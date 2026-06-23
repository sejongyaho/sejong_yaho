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

