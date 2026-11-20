"""코디 후보 조합 규칙 확인. 실행: uv run python -m tests.test_outfits"""

from ml.outfits import candidate_outfits

closet = [
    {"id": "t1", "category": "상의"},
    {"id": "b1", "category": "하의"},
    {"id": "o1", "category": "아우터"},
    {"id": "d1", "category": "원피스"},  # 단독으로만 입는 원피스
    {"id": "d2", "category": "원피스", "tags": ["레이어드"]},  # 바지와 레이어드하는 원피스
]


def ids(outfits):
    return sorted(tuple(it["id"] for it in o["items"]) for o in outfits)


all_ = candidate_outfits(closet)
assert ids(all_) == sorted(
    [
        ("t1", "b1"), ("t1", "b1", "o1"),  # 상의+하의(+아우터)
        ("d1",), ("d2",), ("d1", "o1"), ("d2", "o1"),  # 원피스(+아우터)
        ("d2", "b1"), ("d2", "b1", "o1"),  # 레이어드 태그가 있는 원피스만 하의와 조합
    ]
), ids(all_)

# 레이어드 조합에는 그 근거가 붙고, 아닌 조합에는 붙지 않는다
layered = [o for o in all_ if o["template"].startswith("원피스+하의")]
assert all("원피스 아래 바지를 레이어드했어요." in o["reasons"] for o in layered)
assert not any("원피스 아래 바지를 레이어드했어요." in o["reasons"] for o in all_ if o not in layered)

# 잘 안 입는 옷을 지정하면 그 옷이 들어간 조합만, 근거도 추가
with_b1 = candidate_outfits(closet, include_id="b1")
assert ids(with_b1) == sorted([("t1", "b1"), ("t1", "b1", "o1"), ("d2", "b1"), ("d2", "b1", "o1")])
assert all("고른 옷을 포함했어요." in o["reasons"] for o in with_b1)

# 하의가 없으면 상의 조합과 레이어드 조합은 안 나온다
assert ids(candidate_outfits([c for c in closet if c["id"] != "b1"])) == sorted([("d1",), ("d2",), ("d1", "o1"), ("d2", "o1")])

# --- 상의 레이어드 ---
from ml.outfits import dress_layer, top_layer

knit = {"id": "knit", "category": "상의", "subcategory": "니트", "sleeve": "긴팔"}
shirt = {"id": "shirt", "category": "상의", "subcategory": "셔츠", "sleeve": "긴팔"}
tee_s = {"id": "tee_s", "category": "상의", "subcategory": "티셔츠", "sleeve": "반팔"}
tee_l = {"id": "tee_l", "category": "상의", "subcategory": "티셔츠", "sleeve": "긴팔"}
nasi = {"id": "nasi", "category": "상의", "subcategory": "민소매"}
unknown = {"id": "unk", "category": "상의", "subcategory": "티셔츠"}  # 소매 모름
nasi_dress = {"id": "nd", "category": "원피스", "sleeve": "민소매"}

# A. 니트 안에 셔츠·티셔츠 (소매 길이 무관), 반대 방향(셔츠 안에 니트)은 안 됨
assert top_layer(shirt, knit) == "니트 안에 셔츠를 받쳐 입었어요."
assert top_layer(tee_s, knit) is not None
assert top_layer(knit, shirt) is None
# B. 겉 소매가 이너보다 짧을 때만: 긴팔 위 반팔·나시 O, 반팔 위 긴팔 X, 같은 길이 X
assert top_layer(tee_l, tee_s) == "긴팔 위에 반팔을 레이어드했어요."
assert top_layer(tee_l, nasi).startswith("긴팔 위에 나시")
assert top_layer(tee_s, tee_l) is None and top_layer(tee_l, shirt) is None
# 소매를 모르면 레이어드하지 않는다
assert top_layer(unknown, tee_s) is None and top_layer(tee_l, unknown) is None
# 원피스 안에 받쳐 입기: 원피스 소매가 더 짧을 때
assert dress_layer(tee_s, nasi_dress) is not None and dress_layer(nasi, nasi_dress) is None

closet2 = [shirt, knit, tee_l, tee_s, {"id": "pants", "category": "하의"}, nasi_dress]
off = candidate_outfits(closet2)
assert not any(o["template"].startswith(("상의 레이어드", "원피스+이너")) for o in off)  # 기본은 레이어드 꺼짐
on = candidate_outfits(closet2, allow_layering=True)
layered = {tuple(it["id"] for it in o["items"]) for o in on if o["template"] == "상의 레이어드+하의"}
assert ("shirt", "knit", "pants") in layered and ("tee_l", "tee_s", "pants") in layered
assert ("knit", "shirt", "pants") not in layered
o = next(o for o in on if [it["id"] for it in o["items"]] == ["shirt", "knit", "pants"])
assert o["roles"] == {"shirt": "이너", "knit": "겉"} and "니트 안에 셔츠를 받쳐 입었어요." in o["reasons"]
assert any(o["template"] == "원피스+이너" and [it["id"] for it in o["items"]] == ["tee_s", "nd"] for o in on)
print("ok")

from ml.outfits import eul

assert [eul(w) for w in ("반팔", "셔츠", "나시", "7부", "티셔츠")] == ["반팔을", "셔츠를", "나시를", "7부를", "티셔츠를"]
print("ok")

# --- 걸쳐 입는 상의 ("걸쳐입기" 태그) ---
denim = {"id": "denim", "category": "상의", "subcategory": "셔츠", "tags": ["걸쳐입기"]}
tee = {"id": "tee", "category": "상의", "subcategory": "티셔츠"}
jeans = {"id": "jeans", "category": "하의"}
dress = {"id": "dress", "category": "원피스"}
outs = candidate_outfits([denim, tee, jeans, dress])
over = [o for o in outs if o["template"] in ("상의+하의+걸친 상의", "원피스+걸친 상의")]
assert sorted(tuple(it["id"] for it in o["items"]) for o in over) == [("dress", "denim"), ("tee", "jeans", "denim")], over
o = next(o for o in over if o["template"] == "상의+하의+걸친 상의")
assert o["items"][2]["category"] == "아우터" and o["roles"] == {"denim": "겉"}  # 궁합 점수는 아우터 칸으로
assert "셔츠를 아우터처럼 걸쳐 입었어요." in o["reasons"]
assert denim["category"] == "상의"  # 원래 옷 정보는 바뀌지 않음
# 태그가 없으면 아우터 자리에 오지 않고, 한 옷이 안팎에 같이 쓰이지 않음
assert not any(o["template"].endswith("걸친 상의") for o in candidate_outfits([tee, jeans]))
assert not any(o["items"][0]["id"] == "denim" for o in over if o["template"] == "상의+하의+걸친 상의")
print("ok")
