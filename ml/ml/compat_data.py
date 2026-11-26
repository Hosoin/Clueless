"""코디 궁합 학습 데이터: Polyvore(Maryland, 21,587개 코디, Marqo/polyvore 사본, Apache-2.0 표기).
이미지는 쇼핑몰 상품 사진이라 학습에만 쓰고 화면에 노출하지 않는다.

item_ID가 "코디ID_순번"이라 같은 코디의 아이템을 다시 묶을 수 있다. 상의/하의/아우터/원피스만 남기고,
우리 조합 규칙(ml/outfits.py)에 맞는 코디만 쓴다.

사용: uv run python -m ml.compat_data   (처음 1회: 다운로드 2.5GB + 임베딩 계산, 맥 GPU 약 10분)
결과: data/processed/cache/polyvore.npz (아이템 id·슬롯·FashionCLIP 벡터·대표색), polyvore_outfits.json
"""

import io
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import hf_hub_download
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, CLIP_REVISION, pick_device
from ml.colors import suggest_colors

DATASET = "Marqo/polyvore"
FILES = [f"data/data-0000{i}-of-00006.parquet" for i in range(6)]
CACHE = Path("data/processed/cache")
SLOTS = ["상의", "하의", "아우터", "원피스"]

# Polyvore 카테고리 → 슬롯. 여기 없는 것(신발·가방·소품·화장품·생활용품, 애매한 Hoodies·Clothing)은 버린다.
CATEGORY_TO_SLOT = {
    **dict.fromkeys(["Tops", "Blouses", "T-Shirts", "Tank Tops", "Sweaters", "Sweatshirts", "Tunics",
                     "Men's T-Shirts", "Men's Casual Shirts", "Men's Dress Shirts"], "상의"),
    **dict.fromkeys(["Knee Length Skirts", "Shorts", "Skinny Jeans", "Pants", "Mini Skirts", "Jeans", "Leggings",
                     "Capri & Cropped Pants", "Boyfriend Jeans", "Long Skirts", "Skirts", "Men's Jeans",
                     "Straight Leg Jeans", "Activewear Pants", "Men's Casual Pants", "Flared Jeans", "Bootcut Jeans",
                     "Men's Shorts"], "하의"),
    **dict.fromkeys(["Jackets", "Coats", "Blazers", "Cardigans", "Vests", "Outerwear", "Men's Jackets", "Men's Coats"], "아우터"),
    **dict.fromkeys(["Day Dresses", "Cocktail Dresses", "Dresses", "Gowns", "Rompers", "Jumpsuits"], "원피스"),
}
# ml/outfits.py 템플릿과 같은 슬롯 구성만 정답 코디로 쓴다 (슬롯당 1개, 2개 이상)
VALID = {
    ("상의", "하의"), ("상의", "아우터", "하의"),
    ("아우터", "원피스"), ("원피스", "하의"), ("아우터", "원피스", "하의"),
}


def build_outfits(rows: list[dict]) -> list[list[str]]:
    """반환: 코디마다 아이템 id 목록. 슬롯이 겹치거나(상의 2개 등) 규칙에 없는 구성은 버린다."""
    by_outfit: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        slot = CATEGORY_TO_SLOT.get(r["category"])
        if slot:
            by_outfit[r["item_ID"].split("_")[0]].append({"id": r["item_ID"], "slot": slot})
    outfits = []
    for items in by_outfit.values():
        slots = [it["slot"] for it in items]
        if len(set(slots)) == len(slots) and tuple(sorted(slots)) in VALID:
            outfits.append([it["id"] for it in items])
    return outfits


def white_bg_mask(rgb: np.ndarray) -> np.ndarray:
    """상품 사진(흰 배경)에서 옷 픽셀: 거의 흰색이 아닌 곳."""
    return (rgb < 240).any(axis=-1)


@torch.no_grad()
def main() -> None:
    import pyarrow.parquet as pq  # 학습 데이터 만들 때만 (dev 의존성). 서비스(API)는 이 파일의 상수만 쓴다

    paths = [hf_hub_download(DATASET, f, repo_type="dataset") for f in FILES]
    meta = [r for p in paths for r in pq.read_table(p, columns=["item_ID", "category"]).to_pylist()]
    outfits = build_outfits(meta)
    keep = {i for o in outfits for i in o}
    slot_of = {r["item_ID"]: CATEGORY_TO_SLOT[r["category"]] for r in meta if r["item_ID"] in keep}
    print(f"코디 {len(outfits)}개, 아이템 {len(keep)}개")

    device = pick_device()
    model = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION).to(device).eval()
    proc = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION)
    ids, embs, colors = [], [], []
    batch_ids, batch_imgs = [], []

    def flush() -> None:
        e = model.get_image_features(**proc(images=batch_imgs, return_tensors="pt").to(device)).pooler_output
        embs.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy())
        ids.extend(batch_ids)
        batch_ids.clear()
        batch_imgs.clear()

    for p in paths:
        for r in pq.read_table(p, columns=["item_ID", "image"]).to_pylist():
            if r["item_ID"] not in keep:
                continue
            img = Image.open(io.BytesIO(r["image"]["bytes"])).convert("RGB")
            small = np.array(img.resize((64, 64)))
            c = suggest_colors(small, white_bg_mask(small))
            colors.append(c[0]["name"] if c else "")
            batch_ids.append(r["item_ID"])
            batch_imgs.append(img)
            if len(batch_ids) == 64:
                flush()
                if len(ids) % 3200 == 0:
                    print(f"  임베딩 {len(ids)}/{len(keep)}", flush=True)
    if batch_ids:
        flush()

    CACHE.mkdir(parents=True, exist_ok=True)
    np.savez(
        CACHE / "polyvore.npz",
        ids=np.array(ids),
        slots=np.array([slot_of[i] for i in ids]),
        colors=np.array(colors),
        emb=np.concatenate(embs).astype(np.float32),
    )
    (CACHE / "polyvore_outfits.json").write_text(json.dumps(outfits))
    print(f"끝: {CACHE}/polyvore.npz, polyvore_outfits.json")


if __name__ == "__main__":
    main()
