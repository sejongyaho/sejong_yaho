const FILLER_WORDS = ["음", "어", "그", "약간", "이제", "뭔가", "그러니까", "사실"];

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

export function splitSentences(text) {
  const normalized = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const matches = normalized.match(/[^.!?。！？]+[.!?。！？]?/g) || [normalized];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

export function getWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

export function textStats(transcript, sentences = splitSentences(transcript)) {
  const normalized = String(transcript || "").trim();
  const words = getWords(normalized);
  const sentenceCount = sentences.length || (normalized ? 1 : 0);
  const wordCount = words.length;

  return {
    characterCount: normalized.length,
    sentenceCount,
    wordCount,
    avgSentenceLength: sentenceCount ? round(wordCount / sentenceCount) : 0,
  };
}

export function countFillerWords(transcript) {
  const words = getWords(transcript);
  const counts = Object.fromEntries(FILLER_WORDS.map((word) => [word, 0]));

  words.forEach((word) => {
    if (Object.prototype.hasOwnProperty.call(counts, word)) {
      counts[word] += 1;
    }
  });

  return counts;
}

export function estimatePace(stats, fillerWords) {
  const fillerTotal = Object.values(fillerWords).reduce((sum, count) => sum + count, 0);
  const longSentencePenalty = stats.avgSentenceLength > 18 ? 8 : 0;
  const shortSentenceBoost = stats.avgSentenceLength > 0 && stats.avgSentenceLength < 8 ? 8 : 0;
  const fillerPenalty = Math.min(18, fillerTotal * 2);
  const estimatedWpm = Math.max(90, Math.min(190, 145 + shortSentenceBoost - longSentencePenalty - fillerPenalty));
  const durationEstimateSec = stats.wordCount ? Math.round((stats.wordCount / estimatedWpm) * 60) : 0;

  return {
    estimatedWpm,
    durationEstimateSec,
  };
}
