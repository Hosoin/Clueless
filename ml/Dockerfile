# ML 추론 API 컨테이너 (CPU). 빌드: ml/ 폴더에서
#   docker build -t clueless-ml .
#   docker run -p 8000:8000 -v "$PWD/weights:/app/weights:ro" -e ML_API_KEY=... clueless-ml
# 가중치(weights/)는 이미지에 넣지 않는다: 공개 가능한 것은 Release에서, AI-Hub 데이터로 학습한 것은 팀 내부에서 받아 볼륨으로 붙인다.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9.18 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    HF_HOME=/opt/hf \
    WEIGHTS_DIR=/app/weights \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 의존성 먼저 (코드만 바뀌면 이 층은 캐시를 다시 씀). 리눅스는 pyproject 설정대로 CPU 전용 torch
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY ml ./ml

# 사전학습 모델(FashionCLIP·BiRefNet)을 고정한 버전으로 미리 받아 둔다: 시작이 빨라지고, 실행 중 외부 다운로드가 없다
RUN uv run --no-sync python -c "\
from huggingface_hub import snapshot_download; \
from ml.analyze import CLIP, CLIP_REVISION; \
from ml.background import MODEL, REVISION; \
snapshot_download(CLIP, revision=CLIP_REVISION); \
snapshot_download(MODEL, revision=REVISION)"

# root가 아닌 사용자로 실행
RUN useradd --create-home --uid 10001 app && chown -R app /app /opt/hf
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready')" || exit 1
CMD ["uv", "run", "--no-sync", "uvicorn", "ml.api:app", "--host", "0.0.0.0", "--port", "8000"]
