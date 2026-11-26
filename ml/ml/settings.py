"""환경변수로 바꾸는 설정 (컨테이너·Azure 배포 때 코드 수정 없이 바꾼다).

WEIGHTS_DIR  가중치 폴더 (기본: weights)
ML_API_KEY   설정하면 API 요청에 X-API-Key 헤더가 같아야 한다 (백엔드만 호출하게). 비우면 인증 없음(로컬 개발)
BLOB_DRAFTS_URL, BLOB_DRAFTS_SAS
             둘 다 있으면 분석 크롭을 Blob 임시 컨테이너(예: https://<계정>.blob.core.windows.net/closet-drafts)에 WebP로 올리고
             응답에는 경로(crop_blob)만 준다. SAS는 그 컨테이너 쓰기 전용(cw). 비우면 응답에 crop_png_base64 (로컬 개발·테스트)
"""

import os
from pathlib import Path

WEIGHTS_DIR = Path(os.environ.get("WEIGHTS_DIR", "weights"))
API_KEY = os.environ.get("ML_API_KEY", "")
BLOB_DRAFTS_URL = os.environ.get("BLOB_DRAFTS_URL", "").rstrip("/")
BLOB_DRAFTS_SAS = os.environ.get("BLOB_DRAFTS_SAS", "").lstrip("?")
