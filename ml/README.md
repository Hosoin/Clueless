# ML

Python 기반 데이터 처리, 모델 학습·평가 및 추론 코드입니다. 이 폴더에서 실행합니다.

```bash
cd ml
uv sync                         # 맥·윈도우 같음. uv 필요: https://docs.astral.sh/uv/
uv run python -m tests.test_logic   # 모델 없이 도는 로직 확인
```

- 장치는 자동 선택: NVIDIA GPU(cuda) → 맥 GPU(mps) → CPU. `CLUELESS_DEVICE=cpu`로 강제할 수 있습니다.
- 윈도우 + NVIDIA: 기본 설치되는 torch는 CPU 버전입니다. GPU를 쓰려면 CUDA용 torch로 바꿔야 합니다.
- 사전학습 모델(FashionCLIP, BiRefNet 등)은 처음 실행할 때 Hugging Face에서 받아 캐시에 둡니다.
- 팀 규칙대로 데이터(`data/raw/`, `data/processed/`)와 가중치(`weights/`, `*.pt`)는 Git에 넣지 않습니다. 아래 명령으로 각자 만듭니다.

## 개별 옷 사진 4분류 (현재 MVP 입력)

배경 제거(BiRefNet_lite) → FashionCLIP 임베딩 → 4분류(상의/하의/아우터/원피스) → 색 제안

```bash
# 1) 학습 데이터 받기 (clothing-dataset, CC0, 약 150MB)
git clone --depth 1 https://github.com/alexeygrigorev/clothing-dataset.git data/raw/clothing-dataset

# 2) 배경 제거본 만들기 (맥 GPU 약 45분) → data/processed/nobg
uv run python -m ml.garment_data nobg

# 3) 학습·평가 (약 1분) → weights/garment4_probe_both.pt, out/garment4_both.json
uv run python -m ml.train_garment4

# 4) 추론: 사진마다 out/garment/<이름>/result.json + crop.png
uv run python -m ml.garment 옷사진.jpg
```

| 구성 | 역할 | 학습 |
| --- | --- | --- |
| BiRefNet_lite | 배경 제거 → 흰 배경 정사각 크롭 | 사전학습, 고정 (원격 코드라 커밋 고정) |
| FashionCLIP | 옷 사진 → 512차원 벡터 | 사전학습, 고정 |
| Linear 512→4 | 상의/하의/아우터/원피스 | 직접 학습 (원본+배경 제거본) |
| 색 규칙 | 마스크 안 픽셀 k-means → 팔레트 18색 | 없음 |

현재 성능 (찍은 사람 단위로 나눈 test 553장, 배경 제거본 입력): 정확도 0.942, 매크로 F1 0.906. 제로샷 기준선은 0.939 / 0.922.
남은 오류의 대부분은 데이터셋 라벨이 우리 기준(다른 옷 위에 걸치고 앞이 열리는 옷 = 아우터)과 다른 경우입니다.

### 라벨 검토

```bash
uv run python -m ml.find_label_issues   # → labels/review.csv, out/review.html
```

교차검증으로 "그 사진을 본 적 없는 모델"과 라벨이 다른 사진을 뽑습니다. `review.csv`의 `new_cls`에
`상의 / 하의 / 아우터 / 원피스 / 제외` 중 하나를 채워 `labels/clothing_fixes.csv`로 저장하면 다음 학습에 반영됩니다.

## 착장 사진 분석 (나중 단계)

YOLOS-Fashionpedia 탐지 → SAM 분할 → FashionCLIP 세부 분류 + 색 제안

```bash
uv run python -m ml.analyze 착장사진.jpg --out out
uv run python -m ml.eval_fashionpedia     # Fashionpedia 검증 1,158장으로 탐지 기준 성능
```

## 사용한 모델·데이터와 라이선스

| 항목 | 라이선스 | 비고 |
| --- | --- | --- |
| [FashionCLIP](https://huggingface.co/patrickjohncyh/fashion-clip) | MIT | |
| [BiRefNet_lite](https://huggingface.co/ZhengPeng7/BiRefNet_lite) | MIT | |
| [YOLOS-Fashionpedia](https://huggingface.co/valentinafeve/yolos-fashionpedia) | MIT | |
| [SAM vit-base](https://huggingface.co/facebook/sam-vit-base) | Apache-2.0 | |
| [clothing-dataset](https://github.com/alexeygrigorev/clothing-dataset) | CC0 | 4분류 학습 데이터 |
| [Fashionpedia](https://fashionpedia.github.io/home/) | 주석 CC BY 4.0, 이미지는 각 출처 | 탐지 평가에만 사용, 이미지 재배포 안 함 |
