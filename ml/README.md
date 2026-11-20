# ML

옷 사진 분석(종류·소매·색)과 내 옷장 코디 추천을 하는 Python 코드입니다. 모든 명령은 이 폴더(`ml/`)에서 실행합니다.
전체 흐름은 [파이프라인 정리 페이지](https://claude.ai/artifact/SbG46qG5RoNZA5RjT9xx1X)를 참고하세요.

```
옷 사진 → 배경 제거(BiRefNet) → FashionCLIP(옷 1벌 = 512 벡터) → 작은 분류기들(4분류·소매·색, 직접 학습)
옷장(벡터들) → 후보 조합 → 궁합 모델(직접 학습) + 취향·트렌드(예정) → 코디 상위 5개 + 근거
```

## 1. 바로 실행하기 (API 서버)

```bash
cd ml
uv sync                              # 맥·윈도우 같음. uv 필요: https://docs.astral.sh/uv/
# 가중치 받기 (아래 "가중치" 참고). 최소: garment4_probe_both.pt, compat_mlp_polyvore.pt
gh release download ml-weights-v0.1 -R Hosoin/Clueless -D weights
uv run uvicorn ml.api:app --port 8000   # 요청·응답 명세: http://localhost:8000/docs
```

| API | 하는 일 |
| --- | --- |
| `POST /v1/garments/analyze` (multipart `image`) | 카테고리(+후보), 대표색(`color_name`, 확인 필요 표시), 색 견본(`colors`), 소매(`sleeve`, 상의·아우터·원피스만), 다시 찍기(`retake`), 흰 배경 크롭(base64), **512 벡터**(옷장 DB에 저장) |
| `POST /v1/outfits/recommend` (JSON) | 옷장 옷 목록(id, 카테고리, 벡터, 선택: 세부·소매·태그) → 코디 상위 k개, 점수(`score_parts`: 궁합/취향/트렌드), 근거. `include_id`(꼭 넣을 옷), `allow_layering`(레이어드, 기본 꺼짐) |
| `GET /health` | 서버 상태 |

- 장치는 자동 선택: NVIDIA GPU(cuda) → 맥 GPU(mps) → CPU. `CLUELESS_DEVICE=cpu`로 강제할 수 있습니다.
- 윈도우 + NVIDIA: 기본 설치되는 torch는 CPU 버전입니다. GPU를 쓰려면 CUDA용 torch로 바꿔야 합니다.
- 사전학습 모델(FashionCLIP, BiRefNet 등)은 처음 실행할 때 Hugging Face에서 받아 캐시에 둡니다.

## 2. 가중치

팀 규칙대로 가중치(`weights/`, `*.pt`)는 Git에 넣지 않습니다. 작은 파일이라 GitHub Release로 공유합니다.

| 파일 | 역할 | 학습 데이터 | 받는 곳 |
| --- | --- | --- | --- |
| `garment4_probe_both.pt` | 4분류 (필수) | clothing-dataset (CC0) | Release `ml-weights-v0.1` |
| `compat_mlp_polyvore.pt` | 코디 궁합 (추천 API 필수) | Polyvore | Release `ml-weights-v0.1` |
| `sleeve_probe.pt` | 소매 기장 (없으면 소매 생략) | K-Fashion + clothing-dataset | 팀 내부 공유 (AI-Hub 데이터로 학습, 공개 저장소에 올리지 않음) |
| `color_probe.pt` | 대표색 (없으면 규칙으로 대체) | K-Fashion | 팀 내부 공유 (같은 이유) |

## 3. 다시 학습하기

| 모델 | 준비 | 명령 | 결과 (test) |
| --- | --- | --- | --- |
| 4분류 | `git clone --depth 1 https://github.com/alexeygrigorev/clothing-dataset.git data/raw/clothing-dataset` → `uv run python -m ml.garment_data nobg` (배경 제거본, 맥 약 45분) | `uv run python -m ml.train_garment4` | 정확도 0.942 (제로샷 0.939) |
| 궁합 | `uv run python -m ml.compat_data` (Polyvore 2.5GB + 임베딩 약 10분) | `uv run python -m ml.train_compat` | AUC 0.70 (색 규칙 0.50) |
| 소매 | K-Fashion (아래) | `uv run python -m ml.train_sleeve` | 개별 옷 사진 0.91, 착장 0.81 |
| 색 | K-Fashion (아래) | `uv run python -m ml.train_color` | 0.71 (규칙 0.43) |

- 학습할 때마다 설정과 결과가 `out/runs.jsonl`에 한 줄씩 쌓입니다. 자세한 결과는 `out/*.json`.
- **K-Fashion (AI-Hub, 내국인 신청·승인 필요):** API 키를 `~/.aihub_apikey`에 저장한 뒤 라벨·이미지 zip을 `data/raw/kfashion_full/`에 받고
  `uv run python -m ml.kfashion --zip-base "data/raw/kfashion_full/014.KFashion/01.데이터/2.Validation" --pct 17 --name kfashion_val`.
  맥에서는 공식 `aihubshell`의 조각 병합이 한글 파일명에서 실패하니, curl로 받고 직접 합칩니다.
- **궁합 모델에 K-Fashion을 섞지 않는 이유:** 한 사진에서 잘라낸 옷들이 조명·색감을 공유해서 모델이 "같은 사진인가"를 배웁니다
  (K-Fashion test AUC 0.97인데 Polyvore test는 오히려 떨어짐, 비슷한 옷으로 오답을 만들어도 해결 안 됨). K-Fashion은 분류기와 스타일 모델에 씁니다.

## 4. 평가·데이터 도구

```bash
uv run python -m ml.eval_team              # 팀원 촬영 사진으로 실제 정확도 (labels/team_photos_template.csv 참고)
uv run python -m ml.find_label_issues      # 4분류 라벨 검토 목록 → labels/review.csv, out/review.html
uv run python -m ml.kfashion_stats         # K-Fashion 라벨 분포
uv run python -m ml.style_guide            # 스타일별 특징 아이템·색 → out/style_guide.md (스타일 가이드 초안)
for t in test_logic test_api test_outfits test_recommend; do uv run python -m tests.$t; done
```

- **팀원 사진 평가:** 옷 한 벌씩 프리셋(펴서 위에서 / 옷걸이 정면)으로 찍어 `data/raw/team_photos/`에 넣고, 템플릿을 복사한
  `labels.csv`에 정답을 채웁니다. 얼굴·개인정보가 없게 찍고, 사진은 Git에 올리지 않습니다.
- **라벨 검토:** `review.csv`의 `new_cls`에 `상의 / 하의 / 아우터 / 원피스 / 제외`를 채워 `labels/clothing_fixes.csv`로 저장하면 다음 학습에 반영됩니다.
  아우터 기준: 다른 옷 위에 걸치고 앞이 열리는 옷.

## 5. 코디 추천 규칙 (`ml/outfits.py`)

- 기본: 상의+하의(+아우터), 원피스(+아우터), 원피스+하의(원피스에 "레이어드" 태그가 있을 때)
- 레이어드(`allow_layering=True`, 기본 꺼짐): 니트·맨투맨 안에 셔츠·티 / 겉 소매가 이너보다 짧을 때(긴팔 위 반팔·나시) / 원피스 안 이너.
  세부 카테고리·소매를 모르는 옷은 레이어드하지 않습니다. 상의끼리의 궁합은 학습 데이터가 없어 규칙만 씁니다.
- 근거 문구는 실제로 적용한 규칙과 점수만 보여줍니다 (궁합 근거는 0.6 이상일 때만).

## 6. 착장 사진 분석 (나중 단계)

```bash
uv run python -m ml.analyze 착장사진.jpg --out out   # YOLOS 탐지 → SAM 분할 → 세부 분류 + 색
uv run python -m ml.eval_fashionpedia               # Fashionpedia 검증 1,158장 탐지 성능
```

## 7. 사용한 모델·데이터와 라이선스

| 항목 | 라이선스 | 쓰임 |
| --- | --- | --- |
| [FashionCLIP](https://huggingface.co/patrickjohncyh/fashion-clip) | MIT | 옷 벡터 |
| [BiRefNet_lite](https://huggingface.co/ZhengPeng7/BiRefNet_lite) | MIT | 배경 제거 (원격 코드라 커밋 고정) |
| [YOLOS-Fashionpedia](https://huggingface.co/valentinafeve/yolos-fashionpedia) | MIT | 착장 탐지 |
| [SAM vit-base](https://huggingface.co/facebook/sam-vit-base) | Apache-2.0 | 착장 분할 |
| [clothing-dataset](https://github.com/alexeygrigorev/clothing-dataset) | CC0 | 4분류·소매 학습 |
| [Polyvore (Marqo 사본)](https://huggingface.co/datasets/Marqo/polyvore) | Apache-2.0 표기 (이미지는 원 출처) | 궁합 학습, 이미지 노출 안 함 |
| [K-Fashion (AI-Hub)](https://www.aihub.or.kr/aihubdata/data/view.do?dataSetSn=51) | AI-Hub 약관 (내국인, 영리 금지, 재배포 금지) | 소매·색·평가, 이미지 노출·재배포 안 함 |
| [Fashionpedia](https://fashionpedia.github.io/home/) | 주석 CC BY 4.0, 이미지는 각 출처 | 탐지 평가, 이미지 재배포 안 함 |
