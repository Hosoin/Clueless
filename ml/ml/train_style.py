"""스타일 점수 (한 옷에 여러 스타일 가능): 미니멀·클래식·스트리트·캐주얼·페미닌·스포티.

학습 데이터: K-Fashion Validation 착장 사진의 스타일 라벨(메인 + 서브)을 우리 스타일로 묶어 다중 라벨로 쓴다 (STYLE_MAP).
  라벨은 사진(코디 전체)에 붙어 있어서, 그 사진의 상의·하의·아우터가 같은 라벨을 받는다 (옷 한 벌 기준으로는 잡음이 있음).
  캐주얼은 K-Fashion에 없어서 학습하지 않고 garment.style_scores에서 max(미니멀, 클래식)으로 계산한다.
모델: FashionCLIP 512 벡터 → Linear 또는 MLP → 5개 시그모이드 (val 평균 AUC로 고름)
평가: 사진 단위로 나눈 test에서 스타일별 AUC (제로샷과 비교) + clothing-dataset 옷 종류별 평균 점수(상식 확인)

사용: uv run python -m ml.train_style            (캐시가 없으면 먼저 만든다: 사진 약 1만 5천 장, 수십 분)
결과: weights/style_probe.pt (AI-Hub 학습분이라 공개 Release에 올리지 않음), out/style.json
"""

import csv
import hashlib
import json
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP, CLIP_REVISION, pick_device
from ml.compat_data import CACHE
from ml.garment import STYLE_MAP, TRAINED_STYLES, make_head
from ml.kfashion import crop_item, items_of
from ml.kfashion_stats import entry_name
from ml.runlog import log_run
from ml.train_sleeve import part_of

BASE = Path("data/raw/kfashion_full/014.KFashion/01.데이터/2.Validation")
CACHE_FILE = CACHE / "kfashion_style.npz"
PER_STYLE = 3000  # 스타일마다 최대 사진 수 (스트리트가 절반이라 그대로 쓰면 치우침). 어느 스타일도 아닌 사진도 같은 수만큼 (음성)
EPOCHS = 300
HIDDENS = [0, 256]
WEIGHT_DECAYS = [0.0, 1e-4, 1e-3, 1e-2]
PROMPTS = {
    "미니멀": ["a photo of minimalist clothing", "a clean simple garment in a solid neutral color", "minimal design without logos or patterns"],
    "클래식": ["a photo of classic formal clothing", "a tailored elegant garment like a blazer or trench coat", "timeless classic office wear"],
    "스트리트": ["a photo of streetwear clothing", "oversized hip hop street fashion", "urban streetwear with bold graphic print"],
    "페미닌": ["a photo of feminine clothing", "a romantic garment with lace, frills or floral print", "a feminine dress or skirt"],
    "스포티": ["a photo of sportswear", "athletic training clothes for workout", "sporty activewear, jersey or track suit"],
}


def photo_styles(d: dict) -> tuple[str, str]:
    s = (d["데이터셋 정보"]["데이터셋 상세설명"]["라벨링"].get("스타일") or [{}])[0]
    return s.get("스타일") or "", s.get("서브스타일") or ""


@torch.no_grad()
def build_cache() -> None:
    """스타일별로 사진을 고르게 뽑아 아이템 크롭 → FashionCLIP 벡터. 사진 id 해시 순서라 항상 같은 사진."""
    lab = zipfile.ZipFile(BASE / "라벨링데이터_modify" / "라벨링데이터.zip")
    img_zip = BASE / "원천데이터_modify" / "원천데이터.zip"
    img_names = {entry_name(i): i.filename for i in zipfile.ZipFile(img_zip).infolist() if not i.is_dir()}
    infos = sorted((i for i in lab.infolist() if i.filename.endswith(".json")), key=lambda i: hashlib.md5(entry_name(i).encode()).hexdigest())
    taken: Counter = Counter()
    items = []
    for info in infos:
        name = entry_name(info)
        raw = img_names.get(name[: -len(".json")] + ".jpg")
        if not raw:
            continue
        d = json.loads(lab.read(info).decode("utf-8-sig"))
        main, sub = photo_styles(d)
        ours = {STYLE_MAP[s] for s in (main, sub) if s in STYLE_MAP} or {"기타"}
        if all(taken[s] >= PER_STYLE for s in ours):
            continue
        taken.update(ours)
        for it in items_of(d, "kfstyle", (img_zip, raw)):
            items.append({**it, "main": main, "sub": sub})
        if all(taken[s] >= PER_STYLE for s in [*TRAINED_STYLES, "기타"]):
            break
    print(f"사진 {sum(1 for _ in {i['image_id'] for i in items})}장, 아이템 {len(items)}개, 사진 수: {dict(taken)}", flush=True)

    device = pick_device()
    model = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION).to(device).eval()
    proc = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION)
    embs = []
    for s in range(0, len(items), 64):
        crops = [crop_item(it)[0] for it in items[s : s + 64]]
        e = model.get_image_features(**proc(images=crops, return_tensors="pt").to(device)).pooler_output
        embs.append((e / e.norm(dim=-1, keepdim=True)).cpu().numpy())
        if (s // 64) % 25 == 0:
            print(f"  {min(s + 64, len(items))}/{len(items)}", flush=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    np.savez(CACHE_FILE, ids=np.array([i["id"] for i in items]), slots=np.array([i["slot"] for i in items]),
             category_true=np.array([i["category_true"] for i in items]), main=np.array([i["main"] for i in items]),
             sub=np.array([i["sub"] for i in items]), emb=np.concatenate(embs).astype(np.float32))


def labels_of(main: np.ndarray, sub: np.ndarray) -> np.ndarray:
    """(N, 5) 0/1: 메인이나 서브 스타일이 우리 스타일로 묶이면 1."""
    y = np.zeros((len(main), len(TRAINED_STYLES)), np.float32)
    for n, (m, s) in enumerate(zip(main, sub)):
        for st in (m, s):
            if st in STYLE_MAP:
                y[n, TRAINED_STYLES.index(STYLE_MAP[st])] = 1
    return y


def auc(score: np.ndarray, pos: np.ndarray) -> float:
    pos = pos.astype(bool)
    r = score.argsort().argsort() + 1
    n1, n0 = pos.sum(), (~pos).sum()
    return float((r[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)) if n1 and n0 else float("nan")


def mean_auc(scores: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean([auc(scores[:, k], y[:, k]) for k in range(y.shape[1])]))


def train_head(x: np.ndarray, y: np.ndarray, wd: float, hidden: int, seed: int = 0) -> torch.nn.Module:
    torch.manual_seed(seed)
    xt, yt = torch.tensor(x), torch.tensor(y)
    pos = yt.sum(0).clamp(min=1)
    loss_fn = torch.nn.BCEWithLogitsLoss(pos_weight=(len(yt) - pos) / pos)  # 스타일마다 양성 비율이 달라서 보정
    head = make_head(x.shape[1], y.shape[1], hidden)
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3 if hidden else 1e-2, weight_decay=wd)
    for _ in range(EPOCHS):
        opt.zero_grad()
        loss_fn(head(xt), yt).backward()
        opt.step()
    return head.eval()


def predict(head: torch.nn.Module, x: np.ndarray) -> np.ndarray:
    with torch.no_grad():
        return torch.sigmoid(head(torch.tensor(x))).numpy()


def best_thresholds(p: np.ndarray, y: np.ndarray) -> list[float]:
    """스타일마다 val F1이 가장 높은 기준값 → 응답의 tags(이 스타일이 붙었는지)에 쓴다."""
    out = []
    for k in range(y.shape[1]):
        def f1(t: float) -> float:
            pred, true = p[:, k] >= t, y[:, k] > 0
            tp = (pred & true).sum()
            return 2 * tp / max(pred.sum() + true.sum(), 1)
        out.append(round(float(max(np.arange(0.1, 0.95, 0.025), key=f1)), 3))  # numpy 숫자면 torch.load(weights_only)가 못 읽음
    return out


def main() -> None:
    if not CACHE_FILE.exists():
        build_cache()
    z = np.load(CACHE_FILE)
    x_all, y_all = z["emb"], labels_of(z["main"], z["sub"])
    parts = np.array([part_of(i) for i in z["ids"].tolist()])
    x = {p: x_all[parts == p] for p in ("train", "val", "test")}
    y = {p: y_all[parts == p] for p in ("train", "val", "test")}
    print(f"아이템 train {len(x['train'])} / val {len(x['val'])} / test {len(x['test'])}, 양성 수:",
          {s: int(y_all[:, k].sum()) for k, s in enumerate(TRAINED_STYLES)})

    grid = {(h, wd): mean_auc(predict(train_head(x["train"], y["train"], wd, h), x["val"]), y["val"]) for h in HIDDENS for wd in WEIGHT_DECAYS}
    hidden, wd = max(grid, key=grid.get)
    head = train_head(x["train"], y["train"], wd, hidden)
    thresholds = best_thresholds(predict(head, x["val"]), y["val"])

    # 제로샷 기준선
    clip = CLIPModel.from_pretrained(CLIP, revision=CLIP_REVISION).eval()
    proc = CLIPProcessor.from_pretrained(CLIP, revision=CLIP_REVISION)
    with torch.no_grad():
        text = []
        for s in TRAINED_STYLES:
            t = clip.get_text_features(**proc(text=PROMPTS[s], return_tensors="pt", padding=True)).pooler_output
            t = (t / t.norm(dim=-1, keepdim=True)).mean(0)
            text.append((t / t.norm()).numpy())
    zs, pt = x["test"] @ np.stack(text).T, predict(head, x["test"])
    res = {
        "선택": {"hidden": hidden, "weight_decay": wd, "val_평균AUC": round(grid[(hidden, wd)], 3)},
        "test_AUC": {s: {"제로샷": round(auc(zs[:, k], y["test"][:, k]), 3), "학습": round(auc(pt[:, k], y["test"][:, k]), 3)}
                     for k, s in enumerate(TRAINED_STYLES)},
        "기준값": dict(zip(TRAINED_STYLES, thresholds)),
    }

    # 상식 확인: 우리 실제 입력 형태(개별 옷 사진, 배경 제거본)에서 옷 종류별 평균 점수
    c = np.load(CACHE / "fclip_nobg.npz")
    lab = {r["image"]: r["label"] for r in csv.DictReader(open("data/raw/clothing-dataset/images.csv"))}
    by: dict[str, list] = defaultdict(list)
    for i, p in zip(c["ids"].tolist(), predict(head, c["emb"])):
        if lab.get(i) in {"T-Shirt", "Shirt", "Pants", "Dress", "Skirt", "Hoodie", "Blazer", "Polo", "Shorts", "Outwear", "Blouse", "Longsleeve"}:
            by[lab[i]].append(p)
    res["옷종류별_평균점수"] = {k: dict(zip(TRAINED_STYLES, np.round(np.mean(v, 0), 2).tolist())) for k, v in by.items()}

    Path("weights").mkdir(exist_ok=True)
    torch.save({"classes": TRAINED_STYLES, "clip": CLIP, "hidden": hidden, "thresholds": thresholds, "source": "kfashion_val(style)",
                "state_dict": head.state_dict()}, "weights/style_probe.pt")
    Path("out").mkdir(exist_ok=True)
    Path("out/style.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
    log_run("style", {"hidden": hidden, "wd": wd, "per_style": PER_STYLE}, res["test_AUC"])
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
