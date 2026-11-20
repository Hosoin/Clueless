"""개별 옷 사진 추론: 배경 제거 → FashionCLIP 임베딩 → 4분류 → 색 제안. 등록 확인 카드 JSON을 낸다.

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

from ml.analyze import pick_device
from ml.background import BackgroundRemover
from ml.colors import suggest_colors

PROBE = Path("weights/garment4_probe_both.pt")
SLEEVE_PROBE = Path("weights/sleeve_probe.pt")  # 없으면 소매 기장은 결과에서 빠진다
COLOR_PROBE = Path("weights/color_probe.pt")  # 없으면 색 이름은 규칙(k-means + 팔레트)만 쓴다
SLEEVE_CATEGORIES = {"상의", "아우터", "원피스"}  # 하의에는 소매가 없다
# shortcut: 기준값 초안. 팀원 프리셋 사진 평가에서 "확인 필요"가 실제 오답을 잘 잡는지 보고 다시 정한다.
REVIEW_PROB = 0.6  # 1위 확률이 이보다 낮으면 사용자 확인 요청
MIN_MASK_RATIO = 0.05  # 옷이 사진의 5% 미만이면 다시 찍기 안내
COLOR_REVIEW_PROB = 0.5  # 색 모델 1위 확률이 이보다 낮으면 색을 사용자에게 고르게 한다


def load_probe(path: Path) -> tuple[list[str], torch.nn.Linear, str] | None:
    """FashionCLIP 벡터 위의 작은 분류기(Linear). 파일이 없으면 None."""
    if not path.exists():
        return None
    ck = torch.load(path, map_location="cpu")
    probe = torch.nn.Linear(ck["state_dict"]["weight"].shape[1], len(ck["classes"]))
    probe.load_state_dict(ck["state_dict"])
    return ck["classes"], probe.eval(), ck["clip"]


def rank(head: tuple[list[str], torch.nn.Linear, str], emb: np.ndarray) -> list[tuple[str, float]]:
    with torch.no_grad():
        probs = head[1](torch.tensor(emb[None])).softmax(1)[0].tolist()
    return sorted(zip(head[0], probs), key=lambda x: -x[1])


class GarmentClassifier:
    def __init__(self, probe_path: Path = PROBE, device: str | None = None) -> None:
        self.device = device or pick_device()
        head = load_probe(probe_path)
        assert head, f"{probe_path}가 없습니다 (README의 가중치 받기 참고)"
        self.classes, self.probe, clip = head
        self.sleeve, self.color = load_probe(SLEEVE_PROBE), load_probe(COLOR_PROBE)
        for h in (self.sleeve, self.color):  # 같은 벡터를 쓰므로 같은 FashionCLIP으로 학습된 것만
            assert h is None or h[2] == clip, "분류기마다 FashionCLIP 버전이 다릅니다"
        self.clip = CLIPModel.from_pretrained(clip).to(self.device).eval()
        self.proc = CLIPProcessor.from_pretrained(clip)
        self.remover = BackgroundRemover(self.device)

    @torch.no_grad()
    def embed(self, image: Image.Image) -> np.ndarray:
        e = self.clip.get_image_features(**self.proc(images=image, return_tensors="pt").to(self.device)).pooler_output
        return (e / e.norm(dim=-1, keepdim=True)).cpu().numpy()[0]

    def analyze(self, image: Image.Image) -> tuple[dict, Image.Image, np.ndarray]:
        """반환: (확인 카드용 결과, 흰 배경 정사각 크롭, 512차원 임베딩). CLI와 API가 같이 쓴다."""
        image = image.convert("RGB")
        mask, crop = self.remover(image)
        emb = self.embed(crop)
        ranked = rank((self.classes, self.probe, ""), emb)
        mask_ratio = float(mask.mean())
        colors = [{**c, "ratio": round(c["ratio"], 2)} for c in suggest_colors(np.array(image), mask)]
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
        result, crop, emb = self.analyze(Image.open(path))
        result = {"image": path.name, **result, "crop": "crop.png", "embedding_dim": len(emb)}
        out_dir.mkdir(parents=True, exist_ok=True)
        crop.save(out_dir / "crop.png")
        (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        return result


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("images", nargs="+", type=Path)
    p.add_argument("--out", type=Path, default=Path("out/garment"))
    args = p.parse_args()
    clf = GarmentClassifier()
    for path in args.images:
        r = clf(path, args.out / path.stem)
        flags = (" (확인 필요)" if r["needs_review"] else "") + (" (다시 찍기)" if r["retake"] else "")
        color = r["colors"][0]["name"] if r["colors"] else "-"
        print(f"{path.name}: {r['category']['name']} {r['category']['prob']:.2f} / {color}{flags}")


if __name__ == "__main__":
    main()
