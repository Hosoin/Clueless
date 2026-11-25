"""코디 추천 조립: 후보 조합(outfits.py) → 점수(궁합 + 취향 + 트렌드) → 다양성 → 상위 k개 + 근거.

지금 점수에 들어가는 것: 궁합 모델(weights/compat_mlp_polyvore.pt, Polyvore로 학습)
+ 취향: 고른 스타일(또는 착용 기록에서 낸 스타일 비중)에 옷들이 맞는 정도 (스타일 모델 weights/style_probe.pt).
트렌드는 기준이 정해지면 채운다. 그 전까지 0이고 근거에도 쓰지 않는다.
"""

from collections.abc import Callable
from pathlib import Path

import numpy as np
import torch

from ml.compat_data import SLOTS
from ml.garment import load_style_head
from ml.outfits import Item, Outfit, candidate_outfits
from ml.settings import WEIGHTS_DIR
from ml.train_compat import CompatModel

COMPAT_WEIGHTS = WEIGHTS_DIR / "compat_mlp_polyvore.pt"  # K-Fashion을 섞은 버전은 "같은 사진" 지름길을 배워서 쓰지 않는다 (out/compat.json)
WEIGHTS = {"compat": 1.0, "taste": 1.0, "trend": 0.0}  # 스타일을 안 고르면 취향은 0이라 궁합만으로 정렬된다
DIVERSITY = 0.3  # 이미 고른 코디와 옷이 겹치는 만큼 깎는 정도
COMPAT_REASON_MIN = 0.6  # 궁합 확률이 이 이상일 때만 "모델이 높게 평가" 근거를 붙인다
MAX_CANDIDATES = 20000  # shortcut: 옷장이 아주 크면 후보를 무작위로 줄인다. 실제 옷장 크기를 보고 칸별 상위 k개 방식으로 바꾼다


class Recommender:
    def __init__(self, weights_path: Path = COMPAT_WEIGHTS) -> None:
        ck = torch.load(weights_path, map_location="cpu")
        self.model = CompatModel()
        self.model.load_state_dict(ck["state_dict"])
        self.model.eval()
        self.version = weights_path.stem
        self.style = load_style_head()  # 없으면 스타일 추천 요청은 503

    def compat(self, outfits: list[Outfit], emb: dict[str, np.ndarray]) -> np.ndarray:
        """코디마다 궁합 확률(0~1). 벡터가 있는 옷끼리만 재고, 옷 수가 같은 코디끼리 묶어 한 번에 계산.
        사진 없이 직접 입력한 옷은 벡터가 없어 궁합에서 빠진다. 잴 쌍이 없으면(옷 1벌 등) 중립값 0.5."""
        out = np.full(len(outfits), 0.5)
        onehot = np.eye(len(SLOTS), dtype=np.float32)
        scored = [[it for it in o["items"] if it["id"] in emb] for o in outfits]
        with torch.no_grad():
            for n in {len(s) for s in scored} - {0, 1}:
                idx = [i for i, s in enumerate(scored) if len(s) == n]
                x = np.stack([[np.concatenate([emb[it["id"]], onehot[SLOTS.index(it["category"])]]) for it in scored[i]] for i in idx])
                out[idx] = torch.sigmoid(self.model(torch.tensor(x))).numpy()
        return out


def pick_diverse(scores: np.ndarray, outfits: list[Outfit], k: int) -> list[int]:
    """점수 높은 순으로 고르되, 이미 고른 코디와 옷이 많이 겹치면 깎는다 (같은 옷만 반복되지 않게)."""
    chosen: list[int] = []
    used: list[set[str]] = []
    remaining = set(range(len(outfits)))
    while remaining and len(chosen) < k:
        def adjusted(i: int) -> float:
            ids = {it["id"] for it in outfits[i]["items"]}
            overlap = max((len(ids & u) / len(ids) for u in used), default=0.0)
            return scores[i] - DIVERSITY * overlap
        best = max(remaining, key=adjusted)
        chosen.append(best)
        used.append({it["id"] for it in outfits[best]["items"]})
        remaining.discard(best)
    return chosen


def style_taste(outfits: list[Outfit], styles: dict[str, dict], weights: dict[str, float]) -> np.ndarray:
    """코디마다 스타일 맞춤 정도(0~1): 옷마다 Σ 비중 × 스타일 점수, 그 평균. 스타일을 모르는 옷(벡터 없음)은 빼고, 다 모르면 0."""
    total = sum(weights.values()) or 1.0
    out = np.zeros(len(outfits))
    for i, o in enumerate(outfits):
        v = [sum(w * styles[it["id"]]["scores"][s] for s, w in weights.items()) / total for it in o["items"] if it["id"] in styles]
        out[i] = np.mean(v) if v else 0.0
    return out


def recommend(
    items: list[Item],
    emb: dict[str, np.ndarray],
    compat_fn: Callable[[list[Outfit]], np.ndarray],
    k: int = 5,
    include_id: str | None = None,
    allow_layering: bool = False,
    seed: int = 0,
    styles: dict[str, dict] | None = None,
    style_weights: dict[str, float] | None = None,
) -> list[dict]:
    """styles: 옷 id → style_scores 결과, style_weights: {스타일: 비중} (사용자가 고른 스타일이면 {스타일: 1})."""
    outfits = candidate_outfits(items, include_id=include_id, allow_layering=allow_layering)
    if not outfits:
        return []
    if len(outfits) > MAX_CANDIDATES:
        rng = np.random.default_rng(seed)
        outfits = [outfits[i] for i in rng.choice(len(outfits), MAX_CANDIDATES, replace=False)]
    taste = style_taste(outfits, styles, style_weights) if styles and style_weights else np.zeros(len(outfits))
    parts = {"compat": compat_fn(outfits), "taste": taste, "trend": np.zeros(len(outfits))}
    main_style = max(style_weights, key=style_weights.get) if style_weights else None
    total = sum(WEIGHTS[name] * v for name, v in parts.items())

    result = []
    for i in pick_diverse(total, outfits, k):
        o = outfits[i]
        reasons = list(o["reasons"])
        if parts["compat"][i] >= COMPAT_REASON_MIN:
            reasons.append("함께 입는 조합을 학습한 모델이 높게 평가했어요.")
        known = [it["id"] for it in o["items"] if styles and it["id"] in styles]
        if main_style and known and all(main_style in styles[x]["tags"] for x in known):
            reasons.append(f"모든 옷이 {main_style} 스타일이에요.")
        result.append({
            "items": [it["id"] for it in o["items"]],
            "template": o["template"],
            "roles": o["roles"],
            "score": round(float(total[i]), 4),
            "score_parts": {name: round(float(v[i]), 4) for name, v in parts.items()},
            "reasons": reasons,
        })
    return result
