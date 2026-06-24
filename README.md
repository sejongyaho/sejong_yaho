# 온라인 발표 연습실

React와 FastAPI로 만든 발표 리허설 웹앱입니다. 브라우저에서 실시간으로 마이크 볼륨, 침묵 시간, 말 빠르기, 대본 반영도를 계산해 화면의 2x2 관객 아바타와 채팅 반응을 바꾸고, 발표 종료 후 백엔드에 저장된 샘플로 분석 리포트를 생성합니다.

## 실행

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8010
- Health check: http://localhost:8010/health

## Gemini 설정

`.env` 또는 `.env.example`에 있는 값을 채우면 됩니다.

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_API_KEY`가 비어 있으면 FastAPI가 로컬 휴리스틱 분석으로 리포트를 생성합니다.

## 구조

```text
backend/
  app/main.py
frontend/
  src/App.jsx
  src/styles.css
docker-compose.yml
.env.example
```

