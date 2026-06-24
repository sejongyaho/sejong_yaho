const SECTIONS = ["intro", "problem", "solution", "features", "impact", "closing"];

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function fillerTotal(profile) {
  return Object.values(profile.speech?.fillerWords || {}).reduce((sum, count) => sum + count, 0);
}

function compareSpeed(referenceProfile, userProfile) {
  const referenceWpm = referenceProfile.speech.estimatedWpm;
  const userWpm = userProfile.speech.estimatedWpm;
  const differencePercent = referenceWpm ? ((userWpm - referenceWpm) / referenceWpm) * 100 : 0;
  let status = "similar";
  if (differencePercent >= 10) status = "too_fast";
  if (differencePercent <= -10) status = "too_slow";

  return {
    referenceWpm,
    userWpm,
    differencePercent: round(differencePercent, 1),
    status,
  };
}

function compareStructure(referenceProfile, userProfile) {
  const sections = SECTIONS.reduce((acc, section) => {
    const referenceRatio = referenceProfile.structure[section] || 0;
    const userRatio = userProfile.structure[section] || 0;
    acc[section] = {
      referenceRatio,
      userRatio,
      difference: round(userRatio - referenceRatio),
      differencePercent: referenceRatio ? round(((userRatio - referenceRatio) / referenceRatio) * 100, 1) : null,
      priority: ["problem", "features", "closing"].includes(section) ? "high" : "normal",
    };
    return acc;
  }, {});

  return {
    sections,
    highlights: {
      problemGap: sections.problem.difference,
      featureGap: sections.features.difference,
      closingGap: sections.closing.difference,
    },
  };
}

function compareFillers(referenceProfile, userProfile) {
  const referenceTotal = fillerTotal(referenceProfile);
  const userTotal = fillerTotal(userProfile);
  let status = "similar";

  if (userTotal >= Math.max(referenceTotal * 2, referenceTotal + 3)) {
    status = "too_many";
  } else if (userTotal < referenceTotal) {
    status = "better";
  }

  return {
    referenceTotal,
    userTotal,
    difference: userTotal - referenceTotal,
    status,
  };
}

function compareFlow(referenceProfile, userProfile) {
  const referenceFlow = referenceProfile.persuasion.flow;
  const userFlow = userProfile.persuasion.flow;
  const issue =
    referenceFlow === "problem-solution-impact" && userFlow === "feature-centered"
      ? "problem_context_missing"
      : null;

  return {
    referenceFlow,
    userFlow,
    matches: referenceFlow === userFlow,
    issue,
  };
}

export function compareProfiles(referenceProfile, userProfile) {
  return {
    speed: compareSpeed(referenceProfile, userProfile),
    structure: compareStructure(referenceProfile, userProfile),
    fillerWords: compareFillers(referenceProfile, userProfile),
    persuasion: compareFlow(referenceProfile, userProfile),
  };
}
