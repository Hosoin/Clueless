# ML API 연동 가이드 (Spring Boot 백엔드용)

> 상태: **제안**. ML 담당이 작성한 연동 방식 초안입니다. 백엔드 구조는 백엔드 담당이 최종 결정합니다.
> API 명세: [`openapi.json`](openapi.json) (FastAPI 코드에서 자동 생성. Swagger Editor나 springdoc/openapi-generator로 열 수 있음)

## 1. 역할 나누기

```
[웹·앱] ──► [Spring Boot]  로그인, 옷장·코디·평가 DB, 이미지 저장, 권한
                 │  (서버 사이에서만, X-API-Key)
                 ▼
            [ML API (Python)]  옷 분석, 코디 추천. 상태(DB)를 갖지 않음
```

- **ML API는 상태가 없습니다.** 옷장 데이터를 저장하지 않고, 요청마다 받은 값으로 계산만 합니다. 저장은 모두 백엔드 책임입니다.
- **웹·앱은 ML API를 직접 부르지 않습니다.** 키를 앱에 넣으면 노출되므로 백엔드만 호출합니다.

## 2. 호출 흐름

**옷 등록**
1. 앱 → 백엔드: 사진 업로드
2. 백엔드 → ML `POST /v1/garments/analyze` (multipart `image`)
3. 백엔드: 응답의 `crop_png_base64`를 Blob에 저장, 나머지를 "임시 분석 결과"로 앱에 전달 (`embedding`은 앱에 보내지 않음)
4. 앱: 확인 카드에서 사용자가 수정 (`needs_review`, `color_name.needs_review`, `sleeve.needs_review`가 true면 선택을 요구)
5. 앱 → 백엔드: 확정값 저장. 백엔드가 확정값 + `embedding` + `model_versions.embedding`을 함께 저장

**코디 추천**
1. 앱 → 백엔드: "오늘 코디" (+ 꼭 넣을 옷 id)
2. 백엔드: 사용자 옷장에서 옷 목록(id, 확정 카테고리, 벡터, 세부·소매·태그)을 모아 ML `POST /v1/outfits/recommend`
3. 백엔드: 응답(옷 id 목록, 점수, 근거)에 이미지 URL을 붙여 앱에 전달, 추천 기록 저장 (`model_version` 포함)
4. 앱 → 백엔드: 좋아요·싫어요·입을래요 → 평가 저장 (추천 id와 연결)

## 3. 데이터 저장 제안 (1차: 의류 두 테이블)

1차는 모델이 구분할 수 있는 값에 집중해 옷 데이터를 두 테이블로 나눕니다. 추천·평가 테이블은 추천이 1차에 들어가면 추가합니다.
칸별 설명은 노션 자료실 "DB 테이블 명세서 (의류·메타데이터)"와 같습니다.

| 테이블 | 핵심 칸 | 메모 |
| --- | --- | --- |
| `garments` (의류·유저 데이터) | id, user_id, image_blob, name, subcategory, material, memo, tags, excluded, created_at, deleted_at | 누구의 옷인지, 사진 위치, 사용자가 직접 넣는 값. 지울 때는 `deleted_at`만 채움 |
| `garment_metadata` (의류 메타데이터) | garment_id(PK·FK), category, sleeve, color, hex, **embedding(512)**, model_version, **embedding_model**, predicted, needs_review, analyzed_at, updated_at | 모델이 구분하는 값. `predicted`(모델 제안 원본)와 확정값을 같이 둬서 실사용 정확도를 잼. 사진 없이 입력한 옷은 embedding·predicted가 NULL |

**`POST /v1/garments/analyze` 응답 → 저장 위치**

| ML 응답 | 저장 위치 |
| --- | --- |
| `category.name` | `predicted.category`, `category` 기본값 (`덧입기`는 모델이 안 냄, 사용자가 고름) |
| `category_candidates` (상위 3개) | 확인 화면 후보로만 사용, 저장 안 함 |
| `sleeve.name` | `predicted.sleeve`, `sleeve` 기본값 (하의는 null) |
| `color_name.name` | `predicted.color`, `color` 기본값 |
| `colors[0].rgb` | `hex` (`#RRGGBB`로 변환) |
| `needs_review`, `color_name.needs_review` | `needs_review` |
| `embedding` | `embedding` (앱 응답에는 넣지 않음) |
| `model_version` / `model_versions.embedding` | `model_version` / `embedding_model` |
| `crop_png_base64` | Blob에 저장 → `garments.image_blob` |
| `retake` | 저장 안 함. true면 다시 찍기 안내 |

- **추천 요청에 옷을 넣을 때** `embedding`은 null이어도 됩니다 (사진 없이 입력한 옷). 그 옷은 궁합 점수에서만 빠집니다.
- **`embedding_model`이 바뀌면 그 사용자의 벡터를 모두 다시 계산**해야 합니다 (모델이 다른 벡터끼리는 비교가 안 됨). ML API의 `/ready`가 현재 버전을 알려줍니다.
- 벡터 칸은 `real[]`로 시작하고, 비슷한 옷 검색을 붙일 때 pgvector `vector(512)`로 바꿉니다.
- 원본 사진은 보관하지 않고 크롭(배경 제거본)만 보관하면 얼굴 등 개인정보가 줄어듭니다.

## 4. Spring Boot 쪽 구성 제안

외부 스킬([layered-architecture](https://github.com/rrezartprebreza/spring-boot-skills), [spring-boot-engineer](https://github.com/Jeffallan/claude-skills))의 규칙 중 이 연동에 해당하는 것만 골랐습니다.

```
controller/   GarmentController, OutfitController   ← HTTP만. @Valid, 응답 DTO
service/      GarmentService, OutfitService          ← 흐름 조율, @Transactional
client/       MlClient                               ← ML API 호출만 여기서 (타임아웃·재시도·오류 변환)
repository/   GarmentRepository …                    ← 데이터 접근만
config/       MlProperties (@ConfigurationProperties("ml"))
```

- **ML 호출은 `MlClient` 한 곳에서만.** 컨트롤러나 서비스가 URL을 직접 다루지 않게 합니다. 배포 때 주소만 바꾸면 됩니다.
- **설정은 환경변수로:** `ml.base-url`, `ml.api-key`(= ML 쪽 `ML_API_KEY`). `application.yml`에 실제 키를 쓰지 않습니다.
- **타임아웃:** 분석은 CPU에서 수 초가 걸릴 수 있음 (맥 GPU 약 1초, 배경 제거가 대부분). 연결 3초, 읽기 30초 정도로 시작해 측정 후 조정.
- **오류 변환:** ML의 400/413/422(잘못된 이미지·입력)는 사용자에게 안내, 401은 설정 오류, 5xx·타임아웃은 "잠시 후 다시" + 로그.
- **엔티티를 그대로 응답하지 않기:** 응답 DTO(record)로 매핑. 특히 `embedding`은 앱 응답에 넣지 않습니다.
- **헬스 체크:** Actuator 헬스에 ML `/ready`를 넣으면 ML이 내려갔을 때 바로 보입니다.

## 5. 로컬에서 같이 띄우기

```bash
cd ml && uv sync && gh release download ml-weights-v0.1 -R Hosoin/Clueless -D weights
ML_API_KEY=dev-key uv run uvicorn ml.api:app --port 8000
# 또는 컨테이너: docker build -t clueless-ml . && docker run -p 8000:8000 -v "$PWD/weights:/app/weights:ro" -e ML_API_KEY=dev-key clueless-ml
```

Spring 쪽 `ml.base-url=http://localhost:8000`, `ml.api-key=dev-key`.

## 6. 바뀌면 알려야 하는 것

- `openapi.json`이 바뀌면 (응답 칸 추가·변경) ML 담당이 PR에 적고 백엔드 담당에게 공유
- `model_versions.embedding`이 바뀌는 배포는 벡터 재계산 계획과 함께
