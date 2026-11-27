# 개발 VM 백엔드 배포 상세

일상 재배포는 [팀원용 quickstart](DEPLOYMENT.md)를 먼저 따른다. 이 문서는 최초 설치·구성·장애 대응의 참고 자료다.

대상은 `closet-service`만이다. 기존 FE의 80 포트, DB, ML은 변경하지 않는다. 아래 명령은 별도 표시가 없으면 VM의 `~/clueless-backend/backend`에서 실행한다.

## 현재 상태와 적용 전제

- VM에는 저장소 전체가 `~/clueless-backend`에 clone되어 있다. 공개 저장소 clone에는 인증이 필요 없다. Docker 안에서 Java 21로 빌드하므로 VM에 Java/Gradle을 별도 설치하지 않는다.
- DNS `api-closet-service.p-e.kr` → `20.41.112.42`, Docker Compose `2.40.3`, 프로젝트명 `clueless-closet-dev`를 사용한다.
- 현재 기본 이미지: `clueless-closet:20acac8`. 백엔드는 호스트 `127.0.0.1:8081`에만 연결하고, Caddy가 공개 HTTPS 443/TCP를 받는다.
- **사용자 확인 완료:** 외부 `https://api-closet-service.p-e.kr/test` 접근과 Google 로그인 성공. 이 문서 작성 중 VM 재실행·재검증은 하지 않았다.
- **아직 통합 전:** `build-closet-image.sh`, `deploy-closet.sh`는 로컬 미커밋 상태이며 remote/VM에 전달되지 않았다. 스크립트는 mock 검증만 수행됐고 실제 VM의 통합 빌드·배포는 미검증이다. 아래 스크립트 절차는 검토·커밋·전달 후의 기준이다.
- Compose 두 파일과 Caddyfile은 현재 VM에만 있다. 아래는 그 구성에 맞춘 최초 설치용 sample이며 저장소에 이미 제공되는 파일로 가정하지 않는다.

## 1. 최초 준비

처음 clone할 때는 팀에서 확인한 공개 저장소 URL로 `git clone <공개-저장소-URL> ~/clueless-backend`를 실행한다. 이미 clone되어 있으면 다시 만들지 않는다.

```sh
cd ~/clueless-backend/backend
docker compose version
[ -e .env ] || (umask 077; cp .env.example .env)
```

`.env`는 편집기로 설정하며 기존 파일을 덮어쓰지 않는다. DB/Google 자격증명은 별도 안전한 경로로 전달받는다. 컨테이너에서는 다음 값이 필요하다.

```dotenv
DB_CA_CERT=/run/certs/db-ca.crt
SERVER_FORWARD_HEADERS_STRATEGY=framework
```

그 밖의 필수 DB/Google 항목은 [로컬 실행 가이드](LOCAL_SETUP.md)를 따른다. `certs/ca.crt`가 존재하고 컨테이너 사용자 UID 10001이 읽을 수 있어야 한다. TLS 검증은 끄지 않는다.

Google 콘솔의 승인된 리디렉션 URI는 정확히 다음 값이다.

```text
https://api-closet-service.p-e.kr/login/oauth2/code/google
```

`FRONTEND_LOGIN_SUCCESS_URL`은 로그인 이후 이동할 **실제 FE URL**로 별도 설정한다. 실제 배포 FE URL은 아직 미확정이며, 미설정 기본값은 `http://localhost:5173/home`이다. FE 성공 주소를 Google 콜백으로 등록하지 않는다. 프록시 뒤에서 HTTPS 콜백을 생성하도록 `SERVER_FORWARD_HEADERS_STRATEGY=framework`를 유지한다.

### VM 전용 구성 파일 sample

기존 파일이 있으면 먼저 비교하고 보존한다. 아래 내용을 각각 `backend/`에 준비한다.

`compose.closet.yaml`:

```yaml
name: clueless-closet-dev
services:
  closet-service:
    image: clueless-closet:20acac8
    pull_policy: never
    env_file:
      - .env
    environment:
      DB_CA_CERT: /run/certs/db-ca.crt
    ports:
      - "127.0.0.1:8081:8081"
    volumes:
      - ./certs/ca.crt:/run/certs/db-ca.crt:ro
```

`compose.closet-https.yaml`:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "443:443/tcp"
    volumes:
      - ./Caddyfile.closet:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
```

`Caddyfile.closet`:

```caddyfile
api-closet-service.p-e.kr {
    tls {
        issuer acme {
            disable_http_challenge
        }
    }
    reverse_proxy closet-service:8081
}
```

DNS와 VM/클라우드 방화벽의 443/TCP 허용이 선행돼야 한다. HTTP challenge를 끄고 443의 TLS-ALPN challenge를 사용하므로 기존 FE의 80 포트를 점유하지 않는다. 443/UDP는 이 구성에서 공개하지 않는다. 인증서 상태를 보존하도록 `caddy_data`, `caddy_config` 볼륨을 유지한다.

## 2. 소스 갱신과 빌드 주의점

소스 갱신은 배포 스크립트에 포함되지 않는다. 먼저 작업 상태를 확인하고 별도로 수행한다.

```sh
cd ~/clueless-backend
git status --short
git pull --ff-only
cd backend
```

충돌·분기·로컬 수정 때문에 pull이 실패하면 중단하고 비교·통합한다. `git reset --hard`로 VM 설정이나 임시 수정을 지우지 않는다. 비밀 파일은 Git에 추가하지 않는다.

현재 `.dockerignore`는 `**`로 전체 제외 후 Java wildcard 등을 허용한다. **VM의 legacy builder에서 Java wildcard 허용이 누락되어**, 추적 중인 Java 파일의 literal `!경로`를 임시 추가한 뒤 빌드가 성공했다. 이 수정은 정식 반영되지 않았다. 동일 장애가 나면 원인을 확인한 뒤 다음 임시 목록을 기존 `.dockerignore`와 중복되지 않게 추가한다.

```sh
git ls-files 'closet-service/src/main/java/*.java' \
  'closet-service/src/main/java/**/*.java' | sed 's/^/!/'
```

위 명령은 추가할 목록만 출력한다. 파일 자동 덮어쓰기는 하지 않는다. 소스가 추가·이동되면 목록을 갱신해야 하는 임시 우회이며, pull 충돌 원인이 될 수 있다. wildcard 문제의 정식 수정·해당 VM 재검증 전에는 새 clone에서 빌드가 바로 성공한다고 가정하지 않는다.

## 3. 최초 기동과 이후 재배포

### 최초 기동

아래 수동 예시는 소스가 `20acac8`인 최초 설치 기준이다(`git rev-parse --short HEAD`로 확인). 다른 SHA를 옛 태그로 빌드하지 않는다. Dockerfile은 `backend/`를 build context로 사용하며 closet만 `bootJar`로 만든다.

```sh
docker build -f closet-service/Dockerfile -t clueless-closet:20acac8 .
docker compose -p clueless-closet-dev \
  -f compose.closet.yaml -f compose.closet-https.yaml config --quiet
docker compose -p clueless-closet-dev \
  -f compose.closet.yaml -f compose.closet-https.yaml \
  up -d --no-build --pull never closet-service
# Caddy 이미지를 최초로 받는 단계는 위 backend 기동과 별도다.
docker compose -p clueless-closet-dev \
  -f compose.closet.yaml -f compose.closet-https.yaml up -d caddy
```

`20acac8`은 현재 배포 기준 태그다. 다른 소스로 최초 설치하면 실제 Git short SHA 태그를 빌드하고 아래 deploy 스크립트에 그 이미지를 지정한다. 스크립트는 Caddy를 기동하지 않으므로 최초 Caddy 기동은 별도로 필요하다.

### 재배포 스크립트 동작

실행 명령·환경변수 재적용은 [quickstart](DEPLOYMENT.md#환경변수-재적용과-롤백)를 따른다. build 스크립트는 Git short SHA로 이미지를 빌드한 뒤 deploy를 호출하며 pull·테스트는 하지 않는다. 미커밋 변경도 빌드에 포함될 수 있다.

deploy는 대상 이미지의 로컬 존재와 Compose 구성을 확인하고, 실행 중 이미지 ID에 `clueless-closet:rollback-<이미지ID>` 태그를 붙인다. 이후 이미지 override를 교체하고 closet만 `--no-deps --force-recreate --no-build --pull never`로 재생성한다. DB·ML·Caddy는 재생성하지 않으며 자동 롤백·건강 상태 보증은 하지 않는다.

스크립트가 만든 `compose.closet-image.yaml`은 이미지 선택 override다. 이후 수동 Compose 명령에도 항상 **마지막 `-f`**로 넣어야 기본 파일의 옛 이미지로 돌아가지 않는다.

```sh
docker compose -p clueless-closet-dev \
  -f compose.closet.yaml -f compose.closet-https.yaml \
  -f compose.closet-image.yaml config --quiet
```

`config` 전체 출력은 비밀 환경변수를 노출할 수 있으므로 `--quiet`만 사용한다. `.env`, 컨테이너 환경 전체, OAuth code/state·쿠키·토큰을 출력하거나 공유하지 않는다. 로그도 개인정보·인증정보를 검토·가린 후 공유한다.

## 4. 확인과 롤백

```sh
curl -i --max-time 10 --fail --show-error https://api-closet-service.p-e.kr/test
```

`200`과 `closet-service 테스트 요청`을 확인한다. **`/test` 성공은 DB·ML·OAuth 성공을 의미하지 않는다.** Google 로그인은 브라우저에서 `https://api-closet-service.p-e.kr/oauth2/authorization/google`로 시작하고, 같은 브라우저의 `/api/auth/me`로 세션을 확인한다. 최초 로그인은 DB에 실제 회원을 생성할 수 있다. FE 복귀 화면·교차 출처 연동과 로그아웃 검증은 [인증 API 명세](AUTH_API.md)를 따른다. DB 검증은 별도이며 운영 DB에 임의 쓰기 테스트를 하지 않는다.

배포 실패 시 스크립트가 출력했던 **실제 rollback 태그**로 되돌린다.

```sh
# backend/에서, <이미지ID>는 직전 배포 출력값으로 대체
./deploy-closet.sh clueless-closet:rollback-<이미지ID>
```

`up`이 실패해도 새 override가 남는다. 원인을 해결해 같은 배포를 재시도하거나 보존된 rollback 이미지를 배포한 뒤 `/test`와 필요한 인증 흐름을 다시 확인한다. 최초 배포처럼 실행 중 컨테이너가 없었다면 자동 보존된 rollback 태그도 없다.

롤백은 **애플리케이션 이미지에 한정**된다. `.env`, Compose/Caddy 설정, DB 데이터·스키마는 복구하지 않는다. DB 변경은 이 절차의 범위 밖이며 이전 코드와 DB의 호환성을 별도로 확인해야 한다.

재생성 중 짧은 중단과 메모리 세션 초기화로 재로그인이 발생할 수 있다. 이전 이미지와 rollback 태그는 디스크를 사용하므로 용량을 확인하되, 복구에 필요한 버전·Caddy 볼륨을 무심코 prune하거나 삭제하지 않는다.

## 남은 검증 범위

- 스크립트의 실제 VM 통합 빌드·재배포·롤백은 아직 미검증이다. 현재 성공한 수동 VM 배포와 구분한다.
- 실제 FE 성공 URL과 FE 인증 연동은 미확정이다.
- ML은 별도 대상이며 기존 ML은 호스트 사설 IP의 8000 포트를 사용한다. 별도 백엔드 컨테이너의 `localhost`로는 해당 ML에 연결할 수 없다. 현재 백엔드는 HTTPS 또는 loopback HTTP만 허용하므로 사설 IP HTTP 연결은 제한된다. 내부 HTTPS 준비·연결은 아직 미검증이며, 이 문서의 `/test`나 Google 로그인 성공으로 ML 연결을 판정하지 않는다. 이 배포에서 ML 설정을 변경하지 않는다.
