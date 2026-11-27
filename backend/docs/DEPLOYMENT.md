# 개발 VM 백엔드 배포 quickstart

대상은 `closet-service`만이다. 기존 FE(80 포트)·DB·ML·Caddy는 변경하지 않는다.
최초 설치와 구성·장애 대응은 [상세 가이드](DEPLOYMENT_DETAILS.md)를 참고한다.

## 적용 전제

- **아직 적용 전:** 두 스크립트(`build-closet-image.sh`, `deploy-closet.sh`)의 merge·VM 전달은 현재 미완료다. 완료 후 아래 절차를 사용한다. mock 검증만 했으며 실제 VM 통합 빌드·배포·롤백은 미검증이다.
- VM의 `~/clueless-backend` clone, `backend/.env`·CA 인증서·기본 Compose 두 파일·Caddy/HTTPS 설정이 기존대로 준비돼 있어야 한다. 없으면 [최초 준비](DEPLOYMENT_DETAILS.md#1-최초-준비)를 따른다.
- 외부 `/test`·Google 로그인 성공은 사용자 확인 이력이며 이번 문서 작업에서 VM을 재검증하지 않았다.

## 소스 갱신 → 빌드·배포

먼저 VM에서 `git status --short`로 로컬 변경을 확인한다. 미커밋 변경도 이미지에 포함될 수 있다.

```sh
cd ~/clueless-backend
git status --short
git pull --ff-only && ./backend/build-closet-image.sh
```

실패하면 **중단**하고 원인을 확인한다. pull 실패를 `git reset --hard`로 해결하지 않는다.
VM의 로컬 `.dockerignore`에는 legacy builder 대응 수정이 있을 수 있으므로 지우지 말고 비교·통합한다([우회와 한계](DEPLOYMENT_DETAILS.md#2-소스-갱신과-빌드-주의점)).
스크립트는 현재 Git short SHA 태그를 빌드·배포하지만 pull·테스트·자동 롤백은 하지 않는다.
재생성 중 짧은 중단과 메모리 세션 초기화로 재로그인이 발생할 수 있다.

## 배포 확인

```sh
curl -i --max-time 10 --fail --show-error https://api-closet-service.p-e.kr/test
```

`200`과 `closet-service 테스트 요청`을 확인한다. `/test` 성공은 DB·ML·OAuth 성공을 뜻하지 않는다.
필요한 로그인·세션 확인은 [확인과 롤백](DEPLOYMENT_DETAILS.md#4-확인과-롤백)을 따른다.

## 환경변수 재적용과 롤백

`.env` 변경 후에는 **현재 실행 이미지의 실제 태그**를 명시해 재생성한다. 아래 `<현재-이미지-태그>`는 꺾쇠까지 실제 태그로 바꾼다(예: `20acac8`은 과거 기준이며 현재값으로 단정하지 않는다).

```sh
cd ~/clueless-backend/backend
./deploy-closet.sh clueless-closet:<현재-이미지-태그>
# 롤백: 직전 배포 출력의 실제 명령/이미지ID로 대체
./deploy-closet.sh clueless-closet:rollback-<이미지ID>
```

인자 생략은 현재 Git SHA 이미지를 선택하므로 환경변수 재적용 때 생략하지 않는다. 대상 이미지는 로컬에 있어야 한다.
롤백 명령은 필요할 때만 실행하고 다시 `/test`를 확인한다. 최초 배포에는 보존된 rollback 태그가 없을 수 있으며, 이미지 롤백은 `.env`·설정·DB를 복구하지 않는다([실패 대응](DEPLOYMENT_DETAILS.md#4-확인과-롤백)).
수동 Compose 작업은 이미지 override를 **마지막 `-f`**로 사용한다([상세](DEPLOYMENT_DETAILS.md#재배포-스크립트-동작)).

**비밀 공유 금지:** `.env`, 전체 Compose config·컨테이너 환경, OAuth code/state·쿠키·토큰을 출력·공유하지 않는다. config 검사는 `--quiet`를 쓰고 로그도 민감정보를 가린다.
