"""ML 추론 API (Spring Boot 백엔드가 호출). 모델은 서버 시작 때 한 번만 올린다.

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
from pydantic import BaseModel, ConfigDict, Field

from ml.garment import PROBE, STYLES, GarmentClassifier, style_scores
from ml.vocab import to_front, to_internal
from ml.recommend import Recommender, recommend
from ml.settings import API_KEY

MAX_BYTES = 10 * 1024 * 1024  # 업로드 최대 10MB
MAX_SIDE = 2048  # 긴 변이 이보다 크면 줄여서 처리 (메모리·속도 보호)
Image.MAX_IMAGE_PIXELS = 40_000_000  # 압축 폭탄 방지: 4천만 화소 넘는 이미지는 열지 않음

MAX_CLOSET = 500  # 추천 요청 한 번에 받는 옷 수 상한
EMB_DIM = 512


@lru_cache(maxsize=1)
def get_classifier() -> GarmentClassifier:
    return GarmentClassifier()


@lru_cache(maxsize=1)
def get_recommender() -> Recommender:
    return Recommender()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_classifier()  # 서버 시작 때 모델을 올려 첫 요청이 기다리지 않게 (테스트는 lifespan을 돌리지 않음)
    get_recommender()
    yield


app = FastAPI(title="Clueless ML", version="0.2.0", lifespan=lifespan)
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
    name: str  # 상의 | 덧입기 | 하의 | 아우터 | 원피스 (프론트 seed.ts 이름, ml/vocab.py)
    prob: float


class Color(BaseModel):
    name: str  # 프론트 색 이름 (예: 네이비, 차콜, 카멜)
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


StyleName = Literal["미니멀", "클래식", "스트리트", "캐주얼", "페미닌", "스포티"]
assert list(StyleName.__args__) == STYLES  # garment.STYLES와 같은 순서·이름


class Style(BaseModel):
    scores: dict[StyleName, float]  # 스타일마다 0~1 (6개 모두)
    tags: list[StyleName]  # 이 옷에 붙는 스타일 1~2개, 강한 순 (아무것도 안 맞으면 ["캐주얼"]). 옷장 필터·표시용


class Subcategory(BaseModel):
    name: str  # 프론트 세부 종류 (티셔츠·후드·데님·스커트·카디건 …), category 칸 안에서
    prob: float
    needs_review: bool
    candidates: list[Category]  # 같은 칸 안 상위 3개


class Print(BaseModel):
    name: Literal["무지", "스트라이프", "체크", "도트", "플라워", "프린트"]
    prob: float


class GarmentAnalysis(BaseModel):
    category: Category  # 제안값. 최종값은 사용자가 확인 화면에서 정한다
    category_candidates: list[Category]  # 확률 높은 순, 4개
    colors: list[Color]  # 넓은 순 (색 견본용 rgb)
    color_name: ColorName | None  # 확인 카드에 미리 골라 둘 대표색
    sleeve: Sleeve | None  # 상의·아우터·원피스만, 하의는 null
    style: Style | None = None  # 스타일 모델이 없으면 null
    subcategory: Subcategory | None = None  # closet_items.subcategory 기본값. 모델이 없으면 null
    print: Print | None = None  # 프린트. meta_json에 보관, 표시 이름·비슷한 옷 구분용
    mask_ratio: float  # 사진에서 옷이 차지하는 비율
    retake: bool  # true면 "다시 찍어 주세요" 안내 (옷이 너무 작거나 배경 제거 실패)
    needs_review: bool  # true면 카테고리를 사용자에게 고르게 한다
    crop_png_base64: str  # 흰 배경 정사각 크롭 PNG. 백엔드가 Blob에 저장하고 옷장에 보여준다
    embedding: list[float]  # 512차원 FashionCLIP 벡터. 옷장 DB에 저장해 추천에 쓴다
    model_version: str
    model_versions: dict[str, str | None]  # embedding 값이 바뀌면 DB의 벡터를 모두 다시 계산해야 한다 (옷과 함께 저장)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": PROBE.stem}


@app.get("/ready")
def ready() -> dict:
    """모델이 메모리에 올라왔는지. 서버 시작 직후 모델을 올리는 동안은 503."""
    if not (get_classifier.cache_info().currsize and get_recommender.cache_info().currsize):
        raise HTTPException(503, "모델을 올리는 중입니다")
    return {"status": "ready", "versions": {**get_classifier().versions, "compat": get_recommender().version}}


def read_image(image: UploadFile) -> Image.Image:
    data = image.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"이미지는 {MAX_BYTES // 1024 // 1024}MB 이하여야 합니다")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise HTTPException(400, "이미지 파일을 읽을 수 없습니다 (jpg, png, webp 등)")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


@v1.post("/garments/analyze", response_model=GarmentAnalysis)
def analyze(image: UploadFile, clf: GarmentClassifier = Depends(get_classifier)) -> GarmentAnalysis:
    """옷 사진 → 확인 카드 값 + 크롭·벡터 (CPU 4스레드 약 0.3초, 대부분 배경 제거)."""
    img = read_image(image)

    start = time.perf_counter()
    with _lock:
        result, crop, emb = clf.analyze(img)
    log_event(event="analyze", ms=round((time.perf_counter() - start) * 1000), category=result["category"]["name"],
              category_prob=result["category"]["prob"], needs_review=result["needs_review"], retake=result["retake"],
              color_review=(result.get("color_name") or {}).get("needs_review"), sleeve_review=(result.get("sleeve") or {}).get("needs_review"))
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    return GarmentAnalysis(
        **to_front(result),  # 내부 이름 → 앱(프론트) 이름
        crop_png_base64=base64.b64encode(buf.getvalue()).decode(),
        embedding=[round(float(v), 6) for v in emb],
        model_version=PROBE.stem,
        model_versions=getattr(clf, "versions", {}),
    )


class ColorShare(BaseModel):
    name: str
    ratio: float = Field(ge=0, le=1)


class ClosetItem(BaseModel):
    model_config = ConfigDict(coerce_numbers_to_str=True)  # 백엔드 closet_items.id(bigint)를 숫자로 보내도 받음. 응답의 id는 문자열
    id: str
    category: Literal["상의", "덧입기", "하의", "아우터", "원피스"]  # 사용자가 확인한 값 (프론트 이름)
    subcategory: str | None = None  # 레이어드용, 프론트 세부 종류 이름 (셔츠, 니트, 카디건 …)
    sleeve: Literal["민소매", "반팔", "7부", "긴팔"] | None = None  # 레이어드용
    tags: list[str] = []  # 자유 라벨 (closet_items.tags)
    styles: list[StyleName] = []  # closet_items.styles. 벡터가 없는 옷은 이 값으로 스타일 점수를 대신한다
    color: str | None = None  # closet_items.color (대표색, 프론트 색 이름). colors가 없을 때 색 궁합에 쓴다
    colors: list[ColorShare] | None = None  # meta_json.colors (분석 응답의 색과 면적 비율). 색 궁합에 쓴다
    embedding: list[float] | None = Field(None, min_length=EMB_DIM, max_length=EMB_DIM)  # 등록 때 analyze가 준 벡터. 사진 없이 입력한 옷은 null (궁합에서 빠짐)


class RecommendRequest(BaseModel):
    model_config = ConfigDict(coerce_numbers_to_str=True)
    items: list[ClosetItem] = Field(max_length=MAX_CLOSET)
    k: int = Field(5, ge=1, le=20)
    include_id: str | None = None  # 이 옷이 들어간 코디만 (잘 안 입는 옷 활용)
    allow_layering: bool = False  # 사용자 설정 "레이어드 추천 받기"
    style: StyleName | None = None  # 사용자가 고른 스타일. 주면 style_weights보다 우선
    style_weights: dict[StyleName, float] | None = None  # 취향: 착용 기록의 스타일 비중 (예: {"스트리트": 0.6, "캐주얼": 0.4})


class RecommendedOutfit(BaseModel):
    items: list[str]  # 옷 id, 그리는 순서는 roles 참고
    template: str
    roles: dict[str, str]  # 레이어드일 때 {옷 id: 이너|겉}
    score: float
    score_parts: dict[str, float]  # compat(궁합) / taste(스타일 맞춤, 스타일을 안 주면 0) / color(색 조합, 0.5 = 중립) / trend(트렌드, 아직 0)
    reasons: list[str]  # 실제로 적용한 규칙·점수만


class RecommendResponse(BaseModel):
    outfits: list[RecommendedOutfit]
    model_version: str


@v1.post("/outfits/recommend", response_model=RecommendResponse)
def recommend_outfits(req: RecommendRequest, rec: Recommender = Depends(get_recommender)) -> RecommendResponse:
    ids = [it.id for it in req.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "옷 id가 중복되었습니다")
    if req.include_id and req.include_id not in ids:
        raise HTTPException(400, "include_id가 옷장 목록에 없습니다")
    emb = {it.id: np.asarray(it.embedding, dtype=np.float32) for it in req.items if it.embedding is not None}
    items = [to_internal(it.model_dump(exclude={"embedding", "styles"})) for it in req.items]
    weights = {req.style: 1.0} if req.style else {s: w for s, w in (req.style_weights or {}).items() if w > 0} or None
    if weights and rec.style is None and emb:
        raise HTTPException(503, "스타일 모델(style_probe.pt)이 서버에 없습니다")
    start = time.perf_counter()
    with _lock:
        styles = dict(zip(emb, style_scores(rec.style, np.stack(list(emb.values()))))) if weights and emb else {}
        if weights:  # 벡터 없는 옷(사진 없이 입력 등)은 사용자가 고른 styles로: 있으면 1, 없으면 0
            for it in req.items:
                if it.embedding is None and it.styles:
                    styles[it.id] = {"scores": {s: float(s in it.styles) for s in STYLES}, "tags": list(it.styles)}
        outfits = recommend(items, emb, lambda os: rec.compat(os, emb), k=req.k, include_id=req.include_id, allow_layering=req.allow_layering,
                            styles=styles, style_weights=weights)
    log_event(event="recommend", ms=round((time.perf_counter() - start) * 1000), closet=len(items), returned=len(outfits),
              top_score=outfits[0]["score"] if outfits else None, layering=req.allow_layering, style=req.style)
    return RecommendResponse(outfits=outfits, model_version=rec.version)


app.include_router(v1)
