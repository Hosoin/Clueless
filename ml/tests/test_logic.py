"""모델 없이 도는 로직 확인. 실행: uv run python -m tests.test_logic"""

import numpy as np

from ml.analyze import clean_detections
from ml.colors import nearest_color, suggest_colors

# 색 이름 매핑
assert nearest_color((0, 0, 0)) == "블랙"
assert nearest_color((250, 250, 250)) == "화이트"
assert nearest_color((30, 40, 80)) == "네이비"
# 회청색 재킷: 예전엔 8비트 Lab의 밝기 과대 반영으로 "브라운"이 나왔다
assert nearest_color((75, 77, 92)) in ("그레이", "네이비"), nearest_color((75, 77, 92))
assert nearest_color((0, 128, 140)) != "그레이"  # 청록이 회색으로 가지 않게

# 마스크 안의 색만 본다: 바깥은 빨강, 마스크 안은 네이비
img = np.zeros((100, 100, 3), np.uint8)
img[:] = (200, 30, 40)
img[30:70, 30:70] = (31, 40, 77)
mask = np.zeros((100, 100), bool)
mask[30:70, 30:70] = True
assert suggest_colors(img, mask)[0]["name"] == "네이비"
# 마스크가 없으면 가운데 60%(20~80): 네이비 1600px vs 빨강 2000px → 빨강이 1위
assert suggest_colors(img)[0]["name"] == "레드"

# 탐지 정리: 소품·옷 부분 제거, 작은 박스 제거, 같은 라벨 중복 제거, 겹쳐 입은 다른 라벨은 유지
dets = [
    {"label": "jacket", "score": 0.9, "box": [0, 0, 50, 50]},
    {"label": "jacket", "score": 0.8, "box": [1, 1, 50, 50]},  # 중복
    {"label": "shirt, blouse", "score": 0.85, "box": [5, 5, 45, 45]},  # 재킷 안 셔츠, 유지
    {"label": "sleeve", "score": 0.95, "box": [0, 0, 20, 20]},  # 옷 부분
    {"label": "pants", "score": 0.9, "box": [0, 0, 5, 5]},  # 1% 미만
    {"label": "shoe", "score": 0.9, "box": [60, 90, 65, 95]},  # 0.25%: 신발은 유지
    {"label": "shoe", "score": 0.7, "box": [80, 90, 85, 95]},  # 다른 쪽 신발: 한 켤레로 합침
    {"label": "coat", "score": 0.6, "box": [0, 0, 50, 49]},  # 재킷과 거의 같은 박스: 중복
]
kept = clean_detections(dets, image_area=100 * 100)
assert [d["label"] for d in kept] == ["jacket", "shoe", "shirt, blouse"], kept

# 평가 매칭: 점수 높은 예측부터 짝짓고, 한 정답은 한 번만 쓴다
from ml.eval_fashionpedia import match

gt = [[0, 0, 10, 10], [20, 20, 30, 30]]
preds = [
    {"box": [0, 0, 10, 10], "score": 0.9},  # 정답 0과 일치
    {"box": [1, 1, 10, 10], "score": 0.8},  # 정답 0과 겹치지만 이미 사용됨 → 오답
    {"box": [50, 50, 60, 60], "score": 0.7},  # 아무것도 안 겹침 → 오답
]
assert match(gt, preds) == [(0, 0)], match(gt, preds)

# 배경 제거 후 정사각 크롭: 마스크 밖은 흰색, 결과는 정사각형, 빈 마스크면 원본
from ml.background import square_crop

rgb = np.zeros((100, 200, 3), np.uint8)  # 검은 사진
m = np.zeros((100, 200), bool)
m[10:50, 20:100] = True  # 가로 80, 세로 40
sq = square_crop(rgb, m)
assert sq.size[0] == sq.size[1] == int(80 * 1.1), sq.size
arr = np.array(sq)
assert (arr[0, 0] == 255).all() and (arr[sq.size[1] // 2, sq.size[0] // 2] == 0).all()
assert square_crop(rgb, np.zeros((100, 200), bool)).size == (200, 100)

# 분류 지표: 정답 [0,0,1,2], 예측 [0,1,1,2] → 정확도 0.75, 클래스0 재현 0.5/정밀 1.0, 아무도 없는 클래스3은 F1 0
from ml.garment_data import split_by_sender
from ml.train_garment4 import metrics

mm = metrics([0, 0, 1, 2], [0, 1, 1, 2])
assert mm["accuracy"] == 0.75
assert mm["per_class"]["상의"] == {"precision": 1.0, "recall": 0.5, "f1": 0.667, "n": 2}
assert mm["confusion"][0] == [1, 1, 0, 0]

# 사람 단위 분할: 한 사람의 사진은 한 쪽에만
fake = [{"id": str(i), "sender": str(i % 20), "cls": "상의"} for i in range(200)]
parts = split_by_sender(fake, all_senders=[r["sender"] for r in fake])
owners = {k: {r["sender"] for r in v} for k, v in parts.items()}
assert not (owners["train"] & owners["test"]) and not (owners["train"] & owners["val"])
assert sum(len(v) for v in parts.values()) == 200

# 궁합 평가: AUC (정답이 모두 위면 1, 모두 아래면 0, 같으면 0.5)
from ml.train_compat import auc

assert auc(np.array([3.0, 4.0]), np.array([1.0, 2.0])) == 1.0
assert auc(np.array([1.0, 2.0]), np.array([3.0, 4.0])) == 0.0
assert auc(np.array([1.0, 1.0]), np.array([1.0, 1.0])) == 0.5

# K-Fashion 폴리곤: 번호가 1부터가 아니어도 읽고, 점이 3개 미만이면 None (박스로 대체)
from ml.kfashion import polygon_mask

assert polygon_mask({"X좌표2": 1, "Y좌표2": 1, "X좌표3": 5, "Y좌표3": 1, "X좌표4": 5, "Y좌표4": 5}, 10, 10).sum() > 0
assert polygon_mask({"X좌표1": 1, "Y좌표1": 1}, 10, 10) is None
assert polygon_mask({}, 10, 10) is None

# 같은 입력이면 같은 색 (k-means 시드 고정)
noisy = np.random.default_rng(1).integers(0, 255, (60, 60, 3), dtype=np.uint8)
assert suggest_colors(noisy) == suggest_colors(noisy)

# 분류기 저장·불러오기: Linear(hidden 없음)와 MLP(hidden 있음) 둘 다 같은 출력으로 돌아온다
import tempfile  # noqa: E402
from pathlib import Path  # noqa: E402

import torch  # noqa: E402

from ml.garment import load_probe, make_head  # noqa: E402

x = torch.randn(3, 512)
with tempfile.TemporaryDirectory() as d:
    for hidden in (0, 256):
        head = make_head(512, 4, hidden)
        ck = {"classes": ["상의", "하의", "아우터", "원피스"], "clip": "clip", "state_dict": head.state_dict()}
        if hidden:
            ck["hidden"] = hidden
        torch.save(ck, Path(d) / "h.pt")
        classes, loaded, _ = load_probe(Path(d) / "h.pt")
        assert classes[2] == "아우터" and torch.allclose(loaded(x), head(x)), hidden
    assert load_probe(Path(d) / "없음.pt") is None

# 서비스 이미지에는 dev 의존성(pyarrow·httpx)이 없다: 그래도 API 모듈을 불러올 수 있어야 한다 (도커 첫 실행에서 실제로 죽었던 버그)
import subprocess  # noqa: E402
import sys  # noqa: E402

code = "import sys; sys.modules.update({m: None for m in ('pyarrow', 'pyarrow.parquet', 'httpx')}); import ml.api"
r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
assert r.returncode == 0, r.stderr[-800:]
# 배경 제거 실패 감지: 옷 덩어리는 상자를 채우고, 프린트 조각만 흩어지면 거의 비어 있다
from ml.background import mask_fill  # noqa: E402

solid = np.zeros((100, 100), bool)
solid[20:80, 30:70] = True
solid[45:55, 45:55] = False  # 구멍은 채워서 센다
scattered = np.zeros((100, 100), bool)
for y, x in ((5, 5), (5, 90), (90, 5), (90, 90), (50, 50)):
    scattered[y : y + 5, x : x + 5] = True
assert mask_fill(solid) == 1.0
assert mask_fill(scattered) < 0.05
assert mask_fill(np.zeros((10, 10), bool)) == 0.0

# 데이터셋 선별: 깨끗한 크롭 / 조각난 크롭 / 가장자리에 걸린 근접 사진 / 사람이 입은 사진
from ml.select_clean import judge, metrics  # noqa: E402

assert judge({**metrics(solid), "worn": -0.03}) == []
assert "조각남" in judge({**metrics(scattered), "worn": -0.03})
full = np.ones((100, 100), bool)
assert {"가장자리에 걸림", "화면을 꽉 채움"} <= set(judge({**metrics(full), "worn": -0.03}))
assert judge({**metrics(solid), "worn": 0.02}) == ["사람이 입음"]

print("ok")

