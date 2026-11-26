"""분석 크롭을 Azure Blob 임시 컨테이너에 올린다 (REST PUT + 쓰기 전용 SAS, 추가 라이브러리 없음).

임시 컨테이너는 수명 주기 규칙으로 1일 뒤 지워진다. 사용자가 저장을 확정하면 백엔드가 확정 컨테이너로 복사한다.
"""

import urllib.request
import uuid

from ml.settings import BLOB_DRAFTS_SAS, BLOB_DRAFTS_URL


def enabled() -> bool:
    return bool(BLOB_DRAFTS_URL and BLOB_DRAFTS_SAS)


def upload_draft(data: bytes, content_type: str = "image/webp", ext: str = "webp") -> str:
    """올린 파일의 "컨테이너/파일명"을 돌려준다 (예: closet-drafts/3f2a….webp). 실패하면 예외."""
    name = f"{uuid.uuid4().hex}.{ext}"
    req = urllib.request.Request(f"{BLOB_DRAFTS_URL}/{name}?{BLOB_DRAFTS_SAS}", data=data, method="PUT",
                                 headers={"x-ms-blob-type": "BlockBlob", "Content-Type": content_type})
    with urllib.request.urlopen(req, timeout=15) as r:
        if r.status != 201:
            raise RuntimeError(f"Blob 업로드 응답 {r.status}")
    return f"{BLOB_DRAFTS_URL.rsplit('/', 1)[1]}/{name}"
