"""소매 기장 분류 (민소매 / 반팔 / 7부 / 긴팔) — 레이어드 규칙(겉 소매 ≤ 이너 소매)의 입력.

입력: K-Fashion 아이템의 FashionCLIP 벡터(ml.kfashion 캐시) + K-Fashion '소매기장' 라벨
모델: Linear 512→4 (4분류 모델과 같은 방식)
평가: K-Fashion 착장 크롭(사진 id로 나눈 test) + clothing-dataset 개별 옷 사진(우리 실제 입력 형태, 배경 제거본)
     clothing-dataset은 라벨에 소매 정보가 분명한 것만 씀: T-Shirt·Polo → 반팔, Longsleeve → 긴팔

사용: uv run python -m ml.train_sleeve [--source kfashion_val]
결과: weights/sleeve_probe.pt, out/sleeve.json
"""

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np
import torch
from transformers import CLIPModel, CLIPProcessor

from ml.runlog import log_run
from ml.analyze import CLIP, pick_device
from ml.compat_data import CACHE
from ml.garment_data import load_rows, split_by_sender
from ml.kfashion_stats import ZIPS
from ml.train_garment4 import metrics, train_probe

SLEEVES = ["민소매", "반팔", "7부", "긴팔"]  # 짧은 순서. 레이어드 규칙에서 순서를 비교한다
LABEL_MAP = {"민소매": "민소매", "없음": "민소매", "반팔": "반팔", "캡": "반팔", "7부소매": "7부", "긴팔": "긴팔"}
SLOTS_WITH_SLEEVE = ("상의", "아우터", "원피스")
PROMPTS = {
    "민소매": ["a photo of a sleeveless top", "a photo of a tank top"],
    "반팔": ["a photo of a short sleeve shirt", "a photo of a short sleeve t-shirt"],
    "7부": ["a photo of a three-quarter sleeve top", "a photo of an elbow length sleeve top"],
    "긴팔": ["a photo of a long sleeve shirt", "a photo of a long sleeve top"],
}
CLOTHING_TO_SLEEVE = {"T-Shirt": "반팔", "Polo": "반팔", "Longsleeve": "긴팔"}
WEIGHT_DECAYS = [0.0, 1e-4, 1e-3, 1e-2]


def sleeve_labels(source: str) -> dict[str, str]:
    """아이템 id(ml.kfashion과 같은 규칙) → 소매 기장. 샘플은 풀린 폴더, 전체 데이터는 라벨 zip에서 읽는다."""
    def add(d: dict, prefix: str) -> None:
        info, lab = d["이미지 정보"], d["데이터셋 정보"]["데이터셋 상세설명"]["라벨링"]
        for slot in SLOTS_WITH_SLEEVE:
            v = LABEL_MAP.get(((lab.get(slot) or [{}])[0]).get("소매기장"))
            if v:
                out[f"{prefix}{info['이미지 식별자']}_{slot}"] = v

    out: dict[str, str] = {}
    if source == "kfashion":
        for p in Path("data/raw/kfashion_sample").glob("라벨링데이터/*/*.json"):
            add(json.loads(p.read_text(encoding="utf-8")), "kf")
    else:
        z = zipfile.ZipFile(ZIPS["val"])
        for info in z.infolist():
            if info.filename.endswith(".json"):
                add(json.loads(z.read(info).decode("utf-8-sig")), source.replace("_", ""))
    return out


def part_of(item_id: str) -> str:
    h = int(hashlib.md5(item_id.split("_")[0].encode()).hexdigest(), 16) % 100  # 사진 단위로 나눈다
    return "train" if h < 80 else "val" if h < 90 else "test"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="kfashion_val" if (CACHE / "kfashion_val.npz").exists() else "kfashion")
    args = ap.parse_args()

    z = np.load(CACHE / f"{args.source}.npz")
    labels = sleeve_labels(args.source)
    keep = [k for k, i in enumerate(z["ids"].tolist()) if i in labels]
    ids = [z["ids"][k] for k in keep]
    x_all = z["emb"][keep]
    y_all = np.array([SLEEVES.index(labels[i]) for i in ids])
    parts = np.array([part_of(i) for i in ids])
    x = {p: x_all[parts == p] for p in ("train", "val", "test")}
    y = {p: y_all[parts == p] for p in ("train", "val", "test")}
    print(f"[{args.source}] 아이템 {len(ids)}개 → train {len(y['train'])} / val {len(y['val'])} / test {len(y['test'])}")
    print("  분포:", {s: int((y_all == k).sum()) for k, s in enumerate(SLEEVES)})

    # 기준선: FashionCLIP 제로샷
    device = pick_device()
    clip = CLIPModel.from_pretrained(CLIP).to(device).eval()
    proc = CLIPProcessor.from_pretrained(CLIP)
    with torch.no_grad():
        text = []
        for s in SLEEVES:
            t = clip.get_text_features(**proc(text=PROMPTS[s], return_tensors="pt", padding=True).to(device)).pooler_output
            t = (t / t.norm(dim=-1, keepdim=True)).mean(0)
            text.append((t / t.norm()).cpu().numpy())
    text = np.stack(text)

    # 우리 실제 입력 형태: clothing-dataset 개별 옷 사진(배경 제거본). 찍은 사람 단위 분할(4분류 모델과 같은 분할)
    c = np.load(CACHE / "fclip_nobg.npz")
    emb = dict(zip(c["ids"].tolist(), c["emb"]))
    flat = split_by_sender([r for r in load_rows() if r["label"] in CLOTHING_TO_SLEEVE and r["id"] in emb])
    xf = {p: np.stack([emb[r["id"]] for r in v]) for p, v in flat.items()}
    yf = {p: np.array([SLEEVES.index(CLOTHING_TO_SLEEVE[r["label"]]) for r in v]) for p, v in flat.items()}

    def fit(use_flat: bool) -> torch.nn.Linear:
        """use_flat: 개별 옷 사진 train도 섞는다 (착장 크롭만 배우면 개별 옷 사진에서 긴팔을 7부로 자주 틀림)."""
        xt = np.concatenate([x["train"], xf["train"]]) if use_flat else x["train"]
        yt = np.concatenate([y["train"], yf["train"]]) if use_flat else y["train"]
        xv, yv = np.concatenate([x["val"], xf["val"]]), np.concatenate([y["val"], yf["val"]])  # 두 구성 모두 같은 val로 고른다
        score = lambda wd: metrics(yv.tolist(), train_probe(xt, yt, wd, n_classes=4)(torch.tensor(xv)).argmax(1).tolist(), SLEEVES)["macro_f1"]  # noqa: E731
        return train_probe(xt, yt, max(WEIGHT_DECAYS, key=score), n_classes=4)

    probes = {"K-Fashion만": fit(False), "착장+개별 옷": fit(True)}
    res: dict = {"K-Fashion 착장 크롭": {}, "개별 옷 사진 (반팔/긴팔만)": {}}
    for name, (xs, ys) in {"K-Fashion 착장 크롭": (x["test"], y["test"]), "개별 옷 사진 (반팔/긴팔만)": (xf["test"], yf["test"])}.items():
        res[name]["제로샷"] = metrics(ys.tolist(), (xs @ text.T).argmax(1).tolist(), SLEEVES)
        for pname, p in probes.items():
            res[name][pname] = metrics(ys.tolist(), p(torch.tensor(xs, dtype=torch.float32)).argmax(1).tolist(), SLEEVES)
    probe = probes["착장+개별 옷"]  # 서비스 입력(개별 옷 사진)에 맞춘 구성을 저장

    Path("weights").mkdir(exist_ok=True)
    torch.save({"classes": SLEEVES, "clip": CLIP, "source": args.source + "+clothing-dataset", "state_dict": probe.state_dict()}, "weights/sleeve_probe.pt")
    Path("out").mkdir(exist_ok=True)
    Path("out/sleeve.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
    log_run("sleeve", {"source": args.source}, {test: {m: {k: v[k] for k in ("accuracy", "macro_f1")} for m, v in r.items()} for test, r in res.items()})

    for name, r in res.items():
        print(f"\n{name}")
        for m, v in r.items():
            rec = "  ".join(f"{s} {v['per_class'][s]['recall']:.2f}({v['per_class'][s]['n']})" for s in SLEEVES)
            print(f"  {m:10} 정확도 {v['accuracy']:.3f} 매크로F1 {v['macro_f1']:.3f} | 재현 {rec}")
        print("  착장+개별 옷 혼동 행렬 (행=정답, 열=예측):", SLEEVES)
        for s, row in zip(SLEEVES, r["착장+개별 옷"]["confusion"]):
            print(f"    {s:4} {row}")


if __name__ == "__main__":
    main()
