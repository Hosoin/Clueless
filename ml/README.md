# ML

옷 사진 분석(종류·소매·색)과 내 옷장 코디 추천을 하는 Python 코드입니다. 모든 명령은 이 폴더(`ml/`)에서 실행합니다.
전체 흐름은 [파이프라인 정리 페이지](https://claude.ai/artifact/SbG46qG5RoNZA5RjT9xx1X)를 참고하세요.

```
옷 사진 → EXIF 보정 원본 → FashionCLIP L2 512 벡터 → 4품목 MLP
       └→ BiRefNet → 전경 픽셀(색 견본), 표시용 크롭 → 512 옷장 벡터(소매·대표색 모델·질감에도 사용)
옷장(크롭 벡터들) → 후보 조합 → 궁합 모델(직접 학습) + 취향·트렌드(예정) → 코디 상위 5개 + 근거
```

## 1. 바로 실행하기 (API 서버)

```bash
cd ml
# 기존 환경 및 로컬 자산 준비: 아래 "가중치" 참고
uv run --no-sync --offline uvicorn ml.api:app --port 8000  # http://localhost:8000/docs
uv run --no-sync --offline python -m ml.garment photo.jpg --out out/garment
```

| API | 하는 일 |
| --- | --- |
| `POST /v1/garments/analyze` (multipart `image`) | 카테고리(+후보), 대표색(`color_name`, 확인 필요 표시), 색 견본(`colors`), 소매(`sleeve`, 상의·아우터·원피스만), 다시 찍기(`retake`), 흰 배경 크롭(base64), **512 벡터**(옷장 DB에 저장) |
| `POST /v1/garments/analyze/attributes` (동일 multipart `image`, 명시적으로 선택) | 기존 응답을 그대로 반환하고 `attributes`에 색 추출 정보와 사진 질감 후보를 추가. [JSON 계약과 예시](../docs/ml-api/garment-attributes.md) |
| `POST /v1/outfits/recommend` (JSON) | 옷장 옷 목록(id, 카테고리, 벡터, 선택: 세부·소매·태그) → 코디 상위 k개, 점수(`score_parts`: 궁합/취향/트렌드), 근거. `include_id`(꼭 넣을 옷), `allow_layering`(레이어드, 기본 꺼짐) |
| `GET /health` | 살아 있는지 (liveness) |
| `GET /ready` | 옷 분석 준비 상태와 모델 버전. 추천은 별도 `recommendation` 상태로 표시 |

- **환경변수:** `WEIGHTS_DIR`(기본 `ml/weights`), `GARMENT_CATEGORY_MODEL`(기본 `mlp`), `ML_API_KEY`(설정하면 `/v1/*`에 `X-API-Key` 필요).
- **품목:** EXIF 보정·RGB 원본을 FashionCLIP 프로세서에 그대로 전달합니다(내부 resize/center crop 적용). 기본은 [누적 MLP seed 0](GARMENT_CATEGORY_MODEL.json)입니다. 구형 raw Linear 비교는 서버에서 `GARMENT_CATEGORY_MODEL=legacy-linear`, 등록 CLI에서 `--category-model legacy-linear`로만 선택할 수 있습니다. 기본 파일이 없거나 해시가 다르면 시작에 실패하며 Linear로 자동 전환하지 않습니다.
- **벡터 호환:** API `embedding`은 여전히 저장 방향에서 긴 변 2048 이하로 축소한 기존 표시 크롭의 512D L2 FashionCLIP 벡터입니다. 품목용 원본 벡터는 반환하지 않습니다. `model_versions.embedding` 식별자와 API 픽셀 경로를 유지하므로 이번 품목 변경만으로 벡터를 다시 계산할 필요는 없습니다. 소매/대표색 probe도 기존 크롭 벡터를 사용합니다. CLI의 크롭은 API와 같이 최대 2048로 제한됩니다.
- **추천:** `compat_mlp_polyvore.pt`는 추천 요청 때만 로드합니다. 없거나 불량이면 추천 경로만 503이며 점수 대체는 없습니다. `/ready`는 분석만 판단하고 `recommendation`은 `missing_weights`, `not_loaded`, `ready` 중 하나입니다 (`not_loaded`는 파일 존재만 확인한 것).
- **로그:** 요청마다 한 줄 JSON (경로·상태·지연 시간·예측 요약). 사진·벡터는 남기지 않습니다
- **컨테이너:** `docker build -t clueless-ml .` → `docker run -p 8000:8000 -v "$PWD/weights:/app/weights:ro" clueless-ml` (리눅스는 CPU 전용 torch, 사전학습 모델은 이미지에 미리 받아 둠)
- **CI:** `ml/` 변경 PR마다 GitHub Actions가 테스트 실행 (모델·데이터 없이 도는 테스트)
- **백엔드 연동:** [`docs/ml-api/`](../docs/ml-api/README.md) (흐름, 저장 구조 제안, `openapi.json`)
- 장치는 자동 선택: NVIDIA GPU(cuda) → 맥 GPU(mps) → CPU. `CLUELESS_DEVICE=cpu`로 강제할 수 있습니다.
- 윈도우 + NVIDIA: 기본 설치되는 torch는 CPU 버전입니다. GPU를 쓰려면 CUDA용 torch로 바꿔야 합니다.
- 추론 서비스와 아래 CLI는 검토한 고정 리비전의 로컬 FashionCLIP·BiRefNet 캐시를 사용합니다. 캐시가 없으면 실행 중 다운로드하지 않습니다.

### 오프라인 속성 추출 CLI (실험용)

기본값은 서비스와 같은 체크포인트입니다. `--classifier-checkpoint`로 신뢰하는 다른 로컬 파일을 명시해 비교할 수 있습니다. 예: `ml/`에서 PowerShell, 기존 `.venv`와 고정 리비전 모델 캐시 사용:

```powershell
$env:HF_HUB_OFFLINE='1'
$env:TRANSFORMERS_OFFLINE='1'
$env:HF_HUB_DISABLE_TELEMETRY='1'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ')
$images = (Get-ChildItem ../sample -File | Sort-Object Name).FullName
.\.venv\Scripts\python.exe -B -m ml.garment_attributes @images `
  --region mask --mask-fallback central --swatches --out "../out/garment_attributes_$stamp"
```

- `--out`은 새 폴더여야 합니다. 사진별 `001.json` 등, `summary.json`, 선택적으로 `*_colors.png`를 저장하며 원본 사진은 복사하지 않습니다. CPU 기본 4 스레드(`--cpu-threads`). 가중치는 모델 ID, 리비전, `[상의, 하의, 아우터, 원피스]` 순서와 512차원 입력을 확인합니다. `GARMENT_CATEGORY_MODEL=legacy-linear`로 핀된 비교용 Linear를 선택할 수 있습니다. 같은 파일을 `--classifier-checkpoint`로 직접 넘길 경우, 체크포인트에 리비전이 없으므로 `--legacy-clip-revision 7e3ba62ce16b379a1ab479346b66f192e76f51b7`도 명시해야 합니다. 두 경로 모두 리비전이 체크포인트 자체에 의해 입증되지 않았음을 표시합니다.
- EXIF 보정 후 RGB를 공통으로 사용합니다. 품목은 학습 조건에 맞춘 전체 프레임(단, CLIP 중심 크롭 적용), 색은 자동 마스크 픽셀, 질감은 마스크 흰 배경 크롭을 사용합니다. `--region central`은 중앙 60%×60%, `--region roi --roi 100,50,600,700`은 사진 한 장의 EXIF 보정 이미지 픽셀 좌표 `[x0,y0,x1,y1)`로 지정하는 **비마스크 진단**입니다. 마스크 경로는 실패/부적합 시 기본적으로 오류를 반환합니다. 명시한 `--mask-fallback central`만 중앙 진단으로 넘어가며 실제 영역과 마스크 상태를 JSON에 남깁니다. CPU에서 자동 마스크는 수십 초/장 걸릴 수 있습니다.
- 색은 Lab k-means(k=3)와 20색 팔레트 규칙만 사용합니다. 품목 softmax도 보정되지 않았고, 낮은 값(0.6 미만)만 검토로 표시하는 규칙은 검증된 임계값이 아닙니다. 질감은 후보별 `label`, 원시 cosine `score`를 제공하며 `prob`는 `null`, 색과 질감은 항상 검토 대상으로 표시합니다. 실제 섬유 조성은 제안하지 않습니다. 여러 옷을 분리하는 도구가 아니며 CLI 결과 계약은 기존/확장 API 응답과 별도입니다.

## 2. 가중치

가중치(`weights/`, `*.pt`)와 캐시·학습 데이터는 Git에 넣지 않습니다. 기본 MLP는 이 작업본에만 로컬 배치했으며, 공개 릴리스에는 올리지 않았습니다. 다른 환경에는 권한이 확인된 로컬 사본이나 팀의 승인된 자산 채널에서 **동일한 파일**을 받아 `ml/weights/`(또는 `WEIGHTS_DIR`)에 별도로 배치하세요. [모델 매니페스트](GARMENT_CATEGORY_MODEL.json)에 정확한 파일명, SHA-256, 학습 표본, CC BY 4.0 귀속 및 제한이 있습니다. PowerShell: `Get-FileHash weights/garment4_mlp_secondhand_balanced264_20261124_seed0.pt -Algorithm SHA256`. 서비스는 두 품목 파일의 핀 해시를 역직렬화 전에 검증합니다. `weights_only=True`도 임의 체크포인트를 신뢰할 근거는 아니므로 출처가 검증된 자산만 사용하세요.

| 파일 | 역할 | 공급 방식 |
| --- | --- | --- |
| `garment4_mlp_secondhand_balanced264_20261124_seed0.pt` | 기본 4품목 MLP (분석에 필수) | 로컬 실험 산출물 `../out/garment4_secondhand_balanced264_20261124T0429053807666Z/cumulative_mlp_seed0.pt`의 정확한 사본 또는 별도 승인 자산 |
| `garment4_probe_raw.pt` | 명시적 비교용 Linear (리비전은 프로젝트 선언) | 기존 검증된 로컬 파일만. 이전 `garment4_probe_both.pt`는 이 경로에서 사용하지 않음 |
| `compat_mlp_polyvore.pt` | 코디 궁합 (추천 API에만 필수) | 승인된 Polyvore 모델 자산 별도 제공. 이 작업본에는 없음 |
| `sleeve_probe.pt` | 소매 기장 (없으면 `null`) | 승인된 팀 내부 자산 (AI-Hub 제한, 공개 금지) |
| `color_probe.pt` | 대표색 (없으면 규칙 사용) | 승인된 팀 내부 자산 (AI-Hub 제한, 공개 금지) |

FashionCLIP과 BiRefNet_lite의 고정 리비전 캐시도 배포 호스트에 별도로 공급합니다(`HF_HOME` 등). BiRefNet은 커밋에 고정된 모델 코드를 로드하므로 해당 코드까지 검토된 캐시만 사용하세요. 기존 컨테이너의 **빌드 단계** 캐시 준비는 런타임 다운로드와 별개입니다.

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
uv run python -m ml.find_label_issues      # 4분류 라벨 검토 목록 → labels/review.csv, out/review.html
uv run python -m ml.kfashion_stats         # K-Fashion 라벨 분포
uv run python -m ml.style_guide            # 스타일별 특징 아이템·색 → out/style_guide.md (스타일 가이드 초안)
for t in test_logic test_api test_outfits test_recommend test_eval_team test_garment_attributes; do uv run python -m tests.$t; done
```

### 팀원 사진으로 실제 정확도 재기 (3단계)

옷 한 벌씩 프리셋(바닥에 펴서 위에서 / 옷걸이에 걸어 정면, 단색 배경)으로 찍은 사진을 한 폴더에 모읍니다. 얼굴·개인정보가 찍힌 사진은 빼 주세요.

```bash
# 1) 정리: HEIC→JPG, 위치(GPS) 등 메타데이터 제거, 회전 보정 → data/raw/team_photos/ + labels.csv(파일명 채워짐)
uv run python -m ml.eval_team prepare ~/Downloads/팀원사진

# 2) data/raw/team_photos/labels.csv 를 엑셀·구글시트로 열어 정답 입력 (아래 표)

# 3) 평가 → 화면 요약 + out/team_eval.json + out/team_eval_rows.csv(사진마다 정답·예측·확률)
uv run python -m ml.eval_team
```

| 칸 | 값 | 비고 |
| --- | --- | --- |
| `category` | 상의 / 하의 / 아우터 / 원피스 | 필수. 아우터 = 다른 옷 위에 걸치고 앞이 열리는 옷 |
| `sleeve` | 민소매 / 반팔 / 7부 / 긴팔 | 하의는 비움 |
| `color` | 블랙, 화이트, 아이보리, 그레이, 네이비, 블루, 스카이블루, 민트, 청록, 그린, 카키, 베이지, 브라운, 옐로, 오렌지, 레드, 와인, 핑크, 퍼플, 라벤더 | 가장 넓은 색 하나 |
| `owner`, `memo` | 자유 | 찍은 사람 이니셜, 특이사항 |

- 정답표에 오타가 있으면 평가 전에 몇 행이 틀렸는지 알려 줍니다. `prepare`를 다시 돌려도 이미 채운 정답은 지워지지 않습니다.
- 결과 보는 법: **정확도**(맞힌 비율), **확인 필요가 오답을 잡은 비율**(높을수록 "확인 필요" 표시가 쓸모 있음), **헛경보**(확인 필요 중 사실 맞았던 비율, 낮을수록 좋음).
  이 두 숫자로 `REVIEW_PROB`(0.6)·`COLOR_REVIEW_PROB`(0.5) 기준값을 다시 정합니다.
- 사진과 정답은 `data/` 아래라 Git에 올라가지 않습니다.
- **라벨 검토:** `review.csv`의 `new_cls`에 `상의 / 하의 / 아우터 / 원피스 / 제외`를 채워 `labels/clothing_fixes.csv`로 저장하면 다음 학습에 반영됩니다.
  아우터 기준: 다른 옷 위에 걸치고 앞이 열리는 옷.

## 5. 코디 추천 규칙 (`ml/outfits.py`)

- 기본: 상의+하의(+아우터), 원피스(+아우터), 원피스+하의(원피스에 "레이어드" 태그가 있을 때)
- 걸쳐 입는 상의: "걸쳐입기" 태그가 있는 상의(데님·체크 셔츠 등)는 아우터 자리에도 온다. 셔츠는 기본이 상의, 셔켓·오버셔츠는 아우터
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
