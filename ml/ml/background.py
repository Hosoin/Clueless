"""배경 제거: BiRefNet_lite(MIT)로 옷 마스크 → 흰 배경 정사각 크롭. 개별 옷 사진(펴서/옷걸이) 전처리."""

import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

from ml.analyze import pick_device

MODEL = "ZhengPeng7/BiRefNet_lite"
# trust_remote_code로 저장소의 모델 코드를 실행하므로, 검토한 커밋에 고정한다. 올릴 때는 코드 변경을 확인하고 바꾼다.
REVISION = "aa62cd87eafb9cc43056d08ef3615a14628b831d"
MASK_THRESHOLD = 0.5
PAD_RATIO = 0.05  # 옷 둘레 여백

_TF = transforms.Compose(
    [
        transforms.Resize((1024, 1024)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ]
)


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
    def __init__(self, device: str | None = None, *, local_files_only: bool = False) -> None:
        self.device = device or pick_device()
        self.model = (
            AutoModelForImageSegmentation.from_pretrained(
                MODEL, trust_remote_code=True, revision=REVISION, local_files_only=local_files_only
            )
            .to(self.device)
            .eval()
        )

    @torch.no_grad()
    def mask(self, image: Image.Image) -> np.ndarray:
        """HxW bool 옷 마스크 (원본 크기)."""
        pred = self.model(_TF(image)[None].to(self.device))[-1].sigmoid().cpu()[0, 0].numpy()
        pred = np.array(Image.fromarray((pred * 255).astype(np.uint8)).resize(image.size, Image.BILINEAR))
        return pred >= MASK_THRESHOLD * 255

    def __call__(self, image: Image.Image) -> tuple[np.ndarray, Image.Image]:
        """반환: (원본 크기 마스크, 흰 배경 정사각 크롭)."""
        rgb = np.array(image.convert("RGB"))
        m = self.mask(image)
        return m, square_crop(rgb, m)
