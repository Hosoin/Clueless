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
1. 앱 → 백엔드: 사진 업로드 (앱에서 긴 변 1024px 정도로 줄여 올리면 업로드가 빨라짐. 결과는 같음)
2. 백엔드 → ML `POST /v1/garments/analyze` (multipart `image`, CPU 약 0.3초)
3. 백엔드: 응답의 `crop_png_base64`를 Blob에 저장, 나머지를 "임시 분석 결과"로 앱에 전달 (`embedding`은 앱에 보내지 않음)
4. 앱: 확인 카드에서 사용자가 수정 (`needs_review`, `color_name.needs_review`, `sleeve.needs_review`가 true면 선택을 요구)
5. 앱 → 백엔드: 확정값 저장 (3절 표)
- 여러 장(예: 처음 옷장 채우기 100장)은 한 장씩 차례로 부르면 됨 (100장 약 30초). ML 서버는 요청을 하나씩 처리하므로 동시에 많이 보내도 빨라지지 않음

**코디 추천**
1. 앱 → 백엔드: "오늘 코디" (+ 꼭 넣을 옷 id)
2. 백엔드: 사용자 옷장에서 옷 목록(id, 확정 카테고리, 벡터, 세부·소매·태그)을 모아 ML `POST /v1/outfits/recommend`
3. 백엔드: 응답(옷 id 목록, 점수, 근거)에 이미지 URL을 붙여 앱에 전달, 추천 기록 저장 (`model_version` 포함)
4. 앱 → 백엔드: 좋아요·싫어요·입을래요 → 평가 저장 (추천 id와 연결)

## 3. 데이터 저장 (백엔드 테이블 명세서 1안: `user_info`, `closet_items`)

**`POST /v1/garments/analyze` 응답 → `closet_items`**

| ML 응답 | 저장 위치 |
| --- | --- |
| `category.name` (상의·하의·아우터·원피스) | `category` 기본값 (사용자 확인 후 확정) |
| `color_name.name` | `color` 기본값 |
| `style.tags` (1~2개, 강한 순) | `styles` 기본값 (사용자가 고치거나 비울 수 있음) |
| `subcategory.name` (티셔츠·셔츠·청바지·반바지 …) | `subcategory` 기본값. 사용자가 `category`를 바꾸면 비우고 다시 고르게 함 |
| `print.name` (무지·레터링·그래픽·체크 …) | `meta_json`에 보관. 표시 이름 예: "화이트 레터링 반팔 티셔츠" (색 + 프린트 + 소매 + 세부 종류) |
| `crop_png_base64` | Blob에 저장 → `image_blob`(파일 키). `meta_json`에는 넣지 않음 |
| **나머지 응답 전체** (`crop_png_base64`만 뺀 것) | `meta_json` 그대로. 아래 칸이 들어 있어야 추천이 다 됨 |

`meta_json`에 꼭 남아야 하는 칸 (추천 요청에 다시 씀):

| `meta_json` 안의 칸 | 쓰는 곳 |
| --- | --- |
| `embedding` (512개 숫자, 약 5KB) | 추천 요청의 `embedding` → 궁합 점수·세밀한 스타일 점수. 없으면 그 옷은 궁합에서 빠짐 |
| `sleeve.name` | 추천 요청의 `sleeve` → 레이어드 추천 (겉옷 소매 ≤ 이너 소매) |
| `model_versions.embedding` | 이 값이 바뀌면 그 사용자 옷의 `embedding`을 다시 계산해야 함 (`/ready`가 현재 버전을 알려줌) |
| `style.scores`, `category_candidates`, `colors` | 모델 정확도 측정(제안값 vs 확정값), 색 견본 |

- 사진 없이 수동 입력한 옷은 `meta_json`이 NULL → 추천 요청에 `embedding: null`. 사용자가 고른 `styles`로 스타일 점수를 대신함
- 지금은 `meta_json` 안의 벡터로 충분합니다. 나중에 "비슷한 옷 찾기"를 DB에서 빠르게 하려면 pgvector `vector(512)` 칸을 따로 둡니다.

**스타일 6개 코드 (명세서에서 미확정 → ML 제안)**
- `미니멀`, `클래식`, `스트리트`, `캐주얼`, `페미닌`, `스포티` (ML 응답·요청이 이 한글 이름을 씀. 영문 코드로 바꾸려면 ML·백엔드가 같이 바꿈)
- 같은 코드를 `closet_items.styles`, `user_info.preferred_styles`, 추천 요청의 `style`/`style_weights`에 씁니다.
- 옷장 "캐주얼" 필터는 `styles`에 `미니멀`·`클래식`·`캐주얼` 중 하나가 있는 옷 (캐주얼 점수 = max(미니멀, 클래식)이라서)

**`POST /v1/outfits/recommend` 요청 만들기**

| 요청 칸 | 가져올 곳 |
| --- | --- |
| `items[].id` | `closet_items.id` (숫자 그대로 가능, 응답 id는 문자열) |
| `items[].category`, `subcategory`, `tags`, `styles` | `closet_items` 같은 이름 칸 |
| `items[].sleeve` | `meta_json.sleeve.name` (없으면 생략) |
| `items[].color` | `closet_items.color` (대표색) |
| `items[].colors` | `meta_json.colors` (분석 응답의 색과 면적 비율. 수동 등록 옷은 생략 → 대표색 하나로 계산) |
| `items[].embedding` | `meta_json.embedding` (없으면 null) |
| `style` | 사용자가 추천 화면에서 고른 스타일 (없으면 생략) |
| `style_weights` | `style`이 없을 때 `user_info.preferred_styles`를 같은 비중으로 (예: `{"스트리트": 0.5, "캐주얼": 0.5}`) |

- **색 궁합:** 옷마다 면적 15% 이상인 색끼리 규칙표(무채색·같은 계열 +, 보색 충돌 −)로 점수를 내서 `score_parts.color`(0.5 = 중립)에 반영합니다. 흰색·민트 셔츠처럼 여러 색인 옷은 민트 부분의 궁합도 면적만큼 따집니다. 보조색을 다른 옷과 맞추면 "민트 포인트 색을 맞췄어요." 근거가 붙습니다. 규칙표는 초안이라 가중치를 낮게(0.3) 시작합니다.

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

## 5. 띄우기

**서비스 (Azure VM, docker compose):** 백엔드·DB와 같은 compose 파일에 `ml` 서비스를 추가합니다. 백엔드는 `http://ml:8000`으로 부르고, 8000번은 외부에 열지 않습니다 (`ports` 없이).

```yaml
  ml:
    build: ./ml
    environment:
      ML_API_KEY: ${ML_API_KEY}        # 백엔드 ml.api-key와 같은 값 (.env, Git에 올리지 않음)
    volumes:
      - ./ml/weights:/app/weights:ro   # Release 가중치 + 팀 내부 공유 가중치(소매·색·스타일)
    mem_limit: 3g                      # ML 서버 약 1GB. 넘치면 ML만 정리되고 백엔드·DB는 지킴
    restart: always
```

- 가중치: `gh release download ml-weights-v0.1`, `ml-weights-v0.2`로 공개분을 받고, `sleeve_probe.pt`·`color_probe.pt`·`style_probe.pt`·`subcat_probe.pt`·`print_probe.pt`·`garment4_mlp_real.pt`·`color_probe_real.pt`는 가진 팀원이 VM의 `ml/weights/`로 복사
- 도커 없이 VM에 직접 설치하는 방법(예비용)은 [`ml/deploy/README.md`](../../ml/deploy/README.md)

**개발용 (내 컴퓨터):**

```bash
cd ml && uv sync && gh release download ml-weights-v0.1 -R Hosoin/Clueless -D weights && gh release download ml-weights-v0.2 -R Hosoin/Clueless -D weights
ML_API_KEY=dev-key uv run uvicorn ml.api:app --port 8000
# 또는 컨테이너: docker build -t clueless-ml . && docker run -p 8000:8000 -v "$PWD/weights:/app/weights:ro" -e ML_API_KEY=dev-key clueless-ml
```

Spring 쪽 `ml.base-url=http://localhost:8000`(compose 안에서는 `http://ml:8000`), `ml.api-key`=ML 쪽 `ML_API_KEY`와 같은 값.

## 6. 바뀌면 알려야 하는 것

- `openapi.json`이 바뀌면 (응답 칸 추가·변경) ML 담당이 PR에 적고 백엔드 담당에게 공유
- `model_versions.embedding`이 바뀌는 배포는 벡터 재계산 계획과 함께
