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

# 같은 입력이면 같은 색 (k-means 시드 고정)
noisy = np.random.default_rng(1).integers(0, 255, (60, 60, 3), dtype=np.uint8)
assert suggest_colors(noisy) == suggest_colors(noisy)

print("ok")
