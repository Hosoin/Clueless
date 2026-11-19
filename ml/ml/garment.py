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
# shortcut: 기준값 초안. 팀원 프리셋 사진 평가에서 "확인 필요"가 실제 오답을 잘 잡는지 보고 다시 정한다.
REVIEW_PROB = 0.6  # 1위 확률이 이보다 낮으면 사용자 확인 요청
MIN_MASK_RATIO = 0.05  # 옷이 사진의 5% 미만이면 다시 찍기 안내


class GarmentClassifier:
    def __init__(self, probe_path: Path = PROBE, device: str | None = None) -> None:
        self.device = device or pick_device()
        ck = torch.load(probe_path, map_location="cpu")
        self.classes: list[str] = ck["classes"]
        self.probe = torch.nn.Linear(ck["state_dict"]["weight"].shape[1], len(self.classes))
        self.probe.load_state_dict(ck["state_dict"])
        self.clip = CLIPModel.from_pretrained(ck["clip"]).to(self.device).eval()
        self.proc = CLIPProcessor.from_pretrained(ck["clip"])
        self.remover = BackgroundRemover(self.device)

    @torch.no_grad()
    def embed(self, image: Image.Image) -> np.ndarray:
        e = self.clip.get_image_features(**self.proc(images=image, return_tensors="pt").to(self.device)).pooler_output
        return (e / e.norm(dim=-1, keepdim=True)).cpu().numpy()[0]

    def __call__(self, path: Path, out_dir: Path) -> dict:
        image = Image.open(path).convert("RGB")
        mask, crop = self.remover(image)
        emb = self.embed(crop)
        with torch.no_grad():
            probs = self.probe(torch.tensor(emb[None])).softmax(1)[0].tolist()
        ranked = sorted(zip(self.classes, probs), key=lambda x: -x[1])
        mask_ratio = float(mask.mean())

        out_dir.mkdir(parents=True, exist_ok=True)
        crop.save(out_dir / "crop.png")
        result = {
            "image": path.name,
            "category": {"name": ranked[0][0], "prob": round(ranked[0][1], 3)},  # 제안값, 최종값은 사용자가 확인
            "category_candidates": [{"name": c, "prob": round(p, 3)} for c, p in ranked],
            "colors": [{**c, "ratio": round(c["ratio"], 2)} for c in suggest_colors(np.array(image), mask)],
            "mask_ratio": round(mask_ratio, 3),
            "retake": mask_ratio < MIN_MASK_RATIO,  # 옷이 너무 작게 찍힘(또는 배경 제거 실패)
            "needs_review": ranked[0][1] < REVIEW_PROB,
            "crop": "crop.png",
            "embedding_dim": len(emb),  # 벡터 자체는 옷장 DB(pgvector)에 저장할 값. 여기선 크기만 표시
        }
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
