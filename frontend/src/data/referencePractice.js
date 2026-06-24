export const PRACTICE_HISTORY_STORAGE_KEY = "pitchup_practice_history";

export const referenceProfiles = {
  ted: {
    id: "ted",
    name: "TED 스타일",
    description: "차분하고 설득력 있는 발표",
    speed: "135 WPM",
    pause: "핵심 문장 전후 약 0.8초",
    emphasis: "감정 단어와 핵심 메시지에서 강조",
    structure: "문제 제기 -> 개인 경험 -> 메시지",
    tone: "차분하고 설득력 있음",
    tags: ["공감", "스토리텔링", "여유"],
  },
  startupPitch: {
    id: "startupPitch",
    name: "스타트업 피칭 스타일",
    description: "짧은 시간 안에 문제와 해결책을 강하게 전달하는 발표",
    speed: "155 WPM",
    pause: "숫자와 핵심 가치 앞에서 짧게 쉼",
    emphasis: "시장 규모, 문제, 해결책에서 강세",
    structure: "문제 -> 시장 -> 해결책 -> 기대 효과",
    tone: "자신감 있고 임팩트 있음",
    tags: ["임팩트", "속도감", "핵심 메시지"],
  },
  academic: {
    id: "academic",
    name: "학술 발표 스타일",
    description: "논리적 흐름과 근거 중심의 안정적인 발표",
    speed: "125 WPM",
    pause: "개념 설명 후 일정한 쉼",
    emphasis: "연구 목적, 방법, 결과에서 강조",
    structure: "배경 -> 방법 -> 결과 -> 의의",
    tone: "논리적이고 명확함",
    tags: ["구조", "명확성", "신뢰감"],
  },
  custom: {
    id: "custom",
    name: "직접 업로드한 레퍼런스",
    description: "사용자가 업로드한 발표를 기준으로 분석",
    speed: "142 WPM",
    pause: "핵심 문장 전 평균 0.7초",
    emphasis: "핵심 키워드와 전환 문장에서 강조",
    structure: "문제 제기 -> 해결책 -> 사례 -> 마무리",
    tone: "개인화된 발표 스타일",
    tags: ["맞춤형", "개인화", "레퍼런스 분석"],
  },
};

export const referenceOptions = [
  referenceProfiles.ted,
  referenceProfiles.startupPitch,
  referenceProfiles.academic,
  referenceProfiles.custom,
];

export const comparisonFeedback = [
  {
    label: "말하기 속도",
    reference: "155 WPM",
    mine: "168 WPM",
    feedback: "도입부와 핵심 설명 구간에서 속도를 조금 낮추면 전달력이 좋아집니다.",
  },
  {
    label: "쉬는 타이밍",
    reference: "핵심 문장 전후에 짧게 쉼",
    mine: "문장 사이 쉼이 부족함",
    feedback: "중요한 문장 앞에서 잠깐 멈추면 청중이 핵심을 더 잘 이해할 수 있습니다.",
  },
  {
    label: "발표 구조",
    reference: "문제 -> 시장 -> 해결책 -> 기대 효과",
    mine: "기능 설명이 먼저 나옴",
    feedback: "도입부에 청중이 공감할 문제 상황을 먼저 배치하면 좋습니다.",
  },
];

export const scriptEmphasisGuidance = {
  ted: [
    {
      section: "도입부",
      focus: "청중이 공감할 개인적 문제 상황",
      rewriteHint: "서비스 설명 전에 '혼자 발표 연습할 때 가장 답답한 순간은 언제일까요?'처럼 질문형 문장으로 시작하세요.",
    },
    {
      section: "본론",
      focus: "기능보다 변화와 경험",
      rewriteHint: "각 기능을 말한 뒤 사용자가 덜 불안해지는 장면을 한 문장으로 붙이세요.",
    },
    {
      section: "마무리",
      focus: "기억에 남을 핵심 메시지",
      rewriteHint: "Pitch up을 도구가 아니라 발표 자신감을 회복하는 경험으로 정리하세요.",
    },
  ],
  startupPitch: [
    {
      section: "도입부",
      focus: "문제 크기와 긴급성",
      rewriteHint: "첫 15초 안에 발표 연습의 비효율과 사용자가 겪는 손실을 숫자나 상황으로 압축하세요.",
    },
    {
      section: "본론",
      focus: "문제 -> 해결책 -> 효과",
      rewriteHint: "레퍼런스 분석, 비교 피드백, AI 청중을 기능 나열이 아니라 하나의 해결 흐름으로 연결하세요.",
    },
    {
      section: "마무리",
      focus: "서비스 가치와 기대 효과",
      rewriteHint: "마지막 문장은 'Pitch up은 발표 연습을 감이 아니라 데이터로 바꿉니다'처럼 강하게 끝내세요.",
    },
  ],
  academic: [
    {
      section: "도입부",
      focus: "문제 정의와 평가 기준",
      rewriteHint: "왜 발표 연습을 정량화해야 하는지 배경과 한계를 먼저 밝히세요.",
    },
    {
      section: "본론",
      focus: "분석 기준의 논리적 연결",
      rewriteHint: "속도, 쉼, 강조, 구조를 각각 어떤 근거로 비교하는지 순서대로 설명하세요.",
    },
    {
      section: "마무리",
      focus: "활용 가능성과 의의",
      rewriteHint: "해커톤 데모 이후 교육, 피칭, 면접 연습으로 확장될 수 있다는 의의를 정리하세요.",
    },
  ],
  custom: [
    {
      section: "도입부",
      focus: "업로드한 레퍼런스의 첫 인상",
      rewriteHint: "레퍼런스가 시작하는 방식과 비슷하게 청중을 끌어들이는 첫 문장을 설계하세요.",
    },
    {
      section: "본론",
      focus: "레퍼런스의 전환 방식",
      rewriteHint: "핵심 기능을 설명할 때 레퍼런스의 전환 문장과 쉬는 타이밍을 따라가세요.",
    },
    {
      section: "마무리",
      focus: "레퍼런스의 결론 밀도",
      rewriteHint: "마지막 메시지의 길이와 강세를 레퍼런스에 맞춰 짧게 압축하세요.",
    },
  ],
};

export const sectionImprovements = {
  intro: {
    id: "intro",
    label: "도입부",
    currentProblem: "서비스 설명부터 바로 시작해 청중 공감이 약함",
    direction: "문제 상황을 질문형 문장으로 먼저 제시",
    mission: "첫 문장을 질문형으로 바꿔 말하기",
    referenceFeature: "청중의 문제 상황을 먼저 던지고, 핵심 문장 전 잠깐 쉬는 구조입니다.",
    myProblem: "서비스 기능 설명부터 시작해 청중의 공감이 약합니다.",
    practiceMissions: ["첫 문장을 질문형으로 바꾸기", "문제 제기 후 1초 쉬기", "해결책을 한 문장으로 말하기"],
  },
  body: {
    id: "body",
    label: "본론",
    currentProblem: "기능 설명은 명확하지만 핵심 가치가 약하게 전달됨",
    direction: "기능 설명 뒤에 사용자가 얻는 효과를 한 문장으로 붙이기",
    mission: "각 기능마다 그래서 사용자가 좋아지는 점을 말하기",
    referenceFeature: "핵심 기능을 말한 뒤 시장성과 사용자 가치를 빠르게 연결합니다.",
    myProblem: "기능 설명은 자연스럽지만 사용자가 얻는 변화가 뒤늦게 나옵니다.",
    practiceMissions: ["기능 하나를 12초 안에 설명하기", "기능 뒤에 사용자 효과 붙이기", "핵심 가치 단어를 한 번 더 강조하기"],
  },
  closing: {
    id: "closing",
    label: "마무리",
    currentProblem: "마지막 메시지가 조금 약함",
    direction: "서비스가 해결하는 가치를 강하게 정리",
    mission: "마지막 문장을 10초 안에 임팩트 있게 말하기",
    referenceFeature: "마지막 10초에 문제와 해결 가치를 압축해 기억에 남깁니다.",
    myProblem: "발표가 설명으로 끝나 서비스 가치가 충분히 남지 않습니다.",
    practiceMissions: ["마지막 문장을 10초 안에 말하기", "서비스 가치 한 문장으로 정리하기", "마지막 단어를 또렷하게 강조하기"],
  },
};

export const mockPracticeHistory = [
  {
    id: "mock-3",
    title: "Pitch up 최종 발표 리허설",
    date: "오늘 04:35",
    referenceType: "startupPitch",
    referenceName: "스타트업 피칭 스타일",
    totalScore: 83,
    previousScore: 85,
    improvedSection: "쉬는 타이밍",
    weakSection: "마무리 임팩트",
    recentPracticeSection: "마무리",
    scores: { speed: 82, pause: 80, structure: 84, emphasis: 82, closing: 80 },
    previousScores: { speed: 84, pause: 83, structure: 86, emphasis: 84, closing: 83 },
    sectionFeedback: {
      intro: "문제 제기가 명확해졌고 첫 문장 뒤 쉬는 타이밍이 안정적입니다.",
      body: "기능 설명 뒤 사용자 가치가 자연스럽게 이어집니다.",
      closing: "마무리 문장이 짧아졌지만 마지막 한 문장은 더 강하게 남길 수 있습니다.",
    },
    nextRecommendation: "마지막 10초에서 서비스 가치를 한 문장으로 압축해 말해보세요.",
  },
  {
    id: "mock-2",
    title: "슈카 레퍼런스 기준 발표 연습",
    date: "오늘 03:20",
    referenceType: "custom",
    referenceName: "슈카 유튜브 레퍼런스",
    totalScore: 85,
    previousScore: 68,
    improvedSection: "발표 구조",
    weakSection: "강조 전달력",
    recentPracticeSection: "본론",
    scores: { speed: 84, pause: 83, structure: 86, emphasis: 84, closing: 83 },
    previousScores: { speed: 66, pause: 60, structure: 69, emphasis: 67, closing: 66 },
    sectionFeedback: {
      intro: "도입부의 문제 제기는 이전보다 짧고 분명합니다.",
      body: "경제 해설형 레퍼런스처럼 사례와 핵심 기능을 연결하는 흐름이 좋아졌습니다.",
      closing: "마지막 메시지의 강세는 아직 더 선명하게 만들 수 있습니다.",
    },
    nextRecommendation: "핵심 숫자와 기능명 뒤에 짧게 멈추며 강조해보세요.",
  },
  {
    id: "mock-1",
    title: "AI 발표 서비스 1차 발표",
    date: "오늘 02:10",
    referenceType: "startupPitch",
    referenceName: "스타트업 피칭 스타일",
    totalScore: 68,
    previousScore: 62,
    improvedSection: "도입부 문제 제기",
    weakSection: "쉬는 타이밍",
    recentPracticeSection: "도입부",
    scores: { speed: 66, pause: 60, structure: 69, emphasis: 67, closing: 66 },
    previousScores: { speed: 60, pause: 54, structure: 62, emphasis: 59, closing: 61 },
    sectionFeedback: {
      intro: "서비스 설명보다 문제 상황을 먼저 제시하려는 흐름이 생겼습니다.",
      body: "기능 설명은 명확하지만 사용자 효과가 조금 늦게 나옵니다.",
      closing: "마지막 문장이 설명형으로 끝나 임팩트가 약합니다.",
    },
    nextRecommendation: "도입부에서 청중이 공감할 질문을 먼저 던지고 1초 쉬어보세요.",
  },
];

const todayDawnLabels = ["오늘 04:35", "오늘 03:20", "오늘 02:10"];

function normalizePracticeHistory(history = mockPracticeHistory) {
  const source = Array.isArray(history) && history.length ? history : mockPracticeHistory;
  return source.slice(0, 3).map((record, index) => ({
    ...record,
    date: todayDawnLabels[index] || todayDawnLabels.at(-1),
  }));
}

export function loadPracticeHistory() {
  if (typeof window === "undefined") return mockPracticeHistory;
  try {
    const raw = window.localStorage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const normalized = normalizePracticeHistory(parsed);
    persistPracticeHistory(normalized);
    return normalized;
  } catch {
    return mockPracticeHistory;
  }
}

export function persistPracticeHistory(history) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PRACTICE_HISTORY_STORAGE_KEY, JSON.stringify(history));
  }
  return history;
}

export function buildAnalysisRecord(referenceType = "startupPitch", title = "Pitch up 발표 분석") {
  const profile = referenceProfiles[referenceType] || referenceProfiles.startupPitch;
  return {
    id: `practice-${Date.now()}`,
    title: title?.trim() || "Pitch up 발표 분석",
    date: todayDawnLabels[0],
    referenceType: profile.id,
    referenceName: profile.name,
    totalScore: 82,
    previousScore: 76,
    improvedSection: "쉬는 타이밍",
    weakSection: "도입부 문제 제기",
    recentPracticeSection: "도입부",
    scores: { speed: 74, pause: 66, structure: 78, emphasis: 72, closing: 75 },
    previousScores: { speed: 70, pause: 58, structure: 72, emphasis: 68, closing: 70 },
    sectionFeedback: {
      intro: "도입부의 문제 제기와 쉬는 타이밍이 아직 약합니다.",
      body: "핵심 기능은 전달되지만 사용자 가치가 조금 늦게 나옵니다.",
      closing: "마지막 문장을 더 짧고 강하게 정리하면 좋습니다.",
    },
    nextRecommendation: "도입부에서 문제 제기를 먼저 던지고 1초 쉬는 연습을 해보세요.",
  };
}

export function addPracticeHistoryRecord(currentHistory, record) {
  return persistPracticeHistory(normalizePracticeHistory([record, ...currentHistory]));
}

export function completeSectionPractice(currentHistory, recordId, sectionId) {
  const section = sectionImprovements[sectionId] || sectionImprovements.intro;
  const fallback = buildAnalysisRecord("startupPitch", "구간별 발표 연습");
  const hasTarget = currentHistory.some((record) => record.id === recordId);
  const nextHistory = hasTarget
    ? currentHistory.map((record) => {
        if (record.id !== recordId) return record;
        return {
          ...record,
          totalScore: Math.min(100, record.totalScore + 5),
          improvedSection: "쉬는 타이밍",
          recentPracticeSection: section.label,
          scores: {
            ...record.scores,
            pause: Math.min(100, (record.scores?.pause || 70) + 12),
          },
          sectionFeedback: {
            ...record.sectionFeedback,
            [sectionId]: `${section.label} 연습을 완료했습니다. 쉬는 타이밍과 핵심 문장 강조가 이전보다 좋아졌습니다.`,
          },
        };
      })
    : [
        {
          ...fallback,
          id: recordId || fallback.id,
          recentPracticeSection: section.label,
          totalScore: 87,
          previousScore: 82,
        },
        ...currentHistory,
      ];
  return persistPracticeHistory(normalizePracticeHistory(nextHistory));
}

export function summarizeReferenceGrowth(history) {
  return Object.values(referenceProfiles).map((profile) => {
    const records = history.filter((record) => record.referenceType === profile.id);
    const latest = records[0];
    const earliest = records.at(-1);
    return {
      id: profile.id,
      name: profile.name,
      count: records.length,
      scoreChange: records.length ? `${earliest.previousScore || earliest.totalScore}점 -> ${latest.totalScore}점` : "아직 기록 없음",
      improved: latest?.improvedSection || "-",
      latestDate: latest?.date || "-",
    };
  });
}
