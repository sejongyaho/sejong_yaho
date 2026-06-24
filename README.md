# 레퍼런스 발표 분석 기반 발표 연습 서비스

레퍼런스 발표 자막을 분석해 `Reference Profile`을 만들고, 사용자 발표 자막을 같은 방식으로 분석한 뒤 구조, 말속도, 습관어, 설득 흐름 차이를 비교하는 해커톤 MVP API를 추가했습니다.

현재 기존 React 디자인과 FastAPI 리허설 화면은 유지되어 있습니다. 새 MVP 분석 API는 `server/`의 Node.js Express 서버에 별도로 추가되어 있으며, YouTube 영상 분석이나 AI API를 붙이지 않고 이미 추출된 자막 텍스트를 입력받아 규칙 기반으로 동작합니다. 분석 로직은 `server/src/services/analysis.service.js`에 분리되어 있어 이후 AI API 호출로 교체하기 쉽습니다.

## 실행

### Node 서버

```bash
cd server
npm install
npm run dev
```

- Server: http://localhost:8020
- Health check: http://localhost:8020/health

### 기존 React 클라이언트

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:8010 npm run dev
```

- Frontend: http://localhost:5173

### Docker Compose

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Node server: http://localhost:8020
- Existing FastAPI backend: http://localhost:8010

## API

### `POST /api/references/analyze`

```json
{
  "title": "레퍼런스 발표 제목",
  "transcript": "자막 전체 텍스트"
}
```

레퍼런스 발표의 구조, 예상 말속도, 습관어, 설득 흐름, 핵심 메시지를 분석하고 `ref_001` 형식의 ID로 메모리에 저장합니다.

### `GET /api/references/:id`

저장된 `Reference Profile`을 조회합니다.

### `POST /api/practices/analyze`

```json
{
  "referenceId": "ref_001",
  "transcript": "사용자 발표 자막 전체 텍스트"
}
```

사용자 발표를 분석하고 레퍼런스와 비교해 `comparison`, `score`, `feedback`, `aiReport`를 반환합니다.

### `GET /api/practices/:id/report`

저장된 사용자 발표 분석 리포트를 조회합니다. 응답에는 `totalScore`, `grade`, 세부 점수가 포함된 `score` 객체와 읽기 쉬운 최종 코칭 리포트인 `aiReport` 객체가 들어갑니다.

## 구조

```text
server/
  src/
    app.js
    routes/
    controllers/
    services/
      analysis.service.js
      comparison.service.js
      feedback.service.js
      scoring.service.js
      aiReport.service.js
      storage.service.js
    utils/
    data/
frontend/
  src/
    App.jsx
    styles.css
```

## 현재 분석 방식

- 문장 수, 단어 수, 평균 문장 길이, 예상 발표 시간, 예상 WPM 계산
- `음`, `어`, `그`, `약간`, `이제`, `뭔가`, `그러니까`, `사실` 습관어 카운트
- 문장 위치와 키워드 기반으로 `intro`, `problem`, `solution`, `features`, `impact`, `closing` 구조 추정
- `problem-solution-impact`, `feature-centered`, `unclear` 설득 흐름 분류
- 구조 차이, 말 속도 차이, 습관어 차이, 설득 흐름 차이에 따른 행동형 피드백 생성
- 구조, 속도, 습관어, 설득 흐름, 마무리 비율을 가중 평균으로 최종 점수와 등급 산출
- 계산된 분석/비교/피드백/점수를 바탕으로 최종 코칭 리포트 생성

## 참고

기존 `backend/` FastAPI 코드와 `frontend/` 디자인은 보존되어 있습니다. 이번 MVP 분석 기능은 우선 `server/` Node.js Express API로 추가되어 있으며, 프론트 통합은 기존 디자인을 해치지 않는 방식으로 별도 작업하는 것이 안전합니다.
