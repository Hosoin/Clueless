"""코디 추천 조립: 후보 조합(outfits.py) → 점수(궁합 + 취향 + 트렌드) → 다양성 → 상위 k개 + 근거.

지금 점수에 들어가는 것: 궁합 모델(weights/compat_mlp_polyvore.pt, Polyvore로 학습)
+ 취향: 고른 스타일(또는 착용 기록에서 낸 스타일 비중)에 옷들이 맞는 정도 (스타일 모델 weights/style_probe.pt)
+ 색: 옷마다 면적 비율이 붙은 색(분석 응답 colors, 없으면 대표색 하나)끼리 규칙표로 잰 조합 점수.
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
WEIGHTS = {"compat": 1.0, "taste": 1.0, "color": 0.3, "trend": 0.0}  # 스타일을 안 고르면 취향은 0. 색은 규칙 초안이라 가중치를 낮게 시작
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


# 색 궁합 규칙 초안 (팔레트 이름 기준). shortcut: 감으로 정한 표, 팀 의견·코디 데이터로 조정한다
NEUTRALS = {"블랙", "화이트", "아이보리", "그레이", "네이비", "베이지"}
COLOR_FAMILIES = [{"블루", "스카이블루", "네이비", "청록"}, {"민트", "청록", "그린", "카키"}, {"베이지", "브라운", "카키", "아이보리"},
                  {"옐로", "오렌지", "브라운"}, {"레드", "와인", "핑크"}, {"퍼플", "라벤더", "핑크"}]
COLOR_CLASHES = {frozenset(p) for p in [("레드", "그린"), ("레드", "민트"), ("오렌지", "퍼플"), ("옐로", "퍼플"), ("오렌지", "핑크"), ("레드", "오렌지"), ("그린", "핑크")]}
MIN_COLOR_RATIO = 0.15  # 이보다 작은 면적(로고·단추·그림자)은 색 궁합에서 뺀다


def harmony(a: str, b: str) -> float:
    """두 색의 궁합 -1~1: 충돌 -1, 같은 색·같은 계열 0.7, 무채색이 끼면 0.5, 그 외 0."""
    if frozenset((a, b)) in COLOR_CLASHES:
        return -1.0
    if a == b or any(a in f and b in f for f in COLOR_FAMILIES):
        return 0.7
    return 0.5 if a in NEUTRALS or b in NEUTRALS else 0.0


def color_dist(it: Item) -> dict[str, float]:
    """옷의 색 분포 {색: 비율}. 분석 응답의 colors(면적 비율)를 쓰고, 없으면(수동 등록) 대표색 하나를 100%로.
    사용자가 확정한 대표색(color)이 colors 1위와 다르면 사용자 답을 믿는다: 1위 자리를 대표색으로 바꾸고 나머지(보조색)는 그대로."""
    cs = {c["name"]: c["ratio"] for c in it.get("colors") or [] if c.get("ratio", 0) >= MIN_COLOR_RATIO}
    main = it.get("color")
    if cs and main and main != max(cs, key=cs.get):
        top = max(cs, key=cs.get)
        cs[main] = cs.get(main, 0) + cs.pop(top)
    if not cs and main:
        cs = {main: 1.0}
    total = sum(cs.values())
    return {k: v / total for k, v in cs.items()} if total else {}


def color_scores(outfits: list[Outfit]) -> tuple[np.ndarray, list[list[str]]]:
    """코디마다 색 점수(0~1, 0.5 = 중립)와 근거(좋은 점만, 충돌은 점수로만 반영). 옷 쌍마다 Σ 비율×비율×궁합의 평균. 색을 모르는 옷은 빼고, 쌍이 없으면 0.5."""
    out, reasons = np.full(len(outfits), 0.5), []
    for i, o in enumerate(outfits):
        ds = [(it, color_dist(it)) for it in o["items"]]
        ds = [(it, d) for it, d in ds if d]
        pairs = [(a, b) for k, a in enumerate(ds) for b in ds[k + 1:]]
        why: list[str] = []
        if pairs:
            s = [sum(ra * rb * harmony(ca, cb) for ca, ra in a[1].items() for cb, rb in b[1].items()) for a, b in pairs]
            out[i] = (np.mean(s) + 1) / 2
            for a, b in pairs:  # 포인트 색 맞추기: 한 옷의 보조색(무채색 아님)이 다른 옷에도 있으면
                for c, r in a[1].items():
                    if c not in NEUTRALS and r < 0.5 and c in b[1]:
                        why.append(f"{c} 포인트 색을 맞췄어요.")
        reasons.append(sorted(set(why)))
    return out, reasons


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
    color, color_why = color_scores(outfits)
    parts = {"compat": compat_fn(outfits), "taste": taste, "color": color, "trend": np.zeros(len(outfits))}
    main_style = max(style_weights, key=style_weights.get) if style_weights else None
    total = sum(WEIGHTS[name] * v for name, v in parts.items())

    result = []
    for i in pick_diverse(total, outfits, k):
        o = outfits[i]
        reasons = list(o["reasons"])
        if parts["compat"][i] >= COMPAT_REASON_MIN:
            reasons.append("함께 입는 조합을 학습한 모델이 높게 평가했어요.")
        reasons += color_why[i]
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
