# Backend

Java 백엔드 개발 공간입니다.

현재 Gemini 연동은 별도 `ai-server/`에서 담당합니다. Java 백엔드는 AI 서버의 HTTP API를 호출하고, AI 서버가 Gemini API key를 안전하게 보관한 상태로 Gemini에 요청을 전달합니다.

## 연동 흐름

```text
Java Backend -> AI Server -> Gemini API -> AI Server -> Java Backend
```

## 호출 대상

```text
POST http://localhost:8000/api/v1/generate
```

자세한 실행 방법은 `../ai-server/README.md`를 참고합니다.
