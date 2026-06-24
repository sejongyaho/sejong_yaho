import time
from collections import deque
from threading import Lock
from typing import Any

from pydantic import BaseModel, Field


class StartSessionRequest(BaseModel):
    script: str = Field(..., min_length=10)
    reference_video_url: str | None = None


class MetricSample(BaseModel):
    elapsed_seconds: float = Field(..., ge=0)
    transcript: str = ""
    words_spoken: int = Field(0, ge=0)
    words_per_minute: float = Field(0, ge=0)
    syllables_spoken: int = Field(0, ge=0)
    syllables_per_second: float = Field(0, ge=0)
    articulation_syllables_per_second: float = Field(0, ge=0)
    silence_seconds: float = Field(0, ge=0)
    longest_silence_seconds: float = Field(0, ge=0)
    pause_ratio: float = Field(0, ge=0)
    volume: float = Field(0, ge=0)
    reaction: str = "attentive"
    speech_detected: bool = False


class FinishSessionRequest(BaseModel):
    transcript: str = ""


class ImportedScriptResponse(BaseModel):
    filename: str
    text: str
    character_count: int
    source_type: str


class SessionState(BaseModel):
    id: str
    script: str
    created_at: str
    samples: list[MetricSample] = Field(default_factory=list)
    materials: list[dict[str, Any]] = Field(default_factory=list)
    reference_video: dict[str, Any] | None = None


class GeminiCallLimiter:
    def __init__(self, max_calls: int, window_seconds: int) -> None:
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._calls: deque[float] = deque()
        self._lock = Lock()

    def allow(self) -> tuple[bool, float, int]:
        now = time.monotonic()
        with self._lock:
            while self._calls and now - self._calls[0] >= self.window_seconds:
                self._calls.popleft()

            if len(self._calls) >= self.max_calls:
                retry_after = max(0.0, self.window_seconds - (now - self._calls[0]))
                return False, retry_after, 0

            self._calls.append(now)
            remaining = max(0, self.max_calls - len(self._calls))
            return True, 0.0, remaining

    def remaining(self) -> int:
        now = time.monotonic()
        with self._lock:
            while self._calls and now - self._calls[0] >= self.window_seconds:
                self._calls.popleft()
            return max(0, self.max_calls - len(self._calls))


class GeminiRateLimitError(RuntimeError):
    def __init__(self, retry_after: float, remaining: int) -> None:
        super().__init__("Gemini rate limit reached")
        self.retry_after = retry_after
        self.remaining = remaining
