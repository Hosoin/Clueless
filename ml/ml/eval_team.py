"""팀원 촬영 사진으로 실제 성능 재기 (한국 사용자 환경, 우리 실제 입력).

준비: 팀원이 옷 한 벌씩 프리셋(펴서 위에서 / 옷걸이 정면)으로 찍은 사진을 data/raw/team_photos/ 에 넣고,
     labels/team_photos_template.csv 를 복사해 data/raw/team_photos/labels.csv 로 정답을 채운다.
     (사진에 얼굴·개인정보가 없게. 사진과 정답은 git에 올리지 않는다)
사용: uv run python -m ml.eval_team [--dir data/raw/team_photos]   →  out/team_eval.json

재는 것: 카테고리·소매·색 정확도, "확인 필요" 표시가 실제 오답을 얼마나 잡는지(잡은 비율, 헛경보 비율)
"""

import argparse
import csv
import json
from pathlib import Path

from PIL import Image

from ml.garment import GarmentClassifier

CLOSE_COLORS = {frozenset(p) for p in [("아이보리", "화이트"), ("아이보리", "베이지"), ("네이비", "블랙"), ("블루", "네이비"), ("스카이블루", "블루")]}


def summarize(rows: list[dict], field: str) -> dict | None:
    """field 정답이 있는 행만. needs_review가 실제 오답을 잡았는지도 센다."""
    rows = [r for r in rows if r.get(f"true_{field}")]
    if not rows:
        return None
    wrong = [r for r in rows if not r[f"ok_{field}"]]
    flagged = [r for r in rows if r[f"review_{field}"]]
    return {
        "n": len(rows),
        "accuracy": round(sum(r[f"ok_{field}"] for r in rows) / len(rows), 3),
        "review_catches_wrong": round(sum(r[f"review_{field}"] for r in wrong) / len(wrong), 3) if wrong else None,  # 틀린 것 중 확인 필요로 표시된 비율
        "review_false_alarm": round(sum(r[f"ok_{field}"] for r in flagged) / len(flagged), 3) if flagged else None,  # 확인 필요 중 사실 맞았던 비율
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, default=Path("data/raw/team_photos"))
    args = ap.parse_args()
    labels = list(csv.DictReader(open(args.dir / "labels.csv", encoding="utf-8-sig")))
    clf = GarmentClassifier()
    rows = []
    for lab in labels:
        res, _, _ = clf.analyze(Image.open(args.dir / lab["file"]))
        sleeve, color = res["sleeve"] or {}, res["color_name"] or {}
        rows.append({
            "file": lab["file"],
            "true_category": lab["category"].strip(), "pred_category": res["category"]["name"], "review_category": res["needs_review"],
            "true_sleeve": lab.get("sleeve", "").strip(), "pred_sleeve": sleeve.get("name", ""), "review_sleeve": sleeve.get("needs_review", False),
            "true_color": lab.get("color", "").strip(), "pred_color": color.get("name", ""), "review_color": color.get("needs_review", False),
            "retake": res["retake"],
        })
        r = rows[-1]
        r["ok_category"] = r["pred_category"] == r["true_category"]
        r["ok_sleeve"] = r["pred_sleeve"] == r["true_sleeve"]
        r["ok_color"] = r["pred_color"] == r["true_color"] or frozenset((r["pred_color"], r["true_color"])) in CLOSE_COLORS
    report = {f: summarize(rows, f) for f in ("category", "sleeve", "color")}
    report["retake_rate"] = round(sum(r["retake"] for r in rows) / len(rows), 3)
    report["wrong"] = [{k: r[k] for k in ("file", "true_category", "pred_category", "true_sleeve", "pred_sleeve", "true_color", "pred_color")} for r in rows if not (r["ok_category"] and (not r["true_sleeve"] or r["ok_sleeve"]) and (not r["true_color"] or r["ok_color"]))]
    Path("out").mkdir(exist_ok=True)
    Path("out/team_eval.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"사진 {len(rows)}장")
    for f in ("category", "sleeve", "color"):
        if report[f]:
            m = report[f]
            print(f"  {f:9} 정확도 {m['accuracy']:.3f} ({m['n']}장) | 확인 필요가 오답을 잡은 비율 {m['review_catches_wrong']} | 헛경보 {m['review_false_alarm']}")
    print(f"  다시 찍기 비율 {report['retake_rate']}, 틀린 사진 {len(report['wrong'])}장 → out/team_eval.json")


if __name__ == "__main__":
    main()
