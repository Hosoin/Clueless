"""코디 궁합 모델 학습·평가 (직접 학습하는 핵심 모델).

입력: 코디를 이루는 옷들의 FashionCLIP 벡터(512) + 슬롯(상의/하의/아우터/원피스)
모델: 옷마다 작은 투영층 → 모든 옷 쌍의 궁합 점수(MLP) → 평균 = 코디 궁합 점수
정답: Polyvore 사용자가 만든 코디. 오답: 정답 코디에서 옷 하나를 같은 슬롯의 다른 옷으로 바꾼 것

기준선(같은 test로 비교): 무작위 / 비슷한 옷일수록 어울린다(코사인 유사도) / 색 조합 규칙
지표: 궁합 AUC(정답 vs 오답 구분), FITB 정확도(빈칸 하나에 맞는 옷을 후보 4개 중 고르기)

사용: uv run python -m ml.train_compat   (먼저 ml.compat_data)
결과: weights/compat_mlp_<구성>.pt, out/compat.json  (서비스 기본: compat_mlp_polyvore.pt)
"""

import hashlib
import itertools
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn

from ml.runlog import log_run
from ml.compat_data import CACHE, SLOTS

NEUTRALS = {"블랙", "화이트", "아이보리", "그레이", "네이비", "베이지"}
NEAR_K = 20  # 어려운 오답 후보: 원래 옷과 가장 비슷한 20벌
HARD_FRAC = 0.5  # 어려운 오답을 쓰는 구성에서 오답 중 이 비율만 어렵게 (나머지는 무작위)
EPOCHS = 60  # 30에서 val이 계속 오르고 있었음. 가장 좋은 val epoch의 가중치를 쓴다
SEED = 0


SOURCES = ["polyvore", "kfashion", "kfashion_val"]  # 캐시(ml.compat_data / ml.kfashion)가 있는 것만 쓴다
# 출처별 분할 비율. K-Fashion 샘플(kfashion)은 코디가 600개 남짓이라 test를 넉넉히(20%) 둔다
# kfashion_val: AI-Hub 전체 데이터의 Validation 세트에서 고른 사진(약 20%)
RATIOS = {"polyvore": (80, 90), "kfashion": (60, 80), "kfashion_val": (80, 90)}
NAMES = {"polyvore": "Polyvore", "kfashion": "K-Fashion 샘플", "kfashion_val": "K-Fashion 실제"}


def split_of(outfit: list[str], source: str) -> str:
    h = int(hashlib.md5(outfit[0].split("_")[0].encode()).hexdigest(), 16) % 100
    tr, va = RATIOS[source]
    return "train" if h < tr else "val" if h < va else "test"


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    """정답 점수가 오답 점수보다 클 확률 (동점은 0.5)."""
    scores = np.concatenate([pos, neg])
    order = scores.argsort()
    ranks = np.empty(len(scores))
    ranks[order] = np.arange(1, len(scores) + 1)
    for s in np.unique(scores):  # 동점 평균 순위
        m = scores == s
        ranks[m] = ranks[m].mean()
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


class CompatModel(nn.Module):
    def __init__(self, dim: int = 512, hidden: int = 256) -> None:
        super().__init__()
        self.proj = nn.Sequential(nn.Linear(dim + len(SLOTS), hidden), nn.ReLU(), nn.Dropout(0.2))
        self.pair = nn.Sequential(nn.Linear(2 * hidden, 128), nn.ReLU(), nn.Linear(128, 1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, n, 516) 같은 크기 코디 묶음 → (B,) 로짓. 쌍 순서에 상관없는 대칭 특징을 쓴다."""
        h = self.proj(x)
        logits = [self.pair(torch.cat([h[:, i] * h[:, j], (h[:, i] - h[:, j]).abs()], -1)) for i, j in itertools.combinations(range(x.shape[1]), 2)]
        return torch.cat(logits, -1).mean(-1)


class Data:
    """출처별 코디를 한 인덱스에 모은다. split 키는 "출처:train" 형태 (예: "kfashion:test")."""

    def __init__(self) -> None:
        ids, slots, colors, embs = [], [], [], []
        self.sources = [s for s in SOURCES if (CACHE / f"{s}.npz").exists()]
        for s in self.sources:
            z = np.load(CACHE / f"{s}.npz")
            ids += z["ids"].tolist()
            slots += z["slots"].tolist()
            colors += z["colors"].tolist()
            embs.append(z["emb"])
        self.idx = {i: k for k, i in enumerate(ids)}
        self.slots, self.colors = slots, colors
        self.emb = np.concatenate(embs)
        onehot = np.eye(len(SLOTS), dtype=np.float32)[[SLOTS.index(s) for s in slots]]
        self.x = torch.tensor(np.concatenate([self.emb, onehot], 1))
        self.split: dict[str, list[list[int]]] = {f"{s}:{p}": [] for s in self.sources for p in ("train", "val", "test")}
        for s in self.sources:
            for o_ids in json.loads((CACHE / f"{s}_outfits.json").read_text()):
                if all(i in self.idx for i in o_ids):  # 이미지가 없어 임베딩이 빠진 옷이 있으면 코디째 제외
                    self.split[f"{s}:{split_of(o_ids, s)}"].append([self.idx[i] for i in o_ids])
        # 오답을 만들 옷 풀: 같은 출처·같은 분할 안의 같은 슬롯 옷 (분할 사이에 옷이 섞이지 않게)
        self.pool = {k: {s: sorted({i for o in v for i in o if self.slots[i] == s}) for s in SLOTS} for k, v in self.split.items()}
        self._near: dict[tuple[str, str], dict[int, list[int]]] = {}

    def near(self, part: str, slot: str) -> dict[int, list[int]]:
        """같은 분할·슬롯 안에서 생김새(벡터)가 가장 비슷한 옷 NEAR_K개. 어려운 오답을 만들 때 쓴다."""
        if (part, slot) not in self._near:
            pool = np.array(self.pool[part][slot])
            sims = self.emb[pool] @ self.emb[pool].T
            np.fill_diagonal(sims, -np.inf)
            top = np.argsort(-sims, axis=1)[:, :NEAR_K]
            self._near[(part, slot)] = {int(i): pool[t].tolist() for i, t in zip(pool, top)}
        return self._near[(part, slot)]

    def negative(self, outfit: list[int], part: str, rng: random.Random, hard: bool = False) -> list[int]:
        """정답 코디에서 옷 하나를 같은 슬롯의 다른 옷으로 바꾼다.
        hard: 원래 옷과 생김새가 비슷한 옷으로 바꾼다. K-Fashion은 한 사진에서 잘라낸 옷들이 조명·색감을 공유해서
        무작위 오답이면 모델이 "같은 사진인가"만 보고도 맞힌다. 비슷한 옷으로 바꾸면 그 지름길이 막힌다."""
        # 바꿀 옷: 같은 슬롯에 다른 후보가 있는 자리만 (작은 K-Fashion 분할에선 원피스·아우터가 1개뿐일 수 있음)
        pos = rng.choice([k for k, i in enumerate(outfit) if len(self.pool[part][self.slots[i]]) > 1])
        slot = self.slots[outfit[pos]]
        cands = self.near(part, slot)[outfit[pos]] if hard and len(self.pool[part][slot]) > NEAR_K else self.pool[part][slot]
        new = outfit[pos]
        while new == outfit[pos]:
            new = rng.choice(cands)
        return outfit[:pos] + [new] + outfit[pos + 1 :]


def score_model(model: CompatModel, data: Data, outfits: list[list[int]]) -> np.ndarray:
    model.eval()
    out = np.zeros(len(outfits))
    with torch.no_grad():
        for n in {len(o) for o in outfits}:
            k = [i for i, o in enumerate(outfits) if len(o) == n]
            out[k] = model(data.x[torch.tensor([outfits[i] for i in k])]).numpy()
    return out


def score_cosine(data: Data, outfits: list[list[int]]) -> np.ndarray:
    return np.array([np.mean([data.emb[a] @ data.emb[b] for a, b in itertools.combinations(o, 2)]) for o in outfits])


def score_color_rule(data: Data, outfits: list[list[int]]) -> np.ndarray:
    """무채색은 아무 색과 어울림(+1), 같은 색(+0.5), 서로 다른 유채색끼리는 충돌(-1)."""
    def pair(a: str, b: str) -> float:
        if a in NEUTRALS or b in NEUTRALS:
            return 1.0
        return 0.5 if a == b else -1.0
    return np.array([np.mean([pair(data.colors[a], data.colors[b]) for a, b in itertools.combinations(o, 2)]) for o in outfits])


def evaluate(scorer, data: Data, part: str) -> dict:
    rng = random.Random(SEED + 1)  # 모든 방법이 같은 오답·같은 FITB 문제로 평가받게 고정
    pos = data.split[part]
    neg = [data.negative(o, part, rng) for o in pos]
    pos_scores = scorer(pos)
    result = {"auc": round(auc(pos_scores, scorer(neg)), 4)}
    # 어려운 오답(생김새가 비슷한 옷으로 바꾼 코디)으로 잰 AUC: 사진 지름길로는 못 맞힘
    hard_rng = random.Random(SEED + 2)
    result["auc_hard"] = round(auc(pos_scores, scorer([data.negative(o, part, hard_rng, hard=True) for o in pos])), 4)
    # FITB: 옷 하나를 비우고, 정답 + 같은 슬롯 오답 3개 중 코디 점수가 가장 높은 것을 고른다
    correct = asked = 0
    for o in pos:
        ok = [k for k, i in enumerate(o) if len(data.pool[part][data.slots[i]]) >= 4]  # 오답 후보 3개를 뽑을 수 있는 자리만
        if not ok:
            continue
        blank = rng.choice(ok)
        asked += 1
        cands = [o[blank]] + rng.sample([c for c in data.pool[part][data.slots[o[blank]]] if c != o[blank]], 3)
        # 정답 위치를 섞는다: 점수가 같은 후보가 많은 방법(색 규칙)이 "첫 번째 = 정답" 덕을 보지 않게
        rng.shuffle(cands)
        filled = [o[:blank] + [c] + o[blank + 1 :] for c in cands]
        scores = scorer(filled)
        best = [i for i, s in enumerate(scores) if s == scores.max()]
        correct += int(cands[rng.choice(best)] == o[blank])  # 동점이면 무작위로 하나
    result["fitb"] = round(correct / asked, 4)
    return result


def train(data: Data, train_sources: list[str], hard: bool = False) -> tuple[CompatModel, int]:
    """train_sources의 train 코디로 학습. epoch 선택은 모든 출처 val AUC 평균 (학습 구성과 무관하게 같은 기준)."""
    torch.manual_seed(SEED)
    rng = random.Random(SEED)
    model = CompatModel()
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    loss_fn = nn.BCEWithLogitsLoss()
    best_auc, best_state, best_epoch = -1.0, None, 0
    for epoch in range(EPOCHS):
        model.train()
        # 매 epoch 새 오답을 만든다 (같은 오답을 외우지 않게). 오답은 같은 출처의 옷으로
        batch = [(o, 1.0) for s in train_sources for o in data.split[f"{s}:train"]]
        batch += [(data.negative(o, f"{s}:train", rng, hard=hard and rng.random() < HARD_FRAC), 0.0) for s in train_sources for o in data.split[f"{s}:train"]]
        rng.shuffle(batch)
        for n in (2, 3):
            group = [(o, y) for o, y in batch if len(o) == n]
            for s in range(0, len(group), 256):
                chunk = group[s : s + 256]
                x = data.x[torch.tensor([o for o, _ in chunk])]
                y = torch.tensor([y for _, y in chunk])
                opt.zero_grad()
                loss_fn(model(x), y).backward()
                opt.step()
        val = np.mean([evaluate(lambda os: score_model(model, data, os), data, f"{s}:val")["auc"] for s in data.sources])
        if val > best_auc:
            best_auc, best_state, best_epoch = val, {k: v.clone() for k, v in model.state_dict().items()}, epoch
        if epoch % 10 == 9:
            print(f"  epoch {epoch + 1}: 평균 val AUC {val:.4f}", flush=True)
    model.load_state_dict(best_state)
    return model, best_epoch


def main() -> None:
    data = Data()
    print({k: len(v) for k, v in data.split.items()}, "코디")
    # (학습 출처, 어려운 오답 사용, 가중치 파일). 판단 기준: Polyvore test(사진 지름길이 없음)와 각 test의 auc_hard
    configs = {"Polyvore만": (["polyvore"], False, "compat_mlp_polyvore.pt"), "Polyvore만 +어려운 오답": (["polyvore"], True, "compat_mlp_polyvore_hard.pt")}
    if "kfashion_val" in data.sources:
        configs["Polyvore+K-Fashion 실제"] = (["polyvore", "kfashion_val"], False, "compat_mlp_polyvore_kfval.pt")
        configs["Polyvore+K-Fashion 실제 +어려운 오답"] = (["polyvore", "kfashion_val"], True, "compat_mlp_polyvore_kfval_hard.pt")

    results: dict[str, dict] = {s: {} for s in data.sources}
    rng_rand = np.random.default_rng(SEED)
    for s in data.sources:
        test = f"{s}:test"
        results[s]["무작위"] = evaluate(lambda os: rng_rand.random(len(os)), data, test)
        results[s]["코사인 유사도"] = evaluate(lambda os: score_cosine(data, os), data, test)
        results[s]["색 규칙"] = evaluate(lambda os: score_color_rule(data, os), data, test)
    Path("weights").mkdir(exist_ok=True)
    epochs = {}
    for name, (srcs, hard, fname) in configs.items():
        print(f"\n[{name}] 학습")
        model, best_epoch = train(data, srcs, hard)
        epochs[name] = best_epoch + 1
        for s in data.sources:
            results[s][f"궁합 모델 ({name})"] = evaluate(lambda os: score_model(model, data, os), data, f"{s}:test")
        torch.save({"state_dict": model.state_dict(), "slots": SLOTS, "clip": "patrickjohncyh/fashion-clip",
                    "train_sources": srcs, "hard_negatives": hard, "best_epoch": best_epoch}, f"weights/{fname}")

    report = {"split_sizes": {k: len(v) for k, v in data.split.items()}, "best_epoch": epochs, "test": results}
    Path("out").mkdir(exist_ok=True)
    Path("out/compat.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    log_run("compat", {"configs": {k: v[:2] for k, v in configs.items()}, "near_k": NEAR_K, "hard_frac": HARD_FRAC}, results)
    for s in data.sources:
        print(f"\n{s} test {len(data.split[f'{s}:test'])}개 코디")
        print(f"{'방법':40}{'궁합 AUC':>10}{'어려운 AUC':>11}{'FITB':>8}")
        for name, r in results[s].items():
            print(f"{name:40}{r['auc']:>10}{r['auc_hard']:>11}{r['fitb']:>8}")


if __name__ == "__main__":
    main()
