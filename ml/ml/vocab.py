"""앱 화면(프론트 frontend/src/data/seed.ts)의 이름이 공식 기준. API 입출력은 이 이름만 쓴다.

모델 내부(학습 라벨·분류기 클래스)는 학습 데이터 기준 이름을 그대로 두고, API에서 바꾼다:
  응답(analyze): 내부 이름 → 프론트 이름 (to_front)
  요청(recommend): 프론트 이름 → 내부 이름 (to_internal), 레이어드 규칙이 내부 세부 종류 이름을 쓰기 때문
프론트 목록이 바뀌면 이 파일과 tests/test_vocab.py를 같이 고친다.
"""

import numpy as np

# frontend/src/data/seed.ts 와 같아야 한다
FRONT_COLORS = {"화이트": "#FFFDF7", "아이보리": "#F1E9D6", "베이지": "#D9C7A7", "카멜": "#C49A6C", "브라운": "#6E4B32", "블랙": "#1E2235",
                "차콜": "#3E4049", "그레이": "#A6A39B", "네이비": "#26324F", "데님": "#33467A", "스카이": "#9DBBD9", "카키": "#6B6B3E",
                "그린": "#2F5130", "버건디": "#7A2436", "레드": "#C2353A", "핑크": "#E7A9C2", "옐로": "#E8C547", "퍼플": "#6C5A8E"}
FRONT_PATTERNS = ["무지", "스트라이프", "체크", "도트", "플라워", "프린트"]
FRONT_CATS = ["상의", "덧입기", "하의", "아우터", "원피스"]
FRONT_SUBS = {"상의": ["티셔츠", "셔츠", "블라우스", "니트", "맨투맨", "후드"], "덧입기": ["뷔스티에", "조끼", "카디건"],
              "하의": ["데님", "슬랙스", "와이드 팬츠", "스커트", "카고 팬츠", "트레이닝 팬츠", "레깅스", "반바지"],
              "아우터": ["재킷", "코트", "패딩", "점퍼"], "원피스": ["원피스", "셔츠 원피스", "니트 원피스"]}

# 내부 세부 종류 → (프론트 종류, 프론트 세부 종류). 프론트에 없는 것은 가장 가까운 것으로
SUB_TO_FRONT = {"티셔츠": ("상의", "티셔츠"), "셔츠": ("상의", "셔츠"), "블라우스": ("상의", "블라우스"), "니트": ("상의", "니트"),
                "후드티": ("상의", "후드"), "민소매": ("상의", "티셔츠"),  # shortcut: 프론트에 민소매가 없다. 생기면 바꾼다
                "슬랙스": ("하의", "슬랙스"), "청바지": ("하의", "데님"), "트레이닝 바지": ("하의", "트레이닝 팬츠"),
                "반바지": ("하의", "반바지"), "치마": ("하의", "스커트"),
                "재킷": ("아우터", "재킷"), "코트": ("아우터", "코트"), "패딩": ("아우터", "패딩"),
                "가디건": ("덧입기", "카디건"), "조끼": ("덧입기", "조끼"),
                "원피스": ("원피스", "원피스"), "점프수트": ("원피스", "원피스")}  # shortcut: 프론트에 점프수트가 없다
# 프론트 세부 종류 → 내부 세부 종류 (추천 요청용)
SUB_TO_INTERNAL = {"티셔츠": "티셔츠", "셔츠": "셔츠", "블라우스": "블라우스", "니트": "니트", "맨투맨": "티셔츠", "후드": "후드티",
                   "뷔스티에": "민소매", "조끼": "조끼", "카디건": "가디건",
                   "데님": "청바지", "슬랙스": "슬랙스", "와이드 팬츠": "슬랙스", "스커트": "치마", "카고 팬츠": "슬랙스",
                   "트레이닝 팬츠": "트레이닝 바지", "레깅스": "트레이닝 바지", "반바지": "반바지",
                   "재킷": "재킷", "코트": "코트", "패딩": "패딩", "점퍼": "재킷",
                   "원피스": "원피스", "셔츠 원피스": "원피스", "니트 원피스": "원피스"}
# 내부 색(K-Fashion 기준 20색) → 프론트 색. 색 거리(Lab)로 정하고, 이름 뜻이 어긋나는 3개만 직접 정함
COLOR_TO_FRONT = {"블랙": "블랙", "화이트": "화이트", "아이보리": "아이보리", "그레이": "그레이", "네이비": "네이비", "블루": "데님",
                  "스카이블루": "스카이", "민트": "스카이", "청록": "그린", "그린": "그린", "카키": "카키", "베이지": "베이지",
                  "브라운": "브라운", "옐로": "옐로", "오렌지": "옐로", "레드": "레드", "와인": "버건디", "핑크": "핑크",
                  "퍼플": "퍼플", "라벤더": "퍼플"}
PRINT_TO_FRONT = {"무지": "무지", "스트라이프": "스트라이프", "체크": "체크", "도트": "도트", "플로럴": "플라워",
                  "레터링": "프린트", "그래픽": "프린트", "기타무늬": "프린트"}


def _lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB(0~255) → CIE Lab. 사람 눈에 가까운 색 거리용."""
    c = np.asarray(rgb, float) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    x, y, z = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ c
    f = lambda t: np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16 / 116)  # noqa: E731
    fx, fy, fz = f(x / 0.9505), f(y), f(z / 1.089)
    return np.array([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)])


_FRONT_LAB = {n: _lab([int(h[i:i + 2], 16) for i in (1, 3, 5)]) for n, h in FRONT_COLORS.items()}


def nearest_front_color(rgb: list[int] | tuple[int, int, int]) -> str:
    """픽셀 색 → 가장 가까운 프론트 색 이름 (차콜·카멜처럼 내부 팔레트에 없는 색도 여기서 나온다)."""
    p = _lab(rgb)
    return min(_FRONT_LAB, key=lambda n: float(np.linalg.norm(p - _FRONT_LAB[n])))


def to_front(result: dict) -> dict:
    """analyze 결과(내부 이름) → 프론트 이름. 세부 종류가 가디건·조끼면 종류는 '덧입기'."""
    r = dict(result)
    sub = r.get("subcategory")
    if sub:
        cat, name = SUB_TO_FRONT.get(sub["name"], (r["category"]["name"], sub["name"]))
        cands = []
        for c in sub.get("candidates", []):
            n = SUB_TO_FRONT.get(c["name"], (None, c["name"]))[1]
            if n not in {x["name"] for x in cands}:
                cands.append({**c, "name": n})
        r["subcategory"] = {**sub, "name": name, "candidates": cands}
        if cat == "덧입기":  # 내부 4분류의 '아우터'가 프론트에서는 '덧입기'
            r["category"] = {**r["category"], "name": "덧입기"}
            r["category_candidates"] = [{**c, "name": "덧입기" if c["name"] == "아우터" else c["name"]} for c in r["category_candidates"]]
    merged: dict[str, dict] = {}
    for c in r.get("colors") or []:
        n = nearest_front_color(c["rgb"])
        if n in merged:
            merged[n]["ratio"] = round(merged[n]["ratio"] + c["ratio"], 2)
        else:
            merged[n] = {**c, "name": n}
    r["colors"] = sorted(merged.values(), key=lambda c: -c["ratio"])
    cn = r.get("color_name")
    if cn:  # 색 모델 후보와 규칙 색 후보 모두 내부 20색 이름
        cands: list[dict] = []
        for c in cn.get("candidates", []):
            n = COLOR_TO_FRONT.get(c["name"], c["name"])
            if n not in {x["name"] for x in cands}:
                cands.append({**c, "name": n})
        r["color_name"] = {**cn, "name": COLOR_TO_FRONT.get(cn["name"], cn["name"]), "candidates": cands}
    if r.get("print"):
        r["print"] = {**r["print"], "name": PRINT_TO_FRONT.get(r["print"]["name"], "프린트")}
    return r


def to_internal(item: dict) -> dict:
    """추천 요청의 옷(프론트 이름) → 내부 이름. 덧입기는 내부에서 아우터(겉에 걸치는 옷)로 다룬다. 색 이름은 프론트 이름 그대로 (색 궁합 규칙이 프론트 이름)."""
    it = dict(item)
    if it.get("category") == "덧입기":
        it["category"] = "아우터"
    if it.get("subcategory"):
        it["subcategory"] = SUB_TO_INTERNAL.get(it["subcategory"], it["subcategory"])
    return it
