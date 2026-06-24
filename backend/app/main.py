import json
import os
import re
from datetime import datetime, timezone
from statistics import mean, pstdev
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


class StartSessionRequest(BaseModel):
    script: str = Field(..., min_length=10)


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


class SessionState(BaseModel):
    id: str
    script: str
    created_at: str
    samples: list[MetricSample] = Field(default_factory=list)


app = FastAPI(title="Presentation Practice API")

cors_origins = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, SessionState] = {}


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


def presentation_criteria() -> dict[str, Any]:
    return {
        "source": "신지영, 「소통과 공감을 위한 전달력 높은 말하기의 언어학적 조건(1): 운율적 측면을 중심으로」",
        "core_principle": "정보 전달형 공적 말하기에서는 내용만큼 운율, 속도, 휴지 양상이 전달력에 큰 영향을 준다.",
        "targets": {
            "pause_ratio": "전체 발화 시간 중 휴지 약 15% 전후를 이상적 기준으로 보고, 25% 이상은 전달력 저하 위험으로 본다.",
            "speech_rate": "한국어 기준 보통 발화 속도인 초당 약 5.6-6.3음절을 좋은 전달 속도 범위로 본다.",
            "pause_pattern": "긴 침묵이나 잦은 끊김보다, 의미 단위에 맞춘 적절한 끊어 말하기를 높게 본다.",
            "rhythm": "큰 운율 단위에서 속도 변동이 과도하면 전달력이 낮아질 수 있으므로 안정적인 리듬을 본다.",
        },
        "rubric_items": ["발음", "크기", "속도", "억양", "리듬감", "유창성", "끊어 말하기", "전달력"],
    }


def build_heuristic_report(session: SessionState, transcript: str) -> dict[str, Any]:
    samples = session.samples
    last_sample = samples[-1] if samples else None
    script_tokens = set(tokenize(session.script))
    transcript_tokens = tokenize(transcript)
    transcript_set = set(transcript_tokens)
    overlap = len(script_tokens & transcript_set) / len(script_tokens) if script_tokens else 0

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

    return {
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
        "criteria_basis": presentation_criteria(),
        "audience_reactions": reaction_counts,
        "strengths": strengths[:4] or ["리허설 데이터를 안정적으로 수집했습니다."],
        "improvements": improvements[:6],
        "summary": "신지영(2013)의 운율 중심 전달력 연구를 반영해 속도, 휴지 비율, 조음-말속도 차이, 리듬 안정성을 중심으로 분석했습니다.",
        "used_gemini": False,
    }


async def ask_gemini_for_report(session: SessionState, fallback_report: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return fallback_report

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    prompt = {
        "instruction": "You are a Korean presentation coach. Return strict JSON only and preserve the provided criteria_basis.",
        "script": session.script,
        "samples": [sample.model_dump() for sample in session.samples[-80:]],
        "heuristic_report": fallback_report,
        "required_schema": {
            "overall_score": "number 0-100",
            "summary": "Korean short paragraph",
            "strengths": ["Korean bullet"],
            "improvements": ["Korean bullet"],
            "pace": fallback_report["pace"],
            "silence": fallback_report["silence"],
            "rhythm": fallback_report["rhythm"],
            "script": fallback_report["script"],
            "delivery_match": fallback_report["delivery_match"],
            "criteria_basis": fallback_report["criteria_basis"],
            "audience_reactions": fallback_report["audience_reactions"],
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


@app.get("/api/ai/status")
async def ai_status() -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    if not api_key:
        return {
            "configured": False,
            "live": False,
            "model": model,
            "message": "GEMINI_API_KEY가 비어 있어 로컬 분석만 사용합니다.",
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
            return {
                "configured": True,
                "live": bool(text),
                "model": model,
                "message": "Gemini API 연결이 정상입니다.",
            }
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code == 429:
            message = "Gemini API 할당량 또는 요청 제한으로 현재 AI 리포트가 대기 중입니다."
        elif status_code in {401, 403}:
            message = "Gemini API 키 권한을 확인해야 합니다."
        else:
            message = f"Gemini API 연결 확인에 실패했습니다. 상태 코드: {status_code}"
        return {
            "configured": True,
            "live": False,
            "model": model,
            "message": message,
        }
    except Exception:
        return {
            "configured": True,
            "live": False,
            "model": model,
            "message": "Gemini API 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
        }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/session/start")
def start_session(request: StartSessionRequest) -> dict[str, Any]:
    session_id = str(uuid4())
    session = SessionState(
        id=session_id,
        script=request.script.strip(),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    sessions[session_id] = session
    return {
        "session_id": session_id,
        "script_feedback": script_quality(session.script),
        "criteria_basis": presentation_criteria(),
        "gemini_ready": bool(os.getenv("GEMINI_API_KEY", "").strip()),
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
    return await ask_gemini_for_report(session, fallback)
