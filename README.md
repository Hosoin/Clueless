# Clueless

MS AI School 팀 프로젝트의 MVP 개발을 위한 저장소입니다. 프런트엔드, 백엔드, ML 작업 공간과 문서를 분리해 관리합니다.

## 폴더 구조

| 경로 | 역할 | 현재 상태 |
| --- | --- | --- |
| [`frontend/`](frontend/) | 사용자 화면 | 프레임워크 미정 |
| [`backend/`](backend/) | API 및 서비스 로직 | Spring Boot 사용 예정 |
| [`ml/`](ml/) | 데이터 처리, 모델 학습·평가 및 추론 | Python API·CLI, 기본 품목 MLP |
| [`docs/`](docs/) | 요구사항, 설계 및 협업 문서 | ML API 명세 포함 |

ML 실행과 가중치 공급은 [ML 안내](ml/README.md), API 연동은 [연동 가이드](docs/ml-api/README.md)를 참고하세요.

## 파일 관리

- 비밀값은 커밋하지 않습니다. `.env`와 `.env.*`는 제외하며, 실제 비밀값이 없는 `.env.example`만 공유할 수 있습니다.
- `data/`, `dataset(s)/`, `out/`, `sample/`, `uploads/`, 캐시와 `weights/`는 로컬 전용입니다. 코드와 [모델 매니페스트](ml/GARMENT_CATEGORY_MODEL.json)만으로 분석이 실행되지는 않으므로, 승인된 모델 파일과 고정 리비전 캐시를 별도 공급합니다.
- GitHub에 옮기기 전 업로드할 파일을 검토하고 필요한 경로만 선택하세요. Git 저장소가 준비된 뒤 `git status --short --ignored`, `git check-ignore -v ml/weights/garment4_mlp_secondhand_balanced264_20261124_seed0.pt` 및 `git diff --cached --stat`/`--name-only`로 확인합니다. `.gitignore`는 이미 추적한 파일이나 강제로 추가한 파일을 제거하지 않습니다.
- 사진, 기획서, 라벨 CSV 등 무시 목록에 없는 문서·데이터도 공개 가능 여부와 개인정보를 확인한 후 공유하세요. 학습 데이터·사진·체크포인트를 저장소에 일괄 포함하지 마세요.
