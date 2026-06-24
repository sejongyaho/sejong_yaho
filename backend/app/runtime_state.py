from typing import Any

from .config import GEMINI_MAX_CALLS_PER_WINDOW, GEMINI_RATE_WINDOW_SECONDS
from .models import GeminiCallLimiter, SessionState


gemini_limiter = GeminiCallLimiter(GEMINI_MAX_CALLS_PER_WINDOW, GEMINI_RATE_WINDOW_SECONDS)
ai_status_cache: dict[str, Any] = {"checked_at": 0.0, "payload": None}
gemini_runtime_state: dict[str, Any] = {
    "last_live": None,
    "last_ok_at": None,
    "last_error_at": None,
    "last_error_code": None,
    "last_error_message": None,
    "last_call_kind": None,
}

sessions: dict[str, SessionState] = {}
