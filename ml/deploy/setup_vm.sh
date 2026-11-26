#!/usr/bin/env bash
# [예비용] 팀은 docker compose로 배포한다 (docs/ml-api/README.md 5절). 도커를 못 쓸 때만:
# Azure VM(Ubuntu 22.04/24.04)에 ML API를 Docker 없이 설치한다. 여러 번 실행해도 안전하다 (업데이트도 이 스크립트로).
# 실행: sudo bash ml/deploy/setup_vm.sh            (저장소를 받은 뒤, 저장소 루트에서)
# 결과: /opt/clueless (코드), /opt/clueless/ml/weights (가중치), /etc/clueless/ml.env (키), systemd 서비스 clueless-ml
set -euo pipefail

APP=/opt/clueless
REPO=https://github.com/Hosoin/Clueless.git
BRANCH=${BRANCH:-main}
RELEASE=https://github.com/Hosoin/Clueless/releases/download
USER_NAME=clueless

[ "$(id -u)" -eq 0 ] || { echo "sudo로 실행하세요"; exit 1; }

apt-get update -q
apt-get install -y -q git curl ca-certificates openssl

# 서비스 전용 사용자 (로그인 불가)
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$USER_NAME --shell /usr/sbin/nologin "$USER_NAME"

# 코드는 서비스 사용자 소유로 받는다. /opt/clueless 는 배포 전용 폴더라 VM에서 직접 고친 내용은 덮어쓴다
mkdir -p "$APP" && chown "$USER_NAME" "$APP"
if [ -d "$APP/.git" ]; then
  sudo -u "$USER_NAME" git -C "$APP" fetch -q origin "$BRANCH"
  sudo -u "$USER_NAME" git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  sudo -u "$USER_NAME" git clone -q --branch "$BRANCH" "$REPO" "$APP"
fi

# uv (서비스 사용자 홈에 설치) + 의존성. 리눅스는 pyproject 설정대로 CPU 전용 torch
sudo -u "$USER_NAME" -H bash -c 'command -v ~/.local/bin/uv >/dev/null || curl -LsSf https://astral.sh/uv/0.9.18/install.sh | sh'
UV=/home/$USER_NAME/.local/bin/uv
sudo -u "$USER_NAME" -H bash -c "cd $APP/ml && $UV sync --frozen --no-dev"

# 공개 가중치 (clothing-dataset·Polyvore 학습분). 소매·색(AI-Hub 학습분)은 README 안내대로 직접 복사
W=$APP/ml/weights
sudo -u "$USER_NAME" mkdir -p "$W"
for f in ml-weights-v0.2/garment4_mlp_both.pt ml-weights-v0.1/compat_mlp_polyvore.pt; do
  [ -s "$W/$(basename "$f")" ] || sudo -u "$USER_NAME" curl -fsSL -o "$W/$(basename "$f")" "$RELEASE/$f"
done

# 사전학습 모델(FashionCLIP·u2netp)을 고정 버전으로 미리 받아 둔다: 첫 요청이 느리지 않고, 실행 중 외부 다운로드가 없다
sudo -u "$USER_NAME" -H bash -c "cd $APP/ml && $UV run --no-sync python -c \"
from huggingface_hub import snapshot_download
from ml.analyze import CLIP, CLIP_REVISION
from ml.background import ensure_model
snapshot_download(CLIP, revision=CLIP_REVISION, allow_patterns=['*.json', '*.txt', '*.safetensors'])
ensure_model()\""

# 환경 파일: 키는 처음 한 번만 만들고, 이후 실행에서는 건드리지 않는다
mkdir -p /etc/clueless
if [ ! -f /etc/clueless/ml.env ]; then
  umask 077
  printf 'ML_API_KEY=%s\nWEIGHTS_DIR=%s\nCLUELESS_DEVICE=cpu\n' "$(openssl rand -hex 24)" "$W" > /etc/clueless/ml.env
  echo "새 ML_API_KEY를 /etc/clueless/ml.env 에 만들었습니다 (백엔드 설정에 같은 값을 넣으세요)"
fi
chown root:"$USER_NAME" /etc/clueless/ml.env && chmod 640 /etc/clueless/ml.env

install -m 644 "$APP/ml/deploy/clueless-ml.service" /etc/systemd/system/clueless-ml.service
systemctl daemon-reload
systemctl enable -q clueless-ml
systemctl restart clueless-ml

echo "기다리는 중: 모델 올리기(수십 초)"
for _ in $(seq 1 60); do
  curl -fs http://127.0.0.1:8000/ready >/dev/null 2>&1 && { curl -s http://127.0.0.1:8000/ready; echo; echo "ML API 준비 완료"; exit 0; }
  sleep 3
done
echo "180초 안에 준비되지 않았습니다. 로그: journalctl -u clueless-ml -n 100"; exit 1
