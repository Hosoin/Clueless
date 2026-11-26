"""추천 조립 확인: 점수 순서, 다양성, 근거, API 입력 검증. 실행: uv run python -m tests.test_recommend"""

import numpy as np
import torch
from fastapi.testclient import TestClient

from ml import api
from ml.garment import STYLES, style_scores
from ml.recommend import color_dist, color_scores, harmony, recommend

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
# 스타일을 고르면 요청이 스타일 모델 없이 오면 503 (FakeRecommender.style 없음 = 모델 없음)
FakeRecommender.style = None
assert client.post("/v1/outfits/recommend", json={**body, "style": "스트리트"}).status_code == 503
# 백엔드 closet_items 형태: id가 bigint(숫자), 벡터 없이 styles만 → 스타일 모델 없이도 스타일 추천
nums = {"items": [{"id": 1, "category": "상의", "styles": ["캐주얼"]}, {"id": 2, "category": "상의", "styles": ["스트리트"], "tags": ["최애"]},
                  {"id": 3, "category": "하의", "styles": ["스트리트"]}, {"id": 4, "category": "하의"}], "style": "스트리트", "k": 1}
r = client.post("/v1/outfits/recommend", json=nums)
assert r.status_code == 200 and r.json()["outfits"][0]["items"] == ["2", "3"], r.text
assert "모든 옷이 스트리트 스타일이에요." in r.json()["outfits"][0]["reasons"]
assert client.post("/v1/outfits/recommend", json={**nums, "items": [{"id": 9, "category": "상의", "styles": ["고딕"]}]}).status_code == 422
assert client.post("/v1/outfits/recommend", json={**body, "style": "고딕"}).status_code == 422
print("ok")

# --- 스타일 취향: 궁합은 t1+b1이 높아도, 스트리트를 고르면 스트리트 옷(t2+b2)이 1위 ---
def st(street: float, tags: list[str]) -> dict:
    return {"scores": {s: (street if s == "스트리트" else 0.1) for s in STYLES}, "tags": tags}

styles = {"t1": st(0.1, ["캐주얼"]), "b1": st(0.1, ["캐주얼"]), "t2": st(0.95, ["스트리트"]), "b2": st(0.95, ["스트리트"])}
res = recommend(closet, emb, fake_compat, k=2, styles=styles, style_weights={"스트리트": 1.0})
assert set(res[0]["items"]) == {"t2", "b2"} and res[0]["score_parts"]["taste"] == 0.95, res[0]
assert "모든 옷이 스트리트 스타일이에요." in res[0]["reasons"] and all("스트리트" not in r for r in res[1]["reasons"])
assert recommend(closet, emb, fake_compat, k=1, styles=styles, style_weights=None)[0]["items"] == ["t1", "b1"]  # 스타일 없으면 그대로

# --- 색 궁합 (프론트 색 이름): 화이트·그린 셔츠는 흰색과는 맞아도 레드와는 그린이 부딪혀 감점, 그린 포인트를 맞추면 근거 ---
assert harmony("그린", "레드") == -1 and harmony("화이트", "레드") == 0.5 and harmony("그린", "스카이") == 0.0 and harmony("그린", "카키") == 0.7
wm = {"id": "t", "category": "상의", "colors": [{"name": "화이트", "ratio": 0.62}, {"name": "그린", "ratio": 0.31}, {"name": "그레이", "ratio": 0.07}]}
d = color_dist(wm)
assert set(d) == {"화이트", "그린"} and abs(d["화이트"] - 0.62 / 0.93) < 1e-9  # 15% 미만(그레이)은 빼고 다시 합 1로
# 사용자가 대표색을 고쳤으면(모델 1위 화이트 → 사용자 아이보리) 1위 자리를 바꾸고 보조색(그린)은 유지
d2 = color_dist({**wm, "color": "아이보리"})
assert set(d2) == {"아이보리", "그린"} and abs(d2["아이보리"] - 0.62 / 0.93) < 1e-9, d2
assert color_dist({**wm, "color": "화이트"}) == d  # 같으면 그대로
red, black, mint = ({"id": i, "category": "하의", "color": c} for i, c in (("r", "레드"), ("k", "블랙"), ("m", "그린")))
sc, why = color_scores([{"items": [wm, red]}, {"items": [wm, black]}, {"items": [wm, mint]}, {"items": [wm, {"id": "x", "category": "하의"}]}])
assert sc[0] < sc[1] < sc[2] and sc[3] == 0.5, sc  # 레드(충돌) < 블랙(무채색) < 그린(포인트 맞춤), 색 모르는 옷만 있으면 중립
assert "그린 포인트 색을 맞췄어요." in why[2] and not why[0]
# API: color·colors 칸을 받고 score_parts에 color가 나온다
r = client.post("/v1/outfits/recommend", json={"items": [{"id": 1, "category": "상의", "colors": wm["colors"]}, {"id": 2, "category": "하의", "color": "레드"}, {"id": 3, "category": "하의", "color": "그린"}], "k": 2})
assert r.status_code == 200 and r.json()["outfits"][0]["items"] == ["1", "3"] and "color" in r.json()["outfits"][0]["score_parts"], r.text
# 프론트 이름(덧입기·카디건·데님)으로 보낸 옷장도 받는다 (내부에서 아우터·가디건·청바지로)
r = client.post("/v1/outfits/recommend", json={"items": [{"id": 1, "category": "상의", "subcategory": "티셔츠", "sleeve": "반팔"}, {"id": 2, "category": "덧입기", "subcategory": "카디건", "sleeve": "긴팔"},
                                                         {"id": 3, "category": "하의", "subcategory": "데님"}], "k": 5})
assert r.status_code == 200 and any(set(o["items"]) == {"1", "2", "3"} for o in r.json()["outfits"]), r.text
print("ok (색)")

# style_scores: 기준값을 넘는 스타일이 없으면 캐주얼(기본 아이템), 태그는 최대 2개
zero = torch.nn.Linear(512, 5)
torch.nn.init.zeros_(zero.weight), torch.nn.init.zeros_(zero.bias)  # 모든 점수 0.5
assert style_scores((zero, [0.6] * 5), np.zeros(512))[0]["tags"] == ["캐주얼"]
out = style_scores((zero, [0.4, 0.4, 0.3, 0.45, 0.4]), np.zeros((2, 512)))  # 모두 넘으면 넘은 비율 큰 2개만 (스트리트 0.5/0.3, 그다음 0.5/0.4 중)
assert len(out) == 2 and len(out[0]["tags"]) == 2 and out[0]["tags"][0] == "스트리트" and out[0]["scores"]["캐주얼"] == 0.5, out[0]
print("ok (스타일)")

# --- 사진 없이 입력한 옷(벡터 없음): 그 옷은 궁합에서 빠지고, 잴 쌍이 없으면 중립 0.5 ---
noemb = {k: v for k, v in emb.items() if k != "b1"}
p2 = real.compat(mixed, {**noemb, "d": np.zeros(512, np.float32)})
assert len(p2) == len(mixed) and all(0 <= v <= 1 for v in p2)
alone = [{"items": [{"id": "b1", "category": "하의"}, {"id": "zz", "category": "상의"}]}]
assert real.compat(alone, {}).tolist() == [0.5]  # 둘 다 벡터 없음
print("ok (벡터 없는 옷)")
