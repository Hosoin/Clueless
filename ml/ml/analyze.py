"""1일차 분석 파이프라인: 사진 → 탐지(YOLOS) → 분할(SAM) → 세부 분류(FashionCLIP) + 색 제안.

사용: uv run python -m ml.analyze 사진.jpg [사진2.jpg ...] --out out/
결과: out/<사진이름>/result.json (POST /uploads 응답 초안) + 옷마다 사각형 크롭과 SAM 크롭 PNG
"""

import argparse
import json
import os
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import (
    AutoImageProcessor,
    CLIPModel,
    CLIPProcessor,
    SamModel,
    SamProcessor,
    YolosForObjectDetection,
)

from ml.categories import FASHIONPEDIA_TO_FAMILY, FINE
from ml.colors import suggest_colors

DETECTOR = "valentinafeve/yolos-fashionpedia"  # MIT
SEGMENTER = "facebook/sam-vit-base"  # Apache-2.0
CLIP = "patrickjohncyh/fashion-clip"  # MIT

# shortcut: 기준값은 샘플 기준 초안. 팀 사진 정답(약 100장)이 모이면 다시 정한다.
# 등록 화면에서 사용자가 잘못된 카드를 지울 수 있으므로 놓치지 않는 쪽(낮은 기준)을 택함.
# 샘플에서 YOLOS가 상의·아우터에 0.3~0.5를 주는 경우가 많았다.
DET_THRESHOLD = 0.3  # 이 아래 박스는 버림
MIN_AREA_RATIO = 0.01  # 사진 면적 1% 미만 박스는 버림
MIN_AREA_RATIO_SHOE = 0.001  # 전신 사진에서 신발은 1%보다 작음
SAME_LABEL_IOU = 0.6  # 같은 라벨끼리 이만큼 겹치면 중복으로 보고 하나만 남김
SAME_FAMILY_IOU = 0.85  # 라벨은 달라도 같은 family(재킷/코트)가 거의 같은 박스면 중복. 재킷 안 셔츠는 이보다 덜 겹침
REVIEW_DET_SCORE = 0.7  # 탐지 신뢰도가 이보다 낮으면 사용자 확인 요청
REVIEW_MARGIN = 0.15  # FashionCLIP 1·2위 확률 차가 이보다 작으면 사용자 확인 요청


def pick_device() -> str:
    if forced := os.environ.get("CLUELESS_DEVICE"):
        return forced
    if torch.cuda.is_available():
        return "cuda"  # 윈도우 + NVIDIA
    if torch.backends.mps.is_available():
        return "mps"  # 맥 Apple Silicon
    return "cpu"


def iou(a: list[float], b: list[float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def clean_detections(dets: list[dict], image_area: float) -> list[dict]:
    """옷이 아닌 라벨, 작은 박스, 중복을 지운다. 겹쳐 입은 옷(재킷+셔츠)은 남긴다."""
    kept: list[dict] = []
    for d in sorted(dets, key=lambda d: -d["score"]):
        x0, y0, x1, y1 = d["box"]
        family = FASHIONPEDIA_TO_FAMILY.get(d["label"])
        if family is None:
            continue
        # shortcut: 사진 한 장 = 한 사람 가정, 신발은 한 켤레로 보고 가장 확실한 박스 하나만. 여러 명 사진을 받게 되면 사람별로 나눈다.
        if family == "shoes" and any(k["label"] == "shoe" for k in kept):
            continue
        min_ratio = MIN_AREA_RATIO_SHOE if family == "shoes" else MIN_AREA_RATIO
        if (x1 - x0) * (y1 - y0) < min_ratio * image_area:
            continue
        if any(
            iou(k["box"], d["box"]) > (SAME_LABEL_IOU if k["label"] == d["label"] else SAME_FAMILY_IOU)
            and FASHIONPEDIA_TO_FAMILY[k["label"]] == family
            for k in kept
        ):
            continue
        kept.append(d)
    return kept


class Analyzer:
    def __init__(self, device: str | None = None) -> None:
        self.device = device or pick_device()
        self.det_proc = AutoImageProcessor.from_pretrained(DETECTOR)
        self.det = YolosForObjectDetection.from_pretrained(DETECTOR).to(self.device).eval()
        self.sam_proc = SamProcessor.from_pretrained(SEGMENTER)
        self.sam = SamModel.from_pretrained(SEGMENTER).to(self.device).eval()
        self.clip_proc = CLIPProcessor.from_pretrained(CLIP)
        self.clip = CLIPModel.from_pretrained(CLIP).to(self.device).eval()
        # family별 문구 임베딩은 한 번만 계산
        self.text_emb: dict[str, torch.Tensor] = {}
        with torch.no_grad():
            for family, fines in FINE.items():
                t = self.clip_proc(text=[f["prompt"] for f in fines], return_tensors="pt", padding=True)
                e = self.clip.get_text_features(**t.to(self.device)).pooler_output  # transformers 5: 투영된 벡터
                self.text_emb[family] = e / e.norm(dim=-1, keepdim=True)

    @torch.no_grad()
    def detect_raw(self, image: Image.Image, threshold: float = DET_THRESHOLD) -> list[dict]:
        """정리 전 YOLOS 결과. 평가 스크립트가 낮은 기준값으로 한 번 돌리고 여러 기준값을 비교할 때 쓴다."""
        inputs = self.det_proc(images=image, return_tensors="pt").to(self.device)
        out = self.det(**inputs)
        res = self.det_proc.post_process_object_detection(
            out, threshold=threshold, target_sizes=[image.size[::-1]]
        )[0]
        return [
            {"label": self.det.config.id2label[int(l)], "score": float(s), "box": [float(v) for v in b]}
            for s, l, b in zip(res["scores"].cpu(), res["labels"].cpu(), res["boxes"].cpu())
        ]

    def detect(self, image: Image.Image) -> list[dict]:
        return clean_detections(self.detect_raw(image), image.size[0] * image.size[1])

    @torch.no_grad()
    def segment(self, image: Image.Image, boxes: list[list[float]]) -> list[np.ndarray]:
        """박스마다 SAM 마스크 하나(HxW bool). SAM이 낸 후보 3개 중 예측 IoU가 가장 높은 것."""
        raw = self.sam_proc(images=image, input_boxes=[boxes], return_tensors="pt")
        # 박스 좌표가 float64로 나오는데 맥 MPS는 float64를 못 씀 → float32로
        inputs = {k: (v.float() if v.dtype == torch.float64 else v).to(self.device) for k, v in raw.items()}
        out = self.sam(pixel_values=inputs["pixel_values"], input_boxes=inputs["input_boxes"])
        masks = self.sam_proc.image_processor.post_process_masks(
            out.pred_masks.cpu(), inputs["original_sizes"].cpu(), inputs["reshaped_input_sizes"].cpu()
        )[0]  # (박스 수, 3, H, W)
        best = out.iou_scores[0].cpu().argmax(dim=-1)  # (박스 수,)
        return [masks[i, best[i]].numpy().astype(bool) for i in range(len(boxes))]

    @torch.no_grad()
    def classify(self, crop: Image.Image, family: str) -> list[dict]:
        img = self.clip_proc(images=crop, return_tensors="pt").to(self.device)
        e = self.clip.get_image_features(**img).pooler_output
        e = e / e.norm(dim=-1, keepdim=True)
        probs = (100 * e @ self.text_emb[family].T).softmax(dim=-1)[0].cpu().tolist()
        ranked = sorted(zip(FINE[family], probs), key=lambda x: -x[1])
        return [{"name": f["name"], "group": f["group"], "prob": round(p, 3)} for f, p in ranked]

    def analyze(self, path: Path, out_dir: Path) -> dict:
        image = Image.open(path).convert("RGB")
        rgb = np.array(image)
        dets = self.detect(image)
        masks = self.segment(image, [d["box"] for d in dets]) if dets else []
        out_dir.mkdir(parents=True, exist_ok=True)

        items = []
        for i, (d, mask) in enumerate(zip(dets, masks)):
            w, h = image.size  # 박스가 사진 밖으로 나가면 크롭과 마스크 크기가 달라지므로 자른다
            x0, y0, x1, y1 = (int(round(v)) for v in d["box"])
            x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
            rect = image.crop((x0, y0, x1, y1))
            # SAM 크롭: 마스크 밖은 흰색. FashionCLIP과 색 제안에 배경·피부가 섞이지 않게 한다.
            white = np.full_like(rgb, 255)
            cut = np.where(mask[..., None], rgb, white)[y0:y1, x0:x1]
            cut_img = Image.fromarray(cut)
            rect.save(out_dir / f"item{i}_rect.png")
            cut_img.save(out_dir / f"item{i}_sam.png")

            family = FASHIONPEDIA_TO_FAMILY[d["label"]]
            candidates = self.classify(cut_img, family)
            margin = candidates[0]["prob"] - (candidates[1]["prob"] if len(candidates) > 1 else 0.0)
            box_mask = mask[y0:y1, x0:x1]
            items.append(
                {
                    "id": i,
                    "box": [x0, y0, x1, y1],
                    "detector": {"label": d["label"], "score": round(d["score"], 3)},
                    "category": candidates[0],  # 제안값. 최종값은 사용자가 확인
                    "category_candidates": candidates[:3],
                    "colors_sam": [
                        {**c, "ratio": round(c["ratio"], 2)} for c in suggest_colors(np.array(rect), box_mask)
                    ],
                    "colors_rect": [
                        {**c, "ratio": round(c["ratio"], 2)} for c in suggest_colors(np.array(rect))
                    ],
                    "mask_ratio": round(float(box_mask.mean()), 2),  # 박스 안에서 옷이 차지하는 비율
                    "needs_review": d["score"] < REVIEW_DET_SCORE or margin < REVIEW_MARGIN,
                    "crops": {"rect": f"item{i}_rect.png", "sam": f"item{i}_sam.png"},
                }
            )
        result = {"image": path.name, "size": list(image.size), "device": self.device, "items": items}
        (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        return result


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("images", nargs="+", type=Path)
    p.add_argument("--out", type=Path, default=Path("out"))
    args = p.parse_args()
    analyzer = Analyzer()
    for path in args.images:
        result = analyzer.analyze(path, args.out / path.stem)
        print(f"{path.name}: 옷 {len(result['items'])}개")
        for it in result["items"]:
            flag = " (확인 필요)" if it["needs_review"] else ""
            color = it["colors_sam"][0]["name"] if it["colors_sam"] else "-"
            print(f"  [{it['id']}] {it['category']['group']}/{it['category']['name']} {color}{flag}")


if __name__ == "__main__":
    main()
