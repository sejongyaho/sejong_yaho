const SECTION_KEYS = {
  problem: ["문제", "어려움", "불편", "한계", "부족", "힘들"],
  solution: ["해결", "제안", "서비스", "아이디어", "도입"],
  features: ["기능", "분석", "피드백", "제공", "지원", "사용"],
  impact: ["효과", "기대", "개선", "도움", "가치"],
  closing: ["마지막", "정리", "결론", "감사합니다"],
};

const SECTION_ORDER = ["intro", "problem", "solution", "features", "impact", "closing"];

function round(value) {
  return Number(value.toFixed(3));
}

function classifyByKeyword(sentence) {
  let best = null;
  let bestKeywords = [];

  Object.entries(SECTION_KEYS).forEach(([section, keywords]) => {
    const matchedKeywords = keywords.filter((keyword) => sentence.includes(keyword));
    if (matchedKeywords.length > bestKeywords.length) {
      best = section;
      bestKeywords = matchedKeywords;
    }
  });

  return best ? { section: best, matchedKeywords: bestKeywords, reason: "keyword" } : null;
}

function classifyByPosition(index, total) {
  const position = total <= 1 ? 0 : index / (total - 1);
  if (position <= 0.15) return "intro";
  if (position >= 0.86) return "closing";
  return "features";
}

export function parseSections(sentences) {
  const total = sentences.length;
  const counts = Object.fromEntries(SECTION_ORDER.map((section) => [section, 0]));

  if (!total) {
    return {
      structure: counts,
      assignments: [],
    };
  }

  const assignments = sentences.map((sentence, index) => {
    const keywordMatch = classifyByKeyword(sentence);
    const section = keywordMatch?.section || classifyByPosition(index, total);
    counts[section] += 1;

    return {
      index,
      sentence,
      section,
      matchedKeywords: keywordMatch?.matchedKeywords || [],
      reason: keywordMatch?.reason || "position",
    };
  });

  const structure = SECTION_ORDER.reduce((acc, section) => {
    acc[section] = round(counts[section] / total);
    return acc;
  }, {});

  return {
    structure,
    assignments,
  };
}
