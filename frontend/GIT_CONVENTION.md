# Git 규칙

`frontend/` 작업에 적용되는 브랜치, 커밋, PR, 머지 규칙입니다. 규칙을 바꿀 때는 PR로 수정합니다.

## 1. 브랜치 구조

```
main        ← 운영 (전체 팀 공용)
  ↑ PR (Create a merge commit)
frontend    ← 스테이징 (개발 서버 자동 배포)
  ↑ PR (Squash and merge)
FE/feat/*, FE/fix/*, FE/docs/* ...   ← 작업 브랜치
```

| 브랜치 | 역할 | 직접 커밋 |
| --- | --- | --- |
| `main` | 운영. 스테이징에서 테스트가 끝난 변경만 반영합니다 | 금지 |
| `frontend` | 스테이징. 개발 서버에 배포되고 여기서 테스트합니다 | 금지 |
| 작업 브랜치 | 기능 하나 또는 수정 하나를 작업하는 브랜치 | 가능 |

### 작업 브랜치 이름

`FE/<type>/<짧은-설명>` 형식입니다. 맨 앞에 `FE/`를 붙여서 브랜치 목록에서 프론트엔드 작업임을 바로 알아보게 합니다. type은 커밋 type과 같은 것을 쓰고, 설명은 영어 소문자와 `-`로 씁니다.

- `FE/feat/upload-candidate`
- `FE/fix/camera-off`
- `FE/docs/git-convention`

- `FE`는 대문자로 씁니다.
- 장수 브랜치(`main`, `frontend`)에는 이 규칙을 적용하지 않습니다.

## 2. 작업 순서

```bash
git switch frontend
git pull
git switch -c FE/feat/my-work

# 작업하고 커밋
git push -u origin FE/feat/my-work
# GitHub에서 base를 frontend로 해서 PR 생성
```

- 작업 중 `frontend`가 앞서 나가면 `git merge frontend`로 최신 상태를 반영한 뒤 PR을 올립니다.
- 머지가 끝난 작업 브랜치는 삭제합니다.

## 3. 커밋 규칙

[Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 형식을 따릅니다.

### 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `scope`, `body`, `footer`는 선택 사항입니다.
- 헤더(첫 줄)는 `type`과 `subject`만 필수입니다.

### Type

| type | 설명 |
| --- | --- |
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 수정 |
| `style` | 화면 디자인 변경, 또는 동작에 영향 없는 포맷팅 변경 (공백, 세미콜론 등) |
| `refactor` | 기능 변화 없는 코드 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 코드 추가 및 수정 |
| `build` | 빌드 설정, 패키지 의존성 변경 |
| `ci` | CI 설정 변경 |
| `chore` | 그 외 잡무 (설정 파일, 폴더 구조 등) |
| `revert` | 이전 커밋 되돌리기 |

### Scope

변경한 화면이나 영역의 이름을 소문자로 씁니다. 같은 영역을 다른 이름으로 쓰지 않도록 아래 목록에서 고릅니다.

| scope | 대상 |
| --- | --- |
| `home`, `closet`, `calendar`, `community`, `post`, `my`, `settings`, `login`, `onboard`, `upload` | `src/pages/`의 화면 |
| `nav` | 하단 탭과 화면 이동 |
| `frontend` | 특정 화면이 아닌 프론트엔드 전체 (빌드 설정, 문서, 의존성 등) |

- 새 화면을 만들면 화면 이름을 scope로 쓰고 이 표에도 추가합니다.
- 여러 영역에 걸친 변경은 scope를 생략하거나 `frontend`를 씁니다.

### Subject 규칙

- 50자 이내로 간결하게 작성합니다.
- 마침표를 붙이지 않습니다.
- "무엇을 했는지"를 명사형으로 끝냅니다. (예: `추가`, `수정`, `제거`)
- 영어로 작성할 경우 첫 글자는 소문자, 동사 원형으로 시작합니다.

### Body 규칙

- 헤더와 한 줄을 띄우고 작성합니다.
- "무엇을"보다 "왜", "어떻게"를 설명합니다.
- 읽기 쉽도록 한 줄이 길어지면 줄바꿈합니다. (한글 기준 40자 안팎)

### Footer 규칙

- GitHub 이슈를 쓸 때만 연결합니다: `Closes #12`, `Fixes #34`, `Refs #56`
- 호환성을 깨는 변경은 `BREAKING CHANGE: <설명>`으로 명시합니다.

### 예시

```
feat(upload): 후보 아래에 직접 선택 추가
```

```
fix(nav): 맨 아래까지 스크롤하면 탭을 다시 보여 줌

스크롤이 끝에 닿으면 스크롤 이벤트가 더 발생하지 않아
탭이 숨겨진 채로 남아 있었다. 바닥에 닿았는지 따로 확인해서
탭을 다시 보이게 변경했다.
```

```
refactor(closet): 필터 로직을 훅으로 분리
```

### 기타 원칙

- 하나의 커밋에는 하나의 논리적 변경만 담습니다.
- 빌드나 린트가 깨진 상태로 커밋하지 않습니다. (`npm run lint`, `npm run build`)
- 작업 중간 저장용 커밋(`wip`, `temp`)을 남겨도 되지만, `frontend`로 머지할 때 squash로 합쳐지므로 PR 제목을 위 형식으로 씁니다.

## 4. PR 규칙

- PR 하나에는 하나의 목적만 담고, 하루 안에 리뷰할 수 있는 크기로 올립니다.
- PR 제목은 커밋 규칙과 같은 형식으로 씁니다. (예: `feat(upload): 후보 아래에 직접 선택 추가`)
- 본문에는 변경 사항, 테스트 방법을 적고, 화면이 바뀌면 스크린샷이나 영상을 붙입니다.
- 리뷰어 1명 이상의 승인을 받아야 머지할 수 있습니다. 본인의 PR은 본인이 승인하지 않습니다.
- 리뷰어는 PR 브랜치를 실행해 화면이 정상인지 확인한 뒤 승인합니다.
- CI(lint, build)가 통과해야 머지할 수 있습니다.

## 5. 머지 방식

| 방향 | 방식 | 이유 |
| --- | --- | --- |
| 작업 브랜치 → `frontend` | **Squash and merge** | 작업 중 생긴 임시 커밋이 정리되고, 기능 하나가 커밋 하나로 남아 되돌리기 쉽습니다 |
| `frontend` → `main` | **Create a merge commit** | 장수 브랜치끼리는 해시를 유지해야 다음 PR에 같은 커밋이 중복으로 잡히지 않습니다 |

- Squash로 머지하면 PR 제목이 최종 커밋 메시지가 되므로 제목 형식을 지킵니다.
- 장수 브랜치(`frontend`, `main`) 사이에서는 squash나 rebase를 쓰지 않습니다.

## 6. 배포와 테스트

- `frontend`에 머지되면 개발 서버에 배포됩니다.
- 개발 서버에서 충분히 테스트한 뒤 `frontend → main` PR을 올립니다.
- `frontend`를 `main`으로 올리면 그 시점까지 머지된 변경이 모두 함께 올라갑니다.
- 문제가 있는 기능은 해당 squash 커밋을 revert하는 PR로 되돌립니다.

### 긴급 수정(hotfix)

- `main`에서 바로 고쳐야 할 때는 `main`에서 `FE/fix/*` 브랜치를 따서 `main`으로 PR합니다.
- 반영한 뒤에는 `main`을 `frontend`로 다시 머지해서 두 브랜치가 갈라지지 않게 합니다.

## 7. 브랜치 보호 설정

GitHub Ruleset으로 설정합니다. (Settings → Rules → Rulesets)

| 브랜치 | 상태 | 규칙 |
| --- | --- | --- |
| `frontend` | 적용 중 | PR 필수, 승인 1명 이상, CI(`check`) 통과 필수, force push·삭제 금지 |
| `main` | 미적용 | 백엔드, ML 팀과 공용이라 팀 간 합의 후 적용합니다 |

- `frontend`는 팀장만 규칙을 우회할 수 있습니다. (Ruleset의 Bypass list)
- 우회는 CI 고장이나 팀원 부재 같은 긴급 상황에만 쓰고, 사용한 뒤에는 팀에 알립니다.
- `main`에 규칙이 생기기 전까지는 직접 푸시가 가능하지만, 직접 푸시하지 않고 항상 `frontend`에서 PR로 반영합니다.
- `frontend → main` PR은 다른 팀 변경과 충돌하지 않는지 확인합니다.
