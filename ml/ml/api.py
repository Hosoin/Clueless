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

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel

from ml.garment import PROBE, GarmentClassifier

MAX_BYTES = 10 * 1024 * 1024  # 업로드 최대 10MB
MAX_SIDE = 2048  # 긴 변이 이보다 크면 줄여서 처리 (메모리·속도 보호)
Image.MAX_IMAGE_PIXELS = 40_000_000  # 압축 폭탄 방지: 4천만 화소 넘는 이미지는 열지 않음

@lru_cache(maxsize=1)
def get_classifier() -> GarmentClassifier:
    return GarmentClassifier()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_classifier()  # 서버 시작 때 모델을 올려 첫 요청이 기다리지 않게 (테스트는 lifespan을 돌리지 않음)
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


class GarmentAnalysis(BaseModel):
    category: Category  # 제안값. 최종값은 사용자가 확인 화면에서 정한다
    category_candidates: list[Category]  # 확률 높은 순, 4개
    colors: list[Color]  # 넓은 순
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
