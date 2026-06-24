import { analyzePresentation } from "../services/analysis.service.js";
import { createReference, findReference } from "../services/storage.service.js";

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length < 5) {
    const error = new Error(`${fieldName} must be at least 5 characters long.`);
    error.status = 400;
    throw error;
  }
}

export function analyzeReference(req, res, next) {
  try {
    const { title, transcript } = req.body || {};
    requireText(title, "title");
    requireText(transcript, "transcript");

    const profile = analyzePresentation(transcript, title);
    const reference = createReference({ profile, transcript });

    res.status(201).json({
      referenceId: reference.id,
      profile: reference.profile,
    });
  } catch (error) {
    next(error);
  }
}

export function getReference(req, res, next) {
  try {
    const reference = findReference(req.params.id);
    if (!reference) {
      const error = new Error("Reference profile not found.");
      error.status = 404;
      throw error;
    }

    res.json({
      referenceId: reference.id,
      profile: reference.profile,
      createdAt: reference.createdAt,
    });
  } catch (error) {
    next(error);
  }
}
