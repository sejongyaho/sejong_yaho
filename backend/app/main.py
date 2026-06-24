import asyncio
import base64
import json
import mimetypes
import os
import re
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from collections import deque
from datetime import datetime, timezone
from html import unescape
from io import BytesIO
from pathlib import Path
from statistics import mean, pstdev
from threading import Lock
from typing import Any
from uuid import uuid4

import httpx
from docx import Document
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pptx import Presentation
from pydantic import BaseModel, Field
from pypdf import PdfReader

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover - handled gracefully at runtime
    PdfReader = None

try:
    from pptx import Presentation
except ImportError:  # pragma: no cover - handled gracefully at runtime
    Presentation = None

try:
    import fitz
except ImportError:  # pragma: no cover - handled gracefully at runtime
    fitz = None


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


MAX_PRESENTATION_UPLOAD_BYTES = int(os.getenv("MAX_PRESENTATION_UPLOAD_BYTES", str(20 * 1024 * 1024)))
MAX_PRESENTATION_UPLOAD_FILES = int(os.getenv("MAX_PRESENTATION_UPLOAD_FILES", "4"))
MAX_VISION_MATERIAL_IMAGES = int(os.getenv("MAX_VISION_MATERIAL_IMAGES", "6"))
MAX_VISION_PAGES_PER_FILE = int(os.getenv("MAX_VISION_PAGES_PER_FILE", "3"))
GEMINI_RATE_WINDOW_SECONDS = int(os.getenv("GEMINI_RATE_WINDOW_SECONDS", "3600"))
GEMINI_MAX_CALLS_PER_WINDOW = int(os.getenv("GEMINI_MAX_CALLS_PER_WINDOW", "6"))
GEMINI_STATUS_CACHE_SECONDS = int(os.getenv("GEMINI_STATUS_CACHE_SECONDS", "600"))

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


app = FastAPI(title="Presentation Practice API")

cors_origins = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
cors_origin_regex = os.getenv(
    "BACKEND_CORS_ORIGIN_REGEX",
    r"http://(localhost|127\.0\.0\.1):\d+",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, SessionState] = {}
MAX_SCRIPT_FILE_BYTES = 10 * 1024 * 1024
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".text", ".csv", ".srt"}
SUPPORTED_SCRIPT_EXTENSIONS = TEXT_EXTENSIONS | {".pdf", ".docx", ".pptx"}


def load_env_file() -> None:
    env_paths = [
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


load_env_file()


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

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
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


def extract_youtube_video_id(url: str) -> str | None:
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
        r"youtube\.com/watch\?.*?[?&]v=([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


HARDCODED_REFERENCE_VIDEOS: dict[str, dict[str, Any]] = {
    "NN4GVaBvroE": {
        "video_id": "NN4GVaBvroE",
        "embed_url": "https://www.youtube.com/embed/NN4GVaBvroE",
        "title": "미친 자산 변동, 누가 벌고 누가 깨졌나",
        "author_name": "슈카월드",
        "thumbnail_url": "https://i.ytimg.com/vi/NN4GVaBvroE/hqdefault.jpg",
        "reference_profile": {
            "transcript_source": "youtube_caption_hardcoded",
            "duration_seconds": 2580,
            "word_count": 5633,
            "syllables_per_second": 5.79,
            "words_per_minute": 131.0,
            "average_sentence_words": 8.4,
            "tone": "짧은 의미 단위로 빠르게 전환하는 금융 해설형 말투",
            "speaking_style": "시장 데이터를 던진 뒤 청중 감정과 사례를 이어 붙이는 스토리텔링형 해설",
            "pause_timing_summary": "문장 길이는 짧지만 숫자, 종목명, 결론 직후에 의미 단위가 끊기며 리듬을 만듭니다.",
            "emphasis_summary": "코스피 9천, 포모, 삼성전자, 하이닉스, 변동성처럼 숫자와 고유명사를 반복해 핵심 장면을 각인합니다.",
            "top_keywords": ["코스피", "포모", "삼성전자", "하이닉스", "사이드카", "변동성", "시장", "투자자"],
            "speech_rate_summary": "43분 자막 기준 초당 5.79음절, 분당 131단어로 빠르지만 청중이 따라올 수 있는 해설형 속도입니다.",
            "word_choice_summary": "전문 지표를 일상어, 농담, 반복 구호와 섞어 복잡한 시장 상황을 쉽게 풀어냅니다.",
        },
        "benchmark_targets": {
            "speech_rate": "초당 5.79음절, 분당 131단어를 기준으로 빠르지만 또렷한 설명 리듬을 비교합니다.",
            "speaking_style": "데이터 제시 -> 감정 해석 -> 사례 확장의 순서로 청중 몰입을 만드는 해설 구조를 기준으로 봅니다.",
            "pause_timing": "숫자와 결론을 말한 직후 짧게 끊어 핵심 정보가 남는지 비교합니다.",
            "emphasis": "코스피, 포모, 삼성전자, 하이닉스, 변동성 같은 반복 키워드를 발표의 강조 축으로 삼습니다.",
        },
        "analysis_note": "제공된 한국어 자동 자막을 기존 분석 함수로 계산한 뒤, 발표 코칭용 기준 문구를 보강해 고정 적용했습니다.",
    }
}


def build_hardcoded_reference_video(video_id: str, url: str) -> dict[str, Any] | None:
    reference = HARDCODED_REFERENCE_VIDEOS.get(video_id)
    if not reference:
        return None
    payload = json.loads(json.dumps(reference, ensure_ascii=False))
    payload["url"] = url
    return payload


async def build_reference_video(url: str | None) -> dict[str, Any] | None:
    if not url or not url.strip():
        return None

    clean_url = url.strip()
    video_id = extract_youtube_video_id(clean_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="올바른 YouTube 영상 주소를 입력해 주세요.")

    hardcoded_reference = build_hardcoded_reference_video(video_id, clean_url)
    if hardcoded_reference:
        return hardcoded_reference

    reference = {
        "url": clean_url,
        "video_id": video_id,
        "embed_url": f"https://www.youtube.com/embed/{video_id}",
        "title": f"YouTube 영상 {video_id}",
        "author_name": "YouTube",
        "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        "benchmark_targets": {
            "speech_rate": "기준 영상처럼 또렷한 말하기 속도를 목표로 봅니다.",
            "speaking_style": "기준 발표자의 화법처럼 차분하고 설명적인 흐름인지 봅니다.",
            "pause_timing": "기준 영상처럼 중요한 의미 단위 뒤에 쉬는 타이밍이 있는지 봅니다.",
            "emphasis": "기준 영상처럼 핵심어를 분명하게 강조하는지 봅니다.",
        },
        "analysis_note": "YouTube URL에서 오디오를 추출해 말하기 속도, 화법, 쉬는 타이밍, 강조 방식 기준을 만듭니다.",
    }

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": clean_url, "format": "json"},
            )
            response.raise_for_status()
            data = response.json()
            reference["title"] = data.get("title") or reference["title"]
            reference["author_name"] = data.get("author_name") or reference["author_name"]
            reference["thumbnail_url"] = data.get("thumbnail_url") or reference["thumbnail_url"]

    except Exception:
        reference["analysis_note"] = "YouTube 메타데이터를 가져오지 못했지만 오디오 분석을 계속 시도합니다."

    missing_gemini_key = not os.getenv("GEMINI_API_KEY", "").strip()
    audio_profile = await analyze_youtube_audio_reference(clean_url)
    if audio_profile:
        reference["reference_profile"] = audio_profile
        reference["benchmark_targets"] = build_reference_benchmark_targets(audio_profile, "음성")
        reference["analysis_note"] = "YouTube URL에서 오디오를 추출해 Gemini가 말하기 속도, 화법, 쉬는 타이밍, 강조 방식을 분석했습니다."
        return reference

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            transcript_data = await fetch_youtube_transcript(client, video_id)
        if not transcript_data:
            transcript_data = await fetch_youtube_transcript_with_ytdlp(clean_url)
        if transcript_data:
            profile = analyze_reference_transcript(
                transcript_data["text"],
                transcript_data["duration_seconds"],
            )
            reference["reference_profile"] = profile
            reference["benchmark_targets"] = build_reference_benchmark_targets(profile, "자막")
            reference["analysis_note"] = "오디오 분석을 사용할 수 없어 YouTube 자막의 시간 정보와 텍스트로 기준을 만들었습니다."
    except Exception:
        if missing_gemini_key:
            reference["analysis_note"] = "GEMINI_API_KEY가 없어 YouTube 오디오 음성 분석을 실행하지 못했고, 기본 기준으로 설정했습니다."
        elif "계속 시도" in reference["analysis_note"]:
            reference["analysis_note"] = "YouTube 오디오/자막을 가져오지 못해 영상 ID 기반 기본 기준으로 설정했습니다."

    return reference


def build_reference_benchmark_targets(profile: dict[str, Any], source_label: str) -> dict[str, str]:
    pace = profile.get("syllables_per_second") or 0
    top_keywords = profile.get("top_keywords") or []
    keywords_text = ", ".join(top_keywords[:5]) if top_keywords else "핵심어"
    return {
        "speech_rate": f"기준 영상 {source_label} 기준 초당 {pace}음절의 말하기 속도를 비교 기준으로 봅니다.",
        "speaking_style": f"기준 영상의 화법은 '{profile.get('speaking_style') or profile.get('tone', '설명형 화법')}'입니다.",
        "pause_timing": profile.get("pause_timing_summary") or "중요한 의미 단위 뒤에 쉬는 타이밍이 있는지 봅니다.",
        "emphasis": profile.get("emphasis_summary") or f"주요 단어({keywords_text})를 어떻게 강조하는지 봅니다.",
    }


async def analyze_youtube_audio_reference(url: str) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        audio_path, metadata = await asyncio.to_thread(download_youtube_audio, url)
    except Exception:
        return None

    try:
        if audio_path.stat().st_size > 18 * 1024 * 1024:
            return None

        mime_type = guess_audio_mime_type(audio_path)
        audio_b64 = base64.b64encode(audio_path.read_bytes()).decode("ascii")
        model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        prompt = """
You are a Korean presentation speech analyst.
Analyze the attached YouTube audio as the reference speaker.
Return strict JSON only.
Focus only on speech rate, speaking style, pause timing, and emphasis style.

Required JSON schema:
{
  "transcript_source": "youtube_audio",
  "duration_seconds": number,
  "word_count": number,
  "syllables_per_second": number,
  "words_per_minute": number,
  "average_sentence_words": number,
  "tone": "Korean short phrase",
  "speaking_style": "Korean short phrase",
  "pause_timing_summary": "Korean short sentence",
  "emphasis_summary": "Korean short sentence",
  "top_keywords": ["Korean keyword"],
  "speech_rate_summary": "Korean short sentence",
  "word_choice_summary": "Korean short sentence"
}
"""
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {"inline_data": {"mime_type": mime_type, "data": audio_b64}},
                    ]
                }
            ],
            "generationConfig": {"responseMimeType": "application/json"},
        }
        data, _remaining = await call_gemini_api(
            kind="reference_audio",
            payload=payload,
            timeout_seconds=60,
            count_against_limit=True,
            retry_on_unavailable=1,
        )
        raw = data["candidates"][0]["content"]["parts"][0]["text"]

        profile = json.loads(raw)
        profile["transcript_source"] = "youtube_audio"
        profile["duration_seconds"] = profile.get("duration_seconds") or metadata.get("duration") or 0
        profile["audio_bytes"] = audio_path.stat().st_size
        return normalize_reference_profile(profile)
    except Exception:
        return None
    finally:
        try:
            audio_path.unlink(missing_ok=True)
            audio_path.parent.rmdir()
        except Exception:
            pass


def download_youtube_audio(url: str) -> tuple[Path, dict[str, Any]]:
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp is not installed") from exc

    tmp_dir = Path(tempfile.mkdtemp(prefix="reference-audio-"))
    output_template = str(tmp_dir / "audio.%(ext)s")
    options = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_template,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 20,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)

    files = [path for path in tmp_dir.iterdir() if path.is_file()]
    if not files:
        raise RuntimeError("audio download failed")
    return files[0], info or {}


def guess_audio_mime_type(path: Path) -> str:
    if path.suffix.lower() == ".m4a":
        return "audio/mp4"
    if path.suffix.lower() == ".webm":
        return "audio/webm"
    if path.suffix.lower() == ".mp3":
        return "audio/mpeg"
    return mimetypes.guess_type(path.name)[0] or "audio/mpeg"


def normalize_reference_profile(profile: dict[str, Any]) -> dict[str, Any]:
    keywords = profile.get("top_keywords") or []
    if not isinstance(keywords, list):
        keywords = []
    return {
        "transcript_source": profile.get("transcript_source", "youtube_audio"),
        "duration_seconds": round(float(profile.get("duration_seconds") or 0), 1),
        "word_count": int(float(profile.get("word_count") or 0)),
        "syllables_per_second": round(float(profile.get("syllables_per_second") or 0), 2),
        "words_per_minute": round(float(profile.get("words_per_minute") or 0), 1),
        "average_sentence_words": round(float(profile.get("average_sentence_words") or 0), 1),
        "tone": str(profile.get("tone") or "설명형 말투"),
        "speaking_style": str(profile.get("speaking_style") or profile.get("tone") or "설명형 화법"),
        "pause_timing_summary": str(profile.get("pause_timing_summary") or ""),
        "emphasis_summary": str(profile.get("emphasis_summary") or ""),
        "top_keywords": [str(keyword) for keyword in keywords[:8]],
        "speech_rate_summary": str(profile.get("speech_rate_summary") or ""),
        "word_choice_summary": str(profile.get("word_choice_summary") or ""),
        "audio_bytes": int(profile.get("audio_bytes") or 0),
    }


async def fetch_youtube_transcript(client: httpx.AsyncClient, video_id: str) -> dict[str, Any] | None:
    watch_response = await client.get(
        "https://www.youtube.com/watch",
        params={"v": video_id, "hl": "ko"},
    )
    watch_response.raise_for_status()
    html = watch_response.text
    match = re.search(r'"captionTracks":(\[.*?\])', html)
    if not match:
        return None

    tracks = json.loads(match.group(1))
    if not tracks:
        return None

    selected = next((track for track in tracks if track.get("languageCode") == "ko"), None)
    selected = selected or next((track for track in tracks if track.get("kind") != "asr"), None)
    selected = selected or tracks[0]
    base_url = selected.get("baseUrl")
    if not base_url:
        return None

    caption_url = unescape(base_url)
    separator = "&" if "?" in caption_url else "?"
    json_response = await client.get(f"{caption_url}{separator}fmt=json3")
    json_response.raise_for_status()

    try:
        data = json_response.json()
        lines = []
        duration_ms = 0
        for event in data.get("events", []):
            parts = [segment.get("utf8", "") for segment in event.get("segs", [])]
            text = "".join(parts).strip()
            if text:
                lines.append(text)
            start_ms = int(event.get("tStartMs", 0) or 0)
            duration_ms = max(duration_ms, start_ms + int(event.get("dDurationMs", 0) or 0))
        transcript = " ".join(lines)
        if transcript:
            return {"text": transcript, "duration_seconds": max(1, duration_ms / 1000)}
    except ValueError:
        pass

    xml_response = await client.get(caption_url)
    xml_response.raise_for_status()
    root = ET.fromstring(xml_response.text)
    lines = []
    duration_seconds = 0.0
    for node in root.findall(".//text"):
        text = unescape("".join(node.itertext())).strip()
        if text:
            lines.append(text)
        start = float(node.attrib.get("start", 0) or 0)
        duration = float(node.attrib.get("dur", 0) or 0)
        duration_seconds = max(duration_seconds, start + duration)
    transcript = " ".join(lines)
    if not transcript:
        return None
    return {"text": transcript, "duration_seconds": max(1, duration_seconds)}


async def fetch_youtube_transcript_with_ytdlp(url: str) -> dict[str, Any] | None:
    try:
        caption_url, duration_seconds = await asyncio.to_thread(get_ytdlp_caption_url, url)
        if not caption_url:
            return None
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(caption_url)
            response.raise_for_status()
        text = response.text
        if caption_url.endswith("json3") or '"events"' in text[:200]:
            return parse_json3_transcript(text, duration_seconds)
        return parse_vtt_transcript(text, duration_seconds)
    except Exception:
        return None


def get_ytdlp_caption_url(url: str) -> tuple[str | None, float]:
    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("yt-dlp is not installed") from exc

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 20,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)

    captions = info.get("subtitles") or {}
    automatic_captions = info.get("automatic_captions") or {}
    tracks = captions or automatic_captions
    if not tracks:
        return None, float(info.get("duration") or 0)

    selected_tracks = (
        tracks.get("ko")
        or tracks.get("ko-KR")
        or tracks.get("en")
        or tracks.get("en-US")
        or next(iter(tracks.values()), None)
    )
    if not selected_tracks:
        return None, float(info.get("duration") or 0)

    preferred = next((track for track in selected_tracks if track.get("ext") == "json3"), None)
    preferred = preferred or next((track for track in selected_tracks if track.get("ext") == "vtt"), None)
    preferred = preferred or selected_tracks[0]
    return preferred.get("url"), float(info.get("duration") or 0)


def parse_json3_transcript(raw_text: str, fallback_duration_seconds: float = 0) -> dict[str, Any] | None:
    data = json.loads(raw_text)
    lines = []
    duration_ms = 0
    for event in data.get("events", []):
        parts = [segment.get("utf8", "") for segment in event.get("segs", [])]
        text = "".join(parts).strip()
        if text:
            lines.append(text)
        start_ms = int(event.get("tStartMs", 0) or 0)
        duration_ms = max(duration_ms, start_ms + int(event.get("dDurationMs", 0) or 0))
    transcript = " ".join(lines)
    if not transcript:
        return None
    duration_seconds = max(1, duration_ms / 1000 if duration_ms else fallback_duration_seconds)
    return {"text": transcript, "duration_seconds": duration_seconds}


def parse_vtt_transcript(raw_text: str, fallback_duration_seconds: float = 0) -> dict[str, Any] | None:
    lines = []
    last_time = fallback_duration_seconds
    time_pattern = re.compile(r"(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})")
    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line or line == "WEBVTT" or line.startswith(("Kind:", "Language:", "NOTE", "STYLE")):
            continue
        if "-->" in line:
            matches = time_pattern.findall(line)
            if matches:
                hours, minutes, seconds, millis = matches[-1]
                last_time = int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000
            continue
        if line.isdigit() or line.startswith("<"):
            continue
        clean_line = re.sub(r"<[^>]+>", "", line)
        clean_line = re.sub(r"\s+", " ", clean_line).strip()
        if clean_line:
            lines.append(unescape(clean_line))
    transcript = " ".join(lines)
    if not transcript:
        return None
    return {"text": transcript, "duration_seconds": max(1, last_time)}


def analyze_reference_transcript(transcript: str, duration_seconds: float) -> dict[str, Any]:
    words = tokenize(transcript)
    syllables = count_syllables(transcript)
    sentence_count = max(1, len(re.findall(r"[.!?。！？]|다\.|요\.", transcript)))
    keyword_stopwords = {
        "그리고", "그래서", "하지만", "저는", "제가", "우리", "여러분", "이것", "그것",
        "것은", "있는", "합니다", "있습니다", "합니다", "the", "and", "that", "this",
    }
    counts: dict[str, int] = {}
    for word in words:
        if len(word) < 2 or word in keyword_stopwords:
            continue
        counts[word] = counts.get(word, 0) + 1
    top_keywords = sorted(counts, key=lambda word: (-counts[word], word))[:8]
    average_sentence_words = len(words) / sentence_count if words else 0

    if average_sentence_words > 24:
        tone = "긴 문장 중심의 설명형 말투"
    elif average_sentence_words < 8:
        tone = "짧고 빠르게 끊는 말투"
    else:
        tone = "짧은 의미 단위로 설명하는 말투"

    return {
        "transcript_source": "youtube_caption",
        "duration_seconds": round(duration_seconds, 1),
        "word_count": len(words),
        "syllables_per_second": round(syllables / duration_seconds, 2) if duration_seconds else 0,
        "words_per_minute": round(len(words) / duration_seconds * 60, 1) if duration_seconds else 0,
        "average_sentence_words": round(average_sentence_words, 1),
        "tone": tone,
        "speaking_style": tone,
        "pause_timing_summary": "자막 기준 분석이라 실제 침묵 길이는 제한적으로만 판단합니다. 문장 경계 뒤 쉬는 흐름을 기준으로 봅니다.",
        "emphasis_summary": f"{', '.join(top_keywords[:5]) if top_keywords else '핵심어'} 같은 반복 키워드를 강조 기준으로 봅니다.",
        "top_keywords": top_keywords,
    }


def tokenize(text: str) -> list[str]:
    return re.findall(r"[가-힣A-Za-z0-9']+", text.lower())


def count_syllables(text: str) -> int:
    hangul = len(re.findall(r"[가-힣]", text))
    latin_words = re.findall(r"[A-Za-z0-9']+", text)
    return hangul + sum(max(1, round(len(word) / 3)) for word in latin_words)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def score_distance(value: float, target: float, tolerance: float, floor: float = 35) -> float:
    if value <= 0:
        return floor
    return clamp(100 - abs(value - target) / tolerance * 35, floor, 100)


def format_seconds(seconds: float) -> str:
    whole = max(0, int(seconds))
    minutes = whole // 60
    rest = whole % 60
    return f"{minutes:02d}:{rest:02d}"


def transcript_delta(previous: str, current: str) -> str:
    previous = previous.strip()
    current = current.strip()
    if not current:
        return ""
    if previous and current.startswith(previous):
        return current[len(previous) :].strip()
    previous_tokens = tokenize(previous)
    current_tokens = tokenize(current)
    if not previous_tokens:
        return current
    shared = 0
    for index, token in enumerate(current_tokens):
        if index < len(previous_tokens) and previous_tokens[index] == token:
            shared += 1
        else:
            break
    if shared >= len(previous_tokens) - 2:
        return " ".join(current_tokens[shared:]).strip()
    return current[-180:].strip()


def recent_excerpt(text: str, limit: int = 140) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return f"...{compact[-limit:]}"


def normalize_imported_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def file_extension(filename: str) -> str:
    _, extension = os.path.splitext(filename.lower())
    return extension


def extract_text_from_pdf(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages.append(f"[{index}쪽]\n{page_text.strip()}")
    return "\n\n".join(pages)


def extract_text_from_docx(content: bytes) -> str:
    document = Document(BytesIO(content))
    parts = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def extract_text_from_pptx(content: bytes) -> str:
    deck = Presentation(BytesIO(content))
    slides = []
    for index, slide in enumerate(deck.slides, start=1):
        slide_text = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                slide_text.append(shape.text.strip())
        if slide_text:
            slides.append(f"[슬라이드 {index}]\n" + "\n".join(slide_text))
    return "\n\n".join(slides)


def extract_script_text(filename: str, content: bytes) -> tuple[str, str]:
    extension = file_extension(filename)
    if extension not in SUPPORTED_SCRIPT_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_SCRIPT_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다. 지원 형식: {supported}")

    try:
        if extension in TEXT_EXTENSIONS:
            try:
                return content.decode("utf-8-sig"), "text"
            except UnicodeDecodeError:
                return content.decode("cp949", errors="ignore"), "text"
        if extension == ".pdf":
            return extract_text_from_pdf(content), "pdf"
        if extension == ".docx":
            return extract_text_from_docx(content), "docx"
        if extension == ".pptx":
            return extract_text_from_pptx(content), "pptx"
    except Exception as exc:
        raise HTTPException(status_code=400, detail="파일에서 대본 텍스트를 읽지 못했습니다.") from exc

    raise HTTPException(status_code=400, detail="파일을 읽지 못했습니다.")


def script_quality(script: str) -> dict[str, Any]:
    words = tokenize(script)
    sentence_count = max(1, len(re.findall(r"[.!?。！？]|다\.|요\.", script)))
    avg_sentence_words = len(words) / sentence_count if words else 0
    unique_ratio = len(set(words)) / len(words) if words else 0
    has_opening = any(token in script for token in ["안녕하세요", "오늘", "소개", "주제"])
    has_closing = any(token in script for token in ["감사합니다", "정리", "결론", "마치"])

    score = 55
    score += 15 if 8 <= avg_sentence_words <= 22 else 4
    score += 10 if unique_ratio > 0.45 else 4
    score += 8 if has_opening else 0
    score += 8 if has_closing else 0
    score += 4 if len(words) >= 80 else 0

    suggestions = []
    if avg_sentence_words > 24:
        suggestions.append("긴 문장을 둘로 나누면 청중이 핵심을 따라가기 쉬워집니다.")
    if not has_opening:
        suggestions.append("처음 15초 안에 발표 주제와 듣는 이유를 분명히 말해보세요.")
    if not has_closing:
        suggestions.append("마지막에는 핵심 요약과 감사 인사를 짧게 넣어 마무리감을 주세요.")
    if len(words) < 80:
        suggestions.append("대본이 짧아 리허설 피드백이 제한될 수 있어요. 예시나 전환 문장을 조금 더 넣어보세요.")

    return {
        "score": round(clamp(score, 0, 100)),
        "word_count": len(words),
        "average_sentence_words": round(avg_sentence_words, 1),
        "suggestions": suggestions[:4],
    }


def build_issue_log(session: SessionState, transcript: str) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    previous_transcript = ""
    previous_longest_silence = 0.0
    script_tokens = set(tokenize(session.script))

    def add_issue(
        sample: MetricSample,
        issue_type: str,
        severity: str,
        title: str,
        evidence: str,
        suggestion: str,
        excerpt: str,
        metric: dict[str, Any],
    ) -> None:
        duplicate_key = (issue_type, format_seconds(sample.elapsed_seconds))
        if any((item["type"], item["time"]) == duplicate_key for item in issues):
            return
        issues.append(
            {
                "time": duplicate_key[1],
                "elapsed_seconds": round(sample.elapsed_seconds, 1),
                "type": issue_type,
                "severity": severity,
                "title": title,
                "evidence": evidence,
                "spoken_excerpt": excerpt or "해당 구간에서 새로 인식된 문장이 거의 없었습니다.",
                "metric": metric,
                "suggestion": suggestion,
            }
        )

    for sample in session.samples:
        current_transcript = sample.transcript.strip()
        delta = transcript_delta(previous_transcript, current_transcript)
        excerpt = recent_excerpt(delta or current_transcript)
        overlap = 0.0
        if script_tokens:
            overlap = len(script_tokens & set(tokenize(current_transcript))) / len(script_tokens)

        if sample.elapsed_seconds >= 8 and sample.syllables_per_second >= 7.2:
            add_issue(
                sample,
                "pace_fast",
                "high" if sample.syllables_per_second >= 8 else "medium",
                "말이 빨라 핵심어가 지나간 구간",
                f"초당 {sample.syllables_per_second:.1f}음절로 목표 범위(5.6-6.3)를 넘었습니다.",
                "핵심 단어 앞뒤로 반 박자 쉬고, 한 문장을 두 덩어리로 끊어 말해보세요.",
                excerpt,
                {"syllables_per_second": round(sample.syllables_per_second, 2), "target": "5.6-6.3"},
            )

        if sample.elapsed_seconds >= 12 and 0 < sample.syllables_per_second < 4.8:
            add_issue(
                sample,
                "pace_slow",
                "medium",
                "흐름이 느려진 구간",
                f"초당 {sample.syllables_per_second:.1f}음절로 목표 범위보다 낮았습니다.",
                "문장 사이 연결어를 미리 정해 두고 다음 의미 단위로 바로 넘어가세요.",
                excerpt,
                {"syllables_per_second": round(sample.syllables_per_second, 2), "target": "5.6-6.3"},
            )

        new_silence = max(0, sample.longest_silence_seconds - previous_longest_silence)
        if sample.longest_silence_seconds >= 5 and new_silence >= 2:
            add_issue(
                sample,
                "long_silence",
                "high" if sample.longest_silence_seconds >= 8 else "medium",
                "긴 침묵이 생긴 구간",
                f"최장 침묵이 {sample.longest_silence_seconds:.0f}초까지 늘었습니다.",
                "막히는 지점에는 '다음으로는', '핵심은' 같은 복구 문장을 준비해두세요.",
                recent_excerpt(current_transcript),
                {"longest_silence_seconds": round(sample.longest_silence_seconds, 1), "risk": "5초 이상"},
            )

        if sample.elapsed_seconds >= 20 and sample.pause_ratio >= 0.28:
            add_issue(
                sample,
                "pause_ratio",
                "high",
                "쉬는 시간이 누적된 구간",
                f"전체 시간 중 휴지 비율이 {sample.pause_ratio * 100:.1f}%로 위험 기준(25%+)을 넘었습니다.",
                "문장을 완전히 멈추기보다 의미 단위 끝에서 짧게 끊어 말하는 방식으로 바꿔보세요.",
                excerpt,
                {"pause_ratio_percent": round(sample.pause_ratio * 100, 1), "risk_ratio_percent": 25},
            )

        if sample.elapsed_seconds >= 24 and current_transcript and overlap < 0.18:
            add_issue(
                sample,
                "off_script",
                "medium",
                "대본 핵심어와 멀어진 구간",
                f"현재까지 대본 핵심어 반영도가 {overlap * 100:.0f}%에 머물렀습니다.",
                "슬라이드 제목이나 대본의 중심 키워드를 다시 말해 메시지를 회수하세요.",
                excerpt,
                {"script_overlap_percent": round(overlap * 100), "expected_min_percent": 25},
            )

        previous_transcript = current_transcript
        previous_longest_silence = max(previous_longest_silence, sample.longest_silence_seconds)

    if not issues and transcript:
        last_sample = session.samples[-1] if session.samples else None
        issues.append(
            {
                "time": format_seconds(last_sample.elapsed_seconds if last_sample else 0),
                "elapsed_seconds": round(last_sample.elapsed_seconds if last_sample else 0, 1),
                "type": "review",
                "severity": "low",
                "title": "큰 위험 구간은 적었습니다",
                "evidence": "속도와 침묵 지표에서 강한 경고가 감지되지 않았습니다.",
                "spoken_excerpt": recent_excerpt(transcript),
                "metric": {},
                "suggestion": "다음 연습에서는 강조하고 싶은 문장 2-3개를 정해 억양과 쉼을 더 의식해보세요.",
            }
        )

    severity_order = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda item: (severity_order.get(item["severity"], 3), item["elapsed_seconds"]))
    return issues[:10]


def build_keyword_feedback(script: str, transcript: str) -> dict[str, Any]:
    script_tokens = [token for token in tokenize(script) if len(token) > 1]
    spoken_tokens = set(tokenize(transcript))
    seen: set[str] = set()
    important_tokens = []
    for token in script_tokens:
        if token in seen:
            continue
        seen.add(token)
        important_tokens.append(token)

    covered = [token for token in important_tokens if token in spoken_tokens]
    missed = [token for token in important_tokens if token not in spoken_tokens]
    return {
        "covered_keywords": covered[:12],
        "missed_keywords": missed[:12],
        "coverage_percent": round((len(covered) / len(important_tokens)) * 100) if important_tokens else 0,
    }


def build_detailed_feedback(report: dict[str, Any], issue_log: list[dict[str, Any]]) -> dict[str, Any]:
    pace = report["pace"]
    silence = report["silence"]
    rhythm = report["rhythm"]
    delivery = report["delivery_match"]

    priorities = []
    if silence["pause_ratio_percent"] >= 25 or silence["longest_seconds"] >= 6:
        priorities.append("침묵 복구 문장을 먼저 준비하세요. 멈췄을 때 바로 이어갈 문장 하나가 전체 전달력을 크게 올립니다.")
    if pace["syllables_per_second"] > 6.8:
        priorities.append("속도를 낮추는 것이 1순위입니다. 핵심어 앞뒤에 짧은 쉼을 넣어 청중이 따라올 시간을 주세요.")
    elif pace["syllables_per_second"] < 5.0:
        priorities.append("발화 흐름을 조금 더 밀도 있게 가져가세요. 문장 사이 공백을 줄이고 다음 문장 첫 단어를 미리 떠올리면 좋습니다.")
    if delivery["similarity_percent"] < 55:
        priorities.append("대본의 핵심 키워드가 충분히 전달되지 않았습니다. 슬라이드 제목, 문제, 해결책 키워드는 반드시 소리 내어 반복하세요.")
    if rhythm["rate_variability"] > 1.2:
        priorities.append("구간별 속도 차이가 큽니다. 문장 안에서는 일정하게, 문장 끝에서만 쉬는 리듬을 연습하세요.")

    if not priorities:
        priorities.append("지표가 안정적입니다. 다음에는 강조 문장과 마무리 문장의 힘을 더 살려 완성도를 높여보세요.")

    practice_plan = [
        "문제가 표시된 구간의 발화 문장을 다시 읽고, 쉼표를 넣을 위치를 표시합니다.",
        "같은 구간만 2회 반복하며 첫 번째는 천천히, 두 번째는 실제 발표 속도로 말합니다.",
        "마지막 20초에는 결론과 감사 인사를 끊기지 않게 말하는지 확인합니다.",
    ]

    if issue_log:
        practice_plan.insert(1, f"가장 먼저 고칠 구간은 {issue_log[0]['time']}의 '{issue_log[0]['title']}'입니다.")

    return {
        "priority_feedback": priorities[:5],
        "practice_plan": practice_plan,
        "coach_note": "아래 로그는 발표 중 저장된 누적 음성 인식 결과와 속도/침묵 샘플을 바탕으로 만든 근거입니다.",
    }


def presentation_criteria() -> dict[str, Any]:
    return {
        "source": "신지영, 「소통과 공감을 위한 전달력 높은 말하기의 언어학적 조건(1): 운율적 측면을 중심으로」",
        "core_principle": "정보 전달형 공적 말하기에서는 말하기 속도, 화법, 쉬는 타이밍, 강조 방식이 청중의 이해와 발표자의 인상에 큰 영향을 준다.",
        "targets": {
            "speech_rate": "말하기 속도는 한국어 기준 초당 약 5.6-6.3음절을 안정적인 전달 속도 범위로 본다.",
            "speaking_style": "화법은 문장이 지나치게 길거나 딱딱하지 않고, 청중이 따라가기 쉬운 설명형 흐름인지 본다.",
            "pause_timing": "쉬는 타이밍은 중요한 의미 단위 뒤에 짧은 여백이 생기는지 본다.",
            "emphasis": "강조 방식은 핵심어를 반복하거나 속도와 억양 변화로 분명히 드러내는지 본다.",
        },
        "rubric_items": ["말하기 속도", "화법", "쉬는 타이밍", "강조 방식"],
    }


def extract_youtube_video_id(url: str) -> str | None:
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
        r"youtube\.com/watch\?.*?[?&]v=([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


async def build_reference_video(url: str | None) -> dict[str, Any] | None:
    if not url or not url.strip():
        return None

    clean_url = url.strip()
    video_id = extract_youtube_video_id(clean_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="올바른 YouTube 영상 주소를 입력해 주세요.")

    reference = {
        "url": clean_url,
        "video_id": video_id,
        "embed_url": f"https://www.youtube.com/embed/{video_id}",
        "title": f"YouTube 영상 {video_id}",
        "author_name": "YouTube",
        "thumbnail_url": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        "benchmark_targets": {
            "speech_rate": "기준 영상처럼 또렷한 말하기 속도를 목표로 봅니다.",
            "speaking_style": "기준 발표자의 화법처럼 차분하고 설명적인 흐름인지 봅니다.",
            "pause_timing": "기준 영상처럼 중요한 의미 단위 뒤에 쉬는 타이밍이 있는지 봅니다.",
            "emphasis": "기준 영상처럼 핵심어를 분명하게 강조하는지 봅니다.",
        },
        "analysis_note": "YouTube URL을 기준 발표로 등록했습니다. 대본과 발표 흐름을 비교할 때 참고합니다.",
    }

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": clean_url, "format": "json"},
            )
            response.raise_for_status()
            data = response.json()
            reference["title"] = data.get("title") or reference["title"]
            reference["author_name"] = data.get("author_name") or reference["author_name"]
            reference["thumbnail_url"] = data.get("thumbnail_url") or reference["thumbnail_url"]
    except Exception:
        reference["analysis_note"] = "YouTube 메타데이터를 가져오지 못했지만 기준 영상 등록은 유지됩니다."

    return reference


def sample_indices(total: int, limit: int) -> list[int]:
    if total <= 0 or limit <= 0:
        return []
    if total <= limit:
        return list(range(total))
    if limit == 1:
        return [0]
    step = (total - 1) / (limit - 1)
    return sorted({min(total - 1, round(step * index)) for index in range(limit)})


def render_pdf_images_for_vision(data: bytes, page_limit: int) -> tuple[list[dict[str, Any]], list[str]]:
    if fitz is None:
        return [], ["PDF 시각 렌더링 라이브러리가 없어 텍스트 기반 분석만 가능합니다."]

    notes: list[str] = []
    images: list[dict[str, Any]] = []
    try:
        document = fitz.open(stream=data, filetype="pdf")
        for page_index in sample_indices(document.page_count, page_limit):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.7, 1.7), alpha=False)
            images.append(
                {
                    "page_index": page_index,
                    "mime_type": "image/png",
                    "data": base64.b64encode(pixmap.tobytes("png")).decode("ascii"),
                }
            )
        return images, notes
    except Exception as exc:
        return [], [f"PDF 페이지를 이미지로 렌더링하지 못했습니다: {exc}"]


def convert_pptx_to_pdf_bytes(data: bytes) -> tuple[bytes | None, list[str]]:
    notes: list[str] = []
    with tempfile.TemporaryDirectory(prefix="pptx-render-") as tmp_dir_name:
        tmp_dir = Path(tmp_dir_name)
        source_path = tmp_dir / "material.pptx"
        output_dir = tmp_dir / "out"
        output_dir.mkdir(exist_ok=True)
        source_path.write_bytes(data)
        command = [
            "soffice",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_dir),
            str(source_path),
        ]
        try:
            subprocess.run(
                command,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=45,
            )
        except FileNotFoundError:
            return None, ["LibreOffice가 없어 PPTX 시각 분석을 수행할 수 없습니다."]
        except subprocess.TimeoutExpired:
            return None, ["PPTX를 PDF로 변환하는 데 시간이 너무 오래 걸렸습니다."]
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="ignore").strip()
            return None, [f"PPTX를 PDF로 변환하지 못했습니다: {stderr or exc}"]

        pdf_path = output_dir / "material.pdf"
        if not pdf_path.exists():
            return None, ["PPTX를 PDF로 변환했지만 결과 파일을 찾지 못했습니다."]
        return pdf_path.read_bytes(), notes


def render_material_images_for_vision(name: str, content_type: str | None, data: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    kind = file_kind(name, content_type)
    if kind == "pdf":
        return render_pdf_images_for_vision(data, MAX_VISION_PAGES_PER_FILE)
    if kind == "pptx":
        pdf_bytes, notes = convert_pptx_to_pdf_bytes(data)
        if not pdf_bytes:
            return [], notes
        rendered_images, render_notes = render_pdf_images_for_vision(pdf_bytes, MAX_VISION_PAGES_PER_FILE)
        return rendered_images, notes + render_notes
    return [], ["PDF 또는 PPTX만 시각 분석 대상으로 지원합니다."]


async def analyze_materials_with_gemini_vision(
    script: str,
    local_materials: list[dict[str, Any]],
    uploads: list[dict[str, Any]],
) -> dict[str, Any] | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or not uploads:
        return None

    vision_parts: list[dict[str, Any]] = []
    material_context: list[dict[str, Any]] = []
    image_budget = MAX_VISION_MATERIAL_IMAGES

    for upload, local_material in zip(uploads, local_materials):
        rendered_images, render_notes = render_material_images_for_vision(
            upload["filename"],
            upload.get("content_type"),
            upload["data"],
        )
        local_material.setdefault("notes", [])
        local_material["notes"] = list(local_material["notes"]) + render_notes

        selected_images = rendered_images[:image_budget]
        image_budget -= len(selected_images)
        material_context.append(
            {
                "filename": upload["filename"],
                "kind": local_material.get("kind"),
                "page_count": local_material.get("page_count", 0),
                "slide_count": local_material.get("slide_count", 0),
                "word_count": local_material.get("word_count", 0),
                "extracted_character_count": local_material.get("extracted_character_count", 0),
                "preview": local_material.get("preview", ""),
                "rendered_image_count": len(selected_images),
            }
        )
        for image in selected_images:
            unit_label = "page" if local_material.get("kind") == "pdf" else "slide"
            vision_parts.append(
                {"text": f"{upload['filename']} {unit_label} {image['page_index'] + 1} visual"}
            )
            vision_parts.append(
                {"inline_data": {"mime_type": image["mime_type"], "data": image["data"]}}
            )
        if image_budget <= 0:
            break

    if not vision_parts:
        return None

    prompt = {
        "instruction": (
            "You are a Korean presentation design reviewer. Analyze the uploaded presentation materials together "
            "with the speech script. Return strict JSON only. Base visual judgments on the rendered slide/page images, "
            "and use extracted text only as supporting evidence."
        ),
        "script": script,
        "materials": material_context,
        "required_schema": {
            "summary": "Korean short paragraph",
            "estimated_minutes": "number",
            "clarity_score": "integer 0-100",
            "consistency_score": "integer 0-100",
            "topic_fit_score": "integer 0-100",
            "overall_score": "integer 0-100",
            "notes": ["Korean short sentence"],
            "files": [
                {
                    "filename": "string",
                    "estimated_minutes": "number",
                    "clarity_score": "integer 0-100",
                    "consistency_score": "integer 0-100",
                    "topic_fit_score": "integer 0-100",
                    "overall_score": "integer 0-100",
                    "summary": "Korean short sentence",
                    "notes": ["Korean short sentence"],
                }
            ],
        },
    }
    payload = {
        "contents": [
            {
                "parts": [{"text": json.dumps(prompt, ensure_ascii=False)}, *vision_parts],
            }
        ],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    try:
        data, _remaining = await call_gemini_api(
            kind="preflight_materials",
            payload=payload,
            timeout_seconds=45,
            count_against_limit=True,
            retry_on_unavailable=1,
        )
        return json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
    except Exception:
        return None


def merge_vision_material_feedback(
    local_materials: list[dict[str, Any]],
    vision_feedback: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not vision_feedback:
        return local_materials

    by_name = {item.get("filename"): item for item in (vision_feedback.get("files") or [])}
    merged_materials: list[dict[str, Any]] = []
    for item in local_materials:
        merged = dict(item)
        vision_item = by_name.get(item.get("filename"))
        if vision_item:
            merged.update(
                {
                    "estimated_minutes": vision_item.get("estimated_minutes", item.get("estimated_minutes")),
                    "clarity_score": vision_item.get("clarity_score", item.get("clarity_score")),
                    "consistency_score": vision_item.get("consistency_score", item.get("consistency_score")),
                    "topic_fit_score": vision_item.get("topic_fit_score", item.get("topic_fit_score")),
                    "overall_score": vision_item.get("overall_score", item.get("overall_score")),
                    "summary": vision_item.get("summary", item.get("summary")),
                    "notes": list(item.get("notes", [])) + list(vision_item.get("notes", [])),
                    "analysis_source": "gemini_vision",
                }
            )
        merged_materials.append(merged)
    return merged_materials


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def split_text_units(text: str) -> list[str]:
    units = [part.strip() for part in re.split(r"\n{2,}|(?<=[.!?。！？])\s+", text) if part.strip()]
    if units:
        return units
    compact = normalize_whitespace(text)
    return [compact] if compact else []


def file_kind(filename: str, content_type: str | None) -> str:
    extension = os.path.splitext(filename.lower())[1]
    if extension == ".pdf" or (content_type and "pdf" in content_type):
        return "pdf"
    if extension == ".pptx" or (content_type and "presentation" in content_type):
        return "pptx"
    return "unknown"


def extract_pdf_text(data: bytes) -> tuple[str, int, list[str]]:
    if PdfReader is None:
        return "", 0, ["PDF 텍스트 추출 라이브러리가 설치되지 않았습니다."]

    notes: list[str] = []
    try:
        reader = PdfReader(BytesIO(data))
        texts: list[str] = []
        for index, page in enumerate(reader.pages):
            if index >= 80:
                notes.append("앞쪽 80페이지만 분석했습니다.")
                break
            try:
                texts.append(page.extract_text() or "")
            except Exception:
                texts.append("")
        return "\n".join(texts), len(reader.pages), notes
    except Exception as exc:
        return "", 0, [f"PDF를 읽는 중 문제가 발생했습니다: {exc}"]


def extract_pptx_text(data: bytes) -> tuple[str, int, list[str]]:
    if Presentation is None:
        return "", 0, ["PPTX 텍스트 추출 라이브러리가 설치되지 않았습니다."]

    notes: list[str] = []
    try:
        presentation = Presentation(BytesIO(data))
        texts: list[str] = []
        for index, slide in enumerate(presentation.slides):
            if index >= 80:
                notes.append("앞쪽 80개 슬라이드까지만 분석했습니다.")
                break
            slide_texts: list[str] = []
            for shape in slide.shapes:
                if getattr(shape, "has_text_frame", False) and shape.text_frame:
                    extracted = normalize_whitespace(shape.text_frame.text or "")
                    if extracted:
                        slide_texts.append(extracted)
            texts.append(" ".join(slide_texts))
        return "\n".join(texts), len(presentation.slides), notes
    except Exception as exc:
        return "", 0, [f"PPTX를 읽는 중 문제가 발생했습니다: {exc}"]


def weighted_keyword_overlap(script_text: str, document_text: str, lead_units: list[str]) -> float:
    script_tokens = [token for token in tokenize(script_text) if len(token) > 1]
    document_tokens = [token for token in tokenize(document_text) if len(token) > 1]
    if not script_tokens or not document_tokens:
        return 0.0

    script_set = set(script_tokens)
    lead_tokens = set()
    for unit in lead_units:
        lead_tokens.update(token for token in tokenize(unit) if len(token) > 1)

    title_hits = len(script_set & lead_tokens)
    document_hits = len(script_set & set(document_tokens))
    weighted_hits = (title_hits * 2.0) + document_hits
    weighted_total = (len(script_set) * 1.25) + max(1, len(set(document_tokens)))
    return min(1.0, weighted_hits / weighted_total * 3.2)


def analyze_material_file(script: str, name: str, content_type: str | None, data: bytes) -> dict[str, Any]:
    kind = file_kind(name, content_type)
    if len(data) > MAX_PRESENTATION_UPLOAD_BYTES:
        return {
            "filename": name,
            "content_type": content_type or "application/octet-stream",
            "kind": kind,
            "error": "파일 크기가 허용 한도를 초과했습니다.",
        }

    if kind == "pdf":
        extracted_text, page_count, notes = extract_pdf_text(data)
        unit_count = page_count or len(split_text_units(extracted_text))
    elif kind == "pptx":
        extracted_text, page_count, notes = extract_pptx_text(data)
        unit_count = page_count or len(split_text_units(extracted_text))
    else:
        return {
            "filename": name,
            "content_type": content_type or "application/octet-stream",
            "kind": kind,
            "error": "PDF 또는 PPTX만 업로드할 수 있습니다.",
        }

    extracted_text = normalize_whitespace(extracted_text)
    units = split_text_units(extracted_text)
    lead_units = units[:2]
    script_tokens = [token for token in tokenize(script) if len(token) > 1]
    material_tokens = [token for token in tokenize(extracted_text) if len(token) > 1]
    material_sets = [set(tokenize(unit)) for unit in units if tokenize(unit)]
    unit_total = max(1, unit_count or len(material_sets) or 1)
    total_word_count = len(material_tokens)
    avg_words_per_unit = total_word_count / unit_total
    longest_unit = max((len(tokens) for tokens in material_sets), default=0)
    overlap = len(set(script_tokens) & set(material_tokens)) / len(set(script_tokens)) if script_tokens and material_tokens else 0

    adjacent_overlaps: list[float] = []
    for previous, current in zip(material_sets, material_sets[1:]):
        union = previous | current
        if not union:
            continue
        adjacent_overlaps.append(len(previous & current) / len(union))

    consistency_score = round(
        clamp(
            58
            + (sum(adjacent_overlaps) / len(adjacent_overlaps) * 90 if adjacent_overlaps else 8)
            - max(0, avg_words_per_unit - 30) * 1.3
            - max(0, longest_unit - 70) * 0.4,
            35,
            100,
        )
    )
    clarity_score = round(
        clamp(
            92
            - max(0, avg_words_per_unit - 24) * 1.9
            - max(0, longest_unit - 45) * 0.65
            - (0 if extracted_text else 14),
            35,
            100,
        )
    )
    topic_alignment = weighted_keyword_overlap(script, extracted_text, lead_units)
    topic_fit_score = round(clamp((overlap * 58) + (topic_alignment * 42), 30, 100))

    estimated_minutes = round(
        max(
            max(1.0, len(script_tokens) / 130.0),
            max(1.0, unit_total * 0.45 + total_word_count / 180.0),
        )
        * 1.15,
        1,
    )

    notes = notes[:]
    if not extracted_text:
        notes.append("텍스트를 충분히 읽지 못해 이미지/도형 중심의 시인성 평가는 제한됩니다.")
    if avg_words_per_unit > 40:
        notes.append("장당 텍스트가 많아 슬라이드가 다소 붐빌 수 있습니다.")
    if overlap < 0.2:
        notes.append("대본과 자료의 공통 키워드가 적어서 주제 적합도가 낮습니다.")
    if topic_alignment >= 0.55:
        notes.append("대본 앞부분과 슬라이드 도입부의 주제가 잘 맞습니다.")
    elif topic_alignment < 0.25:
        notes.append("슬라이드 도입부와 대본의 주제 연결을 조금 더 분명하게 맞추면 좋습니다.")
    if consistency_score >= 80:
        notes.append("슬라이드 간 흐름이 비교적 안정적입니다.")

    overall_score = round((clarity_score * 0.34) + (consistency_score * 0.33) + (topic_fit_score * 0.33))
    summary = (
        f"{name} 기준 예상 발표 시간은 약 {estimated_minutes}분이고, "
        f"시인성 {clarity_score}점, 통일성 {consistency_score}점, 주제 적합도 {topic_fit_score}점으로 평가됩니다."
    )

    return {
        "filename": name,
        "content_type": content_type or "application/octet-stream",
        "kind": kind,
        "page_count": page_count if kind == "pdf" else 0,
        "slide_count": page_count if kind == "pptx" else 0,
        "extracted_character_count": len(extracted_text),
        "word_count": total_word_count,
        "unit_count": unit_total,
        "estimated_minutes": estimated_minutes,
        "clarity_score": clarity_score,
        "consistency_score": consistency_score,
        "topic_fit_score": topic_fit_score,
        "overall_score": overall_score,
        "preview": extracted_text[:280],
        "notes": notes,
        "summary": summary,
        "error": None,
    }


def build_material_feedback(script: str, materials: list[dict[str, Any]]) -> dict[str, Any]:
    if not materials:
        return {
            "uploaded": False,
            "files": [],
            "estimated_minutes": max(1.0, round(len(tokenize(script)) / 130.0, 1)),
            "clarity_score": 0,
            "consistency_score": 0,
            "topic_fit_score": 0,
            "overall_score": 0,
            "summary": "발표 자료가 업로드되지 않았습니다.",
            "notes": [],
        }

    valid_files = [item for item in materials if not item.get("error")]
    estimated_minutes = max((item.get("estimated_minutes", 0) for item in valid_files), default=0.0)
    if not estimated_minutes:
        estimated_minutes = max(1.0, round(len(tokenize(script)) / 130.0, 1))

    if valid_files:
        clarity_score = round(sum(item["clarity_score"] for item in valid_files) / len(valid_files))
        consistency_score = round(sum(item["consistency_score"] for item in valid_files) / len(valid_files))
        topic_fit_score = round(sum(item["topic_fit_score"] for item in valid_files) / len(valid_files))
        overall_score = round(sum(item["overall_score"] for item in valid_files) / len(valid_files))
    else:
        clarity_score = consistency_score = topic_fit_score = overall_score = 0

    summary = " / ".join(item["summary"] for item in valid_files[:3]) if valid_files else "업로드된 자료를 해석하지 못했습니다."
    notes = [note for item in valid_files for note in item.get("notes", [])][:8]

    return {
        "uploaded": True,
        "files": materials,
        "estimated_minutes": estimated_minutes,
        "clarity_score": clarity_score,
        "consistency_score": consistency_score,
        "topic_fit_score": topic_fit_score,
        "overall_score": overall_score,
        "summary": summary,
        "notes": notes,
    }


def build_heuristic_report(session: SessionState, transcript: str) -> dict[str, Any]:
    samples = session.samples
    last_sample = samples[-1] if samples else None
    script_tokens = set(tokenize(session.script))
    transcript_tokens = tokenize(transcript)
    transcript_set = set(transcript_tokens)
    overlap = len(script_tokens & transcript_set) / len(script_tokens) if script_tokens else 0
    material_feedback = build_material_feedback(session.script, session.materials)

    elapsed = last_sample.elapsed_seconds if last_sample else 0
    total_silence = last_sample.silence_seconds if last_sample else 0
    longest_silence = max([sample.longest_silence_seconds for sample in samples], default=0)
    pause_ratio = last_sample.pause_ratio if last_sample and last_sample.pause_ratio else (
        total_silence / elapsed if elapsed else 0
    )

    syllables = last_sample.syllables_spoken if last_sample and last_sample.syllables_spoken else count_syllables(transcript)
    speech_rate = last_sample.syllables_per_second if last_sample and last_sample.syllables_per_second else (
        syllables / elapsed if elapsed else 0
    )
    articulation_seconds = max(1, elapsed - total_silence)
    articulation_rate = (
        last_sample.articulation_syllables_per_second
        if last_sample and last_sample.articulation_syllables_per_second
        else syllables / articulation_seconds
    )
    rate_gap = max(0, articulation_rate - speech_rate)

    wpms = [sample.words_per_minute for sample in samples if sample.words_per_minute > 0]
    avg_wpm = mean(wpms) if wpms else 0
    sps_samples = [sample.syllables_per_second for sample in samples if sample.syllables_per_second > 0]
    rate_variability = pstdev(sps_samples) if len(sps_samples) > 1 else 0
    slow_sample_ratio = (
        len([value for value in sps_samples if value < 5.0]) / len(sps_samples)
        if sps_samples
        else 0
    )

    reaction_counts: dict[str, int] = {}
    for sample in samples:
        reaction_counts[sample.reaction] = reaction_counts.get(sample.reaction, 0) + 1

    pace_score = score_distance(speech_rate, 6.0, 1.2)
    pause_score = score_distance(pause_ratio, 0.15, 0.12)
    if pause_ratio >= 0.25:
        pause_score = min(pause_score, 55)
    gap_score = score_distance(rate_gap, 1.1, 0.9)
    rhythm_score = clamp(100 - rate_variability * 22 - slow_sample_ratio * 35, 35, 100)
    match_score = overlap * 100
    script_score = script_quality(session.script)["score"]
    overall = round(
        clamp(
            pace_score * 0.24
            + pause_score * 0.24
            + gap_score * 0.12
            + rhythm_score * 0.12
            + script_score * 0.16
            + match_score * 0.12,
            0,
            100,
        )
    )

    strengths = []
    improvements = []
    if 5.6 <= speech_rate <= 6.3:
        strengths.append("논문에서 전달력 높은 말하기로 제시된 보통 발화 속도(초당 약 6음절)에 가깝습니다.")
    elif speech_rate < 5.0:
        improvements.append("인식된 발화 속도가 느린 편입니다. 긴 침묵을 줄이고 다음 의미 단위로 자연스럽게 이어가 보세요.")
    else:
        improvements.append("발화 속도가 빠른 편입니다. 핵심어 앞뒤에서 짧게 쉬어 청중이 정보를 처리할 시간을 주세요.")

    if 0.10 <= pause_ratio <= 0.20:
        strengths.append("전체 발화 중 휴지 비율이 논문에서 제시한 전달력 높은 말하기의 범위에 가깝습니다.")
    elif pause_ratio >= 0.25:
        improvements.append("휴지 비율이 25% 이상이면 전달력이 떨어질 수 있습니다. 멈춤을 줄이고 의미 단위별로 끊어 말해보세요.")
    else:
        improvements.append("휴지가 너무 적으면 정보가 밀려 들릴 수 있습니다. 중요한 문장 뒤에는 짧은 쉼을 넣어보세요.")

    if rate_gap <= 1.3:
        strengths.append("말 속도와 조음 속도의 차이가 크지 않아 흐름이 비교적 안정적입니다.")
    else:
        improvements.append("말하는 구간 자체는 괜찮지만 침묵 때문에 전체 속도가 느려집니다. 준비된 연결 문장을 활용해보세요.")

    if rate_variability > 1.2 or slow_sample_ratio > 0.35:
        improvements.append("구간별 속도 변동이 큽니다. 한 문장 안에서는 일정한 리듬을 유지하고 문장 끝에서만 쉬어보세요.")
    if overlap <= 0.55:
        improvements.append("대본의 핵심 키워드를 더 명확히 말하면 메시지 일관성과 전달력이 좋아집니다.")

    quality = script_quality(session.script)
    improvements.extend(quality["suggestions"])
    issue_log = build_issue_log(session, transcript)
    keyword_feedback = build_keyword_feedback(session.script, transcript)

    report = {
        "overall_score": overall,
        "pace": {
            "average_wpm": round(avg_wpm, 1),
            "syllables_per_second": round(speech_rate, 2),
            "articulation_syllables_per_second": round(articulation_rate, 2),
            "speech_articulation_gap": round(rate_gap, 2),
            "target_range": "5.6-6.3 syllables/sec",
            "score": round(clamp(pace_score, 0, 100)),
        },
        "silence": {
            "total_seconds": round(total_silence, 1),
            "longest_seconds": round(longest_silence, 1),
            "pause_ratio_percent": round(pause_ratio * 100, 1),
            "target_ratio_percent": "around 15",
            "risk_ratio_percent": "25+",
            "score": round(clamp(pause_score, 0, 100)),
        },
        "rhythm": {
            "rate_variability": round(rate_variability, 2),
            "slow_sample_ratio_percent": round(slow_sample_ratio * 100, 1),
            "score": round(rhythm_score),
        },
        "script": quality,
        "delivery_match": {
            "similarity_percent": round(overlap * 100),
            "spoken_words": len(transcript_tokens),
            "spoken_syllables": syllables,
        },
        "keyword_feedback": keyword_feedback,
        "criteria_basis": presentation_criteria(),
        "presentation_material": material_feedback,
        "reference_video": session.reference_video,
        "audience_reactions": reaction_counts,
        "strengths": strengths[:4] or ["리허설 데이터를 안정적으로 수집했습니다."],
        "improvements": improvements[:6],
        "issue_log": issue_log,
        "summary": (
            "신지영(2013)의 운율 중심 전달력 연구를 반영해 속도, 휴지 비율, 조음-말속도 차이, "
            "리듬 안정성과 대본 핵심어 반영도를 함께 분석했습니다."
        ),
        "used_gemini": False,
    }
    if material_feedback.get("uploaded"):
        report["summary"] = f"{report['summary']} 업로드된 발표자료를 함께 분석해 예상 시간과 시인성도 반영했습니다."
    if session.reference_video:
        report["reference_comparison"] = build_reference_comparison(report, session.reference_video)
    report["detailed_feedback"] = build_detailed_feedback(report, issue_log)

    if session.reference_video:
        report["reference_video"] = session.reference_video
        report["reference_comparison"] = build_reference_comparison(report, session.reference_video)

    return report


def build_reference_comparison(report: dict[str, Any], reference_video: dict[str, Any]) -> dict[str, Any]:
    pace = report["pace"]["syllables_per_second"]
    pause_ratio = report["silence"]["pause_ratio_percent"]
    script = report.get("script", {})
    average_sentence_words = script.get("average_sentence_words", 0)
    profile = reference_video.get("reference_profile") or {}
    reference_pace = profile.get("syllables_per_second")
    reference_sentence_words = profile.get("average_sentence_words")
    reference_keywords = profile.get("top_keywords") or []
    notes = []

    if reference_pace:
        pace_gap = pace - reference_pace
        if pace_gap < -0.7:
            notes.append(f"말하기 속도: 기준 영상은 초당 {reference_pace}음절 정도입니다. 지금은 조금 느려서 문장 사이 이동을 더 자연스럽게 이어보세요.")
        elif pace_gap > 0.7:
            notes.append(f"말하기 속도: 기준 영상은 초당 {reference_pace}음절 정도입니다. 지금은 더 빨라서 핵심어 앞뒤에서 속도를 낮춰보세요.")
        else:
            notes.append("말하기 속도: 기준 영상의 발화 속도와 꽤 가까운 편입니다.")
    elif pace < 5.6:
        notes.append("말하기 속도: 기준 범위에 비해 느린 편입니다. 다음 문장으로 넘어가는 속도를 조금 높여보세요.")
    elif pace > 6.3:
        notes.append("말하기 속도: 기준 범위에 비해 빠른 편입니다. 핵심어 앞뒤에서 속도를 낮춰보세요.")
    else:
        notes.append("말하기 속도: 정보 전달 발표로 보기 좋은 범위에 들어왔습니다.")

    if reference_sentence_words:
        sentence_gap = average_sentence_words - reference_sentence_words
        if sentence_gap > 6:
            notes.append(f"화법: 기준 영상은 문장당 평균 {reference_sentence_words}단어 흐름입니다. 지금 대본은 더 길어서 의미 단위를 나눠 말하면 비슷해집니다.")
        elif sentence_gap < -6:
            notes.append(f"화법: 기준 영상은 문장당 평균 {reference_sentence_words}단어 흐름입니다. 지금은 너무 짧게 끊겨 설명이 단편적으로 들릴 수 있습니다.")
        else:
            notes.append("화법: 문장 길이와 설명 흐름이 기준 영상과 비슷한 편입니다.")
    elif average_sentence_words > 24:
        notes.append("화법: 한 문장이 길어 설명이 무겁게 들릴 수 있습니다. 짧은 의미 단위로 나눠 말해보세요.")
    else:
        notes.append("화법: 문장 길이가 비교적 안정적이라 차분한 설명형 화법으로 다듬기 좋습니다.")

    if pause_ratio > 25:
        notes.append("쉬는 타이밍: 전체 침묵 비율이 높은 편입니다. 기준 영상처럼 의미 단위 뒤에 짧게만 쉬어보세요.")
    elif pause_ratio < 8:
        notes.append("쉬는 타이밍: 쉬는 구간이 적어 정보가 붙어서 들릴 수 있습니다. 핵심 문장 뒤에 짧은 여백을 주세요.")
    else:
        notes.append("쉬는 타이밍: 발표 흐름 안에 적당한 여백이 있어 기준 영상과 비교하기 좋은 상태입니다.")

    if reference_keywords:
        notes.append(f"강조 방식: 기준 영상은 {', '.join(reference_keywords[:5])} 같은 핵심어가 두드러집니다. 내 발표에서도 강조할 단어를 3개 정도 고정해보세요.")
    else:
        notes.append("강조 방식: 핵심어 앞뒤에서 속도를 조금 늦추고 반복 표현을 사용하면 메시지가 더 선명해집니다.")

    return {
        "title": reference_video.get("title", "기준 발표 영상"),
        "author_name": reference_video.get("author_name", "YouTube"),
        "targets": ["말하기 속도", "화법", "쉬는 타이밍", "강조 방식"],
        "notes": notes[:4],
        "reference_profile": profile or None,
        "analysis_note": reference_video.get("analysis_note"),
    }


def build_reference_comparison(report: dict[str, Any], reference_video: dict[str, Any]) -> dict[str, Any]:
    pace = report["pace"]["syllables_per_second"]
    pause_ratio = report["silence"]["pause_ratio_percent"]
    script = report.get("script", {})
    average_sentence_words = script.get("average_sentence_words", 0)
    benchmark_targets = reference_video.get("benchmark_targets") or {}
    notes = []

    if pace < 5.6:
        notes.append("말하기 속도가 조금 느립니다. 기준 영상처럼 문장 사이 이동을 더 부드럽게 이어 보세요.")
    elif pace > 6.3:
        notes.append("말하기 속도가 조금 빠릅니다. 핵심어 앞뒤에서 속도를 낮춰 보세요.")
    else:
        notes.append("말하기 속도는 기준 영상과 비교하기 좋은 범위입니다.")

    if average_sentence_words > 24:
        notes.append("문장이 길어 설명이 무거워질 수 있습니다. 의미 단위로 나눠 말해 보세요.")
    else:
        notes.append("문장 길이는 비교적 안정적이라 기준 영상의 설명 흐름과 비교하기 좋습니다.")

    if pause_ratio > 25:
        notes.append("쉬는 구간이 많은 편입니다. 의미 단위 뒤에만 짧게 쉬어 보세요.")
    elif pause_ratio < 8:
        notes.append("쉬는 구간이 적습니다. 핵심 문장 뒤에 짧은 여백을 주세요.")
    else:
        notes.append("쉬는 타이밍이 비교적 안정적입니다.")

    return {
        "title": reference_video.get("title", "기준 발표 영상"),
        "author_name": reference_video.get("author_name", "YouTube"),
        "targets": list(benchmark_targets.keys()) or ["말하기 속도", "화법", "쉬는 타이밍", "강조 방식"],
        "notes": notes[:4],
        "analysis_note": reference_video.get("analysis_note"),
        "reference_profile": reference_video.get("reference_profile"),
    }


async def ask_gemini_for_report(session: SessionState, fallback_report: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return fallback_report

    allowed, retry_after, remaining = gemini_limiter.allow()
    if not allowed:
        fallback_report["summary"] = (
            "Gemini 호출 한도에 도달해 기본 분석으로 대체했습니다. "
            f"잠시 후 다시 시도하면 AI 분석을 사용할 수 있습니다. (다음 시도 가능: 약 {retry_after:.0f}초 후)"
        )
        fallback_report["used_gemini"] = False
        fallback_report["gemini_limits"] = {
            "rate_limited": True,
            "retry_after_seconds": round(retry_after, 1),
            "remaining_calls": remaining,
        }
        return fallback_report

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    prompt = {
        "instruction": "You are a Korean presentation coach. Return strict JSON only and preserve the provided criteria_basis.",
        "script": session.script,
        "reference_video": session.reference_video,
        "samples": [sample.model_dump() for sample in session.samples[-80:]],
        "heuristic_report": fallback_report,
        "required_schema": {
            "overall_score": "number 0-100",
            "summary": "Korean paragraph with concrete evaluation",
            "strengths": ["Korean bullet"],
            "improvements": ["Korean bullet"],
            "pace": fallback_report["pace"],
            "silence": fallback_report["silence"],
            "rhythm": fallback_report["rhythm"],
            "script": fallback_report["script"],
            "delivery_match": fallback_report["delivery_match"],
            "keyword_feedback": fallback_report["keyword_feedback"],
            "issue_log": fallback_report["issue_log"],
            "detailed_feedback": fallback_report["detailed_feedback"],
            "criteria_basis": fallback_report["criteria_basis"],
            "presentation_material": fallback_report.get("presentation_material", {}),
            "reference_video": fallback_report.get("reference_video"),
            "reference_comparison": fallback_report.get("reference_comparison"),
            "audience_reactions": fallback_report["audience_reactions"],
            "reference_video": fallback_report.get("reference_video"),
            "reference_comparison": fallback_report.get("reference_comparison"),
        },
    }

    payload = {
        "contents": [{"parts": [{"text": json.dumps(prompt, ensure_ascii=False)}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, params={"key": api_key}, json=payload)
            response.raise_for_status()
            data = response.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            report = json.loads(text)
            report["used_gemini"] = True
            return report
    except Exception:
        fallback_report["summary"] = "AI 리포트를 생성하지 못해 기본 분석 리포트로 정리했습니다. 발표 흐름과 전달력 판단에는 저장된 연습 데이터가 사용되었습니다."
        return fallback_report


async def ask_gemini_for_report_v2(session: SessionState, fallback_report: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return fallback_report

    prompt = {
        "instruction": "You are a Korean presentation coach. Return strict JSON only and preserve the provided criteria_basis.",
        "script": session.script,
        "reference_video": session.reference_video,
        "samples": [sample.model_dump() for sample in session.samples[-80:]],
        "heuristic_report": fallback_report,
        "required_schema": {
            "overall_score": "number 0-100",
            "summary": "Korean paragraph with concrete evaluation",
            "strengths": ["Korean bullet"],
            "improvements": ["Korean bullet"],
            "pace": fallback_report["pace"],
            "silence": fallback_report["silence"],
            "rhythm": fallback_report["rhythm"],
            "script": fallback_report["script"],
            "delivery_match": fallback_report["delivery_match"],
            "keyword_feedback": fallback_report["keyword_feedback"],
            "issue_log": fallback_report["issue_log"],
            "detailed_feedback": fallback_report["detailed_feedback"],
            "criteria_basis": fallback_report["criteria_basis"],
            "presentation_material": fallback_report.get("presentation_material", {}),
            "reference_video": fallback_report.get("reference_video"),
            "reference_comparison": fallback_report.get("reference_comparison"),
            "audience_reactions": fallback_report["audience_reactions"],
        },
    }
    payload = {
        "contents": [{"parts": [{"text": json.dumps(prompt, ensure_ascii=False)}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }

    try:
        data, remaining = await call_gemini_api(
            kind="final_report",
            payload=payload,
            timeout_seconds=20,
            count_against_limit=True,
            retry_on_unavailable=2,
        )
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        report = json.loads(text)
        report["used_gemini"] = True
        report["gemini_limits"] = {
            "rate_limited": False,
            "remaining_calls": remaining,
        }
        return report
    except GeminiRateLimitError as exc:
        fallback_report["summary"] = (
            "Gemini 호출 한도에 도달해 기본 분석으로 대체했습니다. "
            f"잠시 후 다시 시도하면 AI 분석을 사용할 수 있습니다. (다음 시도 가능: 약 {exc.retry_after:.0f}초 후)"
        )
        fallback_report["used_gemini"] = False
        fallback_report["gemini_limits"] = {
            "rate_limited": True,
            "retry_after_seconds": round(exc.retry_after, 1),
            "remaining_calls": exc.remaining,
        }
        return fallback_report
    except Exception:
        fallback_report["summary"] = "AI 리포트를 생성하지 못해 기본 분석 리포트로 정리했습니다. 발표 흐름과 전달력 평가는 로컬 분석 결과를 사용했습니다."
        fallback_report["used_gemini"] = False
        return fallback_report


@app.get("/api/ai/status")
async def ai_status(probe: bool = False) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    if not api_key:
        return {
            "configured": False,
            "live": False,
            "model": model,
            "message": "GEMINI_API_KEY가 비어 있어 로컬 분석만 사용합니다.",
        }

    if not probe:
        return {
            "configured": True,
            "live": gemini_runtime_state.get("last_live"),
            "model": model,
            "cached": False,
            "checked_live": False,
            "remaining_calls": gemini_limiter.remaining(),
            "last_ok_at": gemini_runtime_state.get("last_ok_at"),
            "last_error_at": gemini_runtime_state.get("last_error_at"),
            "last_error_code": gemini_runtime_state.get("last_error_code"),
            "last_error_message": gemini_runtime_state.get("last_error_message"),
            "last_call_kind": gemini_runtime_state.get("last_call_kind"),
            "message": "Gemini API 키가 설정되어 있습니다. 실제 외부 호출은 분석이 실행될 때만 진행됩니다.",
        }

    now = time.monotonic()
    cached = ai_status_cache.get("payload")
    cached_at = float(ai_status_cache.get("checked_at") or 0.0)
    if cached and now - cached_at < GEMINI_STATUS_CACHE_SECONDS:
        return {**cached, "cached": True}

    allowed, retry_after, remaining = gemini_limiter.allow()
    if not allowed:
        return {
            "configured": True,
            "live": False,
            "model": model,
            "cached": True,
            "rate_limited": True,
            "remaining_calls": remaining,
            "retry_after_seconds": round(retry_after, 1),
            "message": f"Gemini 상태 확인이 너무 자주 요청되어 캐시된 상태를 반환합니다. 약 {retry_after:.0f}초 후 다시 확인하세요.",
        }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": "Return the single word OK."}]}],
        "generationConfig": {"maxOutputTokens": 8},
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(url, params={"key": api_key}, json=payload)
            response.raise_for_status()
            data = response.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            result = {
                "configured": True,
                "live": bool(text),
                "model": model,
                "rate_limited": False,
                "remaining_calls": remaining,
                "message": "Gemini API 연결이 정상입니다.",
            }
            ai_status_cache["checked_at"] = now
            ai_status_cache["payload"] = result
            return result
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code == 429:
            message = "Gemini API 할당량 또는 요청 제한으로 현재 AI 리포트가 대기 중입니다."
        elif status_code in {401, 403}:
            message = "Gemini API 키 권한을 확인해야 합니다."
        else:
            message = f"Gemini API 연결 확인에 실패했습니다. 상태 코드: {status_code}"
        result = {
            "configured": True,
            "live": False,
            "model": model,
            "rate_limited": False,
            "remaining_calls": remaining,
            "message": message,
        }
        ai_status_cache["checked_at"] = now
        ai_status_cache["payload"] = result
        return result
    except Exception:
        result = {
            "configured": True,
            "live": False,
            "model": model,
            "rate_limited": False,
            "remaining_calls": remaining,
            "message": "Gemini API 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
        }
        ai_status_cache["checked_at"] = now
        ai_status_cache["payload"] = result
        return result

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/script/import", response_model=ImportedScriptResponse)
async def import_script_file(file: UploadFile = File(...)) -> ImportedScriptResponse:
    filename = file.filename or "script"
    content = await file.read()
    if len(content) > MAX_SCRIPT_FILE_BYTES:
        raise HTTPException(status_code=413, detail="10MB 이하의 파일만 불러올 수 있습니다.")

    text, source_type = extract_script_text(filename, content)
    normalized = normalize_imported_text(text)
    if not normalized:
        raise HTTPException(status_code=400, detail="파일에서 읽을 수 있는 대본 내용을 찾지 못했습니다.")

    return ImportedScriptResponse(
        filename=filename,
        text=normalized,
        character_count=len(normalized),
        source_type=source_type,
    )


@app.post("/api/reference/youtube")
async def preview_youtube_reference(payload: dict[str, str]) -> dict[str, Any]:
    reference = await build_reference_video(payload.get("url"))
    if not reference:
        raise HTTPException(status_code=400, detail="YouTube 영상 주소를 입력해 주세요.")
    return reference


@app.post("/api/session/start")
async def start_session(
    script: str = Form(...),
    reference_video_url: str | None = Form(default=None),
    materials: list[UploadFile] | None = File(default=None),
) -> dict[str, Any]:
    session_id = str(uuid4())
    uploaded_blobs: list[dict[str, Any]] = []
    uploaded_materials: list[dict[str, Any]] = []
    for file in (materials or [])[:MAX_PRESENTATION_UPLOAD_FILES]:
        data = await file.read()
        uploaded_blobs.append(
            {
                "filename": file.filename or "material",
                "content_type": file.content_type,
                "data": data,
            }
        )
        uploaded_materials.append(analyze_material_file(script, file.filename or "material", file.content_type, data))
    uploaded_materials = merge_vision_material_feedback(
        uploaded_materials,
        await analyze_materials_with_gemini_vision(script, uploaded_materials, uploaded_blobs),
    )
    reference_video = await build_reference_video(reference_video_url)

    session = SessionState(
        id=session_id,
        script=script.strip(),
        created_at=datetime.now(timezone.utc).isoformat(),
        materials=uploaded_materials,
        reference_video=reference_video,
    )
    sessions[session_id] = session
    material_feedback = build_material_feedback(session.script, session.materials)
    return {
        "session_id": session_id,
        "script_feedback": script_quality(session.script),
        "criteria_basis": presentation_criteria(),
        "presentation_material": material_feedback,
        "reference_video": reference_video,
        "gemini_ready": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "upload_count": len(uploaded_materials),
    }

@app.post("/api/session/{session_id}/metric")
def add_metric(session_id: str, sample: MetricSample) -> dict[str, str]:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.samples.append(sample)
    return {"status": "stored"}


@app.post("/api/session/{session_id}/finish")
async def finish_session(session_id: str, request: FinishSessionRequest) -> dict[str, Any]:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    transcript = request.transcript or (session.samples[-1].transcript if session.samples else "")
    fallback = build_heuristic_report(session, transcript)
    return await ask_gemini_for_report_v2(session, fallback)
