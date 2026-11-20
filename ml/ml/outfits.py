"""코디 후보 조합 만들기 (추천의 1단계, 규칙). 점수 매기기(궁합·취향)는 이 후보 위에서 한다.

기본 템플릿
- 상의 + 하의 (+ 아우터)
- 원피스 (+ 아우터)
- 원피스 + 하의 (+ 아우터): 원피스 아래 바지 레이어드. 원피스에 "레이어드" 태그가 있을 때만

상의 레이어드 (allow_layering=True일 때, 사용자 설정 "레이어드 추천 받기")
- A. 덮는 레이어드: 니트·맨투맨(겉) 안에 셔츠·블라우스·티셔츠(이너). 깃·밑단이 보이므로 소매 길이는 따지지 않는다
- B. 소매가 보이는 레이어드: 겉의 소매가 이너보다 짧을 때만 (예: 긴팔 위에 반팔, 긴팔 위에 나시)
- 원피스 + 이너: 원피스 소매가 이너보다 짧을 때 (예: 나시 원피스 안에 티셔츠)
세부 카테고리나 소매 기장을 모르는 옷은 레이어드 후보에서 뺀다 (틀린 레이어드를 추천하지 않게).
성별로 막지 않는다: 레이어드를 받을지는 사용자 설정과 좋아요 기록으로 정한다.
"""

from itertools import product
from typing import TypedDict

LAYER_TAG = "레이어드"
SLEEVE_ORDER = ["민소매", "반팔", "7부", "긴팔"]  # ml/train_sleeve.py의 SLEEVES와 같은 순서
COVER_OVER = {"니트", "맨투맨"}  # A: 겉으로 덮는 상의
COVER_INNER = {"셔츠", "블라우스", "티셔츠"}  # A: 안에 받쳐 입는 상의
SLEEVE_TOPS = {"티셔츠", "셔츠", "블라우스", "민소매", "맨투맨", "니트"}  # B에 쓸 수 있는 상의


class Item(TypedDict, total=False):
    id: str
    category: str  # 상의 | 하의 | 아우터 | 원피스 (사용자가 확인한 값)
    subcategory: str  # 셔츠, 니트, 티셔츠, 민소매 … (ml/categories.py 이름)
    sleeve: str  # 민소매 | 반팔 | 7부 | 긴팔
    tags: list[str]


class Outfit(TypedDict):
    items: list[Item]
    template: str
    roles: dict[str, str]  # 레이어드일 때 옷 id → "이너" | "겉" (그리기 순서: 이너 먼저)
    reasons: list[str]  # 실제로 적용한 규칙만 근거로 남긴다


def eul(word: str) -> str:
    """을/를: 마지막 글자에 받침이 있으면 '을' (반팔을, 셔츠를)."""
    c = ord(word[-1]) - 0xAC00
    return word + ("을" if 0 <= c < 11172 and c % 28 else "를")


def sleeve_rank(it: Item) -> int | None:
    s = "민소매" if it.get("subcategory") == "민소매" else it.get("sleeve")
    return SLEEVE_ORDER.index(s) if s in SLEEVE_ORDER else None


def top_layer(inner: Item, over: Item) -> str | None:
    """상의 두 벌을 겹쳐 입을 수 있으면 근거 문구, 아니면 None."""
    si, so = inner.get("subcategory"), over.get("subcategory")
    if so in COVER_OVER and si in COVER_INNER:
        return f"{so} 안에 {eul(si)} 받쳐 입었어요."
    ri, ro = sleeve_rank(inner), sleeve_rank(over)
    if si in SLEEVE_TOPS and so in SLEEVE_TOPS and ri is not None and ro is not None and ro < ri:
        return f"{SLEEVE_ORDER[ri]} 위에 {eul('나시' if ro == 0 else SLEEVE_ORDER[ro])} 레이어드했어요."
    return None


def dress_layer(inner: Item, dress: Item) -> str | None:
    """원피스 안에 상의를 받쳐 입을 수 있으면 근거 문구."""
    ri, rd = sleeve_rank(inner), sleeve_rank(dress)
    if inner.get("subcategory") in COVER_INNER | {"민소매"} and ri is not None and rd is not None and rd < ri:
        return f"원피스 안에 {SLEEVE_ORDER[ri]} 상의를 받쳐 입었어요."
    return None


TEMPLATES: list[tuple[str, tuple[str, ...]]] = [
    ("상의+하의", ("상의", "하의")),
    ("상의+하의+아우터", ("상의", "하의", "아우터")),
    ("원피스", ("원피스",)),
    ("원피스+아우터", ("원피스", "아우터")),
    ("원피스+하의", ("원피스", "하의")),
    ("원피스+하의+아우터", ("원피스", "하의", "아우터")),
]


def candidate_outfits(items: list[Item], include_id: str | None = None, allow_layering: bool = False) -> list[Outfit]:
    """옷장에서 가능한 조합을 모두 만든다. include_id가 있으면 그 옷이 들어간 조합만 (잘 안 입는 옷 활용).
    shortcut: 하의 세부 종류(바지/치마)가 아직 없어 원피스 아래 하의를 바지로 제한하지 못한다. 세분화 후 치마는 뺀다."""
    by_cat: dict[str, list[Item]] = {}
    for it in items:
        by_cat.setdefault(it["category"], []).append(it)
    tops, bottoms, outers, dresses = (by_cat.get(c, []) for c in ("상의", "하의", "아우터", "원피스"))

    raw: list[tuple[str, tuple[Item, ...], dict[str, str], list[str]]] = []
    for name, slots in TEMPLATES:
        layered = "원피스" in slots and "하의" in slots
        pools = [[it for it in by_cat.get(s, []) if not (layered and s == "원피스") or LAYER_TAG in it.get("tags", [])] for s in slots]
        for combo in product(*pools):
            raw.append((name, combo, {}, ["원피스 아래 바지를 레이어드했어요."] if layered else []))

    if allow_layering:
        layered_tops = [(i, o, why) for i in tops for o in tops if i is not o and (why := top_layer(i, o))]
        for inner, over, why in layered_tops:
            roles = {inner["id"]: "이너", over["id"]: "겉"}
            for b in bottoms:
                raw.append(("상의 레이어드+하의", (inner, over, b), roles, [why]))
                for o in outers:
                    raw.append(("상의 레이어드+하의+아우터", (inner, over, b, o), roles, [why]))
        for d in dresses:
            for inner in tops:
                if why := dress_layer(inner, d):
                    roles = {inner["id"]: "이너", d["id"]: "겉"}
                    raw.append(("원피스+이너", (inner, d), roles, [why]))
                    for o in outers:
                        raw.append(("원피스+이너+아우터", (inner, d, o), roles, [why]))

    outfits: list[Outfit] = []
    for name, combo, roles, extra in raw:
        if include_id and include_id not in {it["id"] for it in combo}:
            continue
        reasons = ["등록한 옷만으로 구성했어요."] + (["고른 옷을 포함했어요."] if include_id else []) + extra
        outfits.append({"items": list(combo), "template": name, "roles": roles, "reasons": reasons})
    return outfits
