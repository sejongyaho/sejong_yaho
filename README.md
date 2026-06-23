# Sejong Yaho Hackathon

세종대학교 구성원을 위한 웹앱/API 서비스 해커톤 프로젝트입니다. 현재 저장소는 프론트엔드, 백엔드, 문서, GitHub 협업 템플릿을 나누어 개발을 시작할 수 있는 초기 구조입니다.

## Directory

```text
.
├── frontend/   # 웹앱 화면 개발 공간
├── backend/    # API 서버 개발 공간
├── docs/       # 기획, 리서치, 회의, API, 발표, 버그 문서
└── .github/    # Issue 및 Pull Request 템플릿
```

## Project Scope

- 사용자가 실제로 겪는 문제를 빠르게 정의하고 검증합니다.
- 프론트엔드와 백엔드를 분리해 병렬 개발합니다.
- 문서와 이슈 기반으로 작업 내역을 추적합니다.
- 데모 가능한 최소 기능을 우선 구현합니다.

## Branch Strategy

- `main`: 배포 또는 발표 가능한 안정 버전
- `develop`: 기능 통합 브랜치
- `feature/<name>`: 기능 개발
- `fix/<name>`: 버그 수정
- `docs/<name>`: 문서 수정

예시:

```bash
git checkout -b feature/login-page
git checkout -b fix/api-error-response
git checkout -b docs/update-api-spec
```

## Commit Rules

커밋 메시지는 아래 형식을 사용합니다.

```text
type: summary
```

사용 가능한 `type`:

- `feat`: 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 포맷팅, 스타일 변경
- `refactor`: 동작 변경 없는 구조 개선
- `test`: 테스트 추가 또는 수정
- `chore`: 설정, 빌드, 의존성 작업

예시:

```bash
git commit -m "docs: add initial project templates"
git commit -m "feat: add onboarding screen"
```

## Setup

아직 프론트엔드와 백엔드 프레임워크는 초기화하지 않았습니다. 각 영역의 README를 기준으로 필요한 스택을 정한 뒤 초기화합니다.

```bash
cd frontend
# 프론트엔드 프레임워크 초기화 예정

cd ../backend
# 백엔드 프레임워크 초기화 예정
```

## Demo Scenario

1. 사용자가 웹앱에 접속합니다.
2. 핵심 문제를 해결하는 메인 기능을 실행합니다.
3. 백엔드 API가 요청을 처리하고 결과를 반환합니다.
4. 프론트엔드가 결과를 명확하게 표시합니다.
5. 발표자는 문제, 해결 방식, 기술 구조, 개선 계획을 설명합니다.

## Collaboration Flow

1. 작업 전 GitHub Issue를 생성합니다.
2. 담당자는 작업 브랜치를 생성합니다.
3. 변경 사항을 커밋하고 Pull Request를 엽니다.
4. 팀원이 리뷰하고 필요한 수정을 반영합니다.
5. 승인 후 `develop` 또는 `main`에 병합합니다.

## Documents

- [아이디어](docs/idea.md)
- [리서치](docs/research.md)
- [회의록](docs/meeting-log.md)
- [API 문서](docs/api.md)
- [발표 자료](docs/presentation.md)
- [버그 리포트](docs/bug-report.md)

