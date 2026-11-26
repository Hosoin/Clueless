"""옷 구분 특징: 세부 종류(subcategory)와 프린트. 비슷한 옷(예: 흰 반팔 티 여러 벌)을 나누고 자동 이름을 만드는 데 쓴다.

입력: K-Fashion 아이템의 FashionCLIP 벡터(ml.train_style 캐시) + K-Fashion '카테고리'·'프린트'·'기장' 라벨
      세부 종류는 clothing-dataset 개별 옷 사진도 섞어 학습 (착장 크롭만 배우면 개별 옷 사진에서 흔들림, 소매 모델과 같은 이유)
모델: Linear 또는 MLP (val 매크로 F1로 고름). 세부 종류는 추론 때 4분류 결과의 칸(상의·하의·아우터·원피스) 안에서만 고른다
평가: K-Fashion 사진 단위 test + clothing-dataset test(세부 종류만, 라벨이 분명한 것)

사용: uv run python -m ml.train_attrs   (먼저 ml.train_style로 캐시를 만든다)
결과: weights/subcat_probe.pt, weights/print_probe.pt (AI-Hub 학습분이라 공개 Release에 올리지 않음), out/attrs.json
"""

import json
import zipfile
from pathlib import Path

import numpy as np
import torch

from ml.analyze import CLIP
from ml.compat_data import CACHE
from ml.garment import PRINTS, SUBCAT_GROUP, SUBCATS
from ml.garment_data import load_rows, split_by_sender
from ml.kfashion_stats import ZIPS
from ml.runlog import log_run
from ml.train_garment4 import metrics, train_probe
from ml.train_sleeve import part_of
from ml.train_style import CACHE_FILE

# K-Fashion 세부 카테고리 → 우리 이름 (ml/categories.py, 레이어드 규칙이 쓰는 이름)
SUBCAT_MAP = {"티셔츠": "티셔츠", "블라우스": "블라우스", "니트웨어": "니트", "탑": "민소매", "브라탑": "민소매", "셔츠": "셔츠", "후드티": "후드티",
              "팬츠": "슬랙스", "청바지": "청바지", "래깅스": "트레이닝 바지", "조거팬츠": "트레이닝 바지", "스커트": "치마",
              "재킷": "재킷", "점퍼": "재킷", "짚업": "재킷", "코트": "코트", "가디건": "가디건", "베스트": "조끼", "패딩": "패딩",
              "드레스": "원피스", "점프수트": "점프수트"}
SHORT_LENGTHS = {"미니", "니렝스"}  # 팬츠·청바지인데 이 기장이면 반바지
PRINT_MAP = {"무지": "무지", "레터링": "레터링", "그래픽": "그래픽", "체크": "체크", "깅엄": "체크", "하운즈\xa0투스": "체크", "아가일": "체크",
             "스트라이프": "스트라이프", "플로럴": "플로럴", "페이즐리": "플로럴", "도트": "도트"}  # 나머지(호피·믹스·카무플라쥬 …)는 기타무늬
CLOTHING_TO_SUBCAT = {"T-Shirt": "티셔츠", "Polo": "티셔츠", "Shirt": "셔츠", "Blouse": "블라우스", "Hoodie": "후드티",
                      "Shorts": "반바지", "Skirt": "치마", "Dress": "원피스", "Blazer": "재킷"}
WEIGHT_DECAYS = [0.0, 1e-4, 1e-3, 1e-2]
HIDDENS = [0, 256]


def kfashion_labels(ids: set[str]) -> dict[str, dict]:
    """아이템 id(kfstyle<사진id>_<칸>) → {"subcat", "print"}. Validation 라벨 zip에서 읽는다."""
    out: dict[str, dict] = {}
    z = zipfile.ZipFile(ZIPS["val"])
    for info in z.infolist():
        if not info.filename.endswith(".json"):
            continue
        d = json.loads(z.read(info).decode("utf-8-sig"))
        lab = d["데이터셋 정보"]["데이터셋 상세설명"]["라벨링"]
        for slot in ("상의", "하의", "아우터", "원피스"):
            key = f"kfstyle{d['이미지 정보']['이미지 식별자']}_{slot}"
            if key not in ids:
                continue
            it = (lab.get(slot) or [{}])[0]
            sub = SUBCAT_MAP.get(it.get("카테고리") or "")
            length = it.get("기장")
            length = length[0] if isinstance(length, list) and length else length
            if sub in ("슬랙스", "청바지") and length in SHORT_LENGTHS:
                sub = "반바지"
            prints = [p for p in (it.get("프린트") or []) if p != "무지"] or it.get("프린트") or []
            out[key] = {"subcat": sub, "print": PRINT_MAP.get(prints[0], "기타무늬") if prints else None}
    return out


def fit(xt: np.ndarray, yt: np.ndarray, xv: np.ndarray, yv: np.ndarray, classes: list[str]) -> tuple[torch.nn.Module, int]:
    def score(h: int, wd: float) -> float:
        p = train_probe(xt, yt, wd, n_classes=len(classes), hidden=h)
        return metrics(yv.tolist(), p(torch.tensor(xv)).argmax(1).tolist(), classes)["macro_f1"]
    h, wd = max(((h, wd) for h in HIDDENS for wd in WEIGHT_DECAYS), key=lambda a: score(*a))
    return train_probe(xt, yt, wd, n_classes=len(classes), hidden=h).eval(), h


def predict_in_group(head: torch.nn.Module, x: np.ndarray, groups: list[str]) -> list[int]:
    """세부 종류: 정답 칸(상의·하의 …) 안에서만 고른다 (서비스에서는 사용자가 확정한 4분류 칸)."""
    with torch.no_grad():
        logits = head(torch.tensor(x)).numpy()
    mask = np.array([[SUBCAT_GROUP[s] == g for s in SUBCATS] for g in groups])
    return np.where(mask, logits, -np.inf).argmax(1).tolist()


def main() -> None:
    z = np.load(CACHE_FILE)
    ids = z["ids"].tolist()
    labels = kfashion_labels(set(ids))
    parts = np.array([part_of(i) for i in ids])
    res: dict = {}
    Path("weights").mkdir(exist_ok=True)

    # 세부 종류: K-Fashion + clothing-dataset(개별 옷 사진, 배경 제거본)
    c = np.load(CACHE / "fclip_nobg.npz")
    emb = dict(zip(c["ids"].tolist(), c["emb"]))
    flat = split_by_sender([r for r in load_rows() if r["label"] in CLOTHING_TO_SUBCAT and r["id"] in emb])
    xf = {p: np.stack([emb[r["id"]] for r in v]) for p, v in flat.items()}
    yf = {p: np.array([SUBCATS.index(CLOTHING_TO_SUBCAT[r["label"]]) for r in v]) for p, v in flat.items()}
    keep = np.array([labels[i]["subcat"] is not None for i in ids])
    y_all = np.array([SUBCATS.index(labels[i]["subcat"]) if k else -1 for i, k in zip(ids, keep)])
    x = {p: z["emb"][keep & (parts == p)] for p in ("train", "val", "test")}
    y = {p: y_all[keep & (parts == p)] for p in ("train", "val", "test")}
    head, hidden = fit(np.concatenate([x["train"], xf["train"]]), np.concatenate([y["train"], yf["train"]]),
                       np.concatenate([x["val"], xf["val"]]), np.concatenate([y["val"], yf["val"]]), SUBCATS)
    g_kf = [SUBCAT_GROUP[SUBCATS[k]] for k in y["test"]]
    g_fl = [SUBCAT_GROUP[SUBCATS[k]] for k in yf["test"]]
    res["세부 종류"] = {"K-Fashion 착장 크롭": metrics(y["test"].tolist(), predict_in_group(head, x["test"], g_kf), SUBCATS),
                     "개별 옷 사진": metrics(yf["test"].tolist(), predict_in_group(head, xf["test"], g_fl), SUBCATS), "hidden": hidden}
    torch.save({"classes": SUBCATS, "clip": CLIP, "hidden": hidden, "source": "kfashion_val(style)+clothing-dataset",
                "state_dict": head.state_dict()}, "weights/subcat_probe.pt")

    # 프린트: K-Fashion만 (개별 옷 사진 라벨 없음)
    keep = np.array([labels[i]["print"] is not None for i in ids])
    y_all = np.array([PRINTS.index(labels[i]["print"]) if k else -1 for i, k in zip(ids, keep)])
    x = {p: z["emb"][keep & (parts == p)] for p in ("train", "val", "test")}
    y = {p: y_all[keep & (parts == p)] for p in ("train", "val", "test")}
    head, hidden = fit(x["train"], y["train"], x["val"], y["val"], PRINTS)
    with torch.no_grad():
        pred = head(torch.tensor(x["test"])).argmax(1).tolist()
    res["프린트"] = {"K-Fashion 착장 크롭": metrics(y["test"].tolist(), pred, PRINTS), "hidden": hidden}
    torch.save({"classes": PRINTS, "clip": CLIP, "hidden": hidden, "source": "kfashion_val(style)",
                "state_dict": head.state_dict()}, "weights/print_probe.pt")

    Path("out").mkdir(exist_ok=True)
    Path("out/attrs.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
    log_run("attrs", {}, {a: {t: {k: v[k] for k in ("accuracy", "macro_f1")} for t, v in r.items() if isinstance(v, dict)} for a, r in res.items()})
    for a, r in res.items():
        for t, v in r.items():
            if isinstance(v, dict):
                rec = "  ".join(f"{s} {v['per_class'][s]['recall']:.2f}({v['per_class'][s]['n']})" for s in v["per_class"] if v["per_class"][s]["n"])
                print(f"{a} / {t}: 정확도 {v['accuracy']:.3f} 매크로F1 {v['macro_f1']:.3f} (hidden {r['hidden']})\n   재현 {rec}")


if __name__ == "__main__":
    main()
