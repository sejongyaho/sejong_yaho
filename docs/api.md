# API Documentation

## Base URL

```text
http://localhost:PORT
```

## 공통 응답 형식

### 성공

```json
{
  "success": true,
  "data": {}
}
```

### 실패

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "사용자에게 보여줄 수 있는 메시지"
  }
}
```

## Endpoints

### GET /health

서버 상태를 확인합니다.

#### Response

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

## 추가 예정

| Method | Path | 설명 | 인증 |
| --- | --- | --- | --- |
| GET | `/health` | 상태 확인 | 없음 |
| POST | `/api/v1/generate` | AI 서버가 Gemini API에 프롬프트를 전달하고 생성 결과 반환 | 서버 내부 API key 사용 |
| POST | `/api/v1/code-flow` | 소스코드를 Mermaid.js 실행 흐름 그래프로 변환 | 서버 내부 API key 사용 |
| POST | `/api/v1/learning/blanks` | 정답 코드에서 핵심 로직을 빈칸 처리한 스켈레톤 코드 생성 | 서버 내부 API key 사용 |
| POST | `/api/v1/hints/wrong-answer` | 오답 코드와 실행 로그를 기반으로 힌트 JSON 생성 | 서버 내부 API key 사용 |
| POST | `/api/v1/problems/variant` | 같은 알고리즘의 변형 문제 JSON 생성 | 서버 내부 API key 사용 |
| POST | `/api/v1/review/score` | 코드 리뷰 텍스트를 0~100점으로 채점 | 서버 내부 API key 사용 |

### POST /api/v1/generate

Java 백엔드에서 AI 서버로 프롬프트를 전달합니다. AI 서버는 `GEMINI_API_KEY` 환경 변수로 Gemini API를 호출하고, 받은 텍스트를 Java 백엔드로 반환합니다.

#### Request

```json
{
  "prompt": "세종대학교 학생을 위한 서비스 아이디어를 3개 추천해줘",
  "system_instruction": "한국어로 간결하게 답해줘",
  "model": "gemini-flash-lite-latest"
}
```

### POST /api/v1/code-flow

소스코드를 Mermaid.js `graph LR` 문법으로 변환합니다. AI 서버는 React 코드가 아니라 Mermaid 스크립트 텍스트만 반환합니다.

#### Request

```json
{
  "source_code": "public class Main { public static void main(String[] args) { System.out.println(\"Hi\"); } }",
  "language": "java"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "mermaid": "graph LR\nA[main 시작] --> B[Hi 출력]",
    "model": "gemini-flash-lite-latest"
  },
  "error": null
}
```

### POST /api/v1/learning/blanks

Java 백엔드가 DB에서 조회한 원본 정답 코드를 AI 서버에 전달합니다. AI 서버는 핵심 로직 일부를 `______`로 바꾼 스켈레톤 코드를 반환합니다.

#### Request

```json
{
  "problem_id": "problem-1",
  "answer_code": "public class Main { ... }",
  "stage": "blank",
  "blank_count": 3,
  "language": "java"
}
```

### POST /api/v1/hints/wrong-answer

채점 실패 시 오답 코드와 Piston 에러 로그를 전달합니다. AI 서버는 정답을 직접 알려주지 않는 힌트 JSON을 반환합니다.

#### Response

```json
{
  "success": true,
  "data": {
    "hintLevel1": "반복문의 종료 조건이 마지막 원소까지 확인하고 있나요?",
    "concept": "배열 인덱스 범위",
    "model": "gemini-flash-lite-latest"
  },
  "error": null
}
```

### POST /api/v1/problems/variant

원본 문제와 같은 핵심 알고리즘을 유지하면서 지문과 테스트케이스를 변형한 JSON을 생성합니다.

### POST /api/v1/review/score

샘플 코드, 선택 라인, 리뷰 텍스트를 기반으로 리뷰 품질을 채점합니다.

#### Response

```json
{
  "success": true,
  "data": {
    "score": 85,
    "feedback": "시간 복잡도 문제를 잘 짚었습니다.",
    "model": "gemini-flash-lite-latest"
  },
  "error": null
}
```

## AI가 개입하지 않는 기능

### 웹 코드 에디터 & 테스트

프론트엔드가 제출한 코드는 Java 백엔드가 Piston API로 전달해 격리 실행합니다. AI 서버는 이 채점 흐름에 개입하지 않습니다.

### Context Mission

멀티 파일 병합과 Piston 실행은 Java 백엔드가 담당합니다. AI 서버는 힌트 요청이 들어온 경우에만 `/api/v1/hints/wrong-answer`를 통해 개입합니다.
