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
    report["detailed_feedback"] = build_detailed_feedback(report, issue_log)
    return report


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
