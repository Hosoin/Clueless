"""환경변수로 바꾸는 설정 (컨테이너·Azure 배포 때 코드 수정 없이 바꾼다).

WEIGHTS_DIR             가중치 폴더 (기본: ml/weights)
GARMENT_CATEGORY_MODEL  mlp (기본) 또는 legacy-linear (명시적 비교용, 자동 대체 없음)
ML_API_KEY              설정하면 API 요청에 X-API-Key 헤더가 같아야 한다. 비우면 인증 없음(로컬 개발)
"""

import os
from pathlib import Path

WEIGHTS_DIR = Path(os.environ.get("WEIGHTS_DIR", str(Path(__file__).resolve().parents[1] / "weights")))
GARMENT_CATEGORY_MODEL = os.environ.get("GARMENT_CATEGORY_MODEL", "mlp")
GARMENT_CATEGORY_WEIGHTS = {
    "mlp": WEIGHTS_DIR / "garment4_mlp_secondhand_balanced264_20261124_seed0.pt",
    "legacy-linear": WEIGHTS_DIR / "garment4_probe_raw.pt",
}
API_KEY = os.environ.get("ML_API_KEY", "")
