"""ML 추론 API (Spring Boot 백엔드가 호출). 모델은 서버 시작 때 한 번만 올린다.

실행: uv run uvicorn ml.api:app --host 0.0.0.0 --port 8000
문서: http://localhost:8000/docs (요청·응답 형식 자동 생성)
"""

import base64
import io
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Literal

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from ml.garment import PROBE, GarmentClassifier
from ml.recommend import Recommender, recommend

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


app = FastAPI(title="Clueless ML", version="0.1.0", lifespan=lifespan)
_lock = threading.Lock()  # 모델 하나를 여러 요청이 동시에 쓰지 않게 (맥 MPS·GPU 메모리 보호)


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
    embedding: list[float]  # 512차원 FashionCLIP 벡터. 옷장 DB에 저장해 추천에 쓴다
    model_version: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": PROBE.stem}


@app.post("/v1/garments/analyze", response_model=GarmentAnalysis)
def analyze(image: UploadFile, clf: GarmentClassifier = Depends(get_classifier)) -> GarmentAnalysis:
    data = image.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"이미지는 {MAX_BYTES // 1024 // 1024}MB 이하여야 합니다")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        raise HTTPException(400, "이미지 파일을 읽을 수 없습니다 (jpg, png, webp 등)")
    img.thumbnail((MAX_SIDE, MAX_SIDE))

    with _lock:
        result, crop, emb = clf.analyze(img)
    buf = io.BytesIO()
    crop.save(buf, format="PNG")
    return GarmentAnalysis(
        **result,
        crop_png_base64=base64.b64encode(buf.getvalue()).decode(),
        embedding=[round(float(v), 6) for v in emb],
        model_version=PROBE.stem,
    )


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


@app.post("/v1/outfits/recommend", response_model=RecommendResponse)
def recommend_outfits(req: RecommendRequest, rec: Recommender = Depends(get_recommender)) -> RecommendResponse:
    ids = [it.id for it in req.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "옷 id가 중복되었습니다")
    if req.include_id and req.include_id not in ids:
        raise HTTPException(400, "include_id가 옷장 목록에 없습니다")
    emb = {it.id: np.asarray(it.embedding, dtype=np.float32) for it in req.items}
    items = [it.model_dump(exclude={"embedding"}) for it in req.items]
    with _lock:
        outfits = recommend(items, emb, lambda os: rec.compat(os, emb), k=req.k, include_id=req.include_id, allow_layering=req.allow_layering)
    return RecommendResponse(outfits=outfits, model_version=rec.version)
