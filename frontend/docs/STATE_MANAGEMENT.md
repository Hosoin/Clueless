# 상태관리 구조

앱 상태를 어디에 두고, 어떻게 바꾸고, 언제 다시 그리는지와 앞으로 바꿀 단계를 적습니다. 단계가 끝날 때마다 [진행 상태](#진행-상태) 표를 고칩니다.

## 진행 상태

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 구조 정리: 상태를 바꾸는 일을 `store.ts`의 함수로 모음, 홈 선택을 옷 id로, 날짜를 `YYYY-MM-DD`로, 로그아웃 때 전체 초기화 | **완료** (PR #61) |
| 2 | 서버 데이터를 서버 상태 도구로 옮김 (후보: TanStack Query) | 예정 |
| 3 | 화면 상태를 작은 저장소로 옮기고 `S`·`emit`·`useApp`을 없앰 (후보: Zustand) | 예정 |

- 2·3단계 도구는 의존성 추가라서 도입 전에 팀이 확정합니다. 확정하면 [`LIBRARIES.md`](LIBRARIES.md)의 "도입 예정"도 함께 고칩니다. (지금 `LIBRARIES.md`는 서버 상태를 직접 구현하는 안을 추천하고 있습니다)

## 지금 구조 (1단계 완료)

```
화면(pages·components) ──useApp()으로 읽기──▶ store.ts 의 S
        │
        └─ store.ts의 함수를 부름 (deleteSaved, toggleLike, selectItem …)
               └─ S를 고친 뒤 emit() ──▶ useApp()을 쓰는 화면이 모두 다시 그려짐
```

- 상태는 아직 `store.ts`의 `S` 하나에 있습니다. 서버 데이터(옷·코디·기록·글), 화면 상태(탭·필터·홈 조합), 세션(`me`·`loggedIn`)은 주석으로만 나뉘어 있습니다.
- 화면과 부품은 `S`를 직접 고치지 않습니다. `store.ts`의 함수를 부르고, 함수가 `S`를 고친 뒤 `emit()`을 부릅니다. 나중에 서버 요청을 붙일 때도 이 함수 안에만 넣으면 됩니다.
  - 예외: `wearToday`, `saveLook`은 `S`만 고치고 `emit()`을 부르지 않습니다. 부른 쪽에서 `emit()`을 부릅니다.
  - 화면 파일 안의 모듈 변수(예: `Calendar.tsx`의 고른 날, `Upload.tsx`의 사진 묶음)를 바꾼 뒤에는 그 화면에서 `emit()`을 부릅니다.

### 1단계에서 바뀐 것

| 바뀐 것 | 지금 | 위치 |
| --- | --- | --- |
| 상태를 바꾸는 곳 | 화면에서 `S`를 직접 고치던 곳(60곳 남짓)을 `store.ts`의 함수로 옮김 (`toggleLike`, `toggleFollow`, `deleteSaved`, `deletePlan`, `savePlan`, `saveHistory`, `setExcluded`, `setAlias`, `addComment`, `deletePost`, `setClosetTab` 등) | `store.ts` |
| 홈에서 고른 옷 | 목록 안의 순서(`S.pos`) 대신 옷 id(`S.pick`)로 기억함. 목록 순서가 바뀌어도 고른 옷이 그대로이고, 목록에서 사라진 선택만 `reconcilePicks`가 고침 | `store.ts`의 `current`, `reconcilePicks` |
| 날짜 | `Item.lastWorn`, `Hist.date`를 `YYYY-MM-DD`로 저장하고 "며칠 전"은 그릴 때 계산함 (`daysSince`, `dayLabel`). 자정이 지나면 `rollDay`가 오늘 날짜만 바꾸고 다시 그림 | `data/dates.ts`, `store.ts` |
| 계산할 수 있는 값 | 되돌리기용 `prevWorn`을 없앰. `lastWorn`은 입은 기록에서 다시 계산함 (`recalcWorn`) | `store.ts` |
| 로그아웃 | `clearMe`가 `S` 전체를 처음 상태로 되돌리고, 화면 모듈 변수도 `registerModuleReset`으로 등록한 함수로 초기화함 (`Calendar.tsx`, `Home.tsx`, `Upload.tsx`, `ui.tsx`) | `store.ts`, 각 화면 |
| 불러올 때 실행되던 코드 | 날짜 확인 타이머와 `visibilitychange`는 `Layout.tsx`의 `useEffect`로 옮김 (화면이 사라지면 멈춤). 앱 시작 때의 `applyOutfit` 호출은 없앰 | `Layout.tsx` |

### 아직 남은 것

| 남은 것 | 지금 상태 | 다룰 단계 |
| --- | --- | --- |
| 상태 나누기 | 서버 데이터·화면 상태·세션이 아직 `S` 하나에 있음 | 2·3 |
| 다시 그리기 | `emit()` 한 번에 `useApp()`을 쓰는 화면 전체(`Layout` 포함)가 다시 그려짐. `emit()`마다 `reconcileHomeSelection`도 실행됨 | 3 (필요한 값만 골라 읽기) |
| 화면 모듈 변수 | 없애지 않고 로그아웃 초기화만 등록함 (`Home.tsx` 8개, `Upload.tsx` 7개, `Calendar.tsx` 3개, `ui.tsx` 2개) | 3 |
| 계산 함수 | `current`, `lists`, `pool`, `fit`, `ranked`가 `S`를 직접 읽음 | 2 (필요한 값을 인자로 받는 순수 함수로) |
| 저장해 두는 계산값 | `Item.lastWorn`은 입은 기록에서 계산하지만 옷에 저장해 두고 `recalcWorn`으로 맞춤. `Post.cmts`는 서버가 주는 전체 댓글 수라서 남김 | 2 |
| 화면 문구로 된 날짜 | `Saved.at`(예: '11월 26일'), `Post.ago`·`Comment.ago`(예: '2시간 전') | 2 (서버 날짜로 받을 때) |
| 예시 데이터에 기댄 시작 값 | 처음 홈 선택(`S.pick`)과 `appliedKey`가 예시 옷 id(1·10·6)로 정해져 있음 | 2 (옷을 불러온 뒤 `applyOutfit`으로 정함) |

## 다음 단계 계획

서버와 연결되면 `S`의 값이 성격이 다른 세 종류로 나뉩니다.

| 종류 | 예 | 특징 | 갈 곳 (후보) |
| --- | --- | --- | --- |
| 서버 데이터 | 옷, 추천 코디, 저장한 코디, 입은 기록, 계획, 글, 내 정보 | 진짜 값은 서버에 있음. 로딩·실패·다시 받기·캐시가 필요함 | 2단계: TanStack Query (예: `useMe()`, `useItems()`, `useOutfits()`) |
| 화면 상태 | 탭, 필터, 정렬, 홈에서 고른 조합, 돌아갈 화면 | 앱 안에서만 쓰고, 화면을 옮겨도 유지돼야 함 | 3단계: Zustand (예: 화면 보기 상태, 홈 조합) |
| 한 화면의 임시 값 | 입력창 내용, 창 안에서 고르는 중인 값 | 그 화면에서만 필요함 | `useState` |

- 훅과 저장소 이름은 `CLAUDE.md`의 용어 사전을 따릅니다. (옷은 `Item`이므로 `useItems`)
- 1단계에서 모은 함수가 2단계의 요청(mutation)이 됩니다. 로그아웃 때의 정리는 Query의 캐시 비우기(`queryClient.clear()`)가 맡습니다.
- 계산 함수(`current`, `fit`, `ranked` 등)는 2단계에서 필요한 값을 인자로 받는 순수 함수로 바꿉니다.
- 서버 통신 규칙은 [`API_CONVENTION.md`](API_CONVENTION.md)를 따릅니다.

### `S`의 값이 갈 곳

| 지금 `S`의 값 | 갈 곳 | 단계 |
| --- | --- | --- |
| `items` | 쿼리 `['items']` | 2 |
| `outfits` | 쿼리 `['outfits']` | 2 |
| `saved`, `history`, `plans` | 쿼리 `['saved']`, `['history']`, `['plans']` | 2 |
| `posts`, `liked`, `savedPosts`, `followingSet` | 쿼리 `['posts']` 등 | 2 |
| `me`, `loggedIn`, `onboarded`, `pref` | 쿼리 `['me']` (설정 API가 생기면 정리) | 2 |
| `pick`, `on`, `oi`, `fresh`, `view`, `chosenKey`, `spinning`, `spinKeys` | 화면 상태 저장소 (홈 조합) | 3 |
| `kView`, `cView`, `cTab`, `cColor`, `cSort`, `cmTab`, `chOnly`, `myTab` | 화면 상태 저장소 (보기 상태) | 3 |
| `postFrom`, `loginBack`, `ob` | 화면 상태 저장소 또는 화면의 `useState` | 3 |
| `RECENT`, `defScope`, `cmpOn` | 화면 상태 저장소 또는 설정 쿼리 (설정 API가 정해지면) | 2·3 |
| `uid`, `sid`, `pid` | 없어짐 (서버가 id를 정함) | 2 |

## 지금 지킬 규칙

- 화면은 `useApp()`으로 `S`를 읽기만 합니다. 값을 바꿀 때는 `store.ts`의 함수를 부르고, 필요한 함수가 없으면 `store.ts`에 추가합니다. (`S`의 구조를 바꾸는 일은 `CLAUDE.md`대로 먼저 팀에 확인합니다)
- 날짜는 `YYYY-MM-DD` 문자열로 저장합니다. 계산과 문구는 `data/dates.ts`와 `store.ts`의 `daysSince`·`dayLabel`·`worn`을 씁니다.
- 화면 파일에 모듈 변수로 상태를 새로 두면, `registerModuleReset`으로 로그아웃 때 처음 값으로 되돌리는 함수를 등록합니다.
- 모듈을 불러올 때 타이머나 이벤트를 시작하지 않습니다. `useEffect`에서 시작하고 정리 함수에서 멈춥니다.
