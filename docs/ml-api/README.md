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

## 3. 데이터 저장 제안

| 테이블 | 핵심 칸 | 메모 |
| --- | --- | --- |
| `garment` | id, user_id, category, subcategory(null), sleeve(null), color, material, tags, memo, image_url, **embedding(512)**, **embedding_model**, created_at | 벡터는 PostgreSQL `pgvector` `vector(512)` 권장 (나중에 비슷한 옷 검색). 안 되면 float 배열·JSON |
| `outfit_recommendation` | id, user_id, created_at, **model_version**, conditions(JSON), score, score_parts(JSON), reasons(JSON) | |
| `outfit_item` | recommendation_id, garment_id, **role**(null / 이너 / 겉), position | **코디는 고정 칸(top_id, bottom_id)이 아니라 목록**. 레이어드(상의 2벌)를 나중에 켜도 구조가 안 바뀜 |
| `feedback` | recommendation_id, user_id, type(like / dislike / wear), created_at | 궁합·취향 모델 재학습 데이터 |

- **`embedding_model`이 바뀌면 그 사용자의 벡터를 모두 다시 계산**해야 합니다 (모델이 다른 벡터끼리는 비교가 안 됨). ML API의 `/ready`가 현재 버전을 알려줍니다.
- 원본 사진 보관 여부는 팀 결정 사항입니다. 크롭(배경 제거본)만 보관하면 얼굴 등 개인정보가 줄어듭니다.

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
