"""배경 제거: u2netp(Apache-2.0, ONNX 4.6MB)로 옷 마스크 → 흰 배경 정사각 크롭. 개별 옷 사진(펴서/옷걸이) 전처리.

BiRefNet_lite(1024)에서 바꾼 이유: CPU 4스레드에서 한 장 7.6초 → 0.16초, 마스크 IoU 0.976 (clothing-dataset test 32장).
마스크만 320으로 만들고 크롭은 원본 화소를 쓰므로 옷 무늬·질감은 그대로이고, 테두리만 조금 덜 매끈하다 (옷장 격자 크기에서는 구분 안 됨).
"""

import hashlib
import os
import urllib.request
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

MODEL = "u2netp"
MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"  # rembg 배포본 (U-2-Net 저자 가중치 변환)
MODEL_SHA256 = "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8"
MODEL_PATH = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "clueless" / "u2netp.onnx"
INPUT_SIZE = 320  # u2netp 학습 크기
MASK_THRESHOLD = 0.5
PAD_RATIO = 0.05  # 옷 둘레 여백
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
        """반환: (원본 크기 마스크, 흰 배경 정사각 크롭, 긴 변 최대 MAX_CROP_SIDE)."""
        rgb = np.array(image.convert("RGB"))
        m = self.mask(image)
        crop = square_crop(rgb, m)
        crop.thumbnail((MAX_CROP_SIDE, MAX_CROP_SIDE))
        return m, crop
