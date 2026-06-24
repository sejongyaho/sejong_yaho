import { analyzePresentation } from "../services/analysis.service.js";
import { generateAiReport } from "../services/aiReport.service.js";
import { compareProfiles } from "../services/comparison.service.js";
import { generateFeedback } from "../services/feedback.service.js";
import { generateScore } from "../services/scoring.service.js";
import { createPractice, findReference } from "../services/storage.service.js";

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length < 5) {
    const error = new Error(`${fieldName} must be at least 5 characters long.`);
    error.status = 400;
    throw error;
  }
}

export async function analyzePractice(req, res, next) {
  try {
    const { referenceId, transcript } = req.body || {};
    requireText(referenceId, "referenceId");
    requireText(transcript, "transcript");

    const reference = findReference(referenceId);
    if (!reference) {
      const error = new Error("Reference profile not found.");
      error.status = 404;
      throw error;
    }

    const userProfile = analyzePresentation(transcript, "사용자 발표");
    const comparison = compareProfiles(reference.profile, userProfile);
    const score = generateScore(reference.profile, userProfile, comparison);
    const feedback = generateFeedback(reference.profile, userProfile, comparison);
    const aiReport = await generateAiReport({
      referenceProfile: reference.profile,
      userProfile,
      comparison,
      feedback,
      score,
    });
    const practice = createPractice({
      referenceId,
      transcript,
      userProfile,
      comparison,
      score,
      feedback,
      aiReport,
    });

    res.status(201).json({
      practiceId: practice.id,
      userProfile,
      comparison,
      score,
      feedback,
      aiReport,
    });
  } catch (error) {
    next(error);
  }
}
