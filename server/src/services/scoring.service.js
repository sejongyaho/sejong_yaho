const STRUCTURE_WEIGHTS = {
  intro: 1,
  problem: 1.5,
  solution: 1.5,
  features: 1.4,
  impact: 1,
  closing: 1.5,
};

const TOTAL_WEIGHTS = {
  structure: 0.35,
  speed: 0.2,
  fillerWords: 0.15,
  persuasion: 0.2,
  closing: 0.1,
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value) {
  return Math.round(clamp(value));
}

function fillerTotal(profile) {
  return Object.values(profile.speech?.fillerWords || {}).reduce((sum, count) => sum + count, 0);
}

function scoreSpeed(referenceProfile, userProfile) {
  const referenceWpm = referenceProfile.speech?.estimatedWpm || 0;
  const userWpm = userProfile.speech?.estimatedWpm || 0;
  const differenceRate = referenceWpm ? Math.abs(userWpm - referenceWpm) / referenceWpm : 0;

  if (differenceRate <= 0.1) return 100;
  if (differenceRate <= 0.2) return 85;
  if (differenceRate <= 0.3) return 70;
  if (differenceRate <= 0.4) return 55;
  return 40;
}

function scoreStructure(referenceProfile, userProfile) {
  const totalWeight = Object.values(STRUCTURE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const weightedDiff = Object.entries(STRUCTURE_WEIGHTS).reduce((sum, [section, weight]) => {
    const referenceRatio = referenceProfile.structure?.[section] || 0;
    const userRatio = userProfile.structure?.[section] || 0;
    return sum + Math.abs(referenceRatio - userRatio) * weight;
  }, 0);

  const normalizedDiff = totalWeight ? weightedDiff / totalWeight : 0;
  return roundScore(100 - normalizedDiff * 160);
}

function scoreFillerWords(referenceProfile, userProfile) {
  const referenceTotal = fillerTotal(referenceProfile);
  const userTotal = fillerTotal(userProfile);

  if (userTotal <= referenceTotal) return 100;

  const ratio = userTotal / Math.max(referenceTotal, 1);
  if (ratio <= 1.5) return 85;
  if (ratio <= 2) return 70;
  if (ratio <= 3) return 55;
  return 40;
}

function scorePersuasion(referenceProfile, userProfile) {
  const referenceFlow = referenceProfile.persuasion?.flow;
  const userFlow = userProfile.persuasion?.flow;

  if (referenceFlow === userFlow) return 100;
  if (referenceFlow === "problem-solution-impact" && userFlow === "feature-centered") return 55;
  if (userFlow === "unclear") return 45;
  return 70;
}

function scoreClosing(referenceProfile, userProfile) {
  const referenceClosing = referenceProfile.structure?.closing || 0;
  const userClosing = userProfile.structure?.closing || 0;
  const difference = Math.abs(referenceClosing - userClosing);

  if (userClosing < 0.03) return 50;
  if (difference <= 0.03) return 100;
  if (difference <= 0.07) return 80;
  return 60;
}

function gradeFromScore(totalScore) {
  if (totalScore >= 90) return "A";
  if (totalScore >= 80) return "B+";
  if (totalScore >= 70) return "B";
  if (totalScore >= 60) return "C";
  return "D";
}

function speedSummary(comparison) {
  if (comparison.speed?.status === "too_fast") {
    return "말 속도는 레퍼런스보다 빠른 편입니다.";
  }
  if (comparison.speed?.status === "too_slow") {
    return "말 속도는 레퍼런스보다 느린 편입니다.";
  }
  return "말 속도는 레퍼런스와 유사합니다.";
}

function structureSummary(comparison) {
  const problem = comparison.structure?.sections?.problem;
  const features = comparison.structure?.sections?.features;
  const hasShortProblem = problem && problem.referenceRatio > 0 && problem.userRatio < problem.referenceRatio * 0.7;
  const hasHeavyFeatures = features && features.referenceRatio > 0 && features.userRatio > features.referenceRatio * 1.3;

  if (hasShortProblem && hasHeavyFeatures) {
    return "레퍼런스 발표에 비해 문제 제기 구간이 짧고 기능 설명 비중이 높습니다.";
  }

  if (hasShortProblem) {
    return "레퍼런스 발표에 비해 문제 제기 구간이 짧습니다.";
  }

  if (hasHeavyFeatures) {
    return "레퍼런스 발표에 비해 기능 설명 비중이 높습니다.";
  }

  return "발표 구조는 레퍼런스와 크게 벗어나지 않습니다.";
}

function persuasionSummary(comparison) {
  if (comparison.persuasion?.issue === "problem_context_missing") {
    return "설득 흐름은 문제 제기보다 기능 설명으로 치우쳐 있습니다.";
  }
  if (comparison.persuasion?.matches) {
    return "설득 흐름은 레퍼런스와 유사합니다.";
  }
  return "설득 흐름은 일부 차이가 있습니다.";
}

function buildSummary(comparison) {
  return [structureSummary(comparison), speedSummary(comparison), persuasionSummary(comparison)].join(" ");
}

export function generateScore(referenceProfile, userProfile, comparison) {
  const scores = {
    structure: scoreStructure(referenceProfile, userProfile),
    speed: scoreSpeed(referenceProfile, userProfile),
    fillerWords: scoreFillerWords(referenceProfile, userProfile),
    persuasion: scorePersuasion(referenceProfile, userProfile),
    closing: scoreClosing(referenceProfile, userProfile),
  };

  const totalScore = roundScore(
    scores.structure * TOTAL_WEIGHTS.structure +
      scores.speed * TOTAL_WEIGHTS.speed +
      scores.fillerWords * TOTAL_WEIGHTS.fillerWords +
      scores.persuasion * TOTAL_WEIGHTS.persuasion +
      scores.closing * TOTAL_WEIGHTS.closing,
  );

  return {
    totalScore,
    grade: gradeFromScore(totalScore),
    scores,
    summary: buildSummary(comparison),
  };
}
