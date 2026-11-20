"""API 입력 검증과 응답 형식 확인. 실제 모델 대신 가짜 분류기를 넣어 빠르게 돈다.
실행: uv run python -m tests.test_api"""

import base64
import io

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from ml import api


class FakeClassifier:
    def analyze(self, image: Image.Image):
        result = {
            "category": {"name": "상의", "prob": 0.9},
            "category_candidates": [{"name": c, "prob": p} for c, p in [("상의", 0.9), ("아우터", 0.06), ("하의", 0.03), ("원피스", 0.01)]],
            "colors": [{"name": "네이비", "rgb": (31, 40, 77), "ratio": 1.0}],
            "color_name": {"name": "네이비", "prob": 0.8, "candidates": [{"name": "네이비", "prob": 0.8}], "needs_review": False},
            "sleeve": {"name": "긴팔", "prob": 0.7, "needs_review": False},
            "mask_ratio": 0.5,
            "retake": False,
            "needs_review": False,
        }
        self.last_size = image.size
        return result, Image.new("RGB", (8, 8), "white"), np.zeros(512, np.float32)


fake = FakeClassifier()
api.app.dependency_overrides[api.get_classifier] = lambda: fake
client = TestClient(api.app)


def png(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "red").save(buf, format="PNG")
    return buf.getvalue()


# 정상 이미지 → 카드 응답, 크롭은 PNG, 임베딩 512차원
r = client.post("/v1/garments/analyze", files={"image": ("a.png", png(100, 80), "image/png")})
assert r.status_code == 200, r.text
body = r.json()
assert body["category"]["name"] == "상의" and len(body["embedding"]) == 512
assert body["sleeve"]["name"] == "긴팔" and body["color_name"]["name"] == "네이비"
assert base64.b64decode(body["crop_png_base64"])[:8] == b"\x89PNG\r\n\x1a\n"

# 큰 이미지는 긴 변 2048로 줄여서 모델에 넘김
client.post("/v1/garments/analyze", files={"image": ("big.png", png(4000, 1000), "image/png")})
assert max(fake.last_size) == api.MAX_SIDE, fake.last_size

# 이미지가 아니면 400, 너무 크면 413
assert client.post("/v1/garments/analyze", files={"image": ("x.txt", b"hello", "text/plain")}).status_code == 400
assert client.post("/v1/garments/analyze", files={"image": ("x.png", b"0" * (api.MAX_BYTES + 1), "image/png")}).status_code == 413

assert client.get("/health").json()["status"] == "ok"
# 모델을 아직 안 올렸으면 /ready는 503 (테스트는 서버 시작 때 모델을 올리지 않음)
assert client.get("/ready").status_code == 503
assert "model_versions" in r.json()

# ML_API_KEY를 설정하면 /v1/*는 X-API-Key가 맞아야 함, /health는 열려 있음
api.API_KEY = "test-key"
img = {"image": ("a.png", png(10, 10), "image/png")}
assert client.post("/v1/garments/analyze", files=img).status_code == 401
assert client.post("/v1/garments/analyze", files=img, headers={"X-API-Key": "wrong"}).status_code == 401
assert client.post("/v1/garments/analyze", files=img, headers={"X-API-Key": "test-key"}).status_code == 200
assert client.get("/health").status_code == 200
api.API_KEY = ""
print("ok")
