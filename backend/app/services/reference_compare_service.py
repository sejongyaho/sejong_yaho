from statistics import mean

from ..models import MetricSample
from .reference_profile import REFERENCE_SPEAKER_PROFILE


def diff_percent(user_value: float, reference_value: float) -> float:
    if reference_value == 0:
        return 0
    return round(((user_value - reference_value) / reference_value) * 100, 1)


def compare_density(user_density: float, ref_density: float, section_label: str) -> str:
    diff = user_density - ref_density

    if diff >= 7:
        return f"{section_label}에서 기준 발표자보다 말 밀도가 높습니다. 청중이 따라가기 어려울 수 있어요."
    if diff <= -7:
        return f"{section_label}에서 기준 발표자보다 말 밀도가 낮습니다. 발표가 다소 느슨하게 느껴질 수 있어요."
    return f"{section_label}의 말 밀도는 기준 발표자와 비슷한 편입니다."


def compare_pause(user_pause: float, ref_pause: float, section_label: str) -> str:
    diff = user_pause - ref_pause

    if diff <= -0.2:
        return f"{section_label}에서 쉼이 기준보다 짧습니다. 핵심 문장 뒤에 0.5~1초 정도 멈추면 좋아요."
    if diff >= 0.3:
        return f"{section_label}에서 쉼이 기준보다 깁니다. 너무 자주 멈추면 흐름이 끊길 수 있어요."
    return f"{section_label}의 쉼 길이는 기준 발표자와 비슷합니다."


def _pause_events(samples: list[MetricSample]) -> list[tuple[float, float]]:
    events: list[tuple[float, float]] = []
    previous_silence = 0.0
    for sample in sorted(samples, key=lambda item: item.elapsed_seconds):
        delta = sample.silence_seconds - previous_silence
        if delta > 0.05:
            events.append((sample.elapsed_seconds, delta))
        previous_silence = max(previous_silence, sample.silence_seconds)
    return events


def _samples_in_range(samples: list[MetricSample], start: float, end: float) -> list[MetricSample]:
    return [sample for sample in samples if start <= sample.elapsed_seconds <= end]


def _events_in_range(events: list[tuple[float, float]], start: float, end: float) -> list[float]:
    return [duration for elapsed, duration in events if start <= elapsed <= end]


def _average_density(samples: list[MetricSample]) -> float:
    values = [sample.words_per_minute for sample in samples if sample.words_per_minute > 0]
    return round(mean(values), 1) if values else 0


def _average_pause(events: list[float]) -> float:
    return round(mean(events), 2) if events else 0


def build_user_profile_from_samples(samples: list[MetricSample]) -> dict:
    valid_samples = [sample for sample in samples if sample.elapsed_seconds >= 0]
    if not valid_samples:
        return {}

    ordered = sorted(valid_samples, key=lambda item: item.elapsed_seconds)
    duration = ordered[-1].elapsed_seconds if ordered else 0
    events_with_time = _pause_events(ordered)
    pause_values = [duration for _, duration in events_with_time]
    volume_values = [sample.volume for sample in ordered if sample.volume > 0]

    sections = {
        "intro": (0, duration * 0.2),
        "body": (duration * 0.2, duration * 0.8),
        "ending": (duration * 0.8, duration),
    }

    normalized_sections = {}
    for key, (start, end) in sections.items():
        section_samples = _samples_in_range(ordered, start, end)
        section_events = _events_in_range(events_with_time, start, end)
        normalized_sections[key] = {
            "speech_density": _average_density(section_samples),
            "avg_pause_sec": _average_pause(section_events),
            "pause_count": len(section_events),
        }

    return {
        "speech_density_avg": _average_density(ordered),
        "avg_pause_sec": _average_pause(pause_values),
        "long_pause_count_ge_1s": len([value for value in pause_values if value >= 1.0]),
        "long_pause_count_ge_1_5s": len([value for value in pause_values if value >= 1.5]),
        "volume_variation_db": round(max(volume_values) - min(volume_values), 1) if len(volume_values) > 1 else 0,
        "normalized_sections": normalized_sections,
    }


def compare_with_reference(user_profile: dict) -> dict:
    ref = REFERENCE_SPEAKER_PROFILE
    feedback = []

    user_density = user_profile.get("speech_density_avg", 0)
    ref_density = ref["speech_density_avg"]
    density_diff = diff_percent(user_density, ref_density)

    if user_density > ref_density + 7:
        feedback.append("전체적으로 기준 발표자보다 말이 더 빽빽합니다. 정보량이 많아 청중 피로도가 올라갈 수 있어요.")
    elif user_density < ref_density - 7:
        feedback.append("전체적으로 기준 발표자보다 말 밀도가 낮습니다. 설명이 여유롭지만 긴장감이 떨어질 수 있어요.")
    else:
        feedback.append("전체 말 밀도는 기준 발표자와 비슷합니다.")

    user_pause = user_profile.get("avg_pause_sec", 0)
    ref_pause = ref["avg_pause_sec"]

    if user_pause < ref_pause - 0.2:
        feedback.append("평균 쉼이 기준보다 짧습니다. 핵심 문장 뒤에 잠깐 멈추는 연습이 필요합니다.")
    elif user_pause > ref_pause + 0.3:
        feedback.append("평균 쉼이 기준보다 깁니다. 발표 흐름이 끊기지 않도록 주의하세요.")
    else:
        feedback.append("평균 쉼은 기준 발표자와 비슷한 수준입니다.")

    section_feedback = []
    for key in ["intro", "body", "ending"]:
        user_section = user_profile.get("normalized_sections", {}).get(key, {})
        ref_section = ref["normalized_sections"][key]
        section_label = ref_section["label"]
        user_section_density = user_section.get("speech_density", 0)
        ref_section_density = ref_section["speech_density"]
        user_section_pause = user_section.get("avg_pause_sec", 0)
        ref_section_pause = ref_section["avg_pause_sec"]

        section_feedback.append(
            {
                "section": key,
                "label": section_label,
                "density_feedback": compare_density(user_section_density, ref_section_density, section_label),
                "pause_feedback": compare_pause(user_section_pause, ref_section_pause, section_label),
                "user": {
                    "speech_density": user_section_density,
                    "avg_pause_sec": user_section_pause,
                    "pause_count": user_section.get("pause_count", 0),
                },
                "reference": {
                    "speech_density": ref_section_density,
                    "avg_pause_sec": ref_section_pause,
                    "pause_count": ref_section["pause_count"],
                },
            }
        )

    density_score = max(0, 100 - abs(user_density - ref_density) * 3)
    pause_score = max(0, 100 - abs(user_pause - ref_pause) * 80)
    similarity_score = round((density_score * 0.6) + (pause_score * 0.4), 1)

    return {
        "reference": {
            "name": ref["reference_name"],
            "style_type": ref["style_type"],
            "description": ref["description"],
        },
        "summary": {
            "similarity_score": similarity_score,
            "density_diff_percent": density_diff,
            "user_speech_density_avg": user_density,
            "reference_speech_density_avg": ref_density,
            "user_avg_pause_sec": user_pause,
            "reference_avg_pause_sec": ref_pause,
            "user_long_pause_count_ge_1s": user_profile.get("long_pause_count_ge_1s", 0),
            "reference_long_pause_count_ge_1s": ref["long_pause_count_ge_1s"],
            "user_volume_variation_db": user_profile.get("volume_variation_db", 0),
            "reference_volume_variation_db": ref["volume_variation_db"],
        },
        "feedback": feedback,
        "section_feedback": section_feedback,
    }
