import asyncio
import base64
import json
import mimetypes
import os
import re
import tempfile
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException

from ..config import get_gemini_model
from .gemini_service import call_gemini_api
from .text_service import count_syllables, tokenize


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
        "title": "레퍼런스 발표 영상",
        "author_name": "YouTube",
        "thumbnail_url": "https://i.ytimg.com/vi/NN4GVaBvroE/hqdefault.jpg",
        "reference_profile": {
            "transcript_source": "youtube_caption_hardcoded",
            "duration_seconds": 2580,
            "word_count": 5633,
            "syllables_per_second": 5.79,
            "words_per_minute": 131.0,
            "average_sentence_words": 8.4,
            "tone": "설명형 해설 톤",
            "speaking_style": "데이터 제시 뒤 해석을 덧붙이는 설명형 발표",
            "pause_timing_summary": "핵심 숫자와 사례 설명 뒤에 짧은 멈춤을 둡니다.",
            "emphasis_summary": "숫자, 고유명사, 핵심 키워드를 반복하며 강조합니다.",
            "top_keywords": ["코스피", "변동성", "시장", "지수", "투자"],
            "speech_rate_summary": "빠르지만 이해 가능한 해설형 속도입니다.",
            "word_choice_summary": "전문 용어와 쉬운 설명을 섞어 전달합니다.",
        },
        "benchmark_targets": {
            "speech_rate": "초당 5.79음절 정도의 설명형 속도를 기준으로 비교합니다.",
            "speaking_style": "데이터 제시 후 해석을 이어가는 설명 흐름을 기준으로 비교합니다.",
            "pause_timing": "핵심 숫자나 사례 설명 직후 잠깐 쉬는 패턴을 봅니다.",
            "emphasis": "반복되는 핵심어와 숫자 강조를 중심으로 봅니다.",
        },
        "analysis_note": "하드코딩된 기준 발표 프로필을 사용하고 있습니다.",
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
            "speech_rate": "기준 영상처럼 이해 가능한 말하기 속도를 목표로 봅니다.",
            "speaking_style": "기준 발표와 비슷하게 설명 흐름이 자연스러운지 봅니다.",
            "pause_timing": "중요한 문장 뒤에 짧은 멈춤이 들어가는지 봅니다.",
            "emphasis": "핵심 단어를 분명하게 강조하는지 봅니다.",
        },
        "analysis_note": "YouTube URL을 기준 발표로 등록했습니다.",
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

    missing_gemini_key = not os.getenv("GEMINI_API_KEY", "").strip()
    audio_profile = await analyze_youtube_audio_reference(clean_url)
    if audio_profile:
        reference["reference_profile"] = audio_profile
        reference["benchmark_targets"] = build_reference_benchmark_targets(audio_profile, "음성")
        reference["analysis_note"] = "YouTube 음성을 분석해 기준 프로필을 만들었습니다."
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
            reference["analysis_note"] = "YouTube 자막을 기준으로 발표 프로필을 만들었습니다."
    except Exception:
        if missing_gemini_key:
            reference["analysis_note"] = "GEMINI_API_KEY가 없어 음성 분석을 실행하지 못했고 기본 기준으로 설정했습니다."
        elif "메타데이터" in reference["analysis_note"]:
            reference["analysis_note"] = "YouTube 오디오나 자막을 가져오지 못해 기본 기준으로 설정했습니다."

    return reference


def build_reference_benchmark_targets(profile: dict[str, Any], source_label: str) -> dict[str, str]:
    pace = profile.get("syllables_per_second") or 0
    top_keywords = profile.get("top_keywords") or []
    keywords_text = ", ".join(top_keywords[:5]) if top_keywords else "핵심 키워드"
    return {
        "speech_rate": f"{source_label} 기준 초당 {pace}음절 정도의 속도를 비교합니다.",
        "speaking_style": f"기준 발표의 화법은 '{profile.get('speaking_style') or profile.get('tone', '설명형 발표')}' 입니다.",
        "pause_timing": profile.get("pause_timing_summary") or "문장 전환 뒤 잠시 쉬는지 봅니다.",
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
        prompt = """
You are a Korean presentation speech analyst.
Analyze the attached YouTube audio as the reference speaker.
Return strict JSON only.
Focus only on speech rate, speaking style, pause timing, and emphasis style.
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
    sentence_count = max(1, len(re.findall(r"[.!?]+", transcript)))
    keyword_stopwords = {
        "그리고", "그래서", "하지만", "저는", "제가", "우리", "여러분", "이제", "그럼",
        "있는", "합니다", "입니다", "the", "and", "that", "this",
    }
    counts: dict[str, int] = {}
    for word in words:
        if len(word) < 2 or word in keyword_stopwords:
            continue
        counts[word] = counts.get(word, 0) + 1
    top_keywords = sorted(counts, key=lambda word: (-counts[word], word))[:8]
    average_sentence_words = len(words) / sentence_count if words else 0

    if average_sentence_words > 24:
        tone = "긴 문장 위주의 설명형 말투"
    elif average_sentence_words < 8:
        tone = "짧고 빠르게 끊는 말투"
    else:
        tone = "설명과 해설이 섞인 안정형 말투"

    pace = round(syllables / duration_seconds, 2) if duration_seconds else 0
    wpm = round(len(words) / duration_seconds * 60, 1) if duration_seconds else 0
    return {
        "transcript_source": "youtube_caption",
        "duration_seconds": round(duration_seconds, 1),
        "word_count": len(words),
        "syllables_per_second": pace,
        "words_per_minute": wpm,
        "average_sentence_words": round(average_sentence_words, 1),
        "tone": tone,
        "speaking_style": "자막 기반 기준 발표 화법",
        "pause_timing_summary": "자막 기준 분석이라 실제 침묵 길이는 제한적으로만 판단합니다.",
        "emphasis_summary": "반복되는 핵심 단어와 문장 앞쪽 강조 표현을 중심으로 봅니다.",
        "top_keywords": top_keywords,
        "speech_rate_summary": f"자막 기준 초당 {pace}음절, 분당 {wpm}단어 정도입니다." if duration_seconds else "",
        "word_choice_summary": "반복 단어와 설명 문장 비율을 함께 참고합니다.",
    }


def build_reference_comparison(report: dict[str, Any], reference_video: dict[str, Any]) -> dict[str, Any]:
    pace = report["pace"]["syllables_per_second"]
    pause_ratio = report["silence"]["pause_ratio_percent"]
    script = report.get("script", {})
    average_sentence_words = script.get("average_sentence_words", 0)
    benchmark_targets = reference_video.get("benchmark_targets") or {}
    notes = []

    if pace < 5.6:
        notes.append("말하기 속도가 조금 느립니다. 문장 사이 이동을 더 부드럽게 이어보세요.")
    elif pace > 6.3:
        notes.append("말하기 속도가 조금 빠릅니다. 핵심 단어 앞뒤에서 속도를 낮춰보세요.")
    else:
        notes.append("말하기 속도는 기준 영상과 비교하기 좋은 범위입니다.")

    if average_sentence_words > 24:
        notes.append("문장이 길어 설명이 무겁게 들릴 수 있습니다. 의미 단위로 나눠 말해보세요.")
    else:
        notes.append("문장 길이는 비교적 안정적입니다.")

    if pause_ratio > 25:
        notes.append("쉬는 구간이 많은 편입니다. 문장 단위 쉼만 남기고 긴 침묵은 줄여보세요.")
    elif pause_ratio < 8:
        notes.append("쉬는 구간이 적습니다. 전환 문장 뒤에 짧은 호흡을 넣어보세요.")
    else:
        notes.append("쉬는 타이밍은 비교적 안정적입니다.")

    return {
        "title": reference_video.get("title", "기준 발표 영상"),
        "author_name": reference_video.get("author_name", "YouTube"),
        "targets": list(benchmark_targets.keys()) or ["말하기 속도", "화법", "쉬는 타이밍", "강조 방식"],
        "notes": notes[:4],
        "analysis_note": reference_video.get("analysis_note"),
        "reference_profile": reference_video.get("reference_profile"),
    }
