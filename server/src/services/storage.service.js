import memoryStore from "../data/memoryStore.js";

function nextId(prefix, count) {
  return `${prefix}_${String(count).padStart(3, "0")}`;
}

export function createReference({ profile, transcript }) {
  const id = nextId("ref", memoryStore.referenceSeq);
  memoryStore.referenceSeq += 1;

  const reference = {
    id,
    profile,
    transcript,
    createdAt: new Date().toISOString(),
  };

  memoryStore.references.set(id, reference);
  return reference;
}

export function findReference(id) {
  return memoryStore.references.get(id) || null;
}

export function createPractice({ referenceId, transcript, userProfile, comparison, score, feedback, aiReport }) {
  const id = nextId("prac", memoryStore.practiceSeq);
  memoryStore.practiceSeq += 1;

  const practice = {
    id,
    referenceId,
    transcript,
    userProfile,
    comparison,
    score,
    feedback,
    aiReport,
    createdAt: new Date().toISOString(),
  };

  memoryStore.practices.set(id, practice);
  return practice;
}

export function findPractice(id) {
  return memoryStore.practices.get(id) || null;
}
