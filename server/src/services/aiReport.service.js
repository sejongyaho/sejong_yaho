const DEFAULT_REPORT = {
  headline: "발표 흐름을 더 선명하게 다듬어야 합니다.",
  overallComment: "",
  strengths: [],
  weaknesses: [],
  practiceActions: [],
  nextPracticeGoal: "다음 연습에서는 레퍼런스와 가장 차이가 큰 항목 하나를 먼저 개선해보세요.",
};

function clampList(items, fallback, limit = 3) {
  const cleanItems = items.filter(Boolean);
  return (cleanItems.length ? cleanItems : [fallback]).slice(0, limit);
}

function scoreLabel(score) {
  return `총점은 ${score.totalScore}점, ${score.grade}등급입니다.`;
}

function ensureScoreMention(comment, score) {
  const label = scoreLabel(score);
  if (comment.includes(`${score.totalScore}점`) && comment.includes(`${score.grade}등급`)) {
    return comment;
  }

  return `${label} ${comment}`.trim();
}

function stripJsonFence(content) {
  return content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getFillerWordStatus(comparison) {
  return comparison.fillerWords?.status || "similar";
}

function buildStrengths({ comparison, score }) {
  const strengths = [];

  if (score.scores?.speed >= 85) {
    strengths.push("말 속도가 레퍼런스와 유사해 전달 안정성이 좋습니다.");
  }

  if (score.scores?.closing >= 80) {
    strengths.push("마무리 구간은 비교적 적절하게 구성되어 있습니다.");
  }

  if (getFillerWordStatus(comparison) === "better") {
    strengths.push("습관어 사용이 레퍼런스보다 적어 문장이 깔끔하게 들릴 수 있습니다.");
  }

  if (comparison.persuasion?.matches) {
    strengths.push("설득 흐름이 레퍼런스 발표와 유사하게 이어집니다.");
  }

  return clampList(strengths, "기본 발표 요소는 분석 가능한 수준으로 구성되어 있습니다.");
}

function buildWeaknesses({ comparison, score }) {
  const weaknesses = [];
  const problem = comparison.structure?.sections?.problem;
  const features = comparison.structure?.sections?.features;

  if (problem && problem.referenceRatio > 0 && problem.userRatio < problem.referenceRatio * 0.7) {
    weaknesses.push("문제 제기 구간이 레퍼런스보다 짧아 청중의 공감을 만들기 어렵습니다.");
  }

  if (features && features.referenceRatio > 0 && features.userRatio > features.referenceRatio * 1.3) {
    weaknesses.push("기능 설명 비중이 높아 발표가 제품 설명처럼 들릴 수 있습니다.");
  }

  if (comparison.persuasion?.issue === "problem_context_missing") {
    weaknesses.push("설득 흐름이 problem-solution-impact 구조보다 feature-centered에 가깝습니다.");
  } else if (comparison.persuasion?.userFlow === "unclear") {
    weaknesses.push("설득 흐름이 명확하지 않아 핵심 메시지가 약하게 전달될 수 있습니다.");
  }

  if (getFillerWordStatus(comparison) === "too_many") {
    weaknesses.push("습관어 사용이 많아 발표의 자신감과 명료도가 낮아 보일 수 있습니다.");
  }

  if (comparison.speed?.status === "too_fast") {
    weaknesses.push("말 속도가 레퍼런스보다 빨라 핵심 문장이 지나치게 빠르게 전달될 수 있습니다.");
  } else if (comparison.speed?.status === "too_slow") {
    weaknesses.push("말 속도가 레퍼런스보다 느려 발표 밀도가 낮게 느껴질 수 있습니다.");
  }

  if (score.scores?.closing <= 60) {
    weaknesses.push("마무리 구간이 약해 발표의 마지막 인상이 충분히 남지 않을 수 있습니다.");
  }

  return clampList(weaknesses, "레퍼런스와 비교했을 때 일부 구조와 전달 방식에서 개선 여지가 있습니다.");
}

function buildPracticeActions({ feedback, comparison, score }) {
  const actions = feedback.map((item) => item.action).filter(Boolean);

  if (!actions.length && comparison.structure?.sections?.problem?.userRatio < 0.1) {
    actions.push("첫 40초 동안 기능 설명을 하지 말고 문제 상황만 설명해보세요.");
  }

  if (!actions.length && score.scores?.persuasion < 70) {
    actions.push("문제, 해결, 기대 효과가 한 번씩 등장하도록 발표 순서를 다시 배열해보세요.");
  }

  return clampList(actions, "다음 연습에서는 가장 낮은 세부 점수 항목 하나만 골라 집중적으로 고쳐보세요.");
}

function buildHeadline({ comparison, score }) {
  if (score.scores?.speed >= 85 && score.scores?.persuasion < 70) {
    return "말 속도는 안정적이지만 설득 흐름 보강이 필요합니다.";
  }

  if (score.scores?.structure < 70) {
    return "발표 구조를 레퍼런스 흐름에 더 가깝게 정리해야 합니다.";
  }

  if (comparison.speed?.status === "too_fast") {
    return "핵심 메시지가 빠르게 지나가지 않도록 속도 조정이 필요합니다.";
  }

  if (getFillerWordStatus(comparison) === "too_many") {
    return "습관어를 줄이면 발표 전달력이 더 좋아집니다.";
  }

  if (score.totalScore >= 80) {
    return "레퍼런스 흐름을 안정적으로 따라가고 있습니다.";
  }

  return "발표 흐름과 메시지 전달을 한 단계 다듬어야 합니다.";
}

function buildOverallComment({ comparison, score }) {
  const comments = [scoreLabel(score)];

  if (comparison.speed?.status === "similar") {
    comments.push("전체적으로 말 속도는 레퍼런스와 유사합니다.");
  } else if (comparison.speed?.status === "too_fast") {
    comments.push("말 속도는 레퍼런스보다 빠른 편입니다.");
  } else if (comparison.speed?.status === "too_slow") {
    comments.push("말 속도는 레퍼런스보다 느린 편입니다.");
  }

  if (comparison.persuasion?.issue === "problem_context_missing") {
    comments.push("다만 발표 구조가 기능 설명 중심으로 치우쳐 있습니다.");
  } else if (score.scores?.structure < 75) {
    comments.push("다만 레퍼런스와 비교하면 발표 구조의 비율 차이가 있습니다.");
  } else {
    comments.push("발표 구조는 크게 벗어나지 않는 편입니다.");
  }

  return comments.join(" ");
}

function buildNextPracticeGoal({ comparison, score }) {
  const problem = comparison.structure?.sections?.problem;
  const features = comparison.structure?.sections?.features;

  if (
    problem &&
    features &&
    problem.referenceRatio > 0 &&
    problem.userRatio < problem.referenceRatio * 0.7 &&
    features.userRatio > features.referenceRatio * 1.3
  ) {
    return "다음 연습에서는 문제 제기 비율을 늘리고 기능 설명 비중을 줄이는 것을 목표로 하세요.";
  }

  if (score.scores?.speed < 85) {
    return "다음 연습에서는 레퍼런스 말 속도에 맞춰 문장 끝마다 짧게 쉬는 것을 목표로 하세요.";
  }

  if (score.scores?.closing < 80) {
    return "다음 연습에서는 마지막에 서비스의 가치를 한 문장으로 정리하는 것을 목표로 하세요.";
  }

  return "다음 연습에서는 가장 낮은 세부 점수 항목을 10점 이상 끌어올리는 것을 목표로 하세요.";
}

function normalizeReport(report, input) {
  const fallback = fallbackAiReport(input);
  const overallComment =
    typeof report?.overallComment === "string" && report.overallComment.trim()
      ? report.overallComment.trim()
      : fallback.overallComment;

  return {
    headline: typeof report?.headline === "string" && report.headline.trim() ? report.headline.trim() : fallback.headline,
    overallComment: ensureScoreMention(overallComment, input.score),
    strengths: clampList(Array.isArray(report?.strengths) ? report.strengths : [], fallback.strengths[0]),
    weaknesses: clampList(Array.isArray(report?.weaknesses) ? report.weaknesses : [], fallback.weaknesses[0]),
    practiceActions: clampList(
      Array.isArray(report?.practiceActions) ? report.practiceActions : [],
      fallback.practiceActions[0],
    ),
    nextPracticeGoal:
      typeof report?.nextPracticeGoal === "string" && report.nextPracticeGoal.trim()
        ? report.nextPracticeGoal.trim()
        : fallback.nextPracticeGoal,
  };
}

export function buildReportPrompt({ referenceProfile, userProfile, comparison, feedback, score }) {
  return `
너는 발표 연습 코치다. 아래 JSON 데이터를 바탕으로 한국어 최종 코칭 리포트를 작성해라.

중요한 제약:
- 점수는 절대 새로 계산하거나 변경하지 말 것.
- totalScore는 반드시 ${score.totalScore}점으로, grade는 반드시 ${score.grade}등급으로 언급할 것.
- comparison과 feedback에 없는 내용을 과장하지 말 것.
- 발표 연습자가 바로 실행할 수 있는 행동 중심으로 작성할 것.
- 너무 길지 않게 작성할 것.
- JSON만 반환할 것.

반환 JSON 형식:
{
  "headline": "짧은 한 문장",
  "overallComment": "총점과 등급을 포함한 2문장 이내 총평",
  "strengths": ["강점 1", "강점 2"],
  "weaknesses": ["약점 1", "약점 2", "약점 3"],
  "practiceActions": ["실행 행동 1", "실행 행동 2", "실행 행동 3"],
  "nextPracticeGoal": "다음 연습 목표 한 문장"
}

입력 데이터:
${JSON.stringify({ referenceProfile, userProfile, comparison, feedback, score }, null, 2)}
`.trim();
}

export async function generateReportWithAI(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_REPORT_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You write concise Korean presentation coaching reports. Return strict JSON only.",
        },
        {
          role: "user",
          content: buildReportPrompt(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI report request failed with status ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return JSON.parse(stripJsonFence(content));
}

export function fallbackAiReport(input) {
  return {
    ...DEFAULT_REPORT,
    headline: buildHeadline(input),
    overallComment: buildOverallComment(input),
    strengths: buildStrengths(input),
    weaknesses: buildWeaknesses(input),
    practiceActions: buildPracticeActions(input),
    nextPracticeGoal: buildNextPracticeGoal(input),
  };
}

export async function generateAiReport(input) {
  try {
    const aiReport = await generateReportWithAI(input);
    if (aiReport) {
      return normalizeReport(aiReport, input);
    }
  } catch (error) {
    console.warn(`AI report fallback used: ${error.message}`);
  }

  return fallbackAiReport(input);
}
