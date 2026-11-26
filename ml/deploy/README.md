# ML API를 Azure VM에 올리기 (Docker 없이, 예비용)

> **예비용입니다.** 11/25 팀 결정으로 백엔드·DB·ML을 docker compose로 함께 올립니다 ([`docs/ml-api/README.md`](../../docs/ml-api/README.md) 5절). 도커를 쓸 수 없을 때만 이 방법을 씁니다.
> 백엔드가 컨테이너 안에 있으면 `127.0.0.1`은 컨테이너 자신이라 이 방식의 ML에 닿지 않습니다.

백엔드·DB와 같은 VM에서 ML API를 systemd 서비스로 띄웁니다. 백엔드만 부르므로 `127.0.0.1:8000`에만 열고, 외부에는 공개하지 않습니다.

```
VM ─ Nginx(443) ─ 백엔드 Spring ─┬─ ML API 127.0.0.1:8000  ← 이 문서
                                 └─ PostgreSQL 127.0.0.1:5432
```

## 필요한 VM

- Ubuntu 22.04 또는 24.04
- ML만 메모리 약 1GB, 사진 한 장 분석 약 0.3~0.5초(맥 기준, VM에서 다시 측정). 백엔드·DB와 같이 쓰면 **메모리 16GB·4코어 이상** 권장 (예: `Standard_D4s_v5`)
- 디스크: 코드·의존성·모델 합쳐 약 5GB

## 설치·업데이트 (같은 명령)

```bash
git clone https://github.com/Hosoin/Clueless.git && cd Clueless
sudo bash ml/deploy/setup_vm.sh                     # main 브랜치
sudo BRANCH=다른브랜치 bash ml/deploy/setup_vm.sh    # 머지 전 브랜치 시험
```

스크립트가 하는 일:
1. 서비스 전용 사용자 `clueless` 생성, 코드를 `/opt/clueless`에 받기 (배포 전용 폴더라 업데이트하면 덮어씀)
2. uv 설치 → 의존성 설치 (리눅스는 CPU 전용 torch)
3. 공개 가중치 받기: Release `ml-weights-v0.2`(4분류 MLP), `ml-weights-v0.1`(궁합)
4. FashionCLIP·u2netp(배경 제거)를 고정 버전으로 미리 받기
5. `/etc/clueless/ml.env`에 `ML_API_KEY`를 처음 한 번 만들기 (이후 실행에서는 그대로 둠)
6. systemd 서비스 `clueless-ml` 등록·시작 → `/ready` 응답 확인

## 소매·색 가중치 (팀 내부 공유)

`sleeve_probe.pt`, `color_probe.pt`, `style_probe.pt`, `subcat_probe.pt`, `print_probe.pt`, `garment4_mlp_real.pt`, `color_probe_real.pt`는 AI-Hub(K-Fashion) 데이터로 학습해 공개 Release에 올리지 않습니다. 가진 팀원이 VM으로 직접 복사합니다.
없어도 서버는 뜹니다 (소매·스타일 생략, 색은 규칙으로 대체).

```bash
# 내 컴퓨터에서
scp weights/sleeve_probe.pt weights/color_probe.pt weights/style_probe.pt weights/subcat_probe.pt weights/print_probe.pt weights/garment4_mlp_real.pt weights/color_probe_real.pt <사용자>@<VM 주소>:/tmp/
# VM에서
sudo install -o clueless -m 640 /tmp/sleeve_probe.pt /tmp/color_probe.pt /tmp/style_probe.pt /tmp/subcat_probe.pt /tmp/print_probe.pt /tmp/garment4_mlp_real.pt /tmp/color_probe_real.pt /opt/clueless/ml/weights/ && rm /tmp/*_probe.pt
sudo systemctl restart clueless-ml
```

## 백엔드 설정

- 주소: `http://127.0.0.1:8000`
- 키: `sudo cat /etc/clueless/ml.env`의 `ML_API_KEY` 값을 백엔드 환경 변수에 넣기 (Git·채팅에 붙여 넣지 않기)
- 요청 형식: [`docs/ml-api/README.md`](../../docs/ml-api/README.md), `openapi.json`

## 운영

```bash
systemctl status clueless-ml                 # 상태
journalctl -u clueless-ml -f                 # 로그 (요청마다 JSON 한 줄, 사진·벡터는 남기지 않음)
curl -s http://127.0.0.1:8000/ready          # 모델 버전
sudo systemctl restart clueless-ml           # 가중치를 바꾼 뒤
```

- 서버가 죽으면 5초 뒤 자동으로 다시 뜹니다. VM을 재부팅해도 자동 시작합니다.
- ML이 메모리 7GB를 넘기면 ML만 정리되고 다시 뜹니다 (백엔드·DB를 지키기 위해).
- 방화벽(NSG)에서 8000번은 열지 않습니다.
