"""개별 옷 사진 추론: EXIF 보정 원본으로 4분류, BiRefNet 크롭으로 속성·옷장 벡터를 계산한다.

사용: uv run python -m ml.garment 옷사진.jpg [...] --out out/garment
결과: out/garment/<사진이름>/result.json + crop.png(흰 배경 정사각 크롭, 옷장에 보여줄 이미지)
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, CLIP_REVISION, pick_device
from ml.background import MASK_THRESHOLD, MODEL as MASK_MODEL, REVISION as MASK_REVISION
from ml.background import BackgroundRemover
from ml.colors import suggest_colors
from ml.garment_attributes import (
    CATEGORY_INPUT, CATEGORY_PREPROCESSING, EMBED_DIM, FIBER_MATERIAL_REASON, RULE_COLOR_METHOD, TARGET_LIMITATION,
    VisualTextureScorer, category_rgb, clip_image_preprocessing, load_service_category_head, unit_vectors,
    visual_texture_result,
)
from ml.garment_data import CLASSES
from ml.settings import GARMENT_CATEGORY_WEIGHTS, WEIGHTS_DIR

MAX_ATTRIBUTE_SIDE = 2048
CROP_PREPROCESSING = "stored_orientation_rgb_thumbnail2048_birefnet_white_crop_fashionclip_l2_v1"
CROP_INPUT = "birefnet_foreground_square_crop_white_background"
CROP_OR_FULL_FRAME_INPUT = "birefnet_crop_or_full_frame_if_mask_empty"
SLEEVE_PROBE = WEIGHTS_DIR / "sleeve_probe.pt"  # 없으면 소매 기장은 결과에서 빠진다
COLOR_PROBE = WEIGHTS_DIR / "color_probe.pt"  # 없으면 색 이름은 규칙(k-means + 팔레트)만 쓴다
SLEEVE_CATEGORIES = {"상의", "아우터", "원피스"}  # 하의에는 소매가 없다
# shortcut: 기준값 초안. 팀원 프리셋 사진 평가에서 "확인 필요"가 실제 오답을 잘 잡는지 보고 다시 정한다.
REVIEW_PROB = 0.6  # 1위 확률이 이보다 낮으면 사용자 확인 요청
MIN_MASK_RATIO = 0.05  # 옷이 사진의 5% 미만이면 다시 찍기 안내
COLOR_REVIEW_PROB = 0.5  # 색 모델 1위 확률이 이보다 낮으면 색을 사용자에게 고르게 한다


def load_probe(path: Path) -> tuple[list[str], torch.nn.Linear, str] | None:
    """FashionCLIP 벡터 위의 작은 분류기(Linear). 파일이 없으면 None."""
    if not path.exists():
        return None
    ck = torch.load(path, map_location="cpu", weights_only=True)
    classes = ck["classes"]
    if ck["clip"] != CLIP or ck.get("clip_revision", CLIP_REVISION) != CLIP_REVISION:
        raise ValueError(f"attribute probe FashionCLIP mismatch: {path}")
    probe = torch.nn.Linear(EMBED_DIM, len(classes))
    probe.load_state_dict(ck["state_dict"], strict=True)
    return classes, probe.eval(), ck["clip"]


def rank(head: tuple[list[str], torch.nn.Module, str], emb: np.ndarray) -> list[tuple[str, float]]:
    with torch.no_grad():
        probs = head[1](torch.from_numpy(emb)).softmax(dim=-1).tolist()
    if not np.isfinite(probs).all():
        raise ValueError("non-finite classifier scores")
    return sorted(zip(head[0], probs), key=lambda x: -x[1])


class GarmentClassifier:
    def __init__(self, *, category_model: str | None = None, device: str | None = None) -> None:
        self.category_head = load_service_category_head(category_model)
        self.device = device or pick_device()
        self.sleeve, self.color = load_probe(SLEEVE_PROBE), load_probe(COLOR_PROBE)
        self.clip = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION, local_files_only=True).to(self.device).eval()
        if self.clip.config.projection_dim != EMBED_DIM:
            raise ValueError("FashionCLIP projection width disagrees with the classifier")
        self.proc = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION, local_files_only=True)
        self.remover = BackgroundRemover(self.device, local_files_only=True)
        # Keep the existing crop embedding ID and HTTP pixel path; category has its own version.
        self.versions = {
            "embedding": f"{CLIP}@{CLIP_REVISION[:7]}",
            "embedding_preprocessing": CROP_PREPROCESSING,
            "category": self.category_head.version,
            "category_preprocessing": CATEGORY_PREPROCESSING,
            "sleeve": SLEEVE_PROBE.stem if self.sleeve else None,
            "color": COLOR_PROBE.stem if self.color else "rule",
        }

    @property
    def model_version(self) -> str:
        return self.category_head.version

    def describe_category(self, result: dict) -> dict:
        head = self.category_head
        return {
            "input_region": {"kind": CATEGORY_INPUT, "clip_processor_applied": True},
            "score_type": "uncalibrated_softmax",
            "needs_review": result["needs_review"],
            "architecture": head.architecture,
            "checkpoint": head.checkpoint_name,
            "checkpoint_sha256": head.checkpoint_sha256,
            "clip_revision_source": head.revision_source,
            "classes_in_head_order": list(CLASSES),
        }

    @staticmethod
    def crop_input_region(result: dict) -> dict:
        # An empty mask returns the full image; mask_ratio is rounded in the card.
        return {"kind": CROP_OR_FULL_FRAME_INPUT if result["retake"] else CROP_INPUT, "clip_processor_applied": True}

    def describe_attributes(self, result: dict, emb: np.ndarray) -> dict:
        """Describe inputs of the existing result and rank visible textures on the same crop embedding."""
        crop = self.crop_input_region(result)
        foreground = {"kind": "birefnet_foreground_pixels", "clip_processor_applied": False}
        color_name = result["color_name"]
        color_head = self.color is not None
        color_review = (color_name is None or color_name["needs_review"] or result["retake"])
        candidates = []
        if not result["retake"]:
            if not hasattr(self, "_visual_texture_scorer"):
                self._visual_texture_scorer = VisualTextureScorer(self.clip, self.proc, self.device)
            candidates = self._visual_texture_scorer.candidates(torch.from_numpy(emb))
        return {
            "schema_version": 1,
            "target": {"mode": "single_representative_garment_assumption", "multi_garment_detection": False,
                       "limitation": TARGET_LIMITATION},
            "preprocessing": {
                "exif_transpose_applied": True,  # category only; preserve the historical crop vectors
                "clip": clip_image_preprocessing(self.proc),
                "clip_model": CLIP, "clip_revision": CLIP_REVISION,
                "category_version": CATEGORY_PREPROCESSING, "crop_version": CROP_PREPROCESSING,
                "crop_exif_transpose_applied": False, "crop_max_side": MAX_ATTRIBUTE_SIDE,
            },
            "background_removal": {"model": MASK_MODEL, "revision": MASK_REVISION, "threshold": MASK_THRESHOLD},
            "category": self.describe_category(result),
            "embedding_input_region": crop,
            "color": {
                "method": RULE_COLOR_METHOD,
                "extraction_region": foreground,
                "ratio_type": "share_of_selected_pixels_not_probability",
                "swatches_field": "colors",
                "representative_color_field": "color_name",
                "representative_color_method": "supervised_fashionclip_color_head" if color_head else "rule_palette_only",
                "representative_color_input_region": crop if color_head else foreground,
                "representative_color_score_type": "uncalibrated_softmax" if color_head else None,
                "needs_review": color_review,
            },
            "visual_texture": visual_texture_result(candidates, crop if candidates else None),
            "fiber_material": None,
            "fiber_material_reason": FIBER_MATERIAL_REASON,
        }

    @torch.no_grad()
    def embed(self, image: Image.Image) -> np.ndarray:
        e = self.clip.get_image_features(**self.proc(images=image, return_tensors="pt").to(self.device)).pooler_output
        return unit_vectors(e, 1).cpu().numpy()[0]

    def analyze(self, image: Image.Image) -> tuple[dict, Image.Image, np.ndarray]:
        """Return card, display crop and its 512D closet vector, never the raw category vector."""
        category_emb = self.embed(category_rgb(image))
        ranked = rank((CLASSES, self.category_head.model, CLIP), category_emb)

        # Match the old HTTP crop path: thumbnail in stored orientation before RGB conversion.
        attribute_image = image.copy()
        attribute_image.thumbnail((MAX_ATTRIBUTE_SIDE, MAX_ATTRIBUTE_SIDE))
        attribute_image = attribute_image.convert("RGB")
        mask, crop = self.remover(attribute_image)
        emb = self.embed(crop)
        mask_ratio = float(mask.mean())
        colors = [{**c, "ratio": round(c["ratio"], 2)} for c in suggest_colors(np.array(attribute_image), mask)]
        result = {
            "category": {"name": ranked[0][0], "prob": round(ranked[0][1], 3)},  # 제안값, 최종값은 사용자가 확인
            "category_candidates": [{"name": c, "prob": round(p, 3)} for c, p in ranked],
            "colors": colors,  # 규칙: 옷 픽셀 k-means → 팔레트 (색 견본 rgb와 비율)
            "color_name": None,  # 색 모델이 고른 대표색 이름 (모델이 있을 때)
            "sleeve": None,  # 상의·아우터·원피스만
            "mask_ratio": round(mask_ratio, 3),
            "retake": mask_ratio < MIN_MASK_RATIO,  # 옷이 너무 작게 찍힘(또는 배경 제거 실패)
            "needs_review": ranked[0][1] < REVIEW_PROB,
        }
        if self.color:
            # 모델이 기본 (K-Fashion test 0.71 vs 규칙 0.43). 확신이 낮으면 규칙 색도 후보에 넣고 사용자에게 고르게 한다
            # (모델은 K-Fashion에 없는 청록·아이보리를 못 고르고, 무늬 옷에서 흔들림)
            c = rank(self.color, emb)
            cands = [{"name": n, "prob": round(p, 3)} for n, p in c[:3]]
            if colors and colors[0]["name"] not in {x["name"] for x in cands}:
                cands.append({"name": colors[0]["name"], "prob": None})
            result["color_name"] = {"name": c[0][0], "prob": round(c[0][1], 3), "candidates": cands, "needs_review": c[0][1] < COLOR_REVIEW_PROB}
        elif colors:
            result["color_name"] = {"name": colors[0]["name"], "prob": None, "candidates": [{"name": x["name"], "prob": None} for x in colors], "needs_review": True}
        if self.sleeve and ranked[0][0] in SLEEVE_CATEGORIES:
            s = rank(self.sleeve, emb)
            # 7부 경계(반팔↔7부↔긴팔)를 자주 헷갈리므로 확신이 낮으면 사용자에게 고르게 한다
            result["sleeve"] = {"name": s[0][0], "prob": round(s[0][1], 3), "needs_review": s[0][1] < REVIEW_PROB}
        return result, crop, emb

    def __call__(self, path: Path, out_dir: Path) -> dict:
        with Image.open(path) as image:
            image.load()
            result, crop, emb = self.analyze(image)
        result = {"image": path.name, **result, "crop": "crop.png", "embedding_dim": len(emb),
                  "model_version": self.model_version, "model_versions": self.versions,
                  "category_metadata": self.describe_category(result), "embedding_input_region": self.crop_input_region(result)}
        out_dir.mkdir(parents=True, exist_ok=True)
        crop.save(out_dir / "crop.png")
        (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return result


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("images", nargs="+", type=Path)
    p.add_argument("--out", type=Path, default=Path("out/garment"))
    p.add_argument("--category-model", choices=GARMENT_CATEGORY_WEIGHTS, help="Explicit head selection (default: GARMENT_CATEGORY_MODEL or mlp)")
    args = p.parse_args()
    try:
        clf = GarmentClassifier(category_model=args.category_model)
    except (OSError, ValueError, RuntimeError) as exc:
        p.exit(1, f"{p.prog}: {exc}\n")
    for path in args.images:
        r = clf(path, args.out / path.stem)
        flags = (" (확인 필요)" if r["needs_review"] else "") + (" (다시 찍기)" if r["retake"] else "")
        color = r["colors"][0]["name"] if r["colors"] else "-"
        print(f"{path.name}: {r['category']['name']} {r['category']['prob']:.2f} / {color}{flags}")


if __name__ == "__main__":
    main()
