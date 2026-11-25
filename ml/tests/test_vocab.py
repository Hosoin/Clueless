"""앱(프론트) 이름 변환 확인. 실행: uv run python -m tests.test_vocab"""

from ml.vocab import FRONT_COLORS, FRONT_SUBS, SUB_TO_FRONT, SUB_TO_INTERNAL, COLOR_TO_FRONT, nearest_front_color, to_front, to_internal

# 변환 결과는 모두 프론트 목록 안의 이름
assert all(sub in FRONT_SUBS[cat] for cat, sub in SUB_TO_FRONT.values())
assert set(COLOR_TO_FRONT.values()) <= set(FRONT_COLORS)
assert set(SUB_TO_INTERNAL) == {s for subs in FRONT_SUBS.values() for s in subs}  # 프론트 세부 종류는 빠짐없이 내부로
# 픽셀 색: 어두운 회색은 차콜, 낙타색은 카멜 (내부 팔레트에 없는 프론트 색)
assert nearest_front_color([62, 64, 73]) == "차콜" and nearest_front_color([196, 154, 108]) == "카멜"

res = {
    "category": {"name": "아우터", "prob": 0.8},
    "category_candidates": [{"name": "아우터", "prob": 0.8}, {"name": "상의", "prob": 0.2}],
    "subcategory": {"name": "가디건", "prob": 0.7, "needs_review": False, "candidates": [{"name": "가디건", "prob": 0.7}, {"name": "재킷", "prob": 0.3}]},
    "colors": [{"name": "그레이", "rgb": [62, 64, 73], "ratio": 0.5}, {"name": "블랙", "rgb": [60, 62, 70], "ratio": 0.3}, {"name": "민트", "rgb": [150, 220, 200], "ratio": 0.2}],
    "color_name": {"name": "와인", "prob": 0.6, "candidates": [{"name": "와인", "prob": 0.6}, {"name": "레드", "prob": 0.3}], "needs_review": False},
    "print": {"name": "그래픽", "prob": 0.5},
}
f = to_front(res)
assert f["category"]["name"] == "덧입기" and f["category_candidates"][0]["name"] == "덧입기"  # 가디건은 프론트에서 덧입기
assert f["subcategory"]["name"] == "카디건" and [c["name"] for c in f["subcategory"]["candidates"]] == ["카디건", "재킷"]
assert f["colors"][0] == {"name": "차콜", "rgb": [62, 64, 73], "ratio": 0.8}, f["colors"]  # 둘 다 차콜로 합쳐짐
assert f["color_name"]["name"] == "버건디" and f["print"]["name"] == "프린트"
assert res["category"]["name"] == "아우터"  # 원본은 그대로
assert to_internal({"category": "덧입기", "subcategory": "카디건"}) == {"category": "아우터", "subcategory": "가디건"}
assert to_internal({"category": "하의", "subcategory": "카고 팬츠"})["subcategory"] == "슬랙스"
print("ok")
