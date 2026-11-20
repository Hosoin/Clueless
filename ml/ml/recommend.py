"""코디 추천 조립: 후보 조합(outfits.py) → 점수(궁합 + 취향 + 트렌드) → 다양성 → 상위 k개 + 근거.

지금 점수에 들어가는 것: 궁합 모델(weights/compat_mlp_polyvore.pt, Polyvore로 학습).
취향(스타일·좋아요 기록)과 트렌드는 기준이 정해지면 채운다. 그 전까지 0이고 근거에도 쓰지 않는다.
"""

from collections.abc import Callable
from pathlib import Path

import numpy as np
import torch

from ml.compat_data import SLOTS
from ml.outfits import Item, Outfit, candidate_outfits
from ml.settings import WEIGHTS_DIR
from ml.train_compat import CompatModel

COMPAT_WEIGHTS = WEIGHTS_DIR / "compat_mlp_polyvore.pt"  # K-Fashion을 섞은 버전은 "같은 사진" 지름길을 배워서 쓰지 않는다 (out/compat.json)
WEIGHTS = {"compat": 1.0, "taste": 0.0, "trend": 0.0}  # 취향·트렌드는 기준이 생기면 가중치를 올린다
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

    def compat(self, outfits: list[Outfit], emb: dict[str, np.ndarray]) -> np.ndarray:
        """코디마다 궁합 확률(0~1). 옷 수가 같은 코디끼리 묶어 한 번에 계산."""
        out = np.full(len(outfits), 0.5)  # 옷 1벌(원피스 단독)은 쌍이 없어 궁합을 잴 수 없음 → 중립값
        onehot = np.eye(len(SLOTS), dtype=np.float32)
        with torch.no_grad():
            for n in {len(o["items"]) for o in outfits} - {1}:
                idx = [i for i, o in enumerate(outfits) if len(o["items"]) == n]
                x = np.stack([[np.concatenate([emb[it["id"]], onehot[SLOTS.index(it["category"])]]) for it in outfits[i]["items"]] for i in idx])
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


def recommend(
    items: list[Item],
    emb: dict[str, np.ndarray],
    compat_fn: Callable[[list[Outfit]], np.ndarray],
    k: int = 5,
    include_id: str | None = None,
    allow_layering: bool = False,
    seed: int = 0,
) -> list[dict]:
    outfits = candidate_outfits(items, include_id=include_id, allow_layering=allow_layering)
    if not outfits:
        return []
    if len(outfits) > MAX_CANDIDATES:
        rng = np.random.default_rng(seed)
        outfits = [outfits[i] for i in rng.choice(len(outfits), MAX_CANDIDATES, replace=False)]
    parts = {"compat": compat_fn(outfits), "taste": np.zeros(len(outfits)), "trend": np.zeros(len(outfits))}
    total = sum(WEIGHTS[name] * v for name, v in parts.items())

    result = []
    for i in pick_diverse(total, outfits, k):
        o = outfits[i]
        reasons = list(o["reasons"])
        if parts["compat"][i] >= COMPAT_REASON_MIN:
            reasons.append("함께 입는 조합을 학습한 모델이 높게 평가했어요.")
        result.append({
            "items": [it["id"] for it in o["items"]],
            "template": o["template"],
            "roles": o["roles"],
            "score": round(float(total[i]), 4),
            "score_parts": {name: round(float(v[i]), 4) for name, v in parts.items()},
            "reasons": reasons,
        })
    return result
