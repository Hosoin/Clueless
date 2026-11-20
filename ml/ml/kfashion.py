"""K-Fashion(AI-Hub) 읽기: 착장 사진 → 아이템 폴리곤으로 흰 배경 크롭 → FashionCLIP 벡터, 색 추출.
한국 착장이라 (1) 궁합 모델의 한국 코디 데이터, (2) 4분류 모델의 한국 사진 정확도, (3) 색 추출 정답으로 쓴다.
AI-Hub 약관: 내국인 신청, 영리 금지, 이미지 재배포·노출 금지 → 학습·평가에만 쓴다.

사용: uv run python -m ml.kfashion                     (샘플 폴더 → kfashion.npz)
      uv run python -m ml.kfashion --zip-base data/raw/kfashion_full/014.KFashion/01.데이터/2.Validation --pct 17 --name kfashion_val
결과: data/processed/cache/kfashion.npz, kfashion_outfits.json + 4분류·색 정확도 출력
"""

import argparse
import hashlib
import io
import json
import zipfile
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, pick_device
from ml.background import square_crop
from ml.colors import PALETTE, suggest_colors
from ml.compat_data import CACHE, SLOTS, VALID
from ml.kfashion_stats import entry_name

COLOR_MAP = {"옐로우": "옐로"}  # K-Fashion 색 이름 → 우리 팔레트 이름 (실버·골드·네온은 팔레트에 없어 색 평가에서 뺀다)
CLOSE_COLORS = {"아이보리": {"화이트", "베이지"}}  # 너그러운 기준에서 같은 색으로 볼 쌍


def polygon_mask(poly: dict, h: int, w: int) -> np.ndarray | None:
    """폴리곤 → 마스크. 번호가 1부터가 아니거나 빠진 라벨이 있어서, 있는 번호만 순서대로 쓴다. 점이 3개 미만이면 None."""
    idx = sorted(int(k[3:]) for k in poly if k.startswith("X좌표") and k[3:].isdigit() and f"Y좌표{k[3:]}" in poly)
    if len(idx) < 3:
        return None
    pts = np.array([[poly[f"X좌표{i}"], poly[f"Y좌표{i}"]] for i in idx], np.int32)
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [pts], 1)
    return mask.astype(bool)


def items_of(d: dict, prefix: str, img_ref) -> list[dict]:
    """라벨 JSON 하나 → 아이템 목록. img_ref: 이미지 파일 경로 또는 (zip 경로, zip 안 이름)."""
    info, det = d["이미지 정보"], d["데이터셋 정보"]["데이터셋 상세설명"]
    style = (det["라벨링"].get("스타일") or [{}])[0].get("스타일", "")
    items = []
    for slot in SLOTS:
        label = (det["라벨링"].get(slot) or [{}])[0]
        rect = (det["렉트좌표"].get(slot) or [{}])[0]
        poly = (det["폴리곤좌표"].get(slot) or [{}])[0]
        if not rect:
            continue
        items.append({
            "id": f"{prefix}{info['이미지 식별자']}_{slot}", "image_id": str(info["이미지 식별자"]), "slot": slot,
            "img": img_ref, "rect": rect, "poly": poly or None,
            "color_true": label.get("색상") or "", "category_true": label.get("카테고리") or "", "style": style,
        })
    return items


def read_items(root: Path) -> list[dict]:
    """샘플(풀린 폴더) 읽기."""
    items = []
    for lab_path in sorted(root.glob("라벨링데이터/*/*.json")):
        # 원천 이미지는 "이미지 파일명"이 아니라 라벨 파일과 같은 이름(식별자.jpg)으로 들어 있다
        img_path = root / "원천데이터" / "원천데이터_1" / lab_path.parent.name / f"{lab_path.stem}.jpg"
        if img_path.exists():
            items += items_of(json.loads(lab_path.read_text(encoding="utf-8")), "kf", img_path)
    return items


def read_items_zip(base: Path, pct: int, prefix: str) -> list[dict]:
    """전체 데이터(라벨 zip + 이미지 zip)를 풀지 않고 읽는다. 사진 id 해시로 pct%만 고른다 (항상 같은 사진)."""
    lab_zip = zipfile.ZipFile(base / "라벨링데이터_modify" / "라벨링데이터.zip")
    img_zip_path = base / "원천데이터_modify" / "원천데이터.zip"
    img_names = {entry_name(i): i.filename for i in zipfile.ZipFile(img_zip_path).infolist() if not i.is_dir()}
    items = []
    for info in lab_zip.infolist():
        name = entry_name(info)
        if not name.endswith(".json") or int(hashlib.md5(name.encode()).hexdigest(), 16) % 100 >= pct:
            continue
        raw_img = img_names.get(name[: -len(".json")] + ".jpg")  # 라벨과 이미지가 같은 경로·이름
        if raw_img:
            items += items_of(json.loads(lab_zip.read(info).decode("utf-8-sig")), prefix, (img_zip_path, raw_img))
    return items


_ZIPS: dict[Path, zipfile.ZipFile] = {}


def load_image(ref) -> Image.Image:
    if isinstance(ref, tuple):
        zp, name = ref
        if zp not in _ZIPS:  # setdefault로 쓰면 매번 zip(목차 12만 개)을 다시 열어 아주 느려진다
            _ZIPS[zp] = zipfile.ZipFile(zp)
        z = _ZIPS[zp]
        return Image.open(io.BytesIO(z.read(name)))
    return Image.open(ref)


def crop_item(it: dict) -> tuple[Image.Image, np.ndarray, np.ndarray]:
    """반환: (흰 배경 정사각 크롭, 원본 RGB, 아이템 마스크). 폴리곤이 없으면 박스 영역."""
    rgb = np.array(load_image(it["img"]).convert("RGB"))
    h, w = rgb.shape[:2]
    mask = polygon_mask(it["poly"], h, w) if it["poly"] else None
    if mask is None:  # 폴리곤이 없거나 깨졌으면 박스 영역
        r = it["rect"]
        mask = np.zeros((h, w), bool)
        mask[int(r["Y좌표"]) : int(r["Y좌표"] + r["세로"]), int(r["X좌표"]) : int(r["X좌표"] + r["가로"])] = True
    return square_crop(rgb, mask), rgb, mask


def outfits_of(items: list[dict]) -> list[list[str]]:
    """같은 사진의 아이템 = 같이 입은 코디. 우리 조합 규칙(VALID)에 맞는 것만."""
    by_img: dict[str, list[dict]] = {}
    for it in items:
        by_img.setdefault(it["image_id"], []).append(it)
    return [[it["id"] for it in g] for g in by_img.values() if tuple(sorted(it["slot"] for it in g)) in VALID]


def color_match(pred: str, true: str, lenient: bool) -> bool:
    true = COLOR_MAP.get(true, true)
    return pred == true or (lenient and true in CLOSE_COLORS.get(pred, set()))


@torch.no_grad()
def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("root", nargs="?", default="data/raw/kfashion_sample", help="샘플(풀린 폴더)")
    p.add_argument("--zip-base", type=Path, help="전체 데이터 분할 폴더 (예: .../2.Validation). 주면 zip에서 읽음")
    p.add_argument("--pct", type=int, default=17, help="--zip-base에서 고를 사진 비율(%%)")
    p.add_argument("--name", default="kfashion", help="캐시 이름 → data/processed/cache/<name>.npz")
    args = p.parse_args()
    if args.zip_base:
        items = read_items_zip(args.zip_base, args.pct, prefix=args.name.replace("_", ""))  # id 접두어에 "_"가 있으면 코디 분할이 깨진다 (split_of가 "_" 앞까지 사용)
    else:
        items = read_items(Path(args.root))
    print(f"아이템 {len(items)}개 (사진 {len({i['image_id'] for i in items})}장)")
    device = pick_device()
    model = CLIPModel.from_pretrained(CLIP).to(device).eval()
    proc = CLIPProcessor.from_pretrained(CLIP)

    embs, color_pred = [], []
    for s in range(0, len(items), 32):
        batch = items[s : s + 32]
        crops = []
        for it in batch:
            crop, rgb, mask = crop_item(it)
            crops.append(crop)
            c = suggest_colors(rgb, mask)
            color_pred.append(c[0]["name"] if c else "")
        e = model.get_image_features(**proc(images=crops, return_tensors="pt").to(device)).pooler_output
        embs.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy())
        if (s // 32) % 20 == 0:
            print(f"  {min(s + 32, len(items))}/{len(items)}", flush=True)
    emb = np.concatenate(embs).astype(np.float32)

    outfits = outfits_of(items)
    CACHE.mkdir(parents=True, exist_ok=True)
    np.savez(
        CACHE / f"{args.name}.npz",
        ids=np.array([i["id"] for i in items]), slots=np.array([i["slot"] for i in items]),
        colors=np.array(color_pred), emb=emb,
        color_true=np.array([i["color_true"] for i in items]), category_true=np.array([i["category_true"] for i in items]),
        style=np.array([i["style"] for i in items]),
    )
    (CACHE / f"{args.name}_outfits.json").write_text(json.dumps(outfits))
    print(f"코디 {len(outfits)}개:", Counter(tuple(sorted(i.split("_")[1] for i in o)) for o in outfits).most_common())

    # 4분류 모델의 한국 착장 크롭 정확도 (학습엔 안 쓴 데이터)
    probe_ck = torch.load("weights/garment4_probe_both.pt", map_location="cpu")
    probe = torch.nn.Linear(512, 4)
    probe.load_state_dict(probe_ck["state_dict"])
    pred = probe(torch.tensor(emb)).argmax(1).tolist()
    classes = probe_ck["classes"]
    truth = [i["slot"] for i in items]
    acc = np.mean([classes[p] == t for p, t in zip(pred, truth)])
    print(f"\n[4분류] K-Fashion 착장 크롭 {len(items)}개 정확도 {acc:.3f}")
    for c in classes:
        idx = [k for k, t in enumerate(truth) if t == c]
        print(f"  {c}: {np.mean([classes[pred[k]] == c for k in idx]):.3f} ({len(idx)}개), 예측 분포 {dict(Counter(classes[pred[k]] for k in idx))}")

    # 색 추출 정확도: 정답 색이 팔레트에 있는 아이템만
    ev = [(p, i["color_true"]) for p, i in zip(color_pred, items) if COLOR_MAP.get(i["color_true"], i["color_true"]) in PALETTE]
    strict = np.mean([color_match(p, t, False) for p, t in ev])
    lenient = np.mean([color_match(p, t, True) for p, t in ev])
    print(f"\n[색] {len(ev)}개: 정확히 일치 {strict:.3f}, 아이보리≈화이트/베이지 허용 {lenient:.3f}")
    wrong = Counter((t, p) for p, t in ev if not color_match(p, t, True))
    print("  자주 틀리는 (정답 → 예측):", wrong.most_common(10))


if __name__ == "__main__":
    main()
