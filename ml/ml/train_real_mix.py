"""실사진(중고거래·웹·팀원 촬영) 정답을 섞어 4분류와 대표색 분류기를 다시 학습한다.

실사진: data/raw/fruits_eval/photos/labels.csv (후루츠 판매자 카테고리 + 팀 라벨링) — 사진·정답은 공개하지 않는다
  착용 사진(worn_auto.json)과 팀이 제외한 사진(team_excluded.json)은 뺀다. 벡터는 fruits_eval.npz (서비스 파이프라인과 같은 u2netp 크롭)
4분류: clothing-dataset(원본+배경 제거본) + 실사진 ×3 → MLP 512→256→4
대표색: K-Fashion 색 라벨 + 팀 라벨 색 ×3 → Linear (지금 색 모델과 같은 클래스)
세부 종류는 실사진을 섞어도 팀 라벨 시험에서 나아지지 않아(0.874 → 0.847) 다시 학습하지 않는다.

1) 실사진을 반반 나눠 지금 모델과 비교 (출력), 2) 실사진 전체를 넣어 최종 학습·저장
사용: uv run python -m ml.train_real_mix
결과: weights/garment4_mlp_real.pt, weights/color_probe_real.pt (실사진·AI-Hub 학습분이라 공개 Release에 올리지 않음). 있으면 서비스가 우선 사용
"""

import csv
import json
import zipfile
from pathlib import Path

import numpy as np
import torch

from ml.analyze import CLIP
from ml.compat_data import CACHE
from ml.garment import load_probe
from ml.garment_data import CLASSES, load_rows, split_by_sender
from ml.kfashion_stats import ZIPS
from ml.runlog import log_run
from ml.settings import WEIGHTS_DIR
from ml.train_garment4 import train_probe
from ml.train_sleeve import part_of
from ml.train_style import CACHE_FILE

REAL_DIR = Path("data/raw/fruits_eval")
BASE_CAT, BASE_COLOR = WEIGHTS_DIR / "garment4_mlp_both.pt", WEIGHTS_DIR / "color_probe.pt"  # 비교 기준 (실사진 섞기 전)
REAL_REPEAT = 3  # 실사진은 수가 적어 3번 넣는다 (1·3·5 중 반반 시험에서 가장 좋았음)


def real_rows() -> tuple[np.ndarray, dict[str, int], dict[str, dict]]:
    z = np.load(CACHE / "fruits_eval.npz")
    lab = {r["file"]: r for r in csv.DictReader(open(REAL_DIR / "photos/labels.csv", encoding="utf-8-sig"))}
    drop = set(json.load(open(REAL_DIR / "worn_auto.json"))) | set(json.load(open(REAL_DIR / "team_excluded.json")))
    idx = {f: i for i, f in enumerate(z["ids"].tolist()) if f in lab and lab[f]["category"] and f not in drop}
    return z["emb"], idx, lab


def kfashion_colors(classes: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """스타일 캐시의 K-Fashion 아이템(사진 단위 train 분할) → 색 라벨."""
    kz = np.load(CACHE_FILE)
    ids = kz["ids"].tolist()
    want, col = set(ids), {}
    z = zipfile.ZipFile(ZIPS["val"])
    for info in z.infolist():
        if not info.filename.endswith(".json"):
            continue
        d = json.loads(z.read(info).decode("utf-8-sig"))
        lab = d["데이터셋 정보"]["데이터셋 상세설명"]["라벨링"]
        for slot in ("상의", "하의", "아우터", "원피스"):
            k = f"kfstyle{d['이미지 정보']['이미지 식별자']}_{slot}"
            c = ((lab.get(slot) or [{}])[0]).get("색상") or ""
            c = {"옐로우": "옐로"}.get(c, c)
            if k in want and c in classes:
                col[k] = c
    keep = [i for i, k in enumerate(ids) if k in col and part_of(k) == "train"]
    return kz["emb"][keep], np.array([classes.index(col[ids[i]]) for i in keep])


def clothing_category() -> tuple[np.ndarray, np.ndarray]:
    raw, nob = np.load(CACHE / "fclip_raw.npz"), np.load(CACHE / "fclip_nobg.npz")
    er, en = dict(zip(raw["ids"].tolist(), raw["emb"])), dict(zip(nob["ids"].tolist(), nob["emb"]))
    rows = [r for r in split_by_sender(load_rows())["train"] if r["id"] in er and r["id"] in en]
    x = np.concatenate([np.stack([er[r["id"]] for r in rows]), np.stack([en[r["id"]] for r in rows])])
    return x, np.array([CLASSES.index(r["cls"]) for r in rows] * 2)


def acc(head: torch.nn.Module, x: np.ndarray, y: np.ndarray) -> float:
    with torch.no_grad():
        return float((head(torch.tensor(x)).argmax(1).numpy() == y).mean())


def main() -> None:
    emb, idx, lab = real_rows()
    color_classes = load_probe(BASE_COLOR)[0]
    cat_files = sorted(idx)
    col_files = [f for f in cat_files if lab[f]["owner"] == "team" and lab[f]["color"] in color_classes]
    xc0, yc0 = clothing_category()
    xk, yk = kfashion_colors(color_classes)
    X = lambda fs: emb[[idx[f] for f in fs]]  # noqa: E731
    yc = lambda fs: np.array([CLASSES.index(lab[f]["category"]) for f in fs])  # noqa: E731
    yo = lambda fs: np.array([color_classes.index(lab[f]["color"]) for f in fs])  # noqa: E731
    fit_cat = lambda fs: train_probe(np.concatenate([xc0] + [X(fs)] * REAL_REPEAT), np.concatenate([yc0] + [yc(fs)] * REAL_REPEAT), 0.0, n_classes=4, hidden=256).eval()  # noqa: E731
    fit_col = lambda fs: train_probe(np.concatenate([xk] + [X(fs)] * REAL_REPEAT), np.concatenate([yk] + [yo(fs)] * REAL_REPEAT), 1e-4, n_classes=len(color_classes)).eval()  # noqa: E731

    # 1) 반반 비교 (세부 종류·색별로 섞어서)
    rng = np.random.default_rng(0)
    def halves(fs: list[str], key: str) -> tuple[list[str], list[str]]:
        by: dict[str, list[str]] = {}
        for f in fs:
            by.setdefault(lab[f][key] or lab[f]["category"], []).append(f)
        tr, te = [], []
        for g in by.values():
            rng.shuffle(g)
            tr, te = tr + g[: len(g) // 2], te + g[len(g) // 2:]
        return tr, te
    ctr, cte = halves(cat_files, "subcategory")
    otr, ote = halves(col_files, "color")
    res = {
        "4분류": {"n_test": len(cte), "지금": round(acc(load_probe(BASE_CAT)[1], X(cte), yc(cte)), 3), "실사진 섞기": round(acc(fit_cat(ctr), X(cte), yc(cte)), 3)},
        "대표색": {"n_test": len(ote), "지금": round(acc(load_probe(BASE_COLOR)[1], X(ote), yo(ote)), 3), "실사진 섞기": round(acc(fit_col(otr), X(ote), yo(ote)), 3)},
    }
    print(json.dumps(res, ensure_ascii=False))

    # 2) 실사진 전체로 최종 학습
    Path("weights").mkdir(exist_ok=True)
    torch.save({"classes": CLASSES, "clip": CLIP, "hidden": 256, "source": f"clothing-dataset+real×{REAL_REPEAT}", "state_dict": fit_cat(cat_files).state_dict()},
               "weights/garment4_mlp_real.pt")
    torch.save({"classes": color_classes, "clip": CLIP, "source": f"kfashion_val(style)+team×{REAL_REPEAT}", "state_dict": fit_col(col_files).state_dict()},
               "weights/color_probe_real.pt")
    log_run("real_mix", {"repeat": REAL_REPEAT, "n_real_cat": len(cat_files), "n_real_color": len(col_files)}, res)
    print(f"저장: weights/garment4_mlp_real.pt (실사진 {len(cat_files)}장), weights/color_probe_real.pt (팀 라벨 색 {len(col_files)}장)")


if __name__ == "__main__":
    main()
