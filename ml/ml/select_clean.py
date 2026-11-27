"""데이터셋용 사진 선별: 배경 제거(u2net)가 깨끗하게 되는 사진만 골라 크롭을 만든다.

사용: uv run python -m ml.select_clean <사진 폴더> [--out 출력 폴더]
결과 (기본 출력: <사진 폴더>_clean/):
  clean/<이름>.webp     깨끗한 크롭 (흰 배경 정사각, 긴 변 최대 1024) → 데이터셋에 쓴다
  unclean/<이름>.webp   걸러진 사진의 크롭 (왜 걸렸는지 눈으로 확인용)
  report.csv            사진마다 판정·이유·지표
  clean.jpg, unclean.jpg 한눈에 보는 모음

깨끗하다고 보는 조건 (fruits 실사진 검토로 정함, 아래 상수):
- 옷이 한 덩어리로 꽉 차 있음 (mask_fill): 실패하면 프린트·태그 조각만 흩어져 남는다
- 가장 큰 덩어리가 마스크 대부분 (main_share): 옷 여러 벌·사람+옷이 같이 잡히지 않음
- 옷이 화면 가장자리에 걸리지 않음 (edge): 화면을 꽉 채운 근접 사진은 배경 제거가 옷을 배경으로 본다
- 옷 크기가 적당함 (mask_ratio): 너무 작으면 디테일이 뭉개지고, 너무 크면 위와 같은 근접 사진
- 사람이 입은 사진이 아님 (worn): FashionCLIP 제로샷 "사람이 입은 사진" vs "펴 놓은·옷걸이·상품 사진"
  fruits 1,065장(착용 220장 목록 기준): AUC 0.989, 기준 0에서 착용 사진 95% 걸러냄 (걸린 것 중 83%가 실제 착용)
  주의: 착용 목록 자체도 자동으로 만든 것이라 실제 정확도는 이보다 낮을 수 있다. 모음 이미지로 한 번 훑어볼 것
"""

import argparse
import csv
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageOps
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, CLIP_REVISION
from ml.background import BackgroundRemover, crop_with_fallback, mask_fill

MIN_FILL = 0.45
MIN_MAIN_SHARE = 0.99  # 깨끗한 크롭은 0.997 이상. 0.94대는 옷 일부가 떨어져 나간 경우
MAX_EDGE = 0.25  # 테두리 픽셀 중 옷인 비율. 상품 사진은 옷이 화면 끝까지 찍히는 일이 많아서 넉넉하게
MIN_RATIO, MAX_RATIO = 0.05, 0.75
WORN_PROMPTS = ["a photo of a person wearing clothes", "a fashion model posing in an outfit", "a mirror selfie of a person wearing clothes"]
ITEM_PROMPTS = ["a photo of a garment laid flat on the floor", "a photo of clothing on a hanger",
                "a product photo of a garment on a plain background", "a photo of folded clothes"]
WORN_MARGIN = 0.0  # 착용 문장 유사도 - 상품 문장 유사도가 이보다 크면 착용 사진
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def metrics(mask: np.ndarray) -> dict[str, float]:
    m = mask.astype(np.uint8)
    n, _, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    areas = stats[1:, cv2.CC_STAT_AREA] if n > 1 else np.array([0])
    edge = np.concatenate([mask[0], mask[-1], mask[:, 0], mask[:, -1]])
    return {"mask_fill": mask_fill(mask), "main_share": float(areas.max() / max(areas.sum(), 1)),
            "edge": float(edge.mean()), "mask_ratio": float(mask.mean())}


class WornDetector:
    """원본 사진이 사람이 입은 사진인지 (FashionCLIP 제로샷 점수 = 착용 문장 최고 - 상품 문장 최고)."""

    def __init__(self) -> None:
        self.model = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION).eval()
        self.proc = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION)
        with torch.no_grad():
            t = self.model.get_text_features(**self.proc(text=WORN_PROMPTS + ITEM_PROMPTS, return_tensors="pt", padding=True)).pooler_output
        self.text = t / t.norm(dim=-1, keepdim=True)

    @torch.no_grad()
    def score(self, image: Image.Image) -> float:
        e = self.model.get_image_features(**self.proc(images=image, return_tensors="pt")).pooler_output
        s = ((e / e.norm(dim=-1, keepdim=True)) @ self.text.T)[0]
        return float(s[: len(WORN_PROMPTS)].max() - s[len(WORN_PROMPTS):].max())


def judge(m: dict[str, float]) -> list[str]:
    """걸린 이유 목록 (비어 있으면 깨끗)."""
    why = []
    if m["worn"] > WORN_MARGIN:
        why.append("사람이 입음")
    if m["mask_fill"] < MIN_FILL:
        why.append("조각남")
    if m["main_share"] < MIN_MAIN_SHARE:
        why.append("여러 덩어리")
    if m["edge"] > MAX_EDGE:
        why.append("가장자리에 걸림")
    if m["mask_ratio"] < MIN_RATIO:
        why.append("너무 작음")
    elif m["mask_ratio"] > MAX_RATIO:
        why.append("화면을 꽉 채움")
    return why


def sheet(rows: list[dict], crops: dict[str, Path], path: Path, size: int = 160, cols: int = 10) -> None:
    if not rows:
        return
    canvas = Image.new("RGB", (cols * size, ((len(rows) + cols - 1) // cols) * (size + 16)), "white")
    draw = ImageDraw.Draw(canvas)
    for k, r in enumerate(rows):
        im = Image.open(crops[r["file"]]).convert("RGB")
        im.thumbnail((size - 6, size - 6))
        x, y = (k % cols) * size, (k // cols) * (size + 16)
        canvas.paste(im, (x + 3, y + 3))
        draw.text((x + 3, y + size - 2), f"{r['file'][:14]} {r['why']}"[:28], fill="black")
    canvas.save(path, quality=82)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("photos", type=Path)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    out = a.out or a.photos.with_name(a.photos.name + "_clean")
    for d in ("clean", "unclean"):
        (out / d).mkdir(parents=True, exist_ok=True)
    remover = BackgroundRemover()
    worn = WornDetector()
    rows, crops = [], {}
    for p in sorted(f for f in a.photos.iterdir() if f.suffix.lower() in EXTS):
        img = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        mask = remover.mask(img)
        m = {**metrics(mask), "worn": worn.score(img)}
        why = judge(m)
        _, crop = crop_with_fallback(np.array(img), mask)
        dst = out / ("unclean" if why else "clean") / f"{p.stem}.webp"
        crop.save(dst, quality=90)
        crops[p.name] = dst
        rows.append({"file": p.name, "clean": not why, "why": " · ".join(why), **{k: round(v, 3) for k, v in m.items()}})
    with open(out / "report.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    sheet([r for r in rows if r["clean"]], crops, out / "clean.jpg")
    sheet([r for r in rows if not r["clean"]], crops, out / "unclean.jpg")
    n = sum(r["clean"] for r in rows)
    print(f"{len(rows)}장 중 깨끗 {n}장, 걸림 {len(rows) - n}장 → {out}")


if __name__ == "__main__":
    main()
