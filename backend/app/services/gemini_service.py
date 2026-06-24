import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import get_gemini_model
from ..models import GeminiRateLimitError
from ..runtime_state import gemini_limiter, gemini_runtime_state


def mark_gemini_success(kind: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    gemini_runtime_state["last_live"] = True
    gemini_runtime_state["last_ok_at"] = now
    gemini_runtime_state["last_call_kind"] = kind
    gemini_runtime_state["last_error_code"] = None
    gemini_runtime_state["last_error_message"] = None


def mark_gemini_error(kind: str, message: str, status_code: int | None = None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    gemini_runtime_state["last_live"] = False
    gemini_runtime_state["last_error_at"] = now
    gemini_runtime_state["last_error_code"] = status_code
    gemini_runtime_state["last_error_message"] = message
    gemini_runtime_state["last_call_kind"] = kind


async def call_gemini_api(
    *,
    kind: str,
    payload: dict[str, Any],
    timeout_seconds: int,
    count_against_limit: bool = True,
    retry_on_unavailable: int = 0,
) -> tuple[dict[str, Any], int]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    remaining = gemini_limiter.remaining()
    if count_against_limit:
        allowed, retry_after, remaining = gemini_limiter.allow()
        if not allowed:
            mark_gemini_error(kind, f"rate_limited:{retry_after:.1f}", 429)
            raise GeminiRateLimitError(retry_after, remaining)

    model = get_gemini_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    attempt = 0
    while True:
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(url, params={"key": api_key}, json=payload)
                response.raise_for_status()
                data = response.json()
                mark_gemini_success(kind)
                return data, remaining
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            if exc.response.status_code == 503 and attempt < retry_on_unavailable:
                attempt += 1
                await asyncio.sleep(1.2 * attempt)
                continue
            mark_gemini_error(kind, detail or f"HTTP {exc.response.status_code}", exc.response.status_code)
            raise
        except Exception as exc:
            mark_gemini_error(kind, str(exc))
            raise
