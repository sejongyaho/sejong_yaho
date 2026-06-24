import { situationMessages } from "../data/audience";

export function tokenCount(text) {
  return (text.toLowerCase().match(/[가-힣a-z0-9']+/g) || []).length;
}

export function syllableCount(text) {
  const hangul = text.match(/[가-힣]/g) || [];
  const latinWords = text.match(/[a-z0-9']+/gi) || [];
  return hangul.length + latinWords.reduce((total, word) => total + Math.max(1, Math.round(word.length / 3)), 0);
}

export function scriptOverlap(script, transcript) {
  const scriptTokens = new Set(script.toLowerCase().match(/[가-힣a-z0-9']+/g) || []);
  const spokenTokens = new Set(transcript.toLowerCase().match(/[가-힣a-z0-9']+/g) || []);
  if (!scriptTokens.size) return 0;
  let hits = 0;
  scriptTokens.forEach((token) => {
    if (spokenTokens.has(token)) hits += 1;
  });
  return hits / scriptTokens.size;
}

export function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export function formatReferenceStatus(referenceVideo) {
  const profile = referenceVideo?.reference_profile;
  if (!profile) return "분석 기준 준비 중";
  const source = profile.transcript_source || "";
  const sourceLabel = source.includes("caption") ? "자막 기반 전문 분석" : "음성 기반 전문 분석";
  const pace = profile.syllables_per_second ? `초당 ${profile.syllables_per_second}음절` : null;
  const wpm = profile.words_per_minute ? `분당 ${profile.words_per_minute}단어` : null;
  return [sourceLabel, pace, wpm].filter(Boolean).join(" · ");
}

export function getSituation({ elapsed, wordsPerMinute, syllablesPerSecond, silenceStreak, voiceActive, secondsSinceRecognized, overlap, wordsSpoken }) {
  if (elapsed < 6) return "opening";
  if (voiceActive && secondsSinceRecognized > 4) return "unclear";
  if (!voiceActive && wordsSpoken === 0 && elapsed > 18) return "tooSlow";
  if (!voiceActive && wordsSpoken > 2 && silenceStreak >= 8) return "longSilence";
  if (syllablesPerSecond >= 7.4 || wordsPerMinute >= 185) return "tooFast";
  if (elapsed > 16 && !voiceActive && silenceStreak >= 5) return "tooSlow";
  if (elapsed > 16 && wordsSpoken > 6 && syllablesPerSecond > 0 && syllablesPerSecond < 4.5) return "tooSlow";
  if (elapsed > 25 && overlap < 0.16) return "offScript";
  if (elapsed > 12 && syllablesPerSecond >= 5.5 && syllablesPerSecond <= 6.5 && overlap >= 0.38) return "impressed";
  if (syllablesPerSecond >= 4.9 && syllablesPerSecond <= 7.0) return "focused";
  return "opening";
}

export function reactionFromSituation(situation) {
  return situationMessages[situation]?.reaction || "attentive";
}

export function userPaceLabel(syllablesPerSecond) {
  if (!syllablesPerSecond) return "측정 중";
  if (syllablesPerSecond < 5) return "조금 느림";
  if (syllablesPerSecond > 7) return "조금 빠름";
  return "좋은 속도";
}

export function userSilenceLabel(pauseRatio, silenceStreak) {
  if (silenceStreak >= 8) return "침묵 길어짐";
  if (pauseRatio >= 0.25) return "쉬는 시간이 많음";
  return "안정적";
}

export function userDeliveryLabel(overlap) {
  if (overlap >= 0.55) return "대본 반영 좋음";
  if (overlap >= 0.25) return "핵심 유지 중";
  return "핵심어 부족";
}

export function buildPreparationSignature(script, materialFiles, referenceVideoUrl) {
  return JSON.stringify({
    script: script.trim(),
    referenceVideoUrl: referenceVideoUrl.trim(),
    materialFiles: materialFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    })),
  });
}

export function looksLikeScriptFile(fileName) {
  return /(^|[\s._-])(script|speaker.?note|note|notes|manuscript|draft|대본|원고|발표문)([\s._-]|$)/i.test(fileName);
}

export function reactionForAudience(person, baseSituation, metrics) {
  const profile = person.stateProfile || "supportive";
  const {
    elapsed = 0,
    wordsPerMinute = 0,
    syllablesPerSecond = 0,
    silenceStreak = 0,
    voiceActive = false,
    secondsSinceRecognized = 0,
    overlap = 0,
    wordsSpoken = 0,
  } = metrics || {};

  if (elapsed < 6) return "attentive";

  if (profile === "analytical") {
    if (voiceActive && secondsSinceRecognized > 4) return "confused";
    if (syllablesPerSecond >= 7.1 || wordsPerMinute >= 178) return "tooFast";
    if (elapsed > 22 && wordsSpoken > 8 && overlap < 0.2) return "confused";
    if ((baseSituation === "impressed" && overlap >= 0.38) || (baseSituation === "focused" && overlap >= 0.48 && wordsSpoken >= 14)) return "excited";
    return baseSituation === "focused" || baseSituation === "impressed" ? "attentive" : reactionFromSituation(baseSituation);
  }

  if (profile === "expressive") {
    if (baseSituation === "impressed" || (overlap >= 0.35 && syllablesPerSecond >= 4.6 && syllablesPerSecond <= 7.1)) return "excited";
    if (baseSituation === "offScript") return "confused";
    if (baseSituation === "tooFast" && syllablesPerSecond >= 7.8) return "confused";
    if (baseSituation === "longSilence" && silenceStreak >= 9) return "sleepy";
    return "attentive";
  }

  if (profile === "calm") {
    if (!voiceActive && silenceStreak >= 6) return "sleepy";
    if (baseSituation === "tooSlow" && elapsed > 18) return "sleepy";
    if (baseSituation === "tooFast") return "attentive";
    if (baseSituation === "unclear") return "confused";
    if ((baseSituation === "focused" || baseSituation === "impressed") && overlap >= 0.42 && wordsSpoken >= 10) return "excited";
    return "attentive";
  }

  if (baseSituation === "longSilence" && silenceStreak >= 9) return "sleepy";
  if (baseSituation === "unclear" && voiceActive) return "confused";
  if (baseSituation === "tooFast" && syllablesPerSecond >= 7.8) return "tooFast";
  if ((baseSituation === "impressed" && overlap >= 0.35) || (baseSituation === "focused" && overlap >= 0.42 && wordsSpoken >= 10)) return "excited";
  return "attentive";
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}
