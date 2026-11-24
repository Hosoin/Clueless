"""ML 추론 API (Spring Boot 백엔드가 호출). 분석 모델은 시작 때, 추천 모델은 요청 때 올린다.

실행: uv run uvicorn ml.api:app --host 0.0.0.0 --port 8000
문서: http://localhost:8000/docs (요청·응답 형식 자동 생성)

- /health: 살아 있는지 (컨테이너 liveness), /ready: 모델이 올라와 요청을 받을 수 있는지 (readiness)
- ML_API_KEY 환경변수를 설정하면 /v1/* 요청은 X-API-Key 헤더가 같아야 한다 (백엔드만 호출)
- 요청마다 한 줄 JSON 로그(경로·상태·지연 시간, 예측 요약). 사진·벡터·개인정보는 남기지 않는다
"""

import base64
import io
import json
import logging
import secrets
import threading
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from ml.garment import GarmentClassifier
from ml.recommend import COMPAT_WEIGHTS, Recommender, recommend
from ml.settings import API_KEY, GARMENT_CATEGORY_MODEL, GARMENT_CATEGORY_WEIGHTS

MAX_BYTES = 10 * 1024 * 1024  # 업로드 최대 10MB
MAX_PIXELS = 40_000_000
MAX_ASPECT_RATIO = 64  # guard CLIP shortest-edge resize of pathological images
Image.MAX_IMAGE_PIXELS = MAX_PIXELS

MAX_CLOSET = 500  # 추천 요청 한 번에 받는 옷 수 상한
EMB_DIM = 512


@lru_cache(maxsize=1)
def get_classifier() -> GarmentClassifier:
    return GarmentClassifier()


@lru_cache(maxsize=1)
def _load_recommender() -> Recommender:
    return Recommender(COMPAT_WEIGHTS)


_recommender_init_lock = threading.Lock()


def get_recommender() -> Recommender:
    with _recommender_init_lock:
        try:
            return _load_recommender()
        except Exception as exc:
            # Restricted torch load may fail in several ways (missing, corrupt or incompatible weights).
            log_event(event="recommend_model_unavailable", error_type=type(exc).__name__)
            raise HTTPException(503, "추천 모델을 사용할 수 없습니다 (compat_mlp_polyvore.pt 확인)") from exc


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_classifier()  # garment model is required; optional recommendation weights do not block startup
    yield


app = FastAPI(title="Clueless ML", version="0.3.0", lifespan=lifespan)
_lock = threading.Lock()  # 모델 하나를 여러 요청이 동시에 쓰지 않게 (맥 MPS·GPU 메모리 보호)
log = logging.getLogger("clueless.ml")
if not log.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_h)
    log.setLevel(logging.INFO)


def log_event(**fields: object) -> None:
    log.info(json.dumps(fields, ensure_ascii=False))


@app.middleware("http")
async def access_log(request: Request, call_next):  # noqa: ANN001, ANN201
    start = time.perf_counter()
    response = await call_next(request)
    log_event(event="request", path=request.url.path, status=response.status_code, ms=round((time.perf_counter() - start) * 1000))
    return response


def require_key(x_api_key: str | None = Header(default=None)) -> None:
    """ML_API_KEY가 설정돼 있으면 같은 값의 X-API-Key 헤더가 있어야 한다."""
    if API_KEY and not (x_api_key and secrets.compare_digest(x_api_key, API_KEY)):
        raise HTTPException(401, "X-API-Key가 없거나 틀렸습니다")


v1 = APIRouter(prefix="/v1", dependencies=[Depends(require_key)])


class Category(BaseModel):
    name: str  # 상의 | 하의 | 아우터 | 원피스
    prob: float


class Color(BaseModel):
    name: str  # 팔레트 이름 (예: 네이비)
    rgb: tuple[int, int, int]
    ratio: float  # 옷 픽셀 중 비율


class ColorName(BaseModel):
    name: str  # 대표색 이름
    prob: float | None  # 색 모델의 확률 (규칙으로 정했으면 None)
    candidates: list[dict]  # 후보 이름과 확률 (규칙 색은 prob=None)
    needs_review: bool  # true면 색을 사용자에게 고르게 한다


class Sleeve(BaseModel):
    name: Literal["민소매", "반팔", "7부", "긴팔"]
    prob: float
    needs_review: bool  # true면 소매 기장을 사용자에게 고르게 한다


class GarmentAnalysis(BaseModel):
    category: Category  # 제안값. 최종값은 사용자가 확인 화면에서 정한다
    category_candidates: list[Category]  # 확률 높은 순, 4개
    colors: list[Color]  # 넓은 순 (색 견본용 rgb)
    color_name: ColorName | None  # 확인 카드에 미리 골라 둘 대표색
    sleeve: Sleeve | None  # 상의·아우터·원피스만, 하의는 null
    mask_ratio: float  # 사진에서 옷이 차지하는 비율
    retake: bool  # true면 "다시 찍어 주세요" 안내 (옷이 너무 작거나 배경 제거 실패)
    needs_review: bool  # true면 카테고리를 사용자에게 고르게 한다
    crop_png_base64: str  # 흰 배경 정사각 크롭 PNG. 백엔드가 Blob에 저장하고 옷장에 보여준다
    embedding: list[float] = Field(min_length=EMB_DIM, max_length=EMB_DIM, description="512D L2 FashionCLIP closet vector from the display-crop path, not the category input.")
    model_version: str = Field(description="Active category checkpoint identity (name and SHA-256).")
    model_versions: dict[str, str | None] = Field(description="Version map including category and closet-embedding preprocessing IDs.")


class AttributeInputRegion(BaseModel):
    kind: str
    clip_processor_applied: bool


class AttributeTarget(BaseModel):
    mode: Literal["single_representative_garment_assumption"]
    multi_garment_detection: Literal[False]
    limitation: str


class AttributeClipPreprocessing(BaseModel):
    resize: dict[str, int] | None
    center_crop: dict[str, int] | None
    limitation: str


class AttributePreprocessing(BaseModel):
    exif_transpose_applied: bool = Field(description="EXIF transpose is enabled for category input only.")
    clip: AttributeClipPreprocessing
    clip_model: str
    clip_revision: str
    category_version: str
    crop_version: str
    crop_exif_transpose_applied: bool
    crop_max_side: int


class AttributeBackgroundRemoval(BaseModel):
    model: str
    revision: str
    threshold: float


class CategoryMetadata(BaseModel):
    input_region: AttributeInputRegion
    score_type: Literal["uncalibrated_softmax"]
    needs_review: bool
    architecture: Literal["MLP512->64->4 ReLU", "linear"]
    checkpoint: str
    checkpoint_sha256: str
    clip_revision_source: str
    classes_in_head_order: list[str]


class ColorMetadata(BaseModel):
    method: Literal["cie_lab_kmeans_k3_nearest_palette20_cie76"]
    extraction_region: AttributeInputRegion
    ratio_type: Literal["share_of_selected_pixels_not_probability"]
    swatches_field: Literal["colors"]
    representative_color_field: Literal["color_name"]
    representative_color_method: Literal["supervised_fashionclip_color_head", "rule_palette_only"]
    representative_color_input_region: AttributeInputRegion
    representative_color_score_type: Literal["uncalibrated_softmax"] | None
    needs_review: bool


class TextureCandidate(BaseModel):
    label: str
    score: float  # cosine similarity, not a probability


class VisualTexture(BaseModel):
    label: str | None  # top-ranked suggestion, not an accepted label
    score: float | None
    prob: None  # no validated probability
    method: Literal["zero_shot_similarity"]
    score_type: Literal["cosine_similarity"]
    input_region: AttributeInputRegion | None
    prompt_version: str
    non_exclusive: Literal[True]
    candidate_policy: str
    candidates: list[TextureCandidate]
    review_options: list[str]
    needs_review: Literal[True]
    review_reason: str


class GarmentAttributes(BaseModel):
    schema_version: Literal[1]
    target: AttributeTarget
    preprocessing: AttributePreprocessing
    background_removal: AttributeBackgroundRemoval
    category: CategoryMetadata
    embedding_input_region: AttributeInputRegion
    color: ColorMetadata
    visual_texture: VisualTexture
    fiber_material: None
    fiber_material_reason: str


class ExtendedGarmentAnalysis(GarmentAnalysis):
    attributes: GarmentAttributes


@app.get("/health")
def health() -> dict:
    path = GARMENT_CATEGORY_WEIGHTS.get(GARMENT_CATEGORY_MODEL)
    return {"status": "ok", "model": path.stem if path else None}


@app.get("/ready", responses={503: {"description": "Garment analysis model not ready"}})
def ready() -> dict:
    """Garment analysis readiness. Recommendation loads independently on demand."""
    if not get_classifier.cache_info().currsize:
        raise HTTPException(503, "옷 분석 모델을 올리는 중입니다")
    rec = _load_recommender() if _load_recommender.cache_info().currsize else None
    return {
        "status": "ready", "versions": {**get_classifier().versions, "compat": rec.version if rec else None},
        "recommendation": "ready" if rec else ("not_loaded" if COMPAT_WEIGHTS.is_file() else "missing_weights"),
    }


ANALYSIS_ERRORS = {400: {"description": "Unreadable image"}, 413: {"description": "Image size, resolution or aspect ratio exceeds upload limits"}}


@v1.post("/garments/analyze", response_model=GarmentAnalysis, responses=ANALYSIS_ERRORS)
def analyze(image: UploadFile, clf: GarmentClassifier = Depends(get_classifier)) -> GarmentAnalysis:
    return _analyze_upload(image, clf)


@v1.post("/garments/analyze/attributes", response_model=ExtendedGarmentAnalysis, responses=ANALYSIS_ERRORS)
def analyze_with_attributes(image: UploadFile, clf: GarmentClassifier = Depends(get_classifier)) -> GarmentAnalysis:
    """Opt-in garment analysis: same result plus visual-attribute metadata."""
    return _analyze_upload(image, clf, include_attributes=True)


def _analyze_upload(image: UploadFile, clf: GarmentClassifier, *, include_attributes: bool = False) -> GarmentAnalysis:
    data = image.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"이미지는 {MAX_BYTES // 1024 // 1024}MB 이하여야 합니다")
    try:
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_PIXELS or max(img.size) > MAX_ASPECT_RATIO * min(img.size):
            raise HTTPException(413, "이미지 해상도 또는 가로세로 비율이 너무 큽니다")
        img.load()
    except Image.DecompressionBombError as exc:
        raise HTTPException(413, "이미지 해상도가 너무 큽니다") from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(400, "이미지 파일을 읽을 수 없습니다 (jpg, png, webp 등)") from exc
    start = time.perf_counter()
    with _lock:
        result, crop, emb = clf.analyze(img)
        attributes = clf.describe_attributes(result, emb) if include_attributes else None
    log_event(event="analyze", ms=round((time.perf_counter() - start) * 1000), category=result["category"]["name"],
              category_prob=result["category"]["prob"], needs_review=result["needs_review"], retake=result["retake"],
              color_review=(result.get("color_name") or {}).get("needs_review"), sleeve_review=(result.get("sleeve") or {}).get("needs_review"))
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    fields = dict(
        **result,
        crop_png_base64=base64.b64encode(buf.getvalue()).decode(),
        embedding=[round(float(v), 6) for v in emb],
        model_version=clf.model_version,
        model_versions=clf.versions,
    )
    if attributes is not None:
        return ExtendedGarmentAnalysis(**fields, attributes=attributes)
    return GarmentAnalysis(**fields)


class ClosetItem(BaseModel):
    id: str
    category: Literal["상의", "하의", "아우터", "원피스"]  # 사용자가 확인한 값
    subcategory: str | None = None  # 레이어드용 (셔츠, 니트, 티셔츠, 민소매 …)
    sleeve: Literal["민소매", "반팔", "7부", "긴팔"] | None = None  # 레이어드용
    tags: list[str] = []
    embedding: list[float] = Field(min_length=EMB_DIM, max_length=EMB_DIM)  # 등록 때 analyze가 준 벡터


class RecommendRequest(BaseModel):
    items: list[ClosetItem] = Field(max_length=MAX_CLOSET)
    k: int = Field(5, ge=1, le=20)
    include_id: str | None = None  # 이 옷이 들어간 코디만 (잘 안 입는 옷 활용)
    allow_layering: bool = False  # 사용자 설정 "레이어드 추천 받기"


class RecommendedOutfit(BaseModel):
    items: list[str]  # 옷 id, 그리는 순서는 roles 참고
    template: str
    roles: dict[str, str]  # 레이어드일 때 {옷 id: 이너|겉}
    score: float
    score_parts: dict[str, float]  # compat(궁합) / taste(취향, 아직 0) / trend(트렌드, 아직 0)
    reasons: list[str]  # 실제로 적용한 규칙·점수만


class RecommendResponse(BaseModel):
    outfits: list[RecommendedOutfit]
    model_version: str


@v1.post("/outfits/recommend", response_model=RecommendResponse,
         responses={503: {"description": "Recommendation checkpoint missing or unable to load; no fallback"}})
def recommend_outfits(req: RecommendRequest, rec: Recommender = Depends(get_recommender)) -> RecommendResponse:
    ids = [it.id for it in req.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "옷 id가 중복되었습니다")
    if req.include_id and req.include_id not in ids:
        raise HTTPException(400, "include_id가 옷장 목록에 없습니다")
    emb = {it.id: np.asarray(it.embedding, dtype=np.float32) for it in req.items}
    items = [it.model_dump(exclude={"embedding"}) for it in req.items]
    start = time.perf_counter()
    with _lock:
        outfits = recommend(items, emb, lambda os: rec.compat(os, emb), k=req.k, include_id=req.include_id, allow_layering=req.allow_layering)
    log_event(event="recommend", ms=round((time.perf_counter() - start) * 1000), closet=len(items), returned=len(outfits),
              top_score=outfits[0]["score"] if outfits else None, layering=req.allow_layering)
    return RecommendResponse(outfits=outfits, model_version=rec.version)


app.include_router(v1)
