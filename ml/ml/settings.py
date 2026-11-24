"""환경변수로 바꾸는 설정 (컨테이너·Azure 배포 때 코드 수정 없이 바꾼다).

WEIGHTS_DIR  가중치 폴더 (기본: weights)
ML_API_KEY   설정하면 API 요청에 X-API-Key 헤더가 같아야 한다 (백엔드만 호출하게). 비우면 인증 없음(로컬 개발)
"""

import os
from pathlib import Path

WEIGHTS_DIR = Path(os.environ.get("WEIGHTS_DIR", "weights"))
API_KEY = os.environ.get("ML_API_KEY", "")
