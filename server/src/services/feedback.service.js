function percent(value) {
  return `${Math.round(value * 100)}%`;
}

export function generateFeedback(referenceProfile, userProfile, comparison) {
  const feedback = [];
  const problem = comparison.structure.sections.problem;
  const features = comparison.structure.sections.features;
  const closing = comparison.structure.sections.closing;

  if (comparison.speed.status === "too_fast") {
    feedback.push({
      type: "speed",
      title: "말 속도 조정 필요",
      message: `레퍼런스보다 약 ${comparison.speed.differencePercent}% 빠르게 말하는 패턴입니다. 핵심 문장이 지나가면 설득력이 약해질 수 있습니다.`,
      action: "중요한 문장 뒤에 1초 쉬고, 문장마다 마지막 단어를 또렷하게 끝내는 연습을 하세요.",
    });
  } else if (comparison.speed.status === "too_slow") {
    feedback.push({
      type: "speed",
      title: "진행 속도 보완 필요",
      message: `레퍼런스보다 약 ${Math.abs(comparison.speed.differencePercent)}% 느린 흐름입니다. 발표 밀도가 낮게 느껴질 수 있습니다.`,
      action: "한 문장 설명 뒤 바로 다음 근거로 넘어가는 연결 문장을 미리 정해두세요.",
    });
  }

  if (problem.referenceRatio > 0 && problem.userRatio < problem.referenceRatio * 0.7) {
    feedback.push({
      type: "structure",
      title: "문제 제기 구간 부족",
      message: `문제 제기 비율이 레퍼런스 ${percent(problem.referenceRatio)} 대비 ${percent(problem.userRatio)}로 낮습니다.`,
      action: "첫 40초 동안 기능 설명을 하지 말고, 사용자가 겪는 문제 상황과 불편함만 설명해보세요.",
    });
  }

  if (features.referenceRatio > 0 && features.userRatio > features.referenceRatio * 1.3) {
    feedback.push({
      type: "structure",
      title: "기능 설명 비중 과다",
      message: `기능 설명 비율이 레퍼런스보다 높습니다. 기능 나열이 길어지면 핵심 메시지가 흐려질 수 있습니다.`,
      action: "핵심 기능을 5개 이상 말하지 말고 3개로 줄이고, 각 기능 뒤에는 사용자가 얻는 변화를 붙이세요.",
    });
  }

  if (comparison.fillerWords.status === "too_many") {
    feedback.push({
      type: "speech",
      title: "습관어 줄이기",
      message: `습관어가 ${comparison.fillerWords.userTotal}회로 레퍼런스 ${comparison.fillerWords.referenceTotal}회보다 많습니다.`,
      action: "'음', '어', '이제'가 나오려는 순간 말을 채우지 말고 짧게 멈춘 뒤 다음 문장을 시작하세요.",
    });
  }

  if (closing.userRatio < 0.06 || (closing.referenceRatio > 0 && closing.userRatio < closing.referenceRatio * 0.7)) {
    feedback.push({
      type: "structure",
      title: "마무리 메시지 강화",
      message: `마무리 비율이 ${percent(closing.userRatio)}로 낮아 마지막 인상이 약할 수 있습니다.`,
      action: "마지막에는 문제, 해결, 기대 효과를 한 문장씩 다시 말하고 명확한 결론 문장으로 끝내세요.",
    });
  }

  if (comparison.persuasion.issue === "problem_context_missing") {
    feedback.push({
      type: "persuasion",
      title: "설득 흐름 재정렬",
      message: "레퍼런스는 문제 제기에서 해결책과 효과로 이어지지만, 사용자 발표는 기능 중심으로 흘러갑니다.",
      action: "발표 앞부분을 '누가 어떤 상황에서 왜 불편한가'로 시작한 뒤 해결책을 소개하세요.",
    });
  }

  if (!feedback.length) {
    feedback.push({
      type: "summary",
      title: "레퍼런스와 유사한 흐름",
      message: "말 속도, 구조, 습관어 사용이 레퍼런스와 크게 벗어나지 않습니다.",
      action: "다음 연습에서는 핵심 메시지 한 문장을 더 짧고 선명하게 다듬어보세요.",
    });
  }

  return feedback;
}
