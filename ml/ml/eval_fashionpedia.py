"""탐지 기준 성능 평가: Fashionpedia 검증 데이터(정답 박스 포함, 1,158장)로 YOLOS + 정리 규칙을 잰다.

사용: uv run python -m ml.eval_fashionpedia [--limit 200] [--out out/eval_fashionpedia.json]

재는 것 (MVP 묶음 기준, IoU 0.5 이상이면 맞춘 것으로 봄)
- 묶음별 재현율(정답 옷 중 찾은 비율)과 정밀도(찾은 것 중 맞은 비율): 상의·아우터 / 하의 / 원피스
- 신발: 파이프라인이 한 켤레를 박스 하나로 합치므로 "사진에 신발이 있을 때 찾았는지"로 잼
- 기준값별 비교: 한 번 낮은 기준값으로 돌린 뒤 0.1~0.7을 같은 결과에서 비교
- 상의 vs 아우터 혼동: 맞춘 박스 중 정답은 상의인데 아우터로 낸 경우와 그 반대

주의: 이 모델이 Fashionpedia train으로 학습됐으므로, 실제 사용자 사진보다 점수가 좋게 나올 가능성이 높다.
"""

import argparse
import io
import json
import time
from pathlib import Path

import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download
from PIL import Image

from ml.analyze import DET_THRESHOLD, Analyzer, clean_detections, iou
from ml.categories import FASHIONPEDIA_TO_FAMILY

DATASET = "detection-datasets/fashionpedia"
VAL_FILE = "data/val-00000-of-00001-0b29e85429788213.parquet"
IOU_MATCH = 0.5
THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.7]
BOX_FAMILIES = ["upper", "lower", "onepiece"]

# 상의·아우터 묶음 안에서 혼동을 보기 위한 구분
UPPER_TOP = {"shirt, blouse", "top, t-shirt, sweatshirt", "sweater"}
UPPER_OUTER = {"cardigan", "jacket", "vest", "coat", "cape"}


def match(gt_boxes: list[list[float]], preds: list[dict], iou_thr: float = IOU_MATCH) -> list[tuple[int, int]]:
    """점수 높은 예측부터 아직 안 짝지어진 정답 중 IoU가 가장 큰 것과 짝짓는다. 반환: (정답 idx, 예측 idx)."""
    pairs: list[tuple[int, int]] = []
    used: set[int] = set()
    for pi in sorted(range(len(preds)), key=lambda i: -preds[i]["score"]):
        best, best_iou = -1, iou_thr
        for gi, g in enumerate(gt_boxes):
            if gi not in used and (v := iou(g, preds[pi]["box"])) >= best_iou:
                best, best_iou = gi, v
        if best >= 0:
            used.add(best)
            pairs.append((best, pi))
    return pairs


def load_val(limit: int | None) -> list[dict]:
    path = hf_hub_download(DATASET, VAL_FILE, repo_type="dataset")
    table = pq.read_table(path)
    return table.slice(0, limit).to_pylist() if limit else table.to_pylist()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None, help="앞에서부터 N장만 (기본: 전체 1,158장)")
    p.add_argument("--out", type=Path, default=Path("out/eval_fashionpedia.json"))
    args = p.parse_args()

    rows = load_val(args.limit)
    analyzer = Analyzer()
    labels = list(analyzer.det.config.id2label.values())  # 데이터셋 category 번호와 같은 순서(46개)

    # 1) 한 번만 추론: 가장 낮은 기준값으로 원본 결과를 모아 둔다
    raw: list[tuple[dict, list[dict]]] = []
    t0 = time.time()
    for i, r in enumerate(rows):
        image = Image.open(io.BytesIO(r["image"]["bytes"])).convert("RGB")
        raw.append((r, analyzer.detect_raw(image, threshold=min(THRESHOLDS))))
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{len(rows)}장 ({time.time() - t0:.0f}초)")
    sec_per_image = (time.time() - t0) / max(1, len(rows))

    # 2) 기준값마다 같은 결과로 채점
    report: dict = {"images": len(rows), "device": analyzer.device, "sec_per_image": round(sec_per_image, 3), "thresholds": {}}
    for thr in THRESHOLDS:
        stats = {f: {"gt": 0, "pred": 0, "tp": 0} for f in BOX_FAMILIES}
        shoe = {"gt_images": 0, "pred_images": 0, "hit": 0}
        confusion = {"top_as_top": 0, "top_as_outer": 0, "outer_as_outer": 0, "outer_as_top": 0}
        for r, dets in raw:
            area = r["width"] * r["height"]
            preds = clean_detections([d for d in dets if d["score"] >= thr], area)
            gts = [
                {"label": labels[c], "box": b}
                for c, b in zip(r["objects"]["category"], r["objects"]["bbox"])
                if labels[c] in FASHIONPEDIA_TO_FAMILY
            ]
            for fam in BOX_FAMILIES:
                g = [x for x in gts if FASHIONPEDIA_TO_FAMILY[x["label"]] == fam]
                pr = [x for x in preds if FASHIONPEDIA_TO_FAMILY[x["label"]] == fam]
                pairs = match([x["box"] for x in g], pr)
                stats[fam]["gt"] += len(g)
                stats[fam]["pred"] += len(pr)
                stats[fam]["tp"] += len(pairs)
                if fam == "upper":
                    for gi, pi in pairs:
                        gt_top, pred_top = g[gi]["label"] in UPPER_TOP, pr[pi]["label"] in UPPER_TOP
                        key = ("top" if gt_top else "outer") + "_as_" + ("top" if pred_top else "outer")
                        confusion[key] += 1
            g_shoe = [x["box"] for x in gts if x["label"] == "shoe"]
            p_shoe = [x for x in preds if x["label"] == "shoe"]
            shoe["gt_images"] += bool(g_shoe)
            shoe["pred_images"] += bool(p_shoe)
            shoe["hit"] += bool(g_shoe and p_shoe and match(g_shoe, p_shoe))

        out: dict = {}
        for fam, s in stats.items():
            out[fam] = {
                **s,
                "recall": round(s["tp"] / s["gt"], 3) if s["gt"] else None,
                "precision": round(s["tp"] / s["pred"], 3) if s["pred"] else None,
            }
        out["shoes"] = {
            **shoe,
            "recall": round(shoe["hit"] / shoe["gt_images"], 3) if shoe["gt_images"] else None,
            "precision": round(shoe["hit"] / shoe["pred_images"], 3) if shoe["pred_images"] else None,
        }
        out["upper_confusion"] = confusion
        report["thresholds"][str(thr)] = out

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    # 3) 요약 출력
    print(f"\n사진 {len(rows)}장, 장당 {sec_per_image:.2f}초 ({analyzer.device}), 현재 기준값 {DET_THRESHOLD}")
    print("기준값 | " + " | ".join(f"{f} 재현/정밀" for f in BOX_FAMILIES + ["shoes"]))
    for thr, o in report["thresholds"].items():
        cells = [f"{o[f]['recall']}/{o[f]['precision']}" for f in BOX_FAMILIES + ["shoes"]]
        print(f"{thr:>6} | " + " | ".join(f"{c:>15}" for c in cells))
    c = report["thresholds"][str(DET_THRESHOLD)]["upper_confusion"]
    print(f"\n상의/아우터 혼동 (기준값 {DET_THRESHOLD}, 맞춘 박스 기준):")
    print(f"  정답 상의 → 상의 {c['top_as_top']}, 아우터 {c['top_as_outer']}")
    print(f"  정답 아우터 → 아우터 {c['outer_as_outer']}, 상의 {c['outer_as_top']}")
    print(f"\n전체 결과: {args.out}")


if __name__ == "__main__":
    main()
