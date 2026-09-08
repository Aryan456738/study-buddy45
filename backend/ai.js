/**
 * ═══════════════════════════════════════════════════════
 *  MODULE D · AI Caller + System Prompts
 *  All Groq API logic lives here.
 *  Swap model or tweak prompts without touching routes.
 * ═══════════════════════════════════════════════════════
 */

const GROQ_API    = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL       = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const MAX_TOKENS  = 1000;

// ── System prompts — one per tool ──────────────────────
export const PROMPTS = {

  notes: `You are Study Buddy, a study-notes assistant. Read the study material and produce exam-ready structured notes as a clean HTML fragment: use <h3> for section headings and <ul><li> for bullet points, with <strong> around key terms. Return ONLY the HTML fragment — no markdown fences, no <html>/<body> tags, no commentary.`,

  flashcards: `You are Study Buddy, a flashcard generator. Return ONLY strict JSON — no markdown fences, no commentary: an array of exactly 8 objects, each shaped {"front":"short question or term","back":"concise answer or definition"}, covering the key concepts of the material.`,

  quiz: `You are Study Buddy, a quiz generator. Return ONLY strict JSON: an array of exactly 5 objects, each shaped {"question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"short explanation"}. Base every question strictly on the given material.`,

  mindmap: `You are Study Buddy, a mind-map generator. Return ONLY strict JSON: {"topic":"root topic","children":[{"topic":"...","children":[{"topic":"...","children":[]}]}]}. Max depth 3. Short labels (2-6 words), 3-5 children per node.`,

  ask: `You are Study Buddy's Q&A assistant. Answer using ONLY the study material provided — never invent facts. If the answer isn't in the material, say so honestly. Keep answers under 130 words. Return ONLY a clean HTML fragment (you may use <strong> and <p> tags).`,

  planner: `You are Study Buddy's study planner. Return ONLY strict JSON: an array of day objects shaped {"day":1,"date":"YYYY-MM-DD","focus":"short label","tasks":["task 1","task 2"],"type":"study"|"revision"}. Final ~20% of days should be "revision". Keep tasks realistic for the given hours/day.`,

  doubt: `You are Study Buddy's Doubt Solver: an encouraging, patient tutor. Explain step by step using <ol><li>. End with one short warm encouraging line in a <p>. Return ONLY the HTML fragment.`,
};

// ── Response shape helpers ─────────────────────────────
function stripFence(text) {
  return text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
}

function extractJSON(text) {
  let t = stripFence(text);
  const first = Math.min(...['{', '['].map(c => {
    const i = t.indexOf(c);
    return i < 0 ? Infinity : i;
  }));
  const last  = Math.max(...['}', ']'].map(c => t.lastIndexOf(c)).filter(i => i >= 0));
  if (first !== Infinity) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

async function requestGroq(userPrompt, systemPrompt, extraBody = {}) {
  const res = await fetch(GROQ_API, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...extraBody,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Groq API error ${res.status}:`, body);
    throw new Error(`Groq API returned ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('Empty response from Groq');
  return text;
}

// ── Core caller ────────────────────────────────────────
/**
 * callClaude(userPrompt, systemPrompt)
 * Returns { html } for HTML-mode tools,
 *         { json } for JSON-mode tools.
 * Throws on API failure.
 */
export async function callClaude(userPrompt, systemPrompt) {
  const isJsonMode = systemPrompt.includes('strict JSON');
  const text = await requestGroq(userPrompt, systemPrompt);

  if (isJsonMode) {
    return { json: extractJSON(text) };
  }
  return { html: stripFence(text) };
}
