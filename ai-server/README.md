# AI Server

Java 백엔드에서 호출할 Gemini 연동용 AI 서버입니다.

## Flow

```text
Java Backend -> AI Server -> Gemini API -> AI Server -> Java Backend
```

Java 백엔드는 Gemini API key를 알 필요가 없습니다. API key는 AI 서버의 환경 변수로만 관리합니다.

## Requirements

- Python 3.11+
- Gemini API key

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

`.env`에 Gemini API key를 설정합니다.

```text
GEMINI_API_KEY=your-gemini-api-key
```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API

### GET /health

서버 상태를 확인합니다.

### POST /api/v1/generate

Gemini에 프롬프트를 전달하고 생성된 텍스트를 반환합니다.

#### Request

```json
{
  "prompt": "세종대학교 학생을 위한 서비스 아이디어를 3개 추천해줘",
  "system_instruction": "한국어로 간결하게 답해줘",
  "model": "gemini-flash-lite-latest"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "text": "Gemini 응답 내용",
    "model": "gemini-flash-lite-latest"
  },
  "error": null
}
```

### POST /api/v1/code-flow

소스코드를 Mermaid.js `graph LR` 스크립트로 변환합니다. Java 백엔드는 반환된 Mermaid 문자열을 DB에 저장하고, 프론트엔드는 mermaid.js로 렌더링합니다.

```json
{
  "source_code": "public class Main { public static void main(String[] args) { System.out.println(\"Hi\"); } }",
  "language": "java"
}
```

### POST /api/v1/learning/blanks

Java 백엔드가 DB에서 조회한 정답 코드를 전달하면, 핵심 로직 일부를 `______`로 바꾼 스켈레톤 코드를 반환합니다.

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

오답 코드와 Piston 에러 로그를 기반으로 정답을 직접 알려주지 않는 힌트를 JSON으로 반환합니다.

```json
{
  "wrong_code": "public class Main { ... }",
  "error_log": "Exception in thread \"main\" ...",
  "problem_title": "배열 합 구하기",
  "language": "java"
}
```

### POST /api/v1/problems/variant

원본 문제 지문과 핵심 알고리즘을 기반으로 변형 문제 JSON을 생성합니다.

```json
{
  "problem_id": "problem-1",
  "problem_statement": "미로에서 출구까지 이동하는 문제",
  "pseudocode": "DFS(start)",
  "core_algorithm": "DFS"
}
```

### POST /api/v1/review/score

리뷰어가 선택한 라인과 리뷰 텍스트를 AI가 0~100점으로 채점합니다.

```json
{
  "code": "public class Main { ... }",
  "selected_line": 12,
  "review_text": "이 반복문은 최악의 경우 O(n^2)입니다.",
  "language": "java"
}
```

## Java Backend Example

```java
WebClient client = WebClient.builder()
        .baseUrl("http://localhost:8000")
        .build();

Mono<String> response = client.post()
        .uri("/api/v1/generate")
        .contentType(MediaType.APPLICATION_JSON)
        .bodyValue(Map.of("prompt", "오늘 점심 메뉴 추천해줘"))
        .retrieve()
        .bodyToMono(String.class);
```
