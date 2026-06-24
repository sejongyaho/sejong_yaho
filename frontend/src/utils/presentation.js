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

export function getSituation({ elapsed, wordsPerMinute, syllablesPerSecond, silenceStreak, voiceActive, secondsSinceRecognized, overlap }) {
  if (elapsed < 5) return "opening";
  if (silenceStreak >= 8) return "longSilence";
  if (silenceStreak >= 3) return "tooSlow";
  if (voiceActive && secondsSinceRecognized > 3) return "unclear";
  if (syllablesPerSecond > 7 || wordsPerMinute > 175) return "tooFast";
  if (elapsed > 20 && overlap < 0.12) return "offScript";
  if (syllablesPerSecond >= 5.6 && syllablesPerSecond <= 6.3) return "goodPace";
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

export function softenReaction(reaction, index) {
  if (reaction === "tooFast" && index === 2) return "confused";
  if (reaction === "tooSlow" && index === 1) return "sleepy";
  if (reaction === "excited" && index === 3) return "attentive";
  return reaction;
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}
