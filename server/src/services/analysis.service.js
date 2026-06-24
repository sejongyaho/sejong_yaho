import { parseSections } from "../utils/sectionParser.js";
import {
  countFillerWords,
  estimatePace,
  splitSentences,
  textStats,
} from "../utils/textStats.js";

const SECTION_ORDER = ["intro", "problem", "solution", "features", "impact", "closing"];

function analyzePersuasion(sectionAssignments, structure) {
  const firstIndex = (section) => sectionAssignments.findIndex((item) => item.section === section);
  const problemIndex = firstIndex("problem");
  const solutionIndex = firstIndex("solution");
  const impactIndex = firstIndex("impact");
  const hasProblemFirst = structure.problem >= 0.15 && structure.solution > 0;
  const featureHeavy = structure.features >= 0.45;

  let flow = "unclear";
  if (problemIndex >= 0 && solutionIndex > problemIndex && impactIndex > solutionIndex) {
    flow = "problem-solution-impact";
  } else if (featureHeavy || structure.features >= Math.max(structure.problem, structure.solution, structure.impact)) {
    flow = "feature-centered";
  }

  return {
    flow,
    hasProblemFirst,
    featureHeavy,
  };
}

function selectCoreMessage(sentences, sectionAssignments) {
  if (!sentences.length) return "";

  let best = sentences[0];
  let bestScore = -1;

  sentences.forEach((sentence, index) => {
    const section = sectionAssignments[index]?.section;
    const sectionWeight = ["problem", "solution", "impact"].includes(section) ? 40 : 0;
    const lengthScore = Math.min(sentence.length, 140);
    const keywordScore = (sectionAssignments[index]?.matchedKeywords?.length || 0) * 35;
    const score = sectionWeight + lengthScore + keywordScore;

    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  });

  return best;
}

export function analyzePresentation(transcript, title = "Untitled presentation") {
  const sentences = splitSentences(transcript);
  const stats = textStats(transcript, sentences);
  const fillerWords = countFillerWords(transcript);
  const { estimatedWpm, durationEstimateSec } = estimatePace(stats, fillerWords);
  const sectionResult = parseSections(sentences);
  const persuasionBase = analyzePersuasion(sectionResult.assignments, sectionResult.structure);

  return {
    title,
    text: {
      characterCount: stats.characterCount,
      wordCount: stats.wordCount,
      sentenceCount: stats.sentenceCount,
      avgSentenceLength: stats.avgSentenceLength,
    },
    durationEstimateSec,
    structure: SECTION_ORDER.reduce((acc, section) => {
      acc[section] = sectionResult.structure[section] || 0;
      return acc;
    }, {}),
    speech: {
      estimatedWpm,
      sentenceCount: stats.sentenceCount,
      avgSentenceLength: stats.avgSentenceLength,
      fillerWords,
    },
    persuasion: {
      ...persuasionBase,
      coreMessage: selectCoreMessage(sentences, sectionResult.assignments),
    },
    sections: sectionResult.assignments,
  };
}
