"""MVP 카테고리 초안과 Fashionpedia(YOLOS) 클래스 매핑. 팀 합의 후 이 파일만 고치면 된다."""

from typing import TypedDict


class Fine(TypedDict):
    name: str  # 화면에 보여줄 이름
    group: str  # 상의 | 아우터 | 하의 | 원피스 | 신발
    prompt: str  # FashionCLIP 제로샷 문구


# 세부 카테고리. family 안에서 FashionCLIP이 하나를 고른다.
FINE: dict[str, list[Fine]] = {
    # 상의와 아우터를 한 family로 묶어, YOLOS의 상의/외투 혼동(후드티→외투 등)을 FashionCLIP이 다시 판단
    "upper": [
        {"name": "셔츠", "group": "상의", "prompt": "a photo of a button-up shirt"},
        {"name": "블라우스", "group": "상의", "prompt": "a photo of a blouse"},
        {"name": "티셔츠", "group": "상의", "prompt": "a photo of a t-shirt"},
        {"name": "맨투맨", "group": "상의", "prompt": "a photo of a crewneck sweatshirt"},
        {"name": "후드티", "group": "상의", "prompt": "a photo of a hoodie"},
        {"name": "니트", "group": "상의", "prompt": "a photo of a knit sweater"},
        {"name": "민소매", "group": "상의", "prompt": "a photo of a sleeveless top"},
        {"name": "가디건", "group": "아우터", "prompt": "a photo of a cardigan"},
        {"name": "재킷", "group": "아우터", "prompt": "a photo of a jacket"},
        {"name": "코트", "group": "아우터", "prompt": "a photo of a long coat"},
        {"name": "패딩", "group": "아우터", "prompt": "a photo of a puffer jacket"},
        {"name": "조끼", "group": "아우터", "prompt": "a photo of a vest"},
    ],
    "lower": [
        {"name": "슬랙스", "group": "하의", "prompt": "a photo of slacks"},
        {"name": "청바지", "group": "하의", "prompt": "a photo of jeans"},
        {"name": "트레이닝 바지", "group": "하의", "prompt": "a photo of sweatpants"},
        {"name": "반바지", "group": "하의", "prompt": "a photo of shorts"},
        {"name": "치마", "group": "하의", "prompt": "a photo of a skirt"},
    ],
    "onepiece": [
        {"name": "원피스", "group": "원피스", "prompt": "a photo of a dress"},
        {"name": "점프수트", "group": "원피스", "prompt": "a photo of a jumpsuit"},
    ],
    "shoes": [
        {"name": "운동화", "group": "신발", "prompt": "a photo of sneakers"},
        {"name": "구두", "group": "신발", "prompt": "a photo of dress shoes"},
        {"name": "부츠", "group": "신발", "prompt": "a photo of boots"},
        {"name": "샌들", "group": "신발", "prompt": "a photo of sandals"},
    ],
}

# YOLOS-Fashionpedia 라벨 → family. 여기 없는 라벨(소품·옷의 부분)은 버린다.
FASHIONPEDIA_TO_FAMILY: dict[str, str] = {
    "shirt, blouse": "upper",
    "top, t-shirt, sweatshirt": "upper",
    "sweater": "upper",
    "cardigan": "upper",
    "jacket": "upper",
    "vest": "upper",
    "coat": "upper",
    "cape": "upper",
    "pants": "lower",
    "shorts": "lower",
    "skirt": "lower",
    "dress": "onepiece",
    "jumpsuit": "onepiece",
    "shoe": "shoes",
}
