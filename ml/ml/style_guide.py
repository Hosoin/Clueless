"""스타일 가이드 초안: K-Fashion Training 라벨(약 97만 장)에서 스타일별로 칸(상의/하의/아우터/원피스)마다
세부 카테고리·색이 얼마나 나오는지 센다.

- 비율(share): 그 스타일 사진 중 해당 칸에서 그 아이템이 차지하는 비율
- 배수(lift): 전체 평균 대비 그 스타일에서 얼마나 더 자주 나오는지. 1보다 크면 그 스타일의 특징 아이템
  (티셔츠·청바지처럼 어디서나 많은 아이템은 비율은 높아도 배수는 1 근처)

사용: uv run python -m ml.style_guide   →  out/style_guide.json, out/style_guide.md (팀 검토용 표)
"""

import json
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from ml.compat_data import SLOTS
from ml.kfashion_stats import ZIPS

MIN_SHARE = 0.05  # 칸 안에서 5% 이상 나오는 아이템만 표에 올린다
MIN_IMAGES = 2000  # 사진이 이보다 적은 스타일은 표에서 뺀다 (숫자가 불안정)


def main() -> None:
    z = zipfile.ZipFile(ZIPS["train"])
    n_style: Counter = Counter()
    cat: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))  # style → slot → 카테고리
    col: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    for info in z.infolist():
        if not info.filename.endswith(".json"):
            continue
        lab = json.loads(z.read(info).decode("utf-8-sig"))["데이터셋 정보"]["데이터셋 상세설명"]["라벨링"]
        style = (lab.get("스타일") or [{}])[0].get("스타일")
        if not style:
            continue
        n_style[style] += 1
        for slot in SLOTS:
            it = (lab.get(slot) or [{}])[0]
            if it.get("카테고리"):
                cat[style][slot][it["카테고리"]] += 1
                cat["전체"][slot][it["카테고리"]] += 1
            if it.get("색상"):
                col[style][slot][it["색상"]] += 1
                col["전체"][slot][it["색상"]] += 1

    def table(counts: dict[str, dict[str, Counter]], style: str, slot: str) -> list[dict]:
        c, base = counts[style][slot], counts["전체"][slot]
        tot, btot = sum(c.values()), sum(base.values())
        rows = [{"name": k, "share": round(v / tot, 3), "lift": round((v / tot) / (base[k] / btot), 2)} for k, v in c.items() if tot and v / tot >= MIN_SHARE]
        return sorted(rows, key=lambda r: -r["share"])

    guide = {}
    for style, n in n_style.most_common():
        if n < MIN_IMAGES:
            continue
        guide[style] = {"images": n, **{slot: {"categories": table(cat, style, slot), "colors": table(col, style, slot)[:5]} for slot in SLOTS}}

    Path("out").mkdir(exist_ok=True)
    Path("out/style_guide.json").write_text(json.dumps(guide, ensure_ascii=False, indent=1))
    fmt = lambda rows: ", ".join(f"{r['name']} {r['share']:.0%}" + (" ★" if r["lift"] >= 1.5 else "") for r in rows) or "-"  # noqa: E731
    lines = ["# 스타일 가이드 초안 (K-Fashion Training 라벨 기준)", "", "★ = 전체 평균보다 1.5배 이상 자주 나오는 특징 아이템·색", ""]
    lines += ["| 스타일 | 사진 수 | 아우터 | 상의 | 하의 | 원피스 | 주요 색 (상의) |", "|---|---|---|---|---|---|---|"]
    for style, g in guide.items():
        lines.append(f"| {style} | {g['images']:,} | {fmt(g['아우터']['categories'])} | {fmt(g['상의']['categories'])} | {fmt(g['하의']['categories'])} | {fmt(g['원피스']['categories'])} | {fmt(g['상의']['colors'])} |")
    Path("out/style_guide.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
