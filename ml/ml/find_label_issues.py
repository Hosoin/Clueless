"""라벨 검토 목록: 모델 판단과 라벨이 다른 사진을 뽑는다.

학습에 쓴 사진은 모델이 외워서 라벨과 같게 답하므로, 찍은 사람 단위 5겹 교차검증으로
"그 사진을 본 적 없는 모델"의 예측을 얻는다. 아직 라벨이 없는 Hoodie는 전체로 학습한 모델이 제안한다.

사용: uv run python -m ml.find_label_issues
결과: labels/review.csv  (검토자가 new_cls 칸을 채움 → labels/clothing_fixes.csv로 저장하면 학습에 반영)
      out/review.html    (브라우저로 사진을 보며 검토)
"""

import csv
import hashlib
import html
from pathlib import Path

import numpy as np
import torch
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, CLIP_REVISION, pick_device
from ml.garment_data import CLASSES, EXCLUDE, ROOT, image_path, load_rows, sender_parts
from ml.train_garment4 import embed, train_probe

FOLDS = 5
WEIGHT_DECAY = 1e-3  # shortcut: 고정값. train_garment4가 고른 값과 다르면 맞춘다


def fold_of(sender: str) -> int:
    return int(hashlib.md5(("fold" + sender).encode()).hexdigest(), 16) % FOLDS


def predict(probe: torch.nn.Linear, x: np.ndarray) -> np.ndarray:
    with torch.no_grad():
        return probe(torch.tensor(x, dtype=torch.float32)).softmax(1).numpy()


def main() -> None:
    device = pick_device()
    model = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION).to(device).eval()
    proc = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION)
    rows = load_rows(include_review=True)
    x = embed(rows, "raw", model, proc, device)
    labeled = np.array([r["cls"] is not None for r in rows])
    y = np.array([CLASSES.index(r["cls"]) if r["cls"] else -1 for r in rows])
    folds = np.array([fold_of(r["sender"]) for r in rows])

    probs = np.zeros((len(rows), len(CLASSES)))
    for k in range(FOLDS):
        tr, te = labeled & (folds != k), labeled & (folds == k)
        probs[te] = predict(train_probe(x[tr], y[tr], WEIGHT_DECAY), x[te])
    unl = ~labeled
    if unl.any():
        probs[unl] = predict(train_probe(x[labeled], y[labeled], WEIGHT_DECAY), x[unl])

    part = sender_parts([r["sender_id"] for r in csv.DictReader(open(ROOT / "images.csv"))])
    issues = []
    for i, r in enumerate(rows):
        pred = int(probs[i].argmax())
        if r["cls"] is not None and (CLASSES.index(r["cls"]) == pred or r["fixed"]):
            continue  # 라벨과 모델이 같거나, 이미 사람이 검토한 사진
        p_cur = float(probs[i, CLASSES.index(r["cls"])]) if r["cls"] else 0.0
        issues.append(
            {
                "id": r["id"],
                "split": part[r["sender"]],
                "orig_label": r["label"],
                "current_cls": r["cls"] or "",
                "model_cls": CLASSES[pred],
                "p_model": round(float(probs[i, pred]), 3),
                "p_current": round(p_cur, 3),
                "new_cls": "",
            }
        )
    # 라벨 없는 것(Hoodie) 먼저, 그다음 모델이 확신하는 순서 (라벨이 틀렸을 가능성이 큰 순)
    issues.sort(key=lambda d: (d["current_cls"] != "", -(d["p_model"] - d["p_current"])))

    Path("labels").mkdir(exist_ok=True)
    with open("labels/review.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(issues[0]))
        w.writeheader()
        w.writerows(issues)

    cards = []
    for d in issues:
        src = "../" + str(image_path({"id": d["id"]}, "raw"))
        cur = html.escape(d["current_cls"] or "라벨 없음")
        cards.append(
            f'<figure><img loading="lazy" src="{src}"><figcaption>'
            f"<b>{cur} → 모델: {d['model_cls']}</b> ({d['p_model']:.2f})<br>"
            f"원본 {html.escape(d['orig_label'])} · {d['split']}<br><code>{d['id'][:8]}</code></figcaption></figure>"
        )
    page = f"""<!doctype html><meta charset="utf-8"><title>라벨 검토</title>
<style>body{{font-family:sans-serif;margin:16px}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}}
figure{{margin:0;border:1px solid #ccc;border-radius:6px;padding:6px}}img{{width:100%;aspect-ratio:3/4;object-fit:contain;background:#eee}}
figcaption{{font-size:12px;line-height:1.4}}</style>
<h1>라벨 검토 {len(issues)}장</h1>
<p>기준: 다른 옷 위에 걸치고 앞이 열리는 옷 = 아우터. labels/review.csv의 new_cls 칸에 {" / ".join(CLASSES)} / {EXCLUDE} 중 하나를 적는다.
id 앞 8자리로 CSV에서 찾는다.</p><main>{"".join(cards)}</main>"""
    Path("out").mkdir(exist_ok=True)
    Path("out/review.html").write_text(page, encoding="utf-8")

    n_unl = sum(1 for d in issues if not d["current_cls"])
    print(f"검토 대상 {len(issues)}장: 라벨 없음(Hoodie) {n_unl}장, 라벨과 모델 불일치 {len(issues) - n_unl}장")
    from collections import Counter

    print("불일치 유형 (현재 → 모델):", Counter((d["current_cls"], d["model_cls"]) for d in issues if d["current_cls"]).most_common())
    print("labels/review.csv, out/review.html")


if __name__ == "__main__":
    main()
