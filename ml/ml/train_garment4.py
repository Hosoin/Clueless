"""개별 옷 사진 4분류(상의/하의/아우터/원피스) 학습·평가.

기준선: FashionCLIP 제로샷 (문구 묶음 평균)
모델 1: 고정한 FashionCLIP 임베딩 + 로지스틱 회귀(linear probe). val 매크로 F1로 weight decay 선택, test로 최종 평가.

사용: uv run python -m ml.train_garment4               (기본 both: 원본+배경 제거본 학습, 배경 제거본으로 평가)
      uv run python -m ml.train_garment4 --variant raw   (원본 사진)
      uv run python -m ml.train_garment4 --variant nobg  (배경 제거본, 먼저 ml.garment_data nobg)
결과: weights/garment4_probe_<variant>.pt, out/garment4_<variant>.json
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from ml.runlog import log_run
from ml.analyze import CLIP, pick_device
from ml.garment_data import CLASSES, image_path, load_rows, split_by_sender

PROMPTS = {
    "상의": ["a photo of a t-shirt", "a photo of a shirt", "a photo of a long sleeve top", "a photo of a blouse", "a photo of a polo shirt"],
    "하의": ["a photo of pants", "a photo of jeans", "a photo of shorts", "a photo of a skirt"],
    "아우터": ["a photo of a jacket", "a photo of a coat", "a photo of a blazer", "a photo of a cardigan", "a photo of a padded jacket"],
    "원피스": ["a photo of a dress", "a photo of a jumpsuit"],
}
WEIGHT_DECAYS = [0.0, 1e-4, 1e-3, 1e-2, 1e-1]
EPOCHS = 300
CACHE = Path("data/processed/cache")


def metrics(y_true: list[int], y_pred: list[int], classes: list[str] = CLASSES) -> dict:
    n = len(classes)
    cm = np.zeros((n, n), int)  # 행: 정답, 열: 예측
    for t, p in zip(y_true, y_pred):
        cm[t, p] += 1
    per = {}
    f1s = []
    for i, c in enumerate(classes):
        tp = cm[i, i]
        prec = tp / cm[:, i].sum() if cm[:, i].sum() else 0.0
        rec = tp / cm[i].sum() if cm[i].sum() else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        per[c] = {"precision": round(float(prec), 3), "recall": round(float(rec), 3), "f1": round(float(f1), 3), "n": int(cm[i].sum())}
        f1s.append(f1)
    return {
        "accuracy": round(float(np.trace(cm) / cm.sum()), 3),
        "macro_f1": round(float(np.mean(f1s)), 3),
        "per_class": per,
        "confusion": cm.tolist(),
    }


@torch.no_grad()
def embed(rows: list[dict], variant: str, model: CLIPModel, proc: CLIPProcessor, device: str) -> np.ndarray:
    """FashionCLIP 이미지 임베딩(정규화). data/cache에 저장해 두고 다시 쓴다."""
    path = CACHE / f"fclip_{variant}.npz"
    cache: dict[str, np.ndarray] = {}
    if path.exists():
        z = np.load(path)
        cache = dict(zip(z["ids"].tolist(), z["emb"]))
    todo = [r for r in rows if r["id"] not in cache]
    for i in range(0, len(todo), 32):
        batch = todo[i : i + 32]
        images = [Image.open(image_path(r, variant)).convert("RGB") for r in batch]
        e = model.get_image_features(**proc(images=images, return_tensors="pt").to(device)).pooler_output
        e = (e / e.norm(dim=-1, keepdim=True)).cpu().numpy()
        cache.update({r["id"]: v for r, v in zip(batch, e)})
        print(f"  임베딩 {min(i + 32, len(todo))}/{len(todo)}", flush=True)
    if todo:
        CACHE.mkdir(parents=True, exist_ok=True)
        np.savez(path, ids=np.array(list(cache)), emb=np.stack(list(cache.values())))
    return np.stack([cache[r["id"]] for r in rows])


def train_probe(x: np.ndarray, y: np.ndarray, wd: float, seed: int = 0, n_classes: int = len(CLASSES)) -> torch.nn.Linear:
    torch.manual_seed(seed)
    xt, yt = torch.tensor(x, dtype=torch.float32), torch.tensor(y)
    # 클래스 불균형(상의가 아우터의 5배 이상) 보정: 적은 클래스에 큰 가중치
    counts = torch.bincount(yt, minlength=n_classes).float()
    loss_fn = torch.nn.CrossEntropyLoss(weight=counts.sum() / (n_classes * counts.clamp(min=1)))
    probe = torch.nn.Linear(x.shape[1], n_classes)
    opt = torch.optim.AdamW(probe.parameters(), lr=1e-2, weight_decay=wd)
    for _ in range(EPOCHS):  # 3천 장이라 전체 배치로 충분
        opt.zero_grad()
        loss_fn(probe(xt), yt).backward()
        opt.step()
    return probe


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--variant", choices=["raw", "nobg", "both"], default="both")
    args = p.parse_args()

    device = pick_device()
    model = CLIPModel.from_pretrained(CLIP).to(device).eval()
    proc = CLIPProcessor.from_pretrained(CLIP)
    splits = split_by_sender(load_rows())
    # both: 원본+배경 제거본을 함께 학습(어느 입력이 와도 안정적), val/test는 서비스 입력인 배경 제거본으로 잰다
    eval_variant = "nobg" if args.variant == "both" else args.variant
    x = {k: embed(v, eval_variant, model, proc, device) for k, v in splits.items()}
    y = {k: np.array([CLASSES.index(r["cls"]) for r in v]) for k, v in splits.items()}
    if args.variant == "both":
        x["train"] = np.concatenate([embed(splits["train"], "raw", model, proc, device), x["train"]])
        y["train"] = np.concatenate([y["train"], y["train"]])

    # 기준선: 제로샷. 클래스마다 문구 임베딩 평균
    with torch.no_grad():
        text = []
        for c in CLASSES:
            t = model.get_text_features(**proc(text=PROMPTS[c], return_tensors="pt", padding=True).to(device)).pooler_output
            t = t / t.norm(dim=-1, keepdim=True)
            m = t.mean(0)
            text.append((m / m.norm()).cpu().numpy())
    zs_pred = (x["test"] @ np.stack(text).T).argmax(1)
    zero_shot = metrics(y["test"].tolist(), zs_pred.tolist())

    # 모델 1: linear probe. val 매크로 F1로 weight decay 고르기
    best_wd, best_f1, val_scores = None, -1.0, {}
    for wd in WEIGHT_DECAYS:
        probe = train_probe(x["train"], y["train"], wd)
        with torch.no_grad():
            pred = probe(torch.tensor(x["val"], dtype=torch.float32)).argmax(1).tolist()
        f1 = metrics(y["val"].tolist(), pred)["macro_f1"]
        val_scores[str(wd)] = f1
        if f1 > best_f1:
            best_wd, best_f1 = wd, f1
    probe = train_probe(x["train"], y["train"], best_wd)
    with torch.no_grad():
        test_pred = probe(torch.tensor(x["test"], dtype=torch.float32)).argmax(1).tolist()
    linear = metrics(y["test"].tolist(), test_pred)

    Path("weights").mkdir(exist_ok=True)
    torch.save(
        {"classes": CLASSES, "clip": CLIP, "variant": args.variant, "weight_decay": best_wd, "state_dict": probe.state_dict()},
        f"weights/garment4_probe_{args.variant}.pt",
    )
    report = {
        "variant": args.variant,
        "split_sizes": {k: len(v) for k, v in splits.items()},
        "zero_shot_test": zero_shot,
        "linear_probe": {"val_macro_f1_by_weight_decay": val_scores, "chosen_weight_decay": best_wd, "test": linear},
    }
    Path("out").mkdir(exist_ok=True)
    Path(f"out/garment4_{args.variant}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    log_run("garment4", {"variant": args.variant, "weight_decay": best_wd}, {"zero_shot": {k: zero_shot[k] for k in ("accuracy", "macro_f1")}, "linear": {k: linear[k] for k in ("accuracy", "macro_f1")}})

    print(f"\n[{args.variant}] test {len(y['test'])}장")
    print(f"{'':10}{'정확도':>8}{'매크로F1':>9}  " + "  ".join(f"{c} 재현" for c in CLASSES))
    for name, m in [("제로샷", zero_shot), ("linear", linear)]:
        rec = "  ".join(f"{m['per_class'][c]['recall']:>7}" for c in CLASSES)
        print(f"{name:10}{m['accuracy']:>8}{m['macro_f1']:>9}  {rec}")
    print("\nlinear 혼동 행렬 (행=정답, 열=예측):", CLASSES)
    for c, row in zip(CLASSES, linear["confusion"]):
        print(f"  {c:4} {row}")


if __name__ == "__main__":
    main()
