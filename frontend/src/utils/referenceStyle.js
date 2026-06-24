export const SELECTED_REFERENCE_STYLE_KEY = "presentation.selectedReferenceStyle.v1";

function fallbackProfileField(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

export function getReferenceSpeakerName(referenceVideo) {
  const title = referenceVideo?.title || "";
  const professorMatch = title.match(/([가-힣]{2,5}\s*교수)/);
  if (professorMatch) return professorMatch[1].replace(/\s+/g, " ").trim();
  return referenceVideo?.author_name || "선택한 레퍼런스";
}

export function buildSelectedReferenceStyle(referenceVideo) {
  const profile = referenceVideo?.reference_profile || {};
  const targets = referenceVideo?.benchmark_targets || {};
  const videoId = referenceVideo?.video_id || globalThis.crypto?.randomUUID?.() || Date.now();

  return {
    id: `ref-${videoId}`,
    title: referenceVideo?.title || `YouTube 영상 ${videoId}`,
    source: "youtube",
    url: referenceVideo?.url || referenceVideo?.embed_url || "",
    speakerName: getReferenceSpeakerName(referenceVideo),
    profile: {
      speechRate: fallbackProfileField(
        profile.speech_rate_summary,
        targets.speech_rate,
        "이해 가능한 말하기 속도",
      ),
      pauseTiming: fallbackProfileField(
        profile.pause_timing_summary,
        targets.pause_timing,
        "중요한 문장 뒤 짧은 멈춤",
      ),
      emphasis: fallbackProfileField(
        profile.emphasis_summary,
        targets.emphasis,
        "핵심 단어를 분명하게 강조",
      ),
      tone: fallbackProfileField(
        profile.speaking_style,
        profile.tone,
        targets.speaking_style,
        "설명 흐름이 자연스러운 화법",
      ),
    },
    selectedAt: new Date().toISOString(),
  };
}

export function loadSelectedReferenceStyle() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SELECTED_REFERENCE_STYLE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSelectedReferenceStyle(referenceStyle) {
  if (typeof window === "undefined") return referenceStyle;
  try {
    window.localStorage.setItem(SELECTED_REFERENCE_STYLE_KEY, JSON.stringify(referenceStyle));
  } catch {
    return referenceStyle;
  }
  return referenceStyle;
}
