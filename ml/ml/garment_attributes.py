"""Opt-in offline extraction of one garment's category, color and visible texture candidates."""

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageOps
from torchvision.ops import MLP
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, CLIP_REVISION
from ml.background import MASK_THRESHOLD, MODEL as MASK_MODEL, REVISION as MASK_REVISION
from ml.background import BackgroundRemover, square_crop
from ml.colors import suggest_colors
from ml.garment_data import CLASSES
from ml.settings import GARMENT_CATEGORY_MODEL, GARMENT_CATEGORY_WEIGHTS

EMBED_DIM = 512
MLP_ARCHITECTURE = "MLP512->64->4 ReLU"
CATEGORY_PREPROCESSING = "exif_rgb_white_alpha_full_frame_fashionclip_l2_v1"
CATEGORY_INPUT = "exif_corrected_full_frame"
# These are the two audited local assets; a missing or changed file is not a fallback signal.
SERVICE_HEADS = {
    "mlp": (MLP_ARCHITECTURE, "59232b1a34deb046984cce8b9d68dfd2a852ae53aa899ce62e5aae695eb7bd10"),
    "legacy-linear": ("linear", "f51931d02a55a475f248ded50c21a99ccbbf2110150ee6c595fe61422be0c8ff"),
}
RULE_COLOR_METHOD = "cie_lab_kmeans_k3_nearest_palette20_cie76"
FIBER_MATERIAL_REASON = "Photo appearance cannot establish actual fiber composition (e.g. wool, cotton or acrylic). Check a care label or product information."
TARGET_LIMITATION = "If multiple garments or a person are visible, category, color and texture can refer to different content. BiRefNet selects foreground, not a specific garment."
REVIEW_SCORE = 0.6  # 기존 품목 UI의 초안 기준을 참고한 휴리스틱. 새 head에 대해 보정/검증하지 않았다.
MIN_FOREGROUND = 0.05
TEXTURE_TOP_K = 3
TEXTURE_PROMPT_VERSION = "visible_texture_en_v1"
# 사진으로 관찰할 수 있는 표면·짜임. 예를 들어 니트와 레이스는 함께 나타날 수 있다.
TEXTURE_PROMPTS = {
    "니트": ("visible knitted stitches", "a textured knit weave with yarn loops", "a ribbed knitted surface"),
    "데님": ("a denim-like twill surface", "visible diagonal denim weave", "a woven jeans-like texture"),
    "코듀로이": ("a corduroy-like surface", "closely spaced raised corduroy ribs", "wide parallel corduroy ridges"),
    "플리스": ("a fuzzy fleece-like surface", "a soft fleece pile", "a fluffy napped fleece texture"),
    "레이스": ("an openwork lace pattern", "delicate lace with visible holes", "a patterned lace surface"),
    "가죽 같은 표면": ("a smooth leather-like finish", "a lightly glossy leather-like grain", "a pebbled leather-like surface"),
    "퀼팅": ("a padded quilted surface", "visible quilted stitching", "stitched quilted panels with raised padding"),
    "스웨이드 같은 표면": ("a matte suede-like finish", "a short velvety suede-like nap", "a brushed suede-like surface"),
}


@dataclass(frozen=True)
class CategoryHead:
    model: torch.nn.Module
    architecture: str
    revision_source: str
    checkpoint_name: str
    checkpoint_sha256: str

    @property
    def version(self) -> str:
        return f"{Path(self.checkpoint_name).stem}@sha256:{self.checkpoint_sha256}"


def load_category_head(path: Path, legacy_clip_revision: str | None = None, *,
                       expected_sha256: str | None = None, expected_architecture: str | None = None) -> CategoryHead:
    """Load a trusted local head with restricted deserialization; check pinned hash before loading."""
    with path.open("rb") as f:
        digest = hashlib.file_digest(f, "sha256").hexdigest()
        if expected_sha256 is not None and digest != expected_sha256:
            raise ValueError(f"category checkpoint SHA-256 mismatch: {path}")
        f.seek(0)
        ck = torch.load(f, map_location="cpu", weights_only=True)
    if not isinstance(ck, dict) or ck.get("clip") != CLIP or ck.get("classes") != CLASSES:
        raise ValueError("classifier must use the project FashionCLIP and exact four-class label order")
    state = ck.get("state_dict")
    if not isinstance(state, dict):
        raise ValueError("classifier state_dict is missing")
    arch = ck.get("architecture")
    if set(state) == {"weight", "bias"} and arch in (None, "linear"):
        arch = "linear"
        model = torch.nn.Linear(EMBED_DIM, len(CLASSES))
    elif set(state) == {"0.weight", "0.bias", "3.weight", "3.bias"} and arch in ("mlp", MLP_ARCHITECTURE):
        arch = MLP_ARCHITECTURE
        model = MLP(EMBED_DIM, [64, len(CLASSES)], dropout=0.0)
    else:
        raise ValueError("unsupported classifier architecture/state_dict")
    if expected_architecture is not None and arch != expected_architecture:
        raise ValueError(f"expected category architecture {expected_architecture}, got {arch}")
    # A head explicitly trained on masked or mixed crops is not a raw-frame reference.
    if ck.get("variant", "raw") != "raw":
        raise ValueError("only raw-trained classifier checkpoints are supported")
    if "clip_revision" in ck:
        if ck["clip_revision"] != CLIP_REVISION:
            raise ValueError("classifier FashionCLIP revision differs from the project's pinned revision")
        revision_source = "checkpoint_metadata_verified"
    elif arch == "linear" and ck.get("variant") == "raw" and legacy_clip_revision == CLIP_REVISION:
        revision_source = "caller_declared_for_legacy_raw_linear_not_checkpoint_verified"
    else:
        raise ValueError("classifier revision missing; only legacy raw Linear accepts an explicit --legacy-clip-revision")
    for key, param in model.state_dict().items():
        value = state[key]
        if (
            not isinstance(value, torch.Tensor)
            or value.shape != param.shape
            or not value.is_floating_point()
            or not torch.isfinite(value).all()
        ):
            raise ValueError(f"invalid classifier weight or embedding width: {key}")
    model.load_state_dict(state, strict=True)
    return CategoryHead(model.eval(), arch, revision_source, path.name, digest)


def load_service_category_head(choice: str | None = None) -> CategoryHead:
    choice = GARMENT_CATEGORY_MODEL if choice is None else choice
    if choice not in SERVICE_HEADS:
        raise ValueError("GARMENT_CATEGORY_MODEL must be mlp or legacy-linear")
    path = GARMENT_CATEGORY_WEIGHTS[choice]
    if not path.is_file():
        raise FileNotFoundError(f"Required category checkpoint missing: {path}. See ml/README.md#2-가중치.")
    architecture, digest = SERVICE_HEADS[choice]
    return load_category_head(path, CLIP_REVISION if choice == "legacy-linear" else None,
                              expected_sha256=digest, expected_architecture=architecture)


def category_rgb(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if "A" in image.getbands() or "transparency" in image.info:
        return Image.alpha_composite(Image.new("RGBA", image.size, "white"), image.convert("RGBA")).convert("RGB")
    return image.convert("RGB")


def read_rgb(path: Path) -> Image.Image:
    with Image.open(path) as original:
        return category_rgb(original)


def unit_vectors(emb: torch.Tensor, n: int) -> torch.Tensor:
    if emb.shape != (n, EMBED_DIM) or not torch.isfinite(emb).all():
        raise ValueError("FashionCLIP did not produce finite 512-dimensional projected embeddings")
    norms = emb.norm(dim=-1, keepdim=True)
    if (norms <= 0).any() or not torch.isfinite(norms).all():
        raise ValueError("FashionCLIP projection cannot be normalized")
    return emb / norms


class VisualTextureScorer:
    """Text prototypes for a particular FashionCLIP; shares the loaded encoder with callers."""

    @torch.inference_mode()
    def __init__(self, model: CLIPModel, processor: CLIPProcessor, device: str = "cpu") -> None:
        prompts = [f"A close-up photo of a garment with {detail}." for details in TEXTURE_PROMPTS.values() for detail in details]
        inputs = processor(text=prompts, return_tensors="pt", padding=True).to(device)
        texts = unit_vectors(model.get_text_features(**inputs).pooler_output, len(prompts))
        means = torch.stack([part.mean(0) for part in texts.split([len(x) for x in TEXTURE_PROMPTS.values()])])
        self.vectors = unit_vectors(means, len(TEXTURE_PROMPTS)).cpu()

    @torch.inference_mode()
    def candidates(self, emb: torch.Tensor) -> list[dict]:
        similarities = (self.vectors @ emb).clamp(-1, 1).tolist()
        if not all(math.isfinite(x) for x in similarities):
            raise ValueError("non-finite FashionCLIP texture scores")
        ranked = sorted(zip(TEXTURE_PROMPTS, similarities), key=lambda row: -row[1])[:TEXTURE_TOP_K]
        return [{"label": label, "score": score} for label, score in ranked]


def visual_texture_result(candidates: list[dict], input_region: dict | None) -> dict:
    top = candidates[0] if candidates else None
    return {
        "label": top["label"] if top else None,
        "score": top["score"] if top else None,
        "prob": None,
        "method": "zero_shot_similarity",
        "score_type": "cosine_similarity",
        "input_region": input_region,
        "prompt_version": TEXTURE_PROMPT_VERSION,
        "non_exclusive": True,
        "candidate_policy": "Top-ranked suggestions only; no acceptance or abstention score threshold.",
        "candidates": candidates,
        "review_options": ["판단 어려움"],
        "needs_review": True,
        "review_reason": (
            "Visual-only zero-shot ranking without verified thresholds; choose one, multiple, or unclear."
            if candidates else "No usable foreground region; retake or review the photo manually."
        ),
    }


def clip_image_preprocessing(processor: CLIPProcessor) -> dict:
    image_processor = processor.image_processor
    return {
        "resize": dict(image_processor.size) if image_processor.do_resize else None,
        "center_crop": dict(image_processor.crop_size) if image_processor.do_center_crop else None,
        "limitation": "Processor center cropping can omit edges or a garment outside the center.",
    }


class FashionCLIPFeatures:
    def __init__(self) -> None:
        self.model = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION, local_files_only=True).cpu().eval()
        self.processor = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION, local_files_only=True)
        if self.model.config.projection_dim != EMBED_DIM:
            raise ValueError("FashionCLIP projection width disagrees with the classifier")
        self.image_preprocessing = clip_image_preprocessing(self.processor)
        self.texture = VisualTextureScorer(self.model, self.processor)

    @torch.inference_mode()
    def embed(self, images: list[Image.Image]) -> torch.Tensor:
        inputs = self.processor(images=images, return_tensors="pt")
        return unit_vectors(self.model.get_image_features(**inputs).pooler_output, len(images))


Box = tuple[int, int, int, int]


@dataclass(frozen=True)
class AttributeRegion:
    texture_image: Image.Image
    color_rgb: np.ndarray
    color_mask: np.ndarray | None
    color_info: dict
    texture_info: dict
    background_removal: dict


class RegionSelector:
    def __init__(self, mode: str = "mask", *, roi: Box | None = None, mask_fallback: bool = False) -> None:
        if mode not in {"mask", "central", "roi"} or (mode == "roi") != (roi is not None):
            raise ValueError("specify an ROI only in roi mode, and choose mask, central or roi")
        if mask_fallback and mode != "mask":
            raise ValueError("mask fallback is only available in mask mode")
        self.mode = mode
        self.roi = roi
        self.mask_fallback = mask_fallback
        self.remover = None
        self.mask_error = None

    def _rectangle(self, image: Image.Image, mode: str, bg: dict) -> AttributeRegion:
        w, h = image.size
        if mode == "central":
            box = (int(w * 0.2), int(h * 0.2), max(int(w * 0.8), 1), max(int(h * 0.8), 1))
        else:
            x0, y0, x1, y1 = self.roi
            if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
                raise ValueError(f"ROI is outside the EXIF-corrected image dimensions {w}x{h}")
            box = self.roi
        crop = image.crop(box)
        info = {
            "kind": "central_60_percent_rectangle" if mode == "central" else "user_roi_rectangle",
            "bbox_xyxy": list(box),
            "uses_mask": False,
            "diagnostic_only": True,
        }
        return AttributeRegion(crop, np.asarray(crop), None, info, info, bg)

    def select(self, image: Image.Image) -> AttributeRegion:
        bg = {"requested": self.mode == "mask", "status": "not_requested"}
        if self.mode != "mask":
            return self._rectangle(image, self.mode, bg)
        bg.update(model=MASK_MODEL, revision=MASK_REVISION, threshold=MASK_THRESHOLD)
        if self.mask_error is not None:
            bg.update(status="skipped_after_error", reason=self.mask_error)
        else:
            try:
                if self.remover is None:
                    self.remover = BackgroundRemover("cpu", local_files_only=True)
                mask = self.remover.mask(image)
                if mask.shape != (image.height, image.width) or mask.dtype != np.bool_:
                    raise ValueError("invalid mask shape or dtype")
            except Exception as exc:
                # Do not retry model load/inference for every input after a failure.
                self.mask_error = type(exc).__name__
                bg.update(status="error", reason=self.mask_error)
            else:
                ratio = float(mask.mean())
                bg["frame_foreground_ratio"] = ratio
                if MIN_FOREGROUND <= ratio < 1.0:
                    bg["status"] = "used"
                    rgb = np.asarray(image)
                    color_info = {"kind": "birefnet_foreground_pixels", "uses_mask": True, "diagnostic_only": False}
                    texture_info = {
                        "kind": "birefnet_foreground_square_crop_white_background",
                        "uses_mask": True,
                        "diagnostic_only": False,
                    }
                    return AttributeRegion(square_crop(rgb, mask), rgb, mask, color_info, texture_info, bg)
                bg.update(status="unusable", reason="foreground_below_5_percent_or_covers_whole_frame")
        if self.mask_fallback:
            return self._rectangle(image, "central", bg)
        raise ValueError(f"automatic mask {bg['status']} ({bg['reason']}); choose --region central/roi or --mask-fallback central")


class GarmentAttributeExtractor:
    def __init__(self, head: CategoryHead, features: FashionCLIPFeatures, regions: RegionSelector) -> None:
        self.head = head
        self.features = features
        self.regions = regions

    @torch.inference_mode()
    def analyze(self, path: Path) -> dict:
        start = perf_counter()
        image = read_rgb(path)
        decoded = perf_counter()
        region = self.regions.select(image)
        localized = perf_counter()
        # Keep the raw category input used to train the chosen classifier; texture uses the localized input.
        cat_emb, tex_emb = self.features.embed([image, region.texture_image])
        scores = self.head.model(cat_emb).softmax(dim=-1).tolist()
        if not all(math.isfinite(x) for x in scores):
            raise ValueError("non-finite classifier scores")
        cat_rank = sorted(zip(CLASSES, scores), key=lambda row: -row[1])
        texture = visual_texture_result(
            self.features.texture.candidates(tex_emb), {**region.texture_info, "clip_processor_applied": True}
        )
        scored = perf_counter()
        # In rectangle mode, pass an explicit local mask of all pixels to avoid the existing helper's own central crop.
        color_mask = region.color_mask
        if color_mask is None:
            color_mask = np.ones(region.color_rgb.shape[:2], dtype=bool)
        colors = suggest_colors(region.color_rgb, color_mask)
        complete = perf_counter()
        return {
            "schema_version": 1,
            "image": path.name,
            "image_size_wh": list(image.size),
            "target": {
                "mode": "single_representative_garment_assumption",
                "multi_garment_detection": False,
                "limitation": TARGET_LIMITATION,
            },
            "models": {
                "fashionclip": {"id": CLIP, "revision": CLIP_REVISION, "embedding_dim": EMBED_DIM},
                "image_preprocessing": self.features.image_preprocessing,
                "classifier": {
                    "checkpoint": self.head.checkpoint_name,
                    "sha256": self.head.checkpoint_sha256,
                    "preprocessing_version": CATEGORY_PREPROCESSING,
                    "architecture": self.head.architecture,
                    "classes_in_embedding_head_order": list(CLASSES),
                    "revision_source": self.head.revision_source,
                },
            },
            "background_removal": region.background_removal,
            "category": {
                "name": cat_rank[0][0],
                "candidates": [{"name": name, "score": score} for name, score in cat_rank],
                "method": "supervised_fashionclip_head",
                "score_type": "uncalibrated_softmax",
                "input_region": {"kind": CATEGORY_INPUT, "clip_processor_applied": True},
                "needs_review": cat_rank[0][1] < REVIEW_SCORE,
                "review_rule": {"type": "unvalidated_low_top_score_heuristic", "review_below": REVIEW_SCORE},
            },
            "color": {
                "name": colors[0]["name"] if colors else None,
                "candidates": colors,
                "method": RULE_COLOR_METHOD,
                "extraction_region": region.color_info,
                "input_region": region.color_info,
                "ratio_type": "share_of_selected_pixels_not_probability",
                "needs_review": True,
                "review_reason": "Rule-based color names; illumination and included background, person or other garments may affect them." if colors else "Too few selected pixels for k-means.",
            },
            "visual_texture": texture,
            "fiber_material": None,
            "fiber_material_reason": FIBER_MATERIAL_REASON,
            "timings_seconds": {
                "decode_exif_rgb": decoded - start,
                "select_attribute_region": localized - decoded,
                "image_embeddings_and_scores": scored - localized,
                "color_rules": complete - scored,
                "total_analysis": complete - start,
            },
        }


def _roi_arg(value: str) -> Box:
    try:
        left, top, right, bottom = (int(x) for x in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("ROI must be x0,y0,x1,y1 in EXIF-corrected pixels") from exc
    if not (0 <= left < right and 0 <= top < bottom):
        raise argparse.ArgumentTypeError("ROI requires 0 <= x0 < x1 and 0 <= y0 < y1")
    return left, top, right, bottom


def _write_json(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.write("\n")


def _save_swatches(path: Path, candidates: list[dict]) -> None:
    canvas = Image.new("RGB", (420, 56), "white")
    draw = ImageDraw.Draw(canvas)
    left = 0
    for i, item in enumerate(candidates):
        right = canvas.width if i == len(candidates) - 1 else min(canvas.width, left + round(canvas.width * item["ratio"]))
        if right > left:
            draw.rectangle((left, 0, right - 1, canvas.height - 1), fill=tuple(item["rgb"]))
        left = right
    with path.open("xb") as f:
        canvas.save(f, format="PNG")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("images", nargs="+", type=Path)
    p.add_argument("--classifier-checkpoint", type=Path, help="Trusted local diagnostic head; defaults to the service head")
    p.add_argument("--legacy-clip-revision", help="Explicit revision declaration for a custom raw Linear checkpoint without revision metadata")
    p.add_argument("--out", required=True, type=Path, help="New directory; existing directories are not overwritten")
    p.add_argument("--region", choices=("mask", "central", "roi"), default="mask", help="Color/texture region; category always uses the raw frame")
    p.add_argument("--mask-fallback", choices=("central",), help="Opt in to a diagnostic central rectangle if masking fails")
    p.add_argument("--roi", type=_roi_arg, help="x0,y0,x1,y1 in EXIF-corrected image pixels (one image only)")
    p.add_argument("--cpu-threads", type=int, default=4)
    p.add_argument("--swatches", action="store_true", help="Save color-only PNGs without copying photos")
    args = p.parse_args(argv)
    if args.cpu_threads < 1:
        p.error("--cpu-threads must be positive")
    if args.roi is not None and len(args.images) != 1:
        p.error("--roi accepts one input image per invocation")
    if args.legacy_clip_revision is not None and (args.legacy_clip_revision != CLIP_REVISION or args.classifier_checkpoint is None):
        p.error("--legacy-clip-revision requires --classifier-checkpoint and the pinned FashionCLIP revision")
    try:
        regions = RegionSelector(args.region, roi=args.roi, mask_fallback=bool(args.mask_fallback))
        for path in args.images:
            if not path.is_file():
                raise ValueError(f"input image is not a local file: {path}")
        args.out.mkdir(parents=True, exist_ok=False)
        torch.set_num_threads(args.cpu_threads)
        cv2.setNumThreads(args.cpu_threads)
        start = perf_counter()
        head = (load_category_head(args.classifier_checkpoint, args.legacy_clip_revision)
                if args.classifier_checkpoint is not None else load_service_category_head())
        extractor = GarmentAttributeExtractor(head, FashionCLIPFeatures(), regions)
        ready = perf_counter()
        rows = []
        failed = False
        for i, path in enumerate(args.images, 1):
            try:
                result = extractor.analyze(path)
            except (OSError, ValueError, RuntimeError, Image.DecompressionBombError) as exc:
                rows.append({"image": path.name, "status": "error", "error": str(exc)})
                failed = True
                continue
            filename = f"{i:03d}.json"
            swatch = f"{i:03d}_colors.png" if args.swatches and result["color"]["candidates"] else None
            if swatch:
                _save_swatches(args.out / swatch, result["color"]["candidates"])
            result["swatch"] = swatch
            _write_json(args.out / filename, result)
            rows.append({
                "image": path.name,
                "status": "ok",
                "file": filename,
                "swatch": swatch,
                "category": result["category"]["name"],
                "color_candidates": [x["name"] for x in result["color"]["candidates"]],
                "visual_texture_candidates": [x["label"] for x in result["visual_texture"]["candidates"]],
                "needs_review": {k: result[k]["needs_review"] for k in ("category", "color", "visual_texture")},
                "attribute_region": result["color"]["input_region"]["kind"],
                "background_removal_status": result["background_removal"]["status"],
                "analysis_seconds": result["timings_seconds"]["total_analysis"],
            })
        _write_json(args.out / "summary.json", {
            "schema_version": 1,
            "device": "cpu",
            "cpu_threads": args.cpu_threads,
            "local_files_only": True,
            "requested_attribute_region": args.region,
            "mask_fallback": args.mask_fallback,
            "classifier_and_clip_load_with_text_features_seconds": ready - start,
            "run_seconds_excluding_imports_and_summary_write": perf_counter() - start,
            "images": rows,
        })
        print(f"{sum(row['status'] == 'ok' for row in rows)}/{len(rows)} images analyzed: {args.out / 'summary.json'}")
        if failed:
            raise SystemExit(1)
    except (OSError, ValueError, RuntimeError) as exc:
        p.exit(1, f"{p.prog}: {exc}\n")


if __name__ == "__main__":
    main()
