"""대표색 제안: 옷 픽셀 → k-means → 팔레트에서 가장 가까운 색. 결과는 제안값이고 사용자가 확인한다."""

import cv2
import numpy as np

# 팔레트 초안 20색 (기획서 18색 + 샘플에서 빠져 있던 청록·라벤더). 팀 합의 후 이름·RGB를 고친다.
PALETTE: dict[str, tuple[int, int, int]] = {
    "블랙": (20, 20, 20),
    "화이트": (245, 245, 245),
    "아이보리": (240, 234, 214),
    "그레이": (128, 128, 128),
    "네이비": (31, 40, 77),
    "블루": (40, 90, 180),
    "스카이블루": (140, 190, 230),
    "민트": (150, 220, 200),
    "청록": (0, 128, 128),
    "그린": (50, 120, 60),
    "카키": (110, 110, 70),
    "베이지": (210, 190, 160),
    "브라운": (110, 70, 40),
    "옐로": (240, 210, 60),
    "오렌지": (235, 130, 40),
    "레드": (200, 30, 40),
    "와인": (110, 25, 45),
    "핑크": (240, 160, 180),
    "퍼플": (120, 70, 150),
    "라벤더": (200, 180, 230),
}

def to_lab(rgb: np.ndarray) -> np.ndarray:
    """Nx3 uint8 RGB → Nx3 실제 Lab(L 0~100, a·b 약 -128~127).
    OpenCV의 8비트 Lab은 L을 0~255로 늘려 밝기 차이가 색 차이보다 2.55배 크게 잡히므로 float로 변환한다."""
    f = (np.asarray(rgb, np.float32).reshape(-1, 1, 3)) / 255.0
    return cv2.cvtColor(f, cv2.COLOR_RGB2LAB).reshape(-1, 3)


def lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    f = cv2.cvtColor(np.asarray(lab, np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(-1, 3)
    return np.clip(np.round(f * 255), 0, 255).astype(np.uint8)


_NAMES = list(PALETTE)
_PALETTE_LAB = to_lab(np.array(list(PALETTE.values())))


def nearest_color(rgb: tuple[int, int, int]) -> str:
    # shortcut: Lab 유클리드 거리(CIE76). 비슷한 색끼리 자주 틀리면 CIEDE2000으로 바꾼다.
    lab = to_lab(np.array([rgb]))[0]
    return _NAMES[int(np.argmin(np.linalg.norm(_PALETTE_LAB - lab, axis=1)))]


def suggest_colors(rgb_image: np.ndarray, mask: np.ndarray | None = None, k: int = 3) -> list[dict]:
    """rgb_image: HxWx3 uint8. mask: HxW bool(옷 픽셀). mask가 없으면 가운데 60% 영역을 쓴다.
    반환: 넓은 순서의 [{"name", "rgb", "ratio"}], 같은 팔레트 이름은 합친다."""
    if mask is None:
        h, w = rgb_image.shape[:2]
        mask = np.zeros((h, w), bool)
        mask[int(h * 0.2) : int(h * 0.8), int(w * 0.2) : int(w * 0.8)] = True
    pixels = rgb_image[mask]
    if len(pixels) < k:
        return []
    lab = to_lab(pixels)
    cv2.setRNGSeed(0)  # 같은 사진이면 실행할 때마다 같은 색이 나오게
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5)
    _, labels, centers = cv2.kmeans(lab, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.ravel(), minlength=k)
    centers_rgb = lab_to_rgb(centers)

    merged: dict[str, dict] = {}
    for i in np.argsort(-counts):
        rgb = tuple(int(c) for c in centers_rgb[i])
        name = nearest_color(rgb)
        ratio = float(counts[i] / counts.sum())
        if name in merged:
            merged[name]["ratio"] += ratio
        else:
            merged[name] = {"name": name, "rgb": rgb, "ratio": ratio}
    return sorted(merged.values(), key=lambda c: -c["ratio"])
