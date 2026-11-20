"""팀원 촬영 사진으로 실제 성능 재기 (한국 사용자 환경, 우리 실제 입력).

1) 준비: 찍은 사진 폴더(드라이브에서 받은 폴더 등)를 넣으면 평가용 폴더로 정리한다
   uv run python -m ml.eval_team prepare ~/Downloads/팀원사진
   - 아이폰 HEIC → JPG 변환(맥 sips), 위치(GPS) 등 EXIF 제거, 회전 바로잡기, 긴 변 2048로 축소
   - data/raw/team_photos/ 에 저장하고 labels.csv 에 파일명을 미리 채워 둔다 (정답 칸은 비어 있음)
2) 정답 채우기: data/raw/team_photos/labels.csv 를 엑셀·구글시트로 열어 category·sleeve·color 입력
   category: 상의/하의/아우터/원피스, sleeve: 민소매/반팔/7부/긴팔 (하의는 비움), color: 팔레트 이름 (README 참고)
3) 평가: uv run python -m ml.eval_team
   → 화면 요약 + out/team_eval.json (요약) + out/team_eval_rows.csv (사진마다 정답·예측·확률, 시트로 열어 보기)

사진과 정답은 git에 올리지 않는다 (data/ 는 제외 대상). 얼굴·개인정보가 찍힌 사진은 넣지 않는다.
"""

import argparse
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from ml.colors import PALETTE

DEFAULT_DIR = Path("data/raw/team_photos")
FIELDS = ["file", "category", "sleeve", "color", "owner", "memo"]
CATEGORIES = {"상의", "하의", "아우터", "원피스"}
SLEEVES = {"민소매", "반팔", "7부", "긴팔"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
CLOSE_COLORS = {frozenset(p) for p in [("아이보리", "화이트"), ("아이보리", "베이지"), ("네이비", "블랙"), ("블루", "네이비"), ("스카이블루", "블루")]}
MAX_SIDE = 2048


def open_image(path: Path) -> Image.Image:
    """HEIC는 PIL이 못 열어서 맥 기본 도구(sips)로 JPG로 바꿔 연다."""
    try:
        return Image.open(path)
    except UnidentifiedImageError:
        if path.suffix.lower() not in {".heic", ".heif"} or sys.platform != "darwin":
            raise
        tmp = Path(tempfile.mkdtemp()) / (path.stem + ".jpg")
        subprocess.run(["sips", "-s", "format", "jpeg", str(path), "--out", str(tmp)], check=True, capture_output=True)
        return Image.open(tmp)


def clean_copy(src: Path, dst: Path) -> None:
    """EXIF(위치 등)를 버리고 다시 저장. 회전 정보는 먼저 픽셀에 반영한다."""
    img = ImageOps.exif_transpose(open_image(src)).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    img.save(dst, "JPEG", quality=92)  # exif 인자를 주지 않으면 메타데이터 없이 저장된다


def prepare(src: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    label_path = out_dir / "labels.csv"
    rows = list(csv.DictReader(open(label_path, encoding="utf-8-sig"))) if label_path.exists() else []
    known = {r["file"] for r in rows}
    added, failed = [], []
    for p in sorted(x for x in src.rglob("*") if x.suffix.lower() in IMAGE_EXT and not x.name.startswith(".")):
        name = p.stem.replace(" ", "_") + ".jpg"
        dst, n = out_dir / name, 2
        while dst.exists() and dst.name not in known:  # 다른 사진과 이름이 겹치면 번호를 붙인다
            dst, n = out_dir / f"{Path(name).stem}_{n}.jpg", n + 1
        if dst.name in known:
            continue  # 이미 정리한 사진
        try:
            clean_copy(p, dst)
        except (UnidentifiedImageError, OSError, subprocess.CalledProcessError) as e:
            failed.append(f"{p.name}: {e}")
            continue
        rows.append({"file": dst.name, "category": "", "sleeve": "", "color": "", "owner": "", "memo": ""})
        added.append(dst.name)
    with open(label_path, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: 엑셀에서 한글이 안 깨지게
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows({k: r.get(k, "") for k in FIELDS} for r in rows)
    print(f"정리한 사진 {len(added)}장 → {out_dir} (위치 정보 제거, JPG)")
    for e in failed:
        print("  못 연 사진:", e)
    print(f"다음: {label_path} 를 열어 category·sleeve·color 를 채운 뒤  uv run python -m ml.eval_team")


def check_labels(labels: list[dict]) -> list[str]:
    """평가 전에 오타·빈칸을 잡는다 (정답이 틀리면 정확도가 엉뚱하게 나옴)."""
    problems = []
    for i, r in enumerate(labels, start=2):  # 2행부터 (1행은 머리글)
        c, s, col = (r.get(k, "").strip() for k in ("category", "sleeve", "color"))
        if c not in CATEGORIES:
            problems.append(f"{i}행 {r['file']}: category '{c}' (상의/하의/아우터/원피스 중 하나)")
        if s and s not in SLEEVES:
            problems.append(f"{i}행 {r['file']}: sleeve '{s}' (민소매/반팔/7부/긴팔 또는 비움)")
        if col and col not in PALETTE:
            problems.append(f"{i}행 {r['file']}: color '{col}' (팔레트: {', '.join(PALETTE)})")
    return problems


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


def run(photo_dir: Path) -> None:
    from ml.garment import GarmentClassifier  # 모델 로딩은 평가할 때만

    labels = list(csv.DictReader(open(photo_dir / "labels.csv", encoding="utf-8-sig")))
    filled = [r for r in labels if r.get("category", "").strip()]
    if len(filled) < len(labels):
        print(f"정답(category)이 빈 사진 {len(labels) - len(filled)}장은 건너뜀")
    problems = check_labels(filled)
    if problems:
        print("정답표를 먼저 고쳐 주세요:")
        for p in problems:
            print("  " + p)
        sys.exit(1)

    clf = GarmentClassifier()
    rows = []
    for lab in filled:
        res, _, _ = clf.analyze(Image.open(photo_dir / lab["file"]))
        sleeve, color = res["sleeve"] or {}, res["color_name"] or {}
        r = {
            "file": lab["file"], "owner": lab.get("owner", ""),
            "true_category": lab["category"].strip(), "pred_category": res["category"]["name"], "prob_category": res["category"]["prob"], "review_category": res["needs_review"],
            "true_sleeve": lab.get("sleeve", "").strip(), "pred_sleeve": sleeve.get("name", ""), "prob_sleeve": sleeve.get("prob", ""), "review_sleeve": sleeve.get("needs_review", False),
            "true_color": lab.get("color", "").strip(), "pred_color": color.get("name", ""), "prob_color": color.get("prob", ""), "review_color": color.get("needs_review", False),
            "retake": res["retake"],
        }
        r["ok_category"] = r["pred_category"] == r["true_category"]
        r["ok_sleeve"] = r["pred_sleeve"] == r["true_sleeve"]
        r["ok_color"] = r["pred_color"] == r["true_color"] or frozenset((r["pred_color"], r["true_color"])) in CLOSE_COLORS
        rows.append(r)

    report = {f: summarize(rows, f) for f in ("category", "sleeve", "color")}
    report["retake_rate"] = round(sum(r["retake"] for r in rows) / len(rows), 3)
    report["wrong"] = [{k: r[k] for k in ("file", "true_category", "pred_category", "true_sleeve", "pred_sleeve", "true_color", "pred_color")}
                       for r in rows if not (r["ok_category"] and (not r["true_sleeve"] or r["ok_sleeve"]) and (not r["true_color"] or r["ok_color"]))]
    Path("out").mkdir(exist_ok=True)
    Path("out/team_eval.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    with open("out/team_eval_rows.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    print(f"사진 {len(rows)}장")
    for field in ("category", "sleeve", "color"):
        if m := report[field]:
            print(f"  {field:9} 정확도 {m['accuracy']:.3f} ({m['n']}장) | 확인 필요가 오답을 잡은 비율 {m['review_catches_wrong']} | 헛경보 {m['review_false_alarm']}")
    print(f"  다시 찍기 비율 {report['retake_rate']}, 틀린 사진 {len(report['wrong'])}장")
    print("  → out/team_eval.json (요약), out/team_eval_rows.csv (사진마다, 시트로 열어 보기)")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("prepare", help="사진 폴더를 평가용으로 정리")
    p.add_argument("src", type=Path)
    p.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    ap.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    args = ap.parse_args()
    if args.cmd == "prepare":
        prepare(args.src.expanduser(), args.dir)
    else:
        run(args.dir)


if __name__ == "__main__":
    main()
