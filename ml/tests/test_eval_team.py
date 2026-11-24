"""팀원 사진 평가 준비 확인: 위치 정보 제거, 정답표 자동 생성, 오타 검사. 모델 없이 돈다.
실행: uv run python -m tests.test_eval_team"""

import csv
import tempfile
from pathlib import Path

from PIL import Image

from ml.eval_team import check_labels, prepare

with tempfile.TemporaryDirectory() as d:
    src, out = Path(d) / "src", Path(d) / "out"
    (src / "sub").mkdir(parents=True)
    img = Image.new("RGB", (3000, 1000), "navy")
    exif = img.getexif()
    exif[0x8825] = {1: "N", 2: (37.0, 33.0, 0.0)}  # GPS 위치
    img.save(src / "sub" / "내 바지.jpg", exif=exif)
    Image.new("RGB", (10, 10)).save(src / "a.png")
    (src / "note.txt").write_text("사진 아님")

    prepare(src, out)
    saved = sorted(p.name for p in out.glob("*.jpg"))
    assert saved == ["a.jpg", "내_바지.jpg"], saved  # 공백은 _로, 이미지 아닌 파일은 무시
    with Image.open(out / "내_바지.jpg") as clean:
        assert len(clean.getexif()) == 0, "위치 정보가 남아 있음"
        assert max(clean.size) == 2048  # 긴 변 축소
    with open(out / "labels.csv", newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    assert [r["file"] for r in rows] == ["a.jpg", "내_바지.jpg"] and all(r["category"] == "" for r in rows)

    # 다시 돌려도 이미 정리한 사진·정답은 그대로 (사용자가 채운 정답을 지우지 않음)
    rows[0]["category"] = "상의"
    with open(out / "labels.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    prepare(src, out)
    with open(out / "labels.csv", newline="", encoding="utf-8-sig") as f:
        again = list(csv.DictReader(f))
    assert len(again) == 2 and again[0]["category"] == "상의"

# 정답표 오타 검사
problems = check_labels([
    {"file": "a.jpg", "category": "상의", "sleeve": "긴 팔", "color": "네이비"},
    {"file": "b.jpg", "category": "모자", "sleeve": "", "color": "보라"},
    {"file": "c.jpg", "category": "하의", "sleeve": "", "color": ""},
])
assert len(problems) == 3 and "긴 팔" in problems[0] and "모자" in problems[1] and "보라" in problems[2], problems
print("ok")
