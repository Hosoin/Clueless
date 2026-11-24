"""라벨 검토 화면 만들기: labels/review.csv(모델과 라벨이 다른 사진) → out/review_tool.html (사진 내장, 브라우저로 열기)

사용: uv run python -m ml.find_label_issues   # 검토 목록 새로 뽑기 (이미 검토한 사진은 빠짐)
     uv run python -m ml.review_tool          # 검토 화면 만들고 열기
화면에서 1~5 키(상의/하의/아우터/원피스/제외)로 고르면 다음 사진으로 넘어가고, 진행 상황은 브라우저에 저장된다.
끝나면 "clothing_fixes.csv 내려받기" → ml/labels/clothing_fixes.csv 로 저장(이미 있으면 덮어쓰기) → 다음 학습에 반영.
"""

import base64
import csv
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

from ml.garment_data import CLASSES, EXCLUDE, FIXES, ROOT

REVIEW = Path("labels/review.csv")
OUT = Path("out/review_tool.html")
CHOICES = CLASSES + [EXCLUDE]  # 상의, 하의, 아우터, 원피스, 제외 → 키 1~5


def thumb(image_id: str) -> str:
    img = Image.open(ROOT / "images" / f"{image_id}.jpg").convert("RGB")
    img.thumbnail((360, 360))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=72)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    rows = list(csv.DictReader(open(REVIEW, encoding="utf-8")))
    done = {}
    if FIXES.exists():  # 이전에 내려받아 저장한 결과는 미리 채워 둔다
        done = {r["id"]: r["new_cls"] for r in csv.DictReader(open(FIXES, encoding="utf-8-sig")) if r.get("new_cls")}
    items = [{
        "id": r["id"], "orig": r["orig_label"], "cur": r["current_cls"] or "라벨 없음", "model": r["model_cls"],
        "p": float(r["p_model"]), "split": r["split"], "img": thumb(r["id"]), "pick": done.get(r["id"], ""),
    } for r in rows]
    page = TEMPLATE.replace("__DATA__", json.dumps(items, ensure_ascii=False)).replace("__CHOICES__", json.dumps(CHOICES, ensure_ascii=False))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"검토 {len(items)}장 (이전 결과 {len(done)}장 반영) → {OUT}")
    if sys.platform == "darwin":
        subprocess.run(["open", str(OUT)], check=False)


TEMPLATE = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>클루리스 라벨 검토</title>
<style>
:root { --bg:#f6f7fa; --card:#fff; --fg:#1b2230; --muted:#5b6577; --line:#dde2ec; --accent:#34558b; --soft:#e6ecf6; --done:#2f7d4f; }
@media (prefers-color-scheme: dark) { :root { --bg:#12161e; --card:#1a202b; --fg:#e6e9f0; --muted:#a0a9ba; --line:#2b3342; --accent:#8fb0e6; --soft:#223149; --done:#7fd0a0; } }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 "Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif; }
header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line); padding:12px 16px; display:flex; flex-wrap:wrap; gap:10px 16px; align-items:center; z-index:2; }
header h1 { font-size:1.1rem; margin:0; }
.bar { flex:1 1 200px; height:8px; background:var(--soft); border-radius:4px; overflow:hidden; min-width:160px; }
.bar i { display:block; height:100%; background:var(--accent); width:0; }
button { font:inherit; border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:6px; padding:4px 10px; cursor:pointer; }
button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
.rule { padding:10px 16px; color:var(--muted); font-size:.9rem; }
main { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; padding:0 16px 40px; }
.card { background:var(--card); border:2px solid var(--line); border-radius:10px; padding:8px; display:flex; flex-direction:column; gap:6px; }
.card.focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--soft); }
.card.picked { border-color:var(--done); }
.card img { width:100%; aspect-ratio:3/4; object-fit:contain; background:#fff; border-radius:6px; }
.info { font-size:.82rem; color:var(--muted); }
.info b { color:var(--fg); }
.opts { display:flex; flex-wrap:wrap; gap:4px; }
.opts button { padding:2px 8px; font-size:.85rem; }
.opts button.on { background:var(--done); color:#fff; border-color:var(--done); }
.hide-done .card.picked { display:none; }
</style>
<header>
  <h1>라벨 검토</h1>
  <span id="count"></span>
  <div class="bar"><i id="prog"></i></div>
  <label><input type="checkbox" id="hideDone"> 고른 것 숨기기</label>
  <button class="primary" id="export">clothing_fixes.csv 내려받기</button>
</header>
<p class="rule">사진을 보고 우리 기준으로 고르세요. <b>아우터 = 다른 옷 위에 걸치고 앞이 열리는 옷</b>(집업·가디건·재킷·블레이저·코트·패딩·조끼). 풀오버 후드·맨투맨은 상의.
키보드: <b>1</b> 상의 · <b>2</b> 하의 · <b>3</b> 아우터 · <b>4</b> 원피스 · <b>5</b> 제외(옷 아님·판단 불가) · <b>←/→</b> 이동 · <b>0</b> 선택 지우기. 진행 상황은 이 브라우저에 자동 저장됩니다.</p>
<main id="grid"></main>
<script>
const DATA = __DATA__, CHOICES = __CHOICES__, KEY = "clueless-review";
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
DATA.forEach(d => { if (saved[d.id] !== undefined) d.pick = saved[d.id]; });
let cur = Math.max(0, DATA.findIndex(d => !d.pick));
const grid = document.getElementById("grid");
function save() { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(DATA.filter(d => d.pick).map(d => [d.id, d.pick])))); } catch (e) {} }
function render() {
  grid.innerHTML = "";
  DATA.forEach((d, i) => {
    const c = document.createElement("div");
    c.className = "card" + (d.pick ? " picked" : "") + (i === cur ? " focus" : "");
    c.innerHTML = `<img loading="lazy" src="${d.img}" alt="">
      <div class="info">지금 라벨 <b>${d.cur}</b> (원본 ${d.orig}) · 모델 <b>${d.model}</b> ${d.p.toFixed(2)} · ${d.split}</div>
      <div class="opts">${CHOICES.map((ch, k) => `<button data-k="${k}" class="${d.pick === ch ? "on" : ""}">${k + 1} ${ch}</button>`).join("")}</div>`;
    c.querySelectorAll("button").forEach(b => b.onclick = () => { cur = i; pick(+b.dataset.k); });
    c.onclick = e => { if (e.target.tagName !== "BUTTON") { cur = i; render(); } };
    grid.appendChild(c);
  });
  const n = DATA.filter(d => d.pick).length;
  document.getElementById("count").textContent = `${n} / ${DATA.length}장`;
  document.getElementById("prog").style.width = (100 * n / DATA.length) + "%";
  const f = grid.children[cur]; if (f) f.scrollIntoView({ block: "nearest" });
}
function pick(k) {
  DATA[cur].pick = k < 0 ? "" : CHOICES[k]; save();
  if (k >= 0) { const next = DATA.findIndex((d, i) => i > cur && !d.pick); cur = next >= 0 ? next : Math.min(cur + 1, DATA.length - 1); }
  render();
}
document.addEventListener("keydown", e => {
  if (e.key >= "1" && e.key <= String(CHOICES.length)) pick(+e.key - 1);
  else if (e.key === "0") pick(-1);
  else if (e.key === "ArrowRight") { cur = Math.min(cur + 1, DATA.length - 1); render(); }
  else if (e.key === "ArrowLeft") { cur = Math.max(cur - 1, 0); render(); }
});
document.getElementById("hideDone").onchange = e => grid.classList.toggle("hide-done", e.target.checked);
document.getElementById("export").onclick = () => {
  const rows = [["id", "new_cls", "orig_label", "model_cls"], ...DATA.filter(d => d.pick).map(d => [d.id, d.pick, d.orig, d.model])];
  const blob = new Blob(["\\ufeff" + rows.map(r => r.join(",")).join("\\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "clothing_fixes.csv"; a.click();
};
render();
</script>
"""

if __name__ == "__main__":
    main()
