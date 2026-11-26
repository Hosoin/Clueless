# ML

옷 사진 분석(종류·소매·색)과 내 옷장 코디 추천을 하는 Python 코드입니다. 모든 명령은 이 폴더(`ml/`)에서 실행합니다.
전체 흐름은 [파이프라인 정리 페이지](https://claude.ai/artifact/SbG46qG5RoNZA5RjT9xx1X)를 참고하세요.

```
옷 사진 → 배경 제거(u2netp) → FashionCLIP(옷 1벌 = 512 벡터) → 작은 분류기들(4분류는 MLP, 소매·색은 Linear, 직접 학습)
옷장(벡터들) → 후보 조합 → 궁합 모델(직접 학습) + 취향·트렌드(예정) → 코디 상위 5개 + 근거
```

## 1. 바로 실행하기 (API 서버)

```bash
cd ml
uv sync                              # 맥·윈도우 같음. uv 필요: https://docs.astral.sh/uv/
# 가중치 받기 (아래 "가중치" 참고). 최소: garment4_mlp_both.pt(없으면 garment4_probe_both.pt), compat_mlp_polyvore.pt
gh release download ml-weights-v0.1 -R Hosoin/Clueless -D weights && gh release download ml-weights-v0.2 -R Hosoin/Clueless -D weights
uv run uvicorn ml.api:app --port 8000   # 요청·응답 명세: http://localhost:8000/docs
```

| API | 하는 일 |
| --- | --- |
| `POST /v1/garments/analyze` (multipart `image`) | 카테고리(+후보), 대표색(`color_name`, 확인 필요 표시), 색 견본(`colors`), 소매(`sleeve`, 상의·아우터·원피스만), 다시 찍기(`retake`), 흰 배경 크롭(base64), **512 벡터**(옷장 DB에 저장) |
| `POST /v1/outfits/recommend` (JSON) | 옷장 옷 목록(id, 카테고리, 벡터, 선택: 세부·소매·태그) → 코디 상위 k개, 점수(`score_parts`: 궁합/취향/트렌드), 근거. `include_id`(꼭 넣을 옷), `allow_layering`(레이어드, 기본 꺼짐) |
| `GET /health` | 살아 있는지 (liveness) |
| `GET /ready` | 모델이 올라와 요청을 받을 수 있는지 + 모델 버전 (readiness) |

- **환경변수:** `WEIGHTS_DIR`(가중치 폴더, 기본 `weights`), `ML_API_KEY`(설정하면 `/v1/*`에 `X-API-Key` 헤더 필요. 백엔드만 호출하게)
- **버전:** 분석 응답의 `model_versions.embedding`(FashionCLIP 고정 버전)이 바뀌면 옷장 DB의 벡터를 모두 다시 계산해야 합니다
- **로그:** 요청마다 한 줄 JSON (경로·상태·지연 시간·예측 요약). 사진·벡터는 남기지 않습니다
- **서비스 배포 (Azure VM, Docker 없이):** [`deploy/README.md`](deploy/README.md) — `sudo bash ml/deploy/setup_vm.sh`로 설치·업데이트, systemd 서비스 `clueless-ml`
- **컨테이너 (선택):** `docker build -t clueless-ml .` → `docker run -p 8000:8000 -v "$PWD/weights:/app/weights:ro" clueless-ml` (리눅스는 CPU 전용 torch, 사전학습 모델은 이미지에 미리 받아 둠)
- **CI:** `ml/` 변경 PR마다 GitHub Actions가 테스트 실행 (모델·데이터 없이 도는 테스트)
- **백엔드 연동:** [`docs/ml-api/`](../docs/ml-api/README.md) (흐름, 저장 구조 제안, `openapi.json`)
- 장치는 자동 선택: NVIDIA GPU(cuda) → 맥 GPU(mps) → CPU. `CLUELESS_DEVICE=cpu`로 강제할 수 있습니다.
- 윈도우 + NVIDIA: 기본 설치되는 torch는 CPU 버전입니다. GPU를 쓰려면 CUDA용 torch로 바꿔야 합니다.
- 사전학습 모델은 처음 실행할 때 받아 캐시에 둡니다 (FashionCLIP은 Hugging Face, u2netp는 GitHub, 둘 다 버전·해시 고정).

## 2. 가중치

팀 규칙대로 가중치(`weights/`, `*.pt`)는 Git에 넣지 않습니다. 작은 파일이라 GitHub Release로 공유합니다.

| 파일 | 역할 | 학습 데이터 | 받는 곳 |
| --- | --- | --- | --- |
| `garment4_mlp_both.pt` | 4분류 (필수, MLP 512→256→4) | clothing-dataset (CC0) | Release `ml-weights-v0.2` |
| `garment4_probe_both.pt` | 4분류 예전 Linear (MLP 파일이 없을 때만 씀) | clothing-dataset (CC0) | Release `ml-weights-v0.1` |
| `compat_mlp_polyvore.pt` | 코디 궁합 (추천 API 필수) | Polyvore | Release `ml-weights-v0.1` |
| `sleeve_probe.pt` | 소매 기장 (없으면 소매 생략) | K-Fashion + clothing-dataset | 팀 내부 공유 (AI-Hub 데이터로 학습, 공개 저장소에 올리지 않음) |
| `color_probe.pt` | 대표색 (없으면 규칙으로 대체) | K-Fashion | 팀 내부 공유 (같은 이유) |
| `style_probe.pt` | 스타일 6개 점수·태그 (없으면 스타일 생략, 스타일 추천 요청은 503). `uv run python -m ml.train_style` | K-Fashion 스타일 라벨 | 팀 내부 공유 (같은 이유) |
| `subcat_probe.pt`, `print_probe.pt` | 세부 종류·프린트 (내부 이름으로 학습, API는 앱 이름으로 바꿔 냄: ml/vocab.py). 없으면 생략. `uv run python -m ml.train_attrs` | K-Fashion (+ clothing-dataset) | 팀 내부 공유 (같은 이유) |
| `garment4_mlp_real.pt`, `color_probe_real.pt` | 실사진(중고거래·웹·팀원 촬영 842장)을 섞은 4분류·대표색. 있으면 우선 사용. `uv run python -m ml.train_real_mix` | clothing-dataset·K-Fashion + 실사진 | 팀 내부 공유 (실사진은 평가 허락 범위라 공개 금지) |

## 3. 다시 학습하기

| 모델 | 준비 | 명령 | 결과 (test) |
| --- | --- | --- | --- |
| 4분류 | `git clone --depth 1 https://github.com/alexeygrigorev/clothing-dataset.git data/raw/clothing-dataset` → `uv run python -m ml.garment_data nobg` (배경 제거본, 맥 약 45분) | `uv run python -m ml.train_garment4` | MLP 정확도 0.974 / 매크로 F1 0.958 (Linear 0.969 / 0.950, 제로샷 0.953, 시드 5개 평균) |
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
for t in test_logic test_api test_outfits test_recommend test_eval_team; do uv run python -m tests.$t; done
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
| [u2netp](https://github.com/xuebinqin/U-2-Net) (rembg ONNX 배포본) | Apache-2.0 | 배경 제거 (파일 해시 고정). 예전 BiRefNet_lite(MIT)보다 CPU에서 약 40배 빠름 |
| [YOLOS-Fashionpedia](https://huggingface.co/valentinafeve/yolos-fashionpedia) | MIT | 착장 탐지 |
| [SAM vit-base](https://huggingface.co/facebook/sam-vit-base) | Apache-2.0 | 착장 분할 |
| [clothing-dataset](https://github.com/alexeygrigorev/clothing-dataset) | CC0 | 4분류·소매 학습 |
| [Polyvore (Marqo 사본)](https://huggingface.co/datasets/Marqo/polyvore) | Apache-2.0 표기 (이미지는 원 출처) | 궁합 학습, 이미지 노출 안 함 |
| [K-Fashion (AI-Hub)](https://www.aihub.or.kr/aihubdata/data/view.do?dataSetSn=51) | AI-Hub 약관 (내국인, 영리 금지, 재배포 금지) | 소매·색·평가, 이미지 노출·재배포 안 함 |
| [Fashionpedia](https://fashionpedia.github.io/home/) | 주석 CC BY 4.0, 이미지는 각 출처 | 탐지 평가, 이미지 재배포 안 함 |
