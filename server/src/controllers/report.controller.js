import { findPractice, findReference } from "../services/storage.service.js";

export function getPracticeReport(req, res, next) {
  try {
    const practice = findPractice(req.params.id);
    if (!practice) {
      const error = new Error("Practice report not found.");
      error.status = 404;
      throw error;
    }

    const reference = findReference(practice.referenceId);
    res.json({
      practiceId: practice.id,
      referenceId: practice.referenceId,
      referenceProfile: reference?.profile || null,
      userProfile: practice.userProfile,
      comparison: practice.comparison,
      score: practice.score,
      feedback: practice.feedback,
      aiReport: practice.aiReport,
      createdAt: practice.createdAt,
    });
  } catch (error) {
    next(error);
  }
}
