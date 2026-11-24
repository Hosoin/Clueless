"""대표색 분류: 규칙(k-means + 팔레트, 정확도 약 0.43)을 학습 모델로 바꾸기.

입력: K-Fashion 아이템 크롭의 FashionCLIP 벡터(ml.kfashion 캐시) + K-Fashion '색상' 라벨
모델: Linear 512→색 수. 사진 id로 나눈 test에서 규칙과 비교 (같은 아이템, 같은 정답)
색 이름: K-Fashion 이름을 우리 팔레트 이름으로 맞춘다 (옐로우→옐로, 실버→그레이). 골드·네온은 적어서 뺀다.
우리 팔레트의 아이보리·청록은 K-Fashion에 없어 모델이 고르지 못한다 → 규칙의 색 견본(rgb)은 계속 함께 보여준다.

사용: uv run python -m ml.train_color [--source kfashion_val]   →  weights/color_probe.pt, out/color.json
"""

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

import numpy as np
import torch

from ml.runlog import log_run
from ml.analyze import CLIP
from ml.compat_data import CACHE
from ml.train_garment4 import metrics, train_probe

TO_PALETTE = {"옐로우": "옐로", "실버": "그레이"}
DROP = {"골드", "네온", ""}
WEIGHT_DECAYS = [0.0, 1e-4, 1e-3, 1e-2]
CLOSE = {("아이보리", "화이트"), ("아이보리", "베이지"), ("네이비", "블랙"), ("블루", "네이비"), ("스카이블루", "블루")}  # 너그러운 기준에서 맞은 걸로 볼 이웃 색


def part_of(item_id: str) -> str:
    h = int(hashlib.md5(item_id.split("_")[0].encode()).hexdigest(), 16) % 100  # 사진 단위
    return "train" if h < 80 else "val" if h < 90 else "test"


def lenient(pred: str, true: str) -> bool:
    return pred == true or (pred, true) in CLOSE or (true, pred) in CLOSE


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="kfashion_val")
    args = ap.parse_args()
    z = np.load(CACHE / f"{args.source}.npz")
    true = [TO_PALETTE.get(c, c) for c in z["color_true"].tolist()]
    keep = [k for k, c in enumerate(true) if c not in DROP]
    classes = sorted({true[k] for k in keep}, key=lambda c: -Counter(true).get(c, 0))
    ids = [z["ids"][k] for k in keep]
    x_all, y_all = z["emb"][keep], np.array([classes.index(true[k]) for k in keep])
    rule_all = [z["colors"][k] for k in keep]
    parts = np.array([part_of(i) for i in ids])
    x = {p: x_all[parts == p] for p in ("train", "val", "test")}
    y = {p: y_all[parts == p] for p in ("train", "val", "test")}
    rule_test = [r for r, p in zip(rule_all, parts) if p == "test"]
    print(f"[{args.source}] 아이템 {len(ids)}개, 색 {len(classes)}개 → train {len(y['train'])} / val {len(y['val'])} / test {len(y['test'])}")

    n = len(classes)
    score = lambda wd: metrics(y["val"].tolist(), train_probe(x["train"], y["train"], wd, n_classes=n)(torch.tensor(x["val"])).argmax(1).tolist(), classes)["macro_f1"]  # noqa: E731
    probe = train_probe(x["train"], y["train"], max(WEIGHT_DECAYS, key=score), n_classes=n)
    pred = [classes[i] for i in probe(torch.tensor(x["test"])).argmax(1).tolist()]
    gold = [classes[i] for i in y["test"]]

    res = {}
    for name, p in {"규칙 (k-means+팔레트)": rule_test, "모델": pred}.items():
        res[name] = {
            "accuracy": round(float(np.mean([a == b for a, b in zip(p, gold)])), 3),
            "lenient": round(float(np.mean([lenient(a, b) for a, b in zip(p, gold)])), 3),
            "top_errors": Counter((b, a) for a, b in zip(p, gold) if a != b).most_common(8),
        }
    res["모델"]["per_class_recall"] = {c: v["recall"] for c, v in metrics(y["test"].tolist(), [classes.index(c) for c in pred], classes)["per_class"].items()}

    Path("weights").mkdir(exist_ok=True)
    torch.save({"classes": classes, "clip": CLIP, "source": args.source, "state_dict": probe.state_dict()}, "weights/color_probe.pt")
    Path("out").mkdir(exist_ok=True)
    Path("out/color.json").write_text(json.dumps(res, ensure_ascii=False, indent=2, default=str))
    log_run("color", {"source": args.source, "classes": len(classes)}, {k: {m: v[m] for m in ("accuracy", "lenient")} for k, v in res.items()})
    print(f"\ntest {len(gold)}개")
    for name, r in res.items():
        print(f"  {name:20} 정확도 {r['accuracy']:.3f}  이웃 색 허용 {r['lenient']:.3f}")
        print(f"    자주 틀림 (정답→예측): {r['top_errors'][:6]}")
    print("  모델 색별 재현:", {c: round(v, 2) for c, v in res["모델"]["per_class_recall"].items()})


if __name__ == "__main__":
    main()
