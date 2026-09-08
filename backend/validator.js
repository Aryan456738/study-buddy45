/**
 * ═══════════════════════════════════════════════════════
 *  Validators — input validation for each route
 *  Returns an error string if invalid, null if OK.
 * ═══════════════════════════════════════════════════════
 */

/** Validates requests that need a study source text */
export function validateSource({ sourceText } = {}) {
  if (!sourceText || typeof sourceText !== 'string') return 'sourceText is required';
  if (sourceText.trim().length < 20)  return 'sourceText is too short (min 20 characters)';
  if (sourceText.length > 100_000)    return 'sourceText is too long (max 100,000 characters)';
  return null;
}

/** Validates chat requests (Ask My Notes, Doubt Solver) */
export function validateChat({ sourceText, question, history } = {}, requireSource = true) {
  if (requireSource) {
    if (!sourceText || typeof sourceText !== 'string') return 'sourceText is required';
    if (sourceText.trim().length < 20) return 'sourceText is too short (min 20 characters)';
  }

  if (!question || typeof question !== 'string') return 'question is required';
  if (question.trim().length < 1)  return 'question cannot be empty';
  if (question.length > 2000)      return 'question is too long (max 2000 characters)';

  if (history !== undefined) {
    if (!Array.isArray(history)) return 'history must be an array';
    if (history.length > 20)     return 'history is too long (max 20 messages)';
  }
  return null;
}

/** Validates study planner requests */
export function validatePlan({ examDate, hours, topics } = {}) {
  if (!examDate) return 'examDate is required (YYYY-MM-DD)';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return 'examDate must be YYYY-MM-DD';
  if (new Date(examDate) <= new Date()) return 'examDate must be in the future';

  if (!hours || isNaN(parseFloat(hours))) return 'hours must be a number';
  const h = parseFloat(hours);
  if (h < 0.5 || h > 16) return 'hours must be between 0.5 and 16';

  if (!topics || typeof topics !== 'string') return 'topics is required';
  if (topics.trim().length < 2) return 'topics cannot be empty';
  return null;
}
