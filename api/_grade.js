const GRADE_PATTERN = /^(?:grade\s*|g)?(1[0-2]|[1-9])$/i;

export function normalizeGrade(value) {
  const match = String(value ?? '').trim().match(GRADE_PATTERN);
  return match ? `Grade ${Number(match[1])}` : null;
}

export function gradeFromQuizId(quizId) {
  const match = String(quizId ?? '').match(/-(?:grade\s*|g)?(1[0-2]|[1-9])$/i);
  return match ? `Grade ${Number(match[1])}` : null;
}

