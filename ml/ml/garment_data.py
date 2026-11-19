"""개별 옷 사진 4분류 데이터: clothing-dataset(CC0, 5,403장, 사람들이 직접 찍은 옷 한 벌 사진).

받기: git clone --depth 1 https://github.com/alexeygrigorev/clothing-dataset.git data/raw/clothing-dataset
배경 제거본 만들기(맥 GPU 약 45분): uv run python -m ml.garment_data nobg
"""

import csv
import hashlib
import sys
import time
from collections import Counter
from pathlib import Path

from PIL import Image

ROOT = Path("data/raw/clothing-dataset")
NOBG_DIR = Path("data/processed/nobg")
CLASSES = ["상의", "하의", "아우터", "원피스"]

# 아우터 기준: 다른 옷 위에 걸치고 앞이 열리는 옷. Hoodie는 풀오버(상의)와 집업(아우터)이 섞여 있어 제외.
LABEL_MAP = {
    "T-Shirt": "상의",
    "Longsleeve": "상의",
    "Shirt": "상의",
    "Polo": "상의",
    "Undershirt": "상의",
    "Top": "상의",
    "Blouse": "상의",
    "Pants": "하의",
    "Shorts": "하의",
    "Skirt": "하의",
    "Outwear": "아우터",
    "Blazer": "아우터",
    "Dress": "원피스",
}


FIXES = Path("labels/clothing_fixes.csv")  # 팀이 검토한 라벨 수정. git에 올려 공유
EXCLUDE = "제외"  # 수정 파일에서 이 값이면 학습·평가에서 뺀다 (옷이 아님, 판단 불가 등)
REVIEW_ONLY = {"Hoodie"}  # 기준과 충돌해 기본은 제외, 수정 파일에서 라벨을 받으면 포함


def load_fixes() -> dict[str, str]:
    if not FIXES.exists():
        return {}
    fixes = {}
    for r in csv.DictReader(open(FIXES, encoding="utf-8")):
        new = r["new_cls"].strip()
        if new:
            assert new in CLASSES or new == EXCLUDE, f"{FIXES}: 알 수 없는 라벨 {new!r} ({r['id']})"
            fixes[r["id"]] = new
    return fixes


def load_rows(include_review: bool = False) -> list[dict]:
    """4분류에 들어가는 사진. 수정 파일이 있으면 그 라벨이 우선.
    include_review=True면 아직 라벨이 없는 Hoodie도 cls=None으로 포함(검토 목록용).
    반환: [{"id", "sender", "label"(원본), "cls"(4분류 또는 None), "fixed"(수정 여부)}]"""
    fixes = load_fixes()
    rows = []
    for r in csv.DictReader(open(ROOT / "images.csv")):
        if r["label"] not in LABEL_MAP and r["label"] not in REVIEW_ONLY:
            continue
        cls = fixes.get(r["image"], LABEL_MAP.get(r["label"]))
        if cls == EXCLUDE or (cls is None and not include_review):
            continue
        rows.append({"id": r["image"], "sender": r["sender_id"], "label": r["label"], "cls": cls, "fixed": r["image"] in fixes})
    return rows


def sender_parts(senders: list[str]) -> dict[str, str]:
    """찍은 사람 단위로 train/val/test ≈ 70/15/15 (사진 수 기준). 같은 사람의 배경·조명이 학습과 평가에 섞이면 점수가 부풀기 때문.
    sender id 해시 순서로 사진 수를 누적해 자른다. 입력은 원본 images.csv 전체라서 라벨을 고쳐도 분할이 그대로다.
    shortcut: 한 사람이 400장 가까이 보낸 경우가 있어 비율이 몇 %p 어긋날 수 있다. 결과 장수를 보고 확인한다."""
    count = Counter(senders)
    order = sorted(count, key=lambda s: hashlib.md5(s.encode()).hexdigest())
    total, acc, part = sum(count.values()), 0, {}
    for s in order:
        part[s] = "train" if acc < 0.70 * total else "val" if acc < 0.85 * total else "test"
        acc += count[s]
    return part


def split_by_sender(rows: list[dict], all_senders: list[str] | None = None) -> dict[str, list[dict]]:
    if all_senders is None:
        all_senders = [r["sender_id"] for r in csv.DictReader(open(ROOT / "images.csv"))]
    part = sender_parts(all_senders)
    out: dict[str, list[dict]] = {"train": [], "val": [], "test": []}
    for r in rows:
        out[part[r["sender"]]].append(r)
    return out


def image_path(row: dict, variant: str) -> Path:
    return NOBG_DIR / f"{row['id']}.png" if variant == "nobg" else ROOT / "images" / f"{row['id']}.jpg"


def make_nobg() -> None:
    from ml.background import BackgroundRemover

    NOBG_DIR.mkdir(parents=True, exist_ok=True)
    todo = [r for r in load_rows() if not image_path(r, "nobg").exists()]
    remover = BackgroundRemover()
    t0 = time.time()
    for i, r in enumerate(todo):
        _, crop = remover(Image.open(image_path(r, "raw")).convert("RGB"))
        crop.save(image_path(r, "nobg"))
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(todo)}장 ({time.time() - t0:.0f}초)", flush=True)
    print(f"끝: {len(todo)}장 → {NOBG_DIR}")


if __name__ == "__main__":
    if sys.argv[1:] == ["nobg"]:
        make_nobg()
    else:
        rows = load_rows()
        for name, part in split_by_sender(rows).items():
            print(name, len(part), dict(Counter(r["cls"] for r in part)))
