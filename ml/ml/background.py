"""배경 제거: u2net(Apache-2.0, ONNX 176MB)로 옷 마스크 → 흰 배경 정사각 크롭. 개별 옷 사진(펴서/옷걸이) 전처리.

BiRefNet_lite(1024)에서 바꾼 이유: CPU 4스레드에서 한 장 7.6초 → 0.16초(u2netp), 마스크 IoU 0.976 (clothing-dataset test 32장).
u2netp(4.6MB)에서 u2net으로 바꾼 이유 (11/26, fruits 실사진 무작위 80장): 흰 옷·큰 프린트에서 옷이 지워지고 프린트만 남던 실패
약 5장 → 약 2장, 속도 0.16초 → 0.42초 (CPU 4스레드). isnet·cloth_seg·BiRefNet(512)은 1~2.4초에 실패 수도 비슷해서 제외.
마스크만 320으로 만들고 크롭은 원본 화소를 쓰므로 옷 무늬·질감은 그대로이고, 테두리만 조금 덜 매끈하다 (옷장 격자 크기에서는 구분 안 됨).
"""

import hashlib
import os
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

MODEL = "u2net"
MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"  # rembg 배포본 (U-2-Net 저자 가중치 변환)
MODEL_SHA256 = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"
MODEL_PATH = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "clueless" / f"{MODEL}.onnx"
INPUT_SIZE = 320  # u2net 학습 크기
MASK_THRESHOLD = 0.5
PAD_RATIO = 0.05  # 옷 둘레 여백
MIN_MASK_FILL = 0.3  # 마스크가 이보다 흩어지면 배경 제거 실패로 보고 원본 전체를 쓴다 (fruits 643장 검토로 정함)
MAX_CROP_SIDE = 1024  # 저장·표시용 크롭 긴 변 (휴대폰 상세 화면까지 충분)
_MEAN, _STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)


def ensure_model(path: Path = MODEL_PATH) -> Path:
    """모델 파일이 없으면 받는다. 해시가 다르면 쓰지 않는다 (받은 파일을 그대로 실행하므로)."""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(MODEL_URL, tmp)
        tmp.rename(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != MODEL_SHA256:
        raise RuntimeError(f"{path} 해시가 다릅니다 ({digest}). 파일을 지우고 다시 받으세요")
    return path


def mask_fill(mask: np.ndarray) -> float:
    """가장 큰 덩어리(구멍 채움)가 전체 마스크 테두리 상자를 채운 비율 (0~1).
    배경 제거가 실패하면 프린트·로고 조각만 흩어져 남아 이 값이 매우 낮다 (fruits 643장: 0.3 미만 16장 대부분 실패)."""
    m = mask.astype(np.uint8)
    if not m.any():
        return 0.0
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(m)
    cv2.drawContours(filled, [max(contours, key=cv2.contourArea)], -1, 1, cv2.FILLED)
    ys, xs = np.nonzero(m)
    return float(filled.sum() / ((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1)))


def square_crop(rgb: np.ndarray, mask: np.ndarray) -> Image.Image:
    """마스크 밖은 흰색, 마스크 영역을 여백 포함 정사각형으로 자른다. 마스크가 비면 원본 전체."""
    white = np.where(mask[..., None], rgb, 255).astype(np.uint8)
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return Image.fromarray(rgb)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    side = int(max(x1 - x0, y1 - y0) * (1 + 2 * PAD_RATIO))
    canvas = np.full((side, side, 3), 255, np.uint8)
    ox, oy = (side - (x1 - x0)) // 2, (side - (y1 - y0)) // 2
    canvas[oy : oy + (y1 - y0), ox : ox + (x1 - x0)] = white[y0:y1, x0:x1]
    return Image.fromarray(canvas)


def crop_with_fallback(rgb: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, Image.Image]:
    """흰 배경 정사각 크롭. 배경 제거가 실패하면(조각만 남음) 원본 전체를 정사각으로 쓴다.
    실패는 주로 옷이 화면을 꽉 채운 근접 사진: 모델이 옷을 배경으로 보고 프린트·태그만 남긴다. 이때는 원본이 옷 모양을 가장 잘 보여 준다.
    반환: (크롭·색 계산에 쓴 마스크, 크롭, 긴 변 최대 MAX_CROP_SIDE)"""
    used = mask if mask_fill(mask) >= MIN_MASK_FILL else np.ones_like(mask, bool)
    crop = square_crop(rgb, used)
    crop.thumbnail((MAX_CROP_SIDE, MAX_CROP_SIDE))
    return used, crop


class BackgroundRemover:
    def __init__(self, device: str | None = None) -> None:  # device: 예전 인터페이스 호환용 (ONNX는 CPU로 충분히 빠름)
        self.session = ort.InferenceSession(str(ensure_model()), providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name

    def mask(self, image: Image.Image) -> np.ndarray:
        """HxW bool 옷 마스크 (원본 크기)."""
        x = np.asarray(image.convert("RGB").resize((INPUT_SIZE, INPUT_SIZE), Image.LANCZOS), np.float32)
        x = (x / max(float(x.max()), 1e-6) - _MEAN) / _STD
        pred = self.session.run(None, {self.input_name: x.transpose(2, 0, 1)[None]})[0][0, 0]
        pred = (pred - pred.min()) / max(float(pred.max() - pred.min()), 1e-6)  # rembg와 같은 정규화
        pred = np.array(Image.fromarray((pred * 255).astype(np.uint8)).resize(image.size, Image.BILINEAR))
        return pred >= MASK_THRESHOLD * 255

    def __call__(self, image: Image.Image) -> tuple[np.ndarray, Image.Image]:
        """반환: (크롭에 쓴 마스크, 흰 배경 정사각 크롭). 배경 제거가 실패하면 원본 전체 (crop_with_fallback)."""
        return crop_with_fallback(np.array(image.convert("RGB")), self.mask(image))
