"""추천 조립 확인: 점수 순서, 다양성, 근거, API 입력 검증. 실행: uv run python -m tests.test_recommend"""

import numpy as np
from fastapi.testclient import TestClient

from ml import api
from ml.recommend import recommend

closet = [
    {"id": "t1", "category": "상의"},
    {"id": "t2", "category": "상의"},
    {"id": "b1", "category": "하의"},
    {"id": "b2", "category": "하의"},
]
emb = {c["id"]: np.zeros(512, np.float32) for c in closet}
GOOD = {"t1", "b1"}


def fake_compat(outfits):  # t1+b1만 궁합이 좋고 나머지는 낮다
    return np.array([0.9 if {it["id"] for it in o["items"]} == GOOD else 0.3 for o in outfits])


res = recommend(closet, emb, fake_compat, k=4)
assert res[0]["items"] == ["t1", "b1"] and res[0]["score_parts"]["compat"] == 0.9
assert "함께 입는 조합을 학습한 모델이 높게 평가했어요." in res[0]["reasons"]  # 0.6 이상만
assert all("함께 입는" not in r for o in res[1:] for r in o["reasons"])
assert res[0]["score_parts"]["taste"] == 0 and res[0]["score_parts"]["trend"] == 0  # 아직 기준 없음
# 다양성: 2위는 1위와 옷이 하나도 안 겹치는 t2+b2 (점수가 같은 후보 중 겹침이 적은 것)
assert set(res[1]["items"]) == {"t2", "b2"}, res[1]
# include_id: b2가 들어간 코디만
assert all("b2" in o["items"] for o in recommend(closet, emb, fake_compat, include_id="b2"))
assert recommend([{"id": "t1", "category": "상의"}], emb, fake_compat) == []  # 하의가 없으면 추천 없음


# 실제 궁합 모델 구조로: 원피스 단독(옷 1벌)은 쌍이 없으니 중립 0.5, 2·3벌 코디는 계산
from ml.recommend import Recommender
from ml.train_compat import CompatModel

real = Recommender.__new__(Recommender)
real.model, real.version = CompatModel().eval(), "random"
mixed = [{"items": [{"id": "d", "category": "원피스"}]}, {"items": [{"id": "t1", "category": "상의"}, {"id": "b1", "category": "하의"}]}]
p = real.compat(mixed, {**emb, "d": np.zeros(512, np.float32)})
assert p[0] == 0.5 and 0 < p[1] < 1, p


class FakeRecommender:
    version = "fake"

    def compat(self, outfits, emb):
        return fake_compat(outfits)


api.app.dependency_overrides[api.get_recommender] = lambda: FakeRecommender()
client = TestClient(api.app)
body = {"items": [{**c, "embedding": [0.0] * 512} for c in closet], "k": 2}
r = client.post("/v1/outfits/recommend", json=body)
assert r.status_code == 200, r.text
assert r.json()["outfits"][0]["items"] == ["t1", "b1"] and r.json()["model_version"] == "fake"
# 입력 검증: 벡터 길이, 카테고리, 중복 id, 없는 include_id
bad = {"items": [{**closet[0], "embedding": [0.0] * 10}]}
assert client.post("/v1/outfits/recommend", json=bad).status_code == 422
bad = {"items": [{"id": "x", "category": "모자", "embedding": [0.0] * 512}]}
assert client.post("/v1/outfits/recommend", json=bad).status_code == 422
dup = {"items": [{**closet[0], "embedding": [0.0] * 512}] * 2}
assert client.post("/v1/outfits/recommend", json=dup).status_code == 400
assert client.post("/v1/outfits/recommend", json={**body, "include_id": "nope"}).status_code == 400
print("ok")
