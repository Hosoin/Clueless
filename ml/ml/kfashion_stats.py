"""K-Fashion 전체 라벨 분포 (zip을 풀지 않고 읽음): 스타일, 코디 구성, 카테고리, 색, 쓸 수 있는 코디 수.
사용: uv run python -m ml.kfashion_stats   →  out/kfashion_stats.json
"""

import json
import zipfile
from collections import Counter
from pathlib import Path

from ml.compat_data import SLOTS, VALID

BASE = Path("data/raw/kfashion_full/014.KFashion/01.데이터")
ZIPS = {
    "train": BASE / "1.Training/라벨링데이터_modify/라벨링데이터.zip",
    "val": BASE / "2.Validation/라벨링데이터_modify/라벨링데이터.zip",
}


def entry_name(info: zipfile.ZipInfo) -> str:
    if info.flag_bits & 0x800:
        return info.filename
    try:
        return info.filename.encode("cp437").decode("cp949")  # 한국어 윈도우에서 만든 zip
    except UnicodeError:
        return info.filename


def main() -> None:
    report = {}
    for part, path in ZIPS.items():
        z = zipfile.ZipFile(path)
        style, combo, cat, color, folder = Counter(), Counter(), Counter(), Counter(), Counter()
        n = valid = 0
        for info in z.infolist():
            if not info.filename.endswith(".json"):
                continue
            n += 1
            folder[entry_name(info).split("/")[-2]] += 1
            d = json.loads(z.read(info).decode("utf-8-sig"))["데이터셋 정보"]["데이터셋 상세설명"]
            lab = d["라벨링"]
            style[(lab.get("스타일") or [{}])[0].get("스타일", "")] += 1
            present = tuple(sorted(s for s in SLOTS if (d["렉트좌표"].get(s) or [{}])[0]))
            combo[present] += 1
            valid += present in VALID
            for s in SLOTS:
                it = (lab.get(s) or [{}])[0]
                if it:
                    cat[f"{s}/{it.get('카테고리')}"] += 1
                    color[it.get("색상") or ""] += 1
        report[part] = {
            "images": n, "usable_outfits": valid, "styles": style.most_common(), "slot_combos": [[list(k), v] for k, v in combo.most_common()],
            "categories": cat.most_common(40), "colors": color.most_common(), "folders": folder.most_common(),
        }
        print(f"\n[{part}] 사진 {n:,}장 → 궁합 학습에 쓸 수 있는 코디 {valid:,}개")
        print("  스타일:", ", ".join(f"{k} {v:,}" for k, v in style.most_common(25)))
        print("  슬롯 구성:", ", ".join(f"{'+'.join(k) or '없음'} {v:,}" for k, v in combo.most_common(8)))
        print("  카테고리 상위:", ", ".join(f"{k} {v:,}" for k, v in cat.most_common(15)))
        print("  색 상위:", ", ".join(f"{k or '-'} {v:,}" for k, v in color.most_common(12)))
    Path("out").mkdir(exist_ok=True)
    Path("out/kfashion_stats.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
