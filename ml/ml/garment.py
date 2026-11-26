"""개별 옷 사진 추론: 배경 제거 → FashionCLIP 임베딩 → 4분류 → 색 제안. 등록 확인 카드 JSON을 낸다.

사용: uv run python -m ml.garment 옷사진.jpg [...] --out out/garment
결과: out/garment/<사진이름>/result.json + crop.png(흰 배경 정사각 크롭, 옷장에 보여줄 이미지)
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from ml.analyze import CLIP_REVISION, pick_device
from ml.background import MODEL as BG_MODEL
from ml.background import BackgroundRemover
from ml.colors import suggest_colors
from ml.settings import WEIGHTS_DIR

# 4분류: MLP(512→256→4, test 정확도 0.974)가 기본. 아직 받지 않았으면 예전 Linear(0.969)로 돈다
PROBE = next((p for p in (WEIGHTS_DIR / "garment4_mlp_both.pt", WEIGHTS_DIR / "garment4_probe_both.pt") if p.exists()), WEIGHTS_DIR / "garment4_mlp_both.pt")
SLEEVE_PROBE = WEIGHTS_DIR / "sleeve_probe.pt"  # 없으면 소매 기장은 결과에서 빠진다
COLOR_PROBE = WEIGHTS_DIR / "color_probe.pt"  # 없으면 색 이름은 규칙(k-means + 팔레트)만 쓴다
STYLE_PROBE = WEIGHTS_DIR / "style_probe.pt"  # 없으면 스타일 점수는 결과에서 빠진다 (AI-Hub 학습분, 팀 내부 공유)
SLEEVE_CATEGORIES = {"상의", "아우터", "원피스"}  # 하의에는 소매가 없다
# 스타일 6개. K-Fashion 23개 스타일을 묶어 5개를 학습하고(train_style), 캐주얼은 K-Fashion에 없어 max(미니멀, 클래식)으로 계산
STYLES = ["미니멀", "클래식", "스트리트", "캐주얼", "페미닌", "스포티"]
TRAINED_STYLES = ["미니멀", "클래식", "스트리트", "페미닌", "스포티"]
# 세부 종류: ml/categories.py 이름 중 K-Fashion에 라벨이 있는 것 (맨투맨은 K-Fashion에서 티셔츠로 묶여 따로 없음)
SUBCAT_GROUP = {"티셔츠": "상의", "셔츠": "상의", "블라우스": "상의", "니트": "상의", "후드티": "상의", "민소매": "상의",
                "슬랙스": "하의", "청바지": "하의", "트레이닝 바지": "하의", "반바지": "하의", "치마": "하의",
                "재킷": "아우터", "코트": "아우터", "가디건": "아우터", "조끼": "아우터", "패딩": "아우터",
                "원피스": "원피스", "점프수트": "원피스"}
SUBCATS = list(SUBCAT_GROUP)
SUBCAT_PROBE = WEIGHTS_DIR / "subcat_probe.pt"  # 없으면 세부 종류 생략 (AI-Hub 학습분, 팀 내부 공유)
PRINTS = ["무지", "레터링", "그래픽", "체크", "스트라이프", "플로럴", "도트", "기타무늬"]
PRINT_PROBE = WEIGHTS_DIR / "print_probe.pt"  # 없으면 프린트 생략
MAX_TAGS = 2  # 옷마다 붙는 스타일 태그 최대 개수 (기준값이 낮은 스트리트가 거의 모든 옷에 붙는 것을 막음)
STYLE_MAP = {"모던": "미니멀", "젠더리스": "미니멀", "클래식": "클래식", "소피스트케이티드": "클래식", "프레피": "클래식",
             "스트리트": "스트리트", "힙합": "스트리트", "펑크": "스트리트", "키치": "스트리트",
             "페미닌": "페미닌", "로맨틱": "페미닌", "섹시": "페미닌", "스포티": "스포티"}  # 나머지(리조트·컨트리 등)는 어느 스타일도 아님
# shortcut: 기준값 초안. 팀원 프리셋 사진 평가에서 "확인 필요"가 실제 오답을 잘 잡는지 보고 다시 정한다.
REVIEW_PROB = 0.6  # 1위 확률이 이보다 낮으면 사용자 확인 요청
MIN_MASK_RATIO = 0.05  # 옷이 사진의 5% 미만이면 다시 찍기 안내
COLOR_REVIEW_PROB = 0.5  # 색 모델 1위 확률이 이보다 낮으면 색을 사용자에게 고르게 한다


def make_head(dim: int, n_classes: int, hidden: int = 0) -> torch.nn.Module:
    """FashionCLIP 벡터 위의 작은 분류기. hidden=0이면 Linear, 아니면 MLP(Linear → GELU → Linear)."""
    if not hidden:
        return torch.nn.Linear(dim, n_classes)
    return torch.nn.Sequential(torch.nn.Linear(dim, hidden), torch.nn.GELU(), torch.nn.Linear(hidden, n_classes))


def load_probe(path: Path) -> tuple[list[str], torch.nn.Module, str] | None:
    """저장된 분류기(Linear 또는 MLP). 파일이 없으면 None."""
    if not path.exists():
        return None
    ck = torch.load(path, map_location="cpu")
    dim = next(iter(ck["state_dict"].values())).shape[1]  # 첫 층 weight: (출력, 512)
    probe = make_head(dim, len(ck["classes"]), ck.get("hidden", 0))
    probe.load_state_dict(ck["state_dict"])
    return ck["classes"], probe.eval(), ck["clip"]


def rank(head: tuple[list[str], torch.nn.Module, str], emb: np.ndarray) -> list[tuple[str, float]]:
    with torch.no_grad():
        probs = head[1](torch.tensor(emb[None])).softmax(1)[0].tolist()
    return sorted(zip(head[0], probs), key=lambda x: -x[1])


def load_style_head(path: Path = STYLE_PROBE) -> tuple[torch.nn.Module, list[float]] | None:
    head = load_probe(path)
    if head is None:
        return None
    assert head[0] == TRAINED_STYLES, "스타일 가중치의 스타일 순서가 코드와 다릅니다"
    return head[1], torch.load(path, map_location="cpu")["thresholds"]


def style_scores(head: tuple[torch.nn.Module, list[float]], emb: np.ndarray) -> list[dict]:
    """벡터 (N, 512) → 옷마다 {"scores": {스타일: 0~1}, "tags": [붙은 스타일]}. 한 옷에 여러 스타일이 붙을 수 있다.
    tags: 기준값(val F1 최고)을 넘는 스타일 중 넘은 비율(점수/기준값)이 큰 순서로 최대 MAX_TAGS개.
    아무 스타일도 기준값을 못 넘으면 기본 아이템으로 보고 ["캐주얼"]. 캐주얼 점수 = max(미니멀, 클래식) (추천 점수에 씀)."""
    with torch.no_grad():
        p = torch.sigmoid(head[0](torch.tensor(np.atleast_2d(emb), dtype=torch.float32))).numpy()
    out = []
    for row in p:
        s = dict(zip(TRAINED_STYLES, row.tolist()))
        passed = sorted((s[st] / t, st) for st, t in zip(TRAINED_STYLES, head[1]) if s[st] >= t)
        tags = [st for _, st in passed[::-1][:MAX_TAGS]] or ["캐주얼"]
        s["캐주얼"] = max(s["미니멀"], s["클래식"])
        out.append({"scores": {st: round(s[st], 3) for st in STYLES}, "tags": tags})  # 강한 순
    return out


class GarmentClassifier:
    def __init__(self, probe_path: Path = PROBE, device: str | None = None) -> None:
        self.device = device or pick_device()
        head = load_probe(probe_path)
        assert head, f"{probe_path}가 없습니다 (README의 가중치 받기 참고)"
        self.classes, self.probe, clip = head
        self.sleeve, self.color = load_probe(SLEEVE_PROBE), load_probe(COLOR_PROBE)
        self.style = load_style_head()
        self.subcat, self.print = load_probe(SUBCAT_PROBE), load_probe(PRINT_PROBE)
        for h in (self.sleeve, self.color, load_probe(STYLE_PROBE), self.subcat, self.print):  # 같은 벡터를 쓰므로 같은 FashionCLIP으로 학습된 것만
            assert h is None or h[2] == clip, "분류기마다 FashionCLIP 버전이 다릅니다"
        self.clip = CLIPModel.from_pretrained(clip, revision=CLIP_REVISION).to(self.device).eval()
        self.proc = CLIPProcessor.from_pretrained(clip, revision=CLIP_REVISION)
        self.remover = BackgroundRemover(self.device)
        # 응답에 넣는 버전. embedding이 바뀌면 옷장 DB의 벡터를 모두 다시 계산해야 한다
        self.versions = {
            "embedding": f"{clip}@{CLIP_REVISION[:7]}",
            "background": BG_MODEL,  # 크롭 이미지를 만든 배경 제거 모델
            "category": probe_path.stem,
            "sleeve": SLEEVE_PROBE.stem if self.sleeve else None,
            "color": COLOR_PROBE.stem if self.color else "rule",
            "style": STYLE_PROBE.stem if self.style else None,
            "subcategory": SUBCAT_PROBE.stem if self.subcat else None,
            "print": PRINT_PROBE.stem if self.print else None,
        }

    @torch.no_grad()
    def embed(self, image: Image.Image) -> np.ndarray:
        e = self.clip.get_image_features(**self.proc(images=image, return_tensors="pt").to(self.device)).pooler_output
        return (e / e.norm(dim=-1, keepdim=True)).cpu().numpy()[0]

    def analyze(self, image: Image.Image) -> tuple[dict, Image.Image, np.ndarray]:
        """반환: (확인 카드용 결과, 흰 배경 정사각 크롭, 512차원 임베딩). CLI와 API가 같이 쓴다."""
        image = image.convert("RGB")
        mask, crop = self.remover(image)
        emb = self.embed(crop)
        mask_ratio = float(mask.mean())
        colors = [{**c, "ratio": round(c["ratio"], 2)} for c in suggest_colors(np.array(image), mask)]
        result = self._card(emb, colors)
        result.update(mask_ratio=round(mask_ratio, 3), retake=mask_ratio < MIN_MASK_RATIO)  # 옷이 너무 작게 찍힘(또는 배경 제거 실패)
        return result, crop, emb

    def _card(self, emb: np.ndarray, colors: list[dict]) -> dict:
        """벡터(+ 규칙 색) → 확인 카드 값."""
        ranked = rank((self.classes, self.probe, ""), emb)
        result = {
            "category": {"name": ranked[0][0], "prob": round(ranked[0][1], 3)},  # 제안값, 최종값은 사용자가 확인
            "category_candidates": [{"name": c, "prob": round(p, 3)} for c, p in ranked],
            "colors": colors,  # 규칙: 옷 픽셀 k-means → 팔레트 (색 견본 rgb와 비율)
            "color_name": None,  # 색 모델이 고른 대표색 이름 (모델이 있을 때)
            "sleeve": None,  # 상의·아우터·원피스만
            "style": style_scores(self.style, emb)[0] if self.style else None,  # 여러 스타일 동시 가능 (tags)
            "subcategory": None,  # 4분류 1위 칸 안의 세부 종류 (closet_items.subcategory 기본값)
            "print": None,  # 무지·레터링·그래픽 … (비슷한 옷 구분·자동 이름용)
            "needs_review": ranked[0][1] < REVIEW_PROB,
        }
        if self.color:
            # 모델이 기본 (K-Fashion test 0.71 vs 규칙 0.43). 확신이 낮으면 규칙 색도 후보에 넣고 사용자에게 고르게 한다
            # (모델은 K-Fashion에 없는 청록·아이보리를 못 고르고, 무늬 옷에서 흔들림)
            c = rank(self.color, emb)
            cands = [{"name": n, "prob": round(p, 3)} for n, p in c[:3]]
            if colors and colors[0]["name"] not in {x["name"] for x in cands}:
                cands.append({"name": colors[0]["name"], "prob": None})
            result["color_name"] = {"name": c[0][0], "prob": round(c[0][1], 3), "candidates": cands, "needs_review": c[0][1] < COLOR_REVIEW_PROB}
        elif colors:
            result["color_name"] = {"name": colors[0]["name"], "prob": None, "candidates": [{"name": x["name"], "prob": None} for x in colors], "needs_review": True}
        if self.subcat:
            # 확정 전이라 1위 칸 기준. 사용자가 칸을 바꾸면 앱은 subcategory를 비우고 직접 고르게 한다
            sub = [(n, p) for n, p in rank(self.subcat, emb) if SUBCAT_GROUP[n] == ranked[0][0]]
            total = sum(p for _, p in sub) or 1.0
            sub = [(n, p / total) for n, p in sub]
            result["subcategory"] = {"name": sub[0][0], "prob": round(sub[0][1], 3), "needs_review": sub[0][1] < REVIEW_PROB,
                                     "candidates": [{"name": n, "prob": round(p, 3)} for n, p in sub[:3]]}
        if self.print:
            pr = rank(self.print, emb)
            result["print"] = {"name": pr[0][0], "prob": round(pr[0][1], 3)}
        if self.sleeve and ranked[0][0] in SLEEVE_CATEGORIES:
            s = rank(self.sleeve, emb)
            # 7부 경계(반팔↔7부↔긴팔)를 자주 헷갈리므로 확신이 낮으면 사용자에게 고르게 한다
            result["sleeve"] = {"name": s[0][0], "prob": round(s[0][1], 3), "needs_review": s[0][1] < REVIEW_PROB}
        return result

    def __call__(self, path: Path, out_dir: Path) -> dict:
        result, crop, emb = self.analyze(Image.open(path))
        result = {"image": path.name, **result, "crop": "crop.png", "embedding_dim": len(emb)}
        out_dir.mkdir(parents=True, exist_ok=True)
        crop.save(out_dir / "crop.png")
        (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        return result


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("images", nargs="+", type=Path)
    p.add_argument("--out", type=Path, default=Path("out/garment"))
    args = p.parse_args()
    clf = GarmentClassifier()
    for path in args.images:
        r = clf(path, args.out / path.stem)
        flags = (" (확인 필요)" if r["needs_review"] else "") + (" (다시 찍기)" if r["retake"] else "")
        color = r["colors"][0]["name"] if r["colors"] else "-"
        print(f"{path.name}: {r['category']['name']} {r['category']['prob']:.2f} / {color}{flags}")


if __name__ == "__main__":
    main()
