/**
 * ═══════════════════════════════════════════════════════
 *  Study Buddy — Backend Server
 *  Node.js + Express · proxies Groq API securely
 * ═══════════════════════════════════════════════════════
 *
 *  Modules:
 *   A. Config & startup checks
 *   B. Middleware setup (CORS, rate limit, JSON parsing)
 *   C. Route handlers (one per AI tool)
 *   D. Shared AI caller
 *   E. Error handling
 *   F. Server start
 */

import 'dotenv/config';
import express       from 'express';
import cors          from 'cors';
import rateLimit     from 'express-rate-limit';
import path          from 'path';
import { fileURLToPath } from 'url';
import { callClaude, PROMPTS } from './ai.js';
import { validateSource, validateChat, validatePlan } from './validator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

// ═══════════════════════════════════════════════════════
//  MODULE A · Config & startup checks
// ═══════════════════════════════════════════════════════
const PORT           = process.env.PORT           || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5500';

if (!process.env.GROQ_API_KEY) {
  console.error('\n❌  GROQ_API_KEY is missing from .env\n');
  process.exit(1);
}
console.log('✅  Groq API key loaded');

// ═══════════════════════════════════════════════════════
//  MODULE B · Middleware
// ═══════════════════════════════════════════════════════
const app = express();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
function parseDateOnly(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date, days) {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function parseTopicsInput(rawTopics) {
  const base = rawTopics
    .split(/[,\n;]+/)
    .map(topic => topic.trim())
    .filter(Boolean);

  let expanded = base;
  if (base.length === 1) {
    const one = base[0];
    if (/\s(?:and|aur|और)\s|&|\//i.test(one)) {
      expanded = one
        .split(/\s(?:and|aur|और)\s|&|\//i)
        .map(topic => topic.trim())
        .filter(Boolean);
    }
  }

  const seen = new Set();
  return expanded.filter(topic => {
    const key = topic.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatHours(hours) {
  return Number.isInteger(hours) ? `${hours}` : `${hours.toFixed(1)}`;
}

function buildTopicWindow(topicList, startIndex, count) {
  const window = [];
  for (let i = 0; i < count; i++) {
    window.push(topicList[(startIndex + i) % topicList.length]);
  }
  return window;
}

// CORS — allow the local frontend page (opened via file://) and common localhost origins
const allowedOrigins = new Set([
  ALLOWED_ORIGIN,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'null',
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin) || origin === 'null' || origin.startsWith('file://')) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Rate limiting — per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,                          // 15 min window
  max: parseInt(process.env.RATE_LIMIT_MAX) || 50,   // max requests
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — slow down a bit and try again.' },
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));   // source text can be large

// ═══════════════════════════════════════════════════════
//  MODULE C · Routes
// ═══════════════════════════════════════════════════════

/**
 * GET /api/health
 * Quick ping to check the server is alive.
 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b' });
});

// Serve specific HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});



/**
 * POST /api/notes
 * Body: { sourceText: string }
 * Returns: { html: string }
 */
app.post('/api/notes', asyncHandler(async (req, res) => {
  const err = validateSource(req.body);
  if (err) return res.status(400).json({ error: err });

  const result = await callClaude(
    `Study material:\n\n${req.body.sourceText.slice(0, 12000)}\n\nGenerate the notes now.`,
    PROMPTS.notes
  );
  res.json(result);
}));

/**
 * POST /api/flashcards
 * Body: { sourceText: string }
 * Returns: { json: Array<{front, back}> }
 */
app.post('/api/flashcards', asyncHandler(async (req, res) => {
  const err = validateSource(req.body);
  if (err) return res.status(400).json({ error: err });

  const result = await callClaude(
    `Study material:\n\n${req.body.sourceText.slice(0, 12000)}\n\nGenerate 8 flashcards now.`,
    PROMPTS.flashcards
  );
  res.json(result);
}));

/**
 * POST /api/quiz
 * Body: { sourceText: string }
 * Returns: { json: Array<{question, options, correctIndex, explanation}> }
 */
app.post('/api/quiz', asyncHandler(async (req, res) => {
  const err = validateSource(req.body);
  if (err) return res.status(400).json({ error: err });

  const result = await callClaude(
    `Study material:\n\n${req.body.sourceText.slice(0, 12000)}\n\nGenerate the 5-question quiz now.`,
    PROMPTS.quiz
  );
  res.json(result);
}));

/**
 * POST /api/mindmap
 * Body: { sourceText: string }
 * Returns: { json: { topic, children } }
 */
app.post('/api/mindmap', asyncHandler(async (req, res) => {
  const err = validateSource(req.body);
  if (err) return res.status(400).json({ error: err });

  const result = await callClaude(
    `Study material:\n\n${req.body.sourceText.slice(0, 12000)}\n\nGenerate the mind map now.`,
    PROMPTS.mindmap
  );
  res.json(result);
}));

/**
 * POST /api/ask
 * Body: { sourceText: string, history: Array<{role, text}>, question: string }
 * Returns: { html: string }
 */
app.post('/api/ask', asyncHandler(async (req, res) => {
  const err = validateChat(req.body);
  if (err) return res.status(400).json({ error: err });

  const { sourceText, history = [], question } = req.body;
  const historyStr = history.slice(-6)
    .map(m => `${m.role === 'user' ? 'Student' : 'Study Buddy'}: ${m.text}`)
    .join('\n');

  const result = await callClaude(
    `Study material:\n\n${sourceText.slice(0, 10000)}\n\nConversation:\n${historyStr}\nStudent: ${question}\n\nAnswer now.`,
    PROMPTS.ask
  );
  res.json(result);
}));

/**
 * POST /api/planner
 * Body: { examDate: string, hours: string, topics: string }
 * Returns: { json: Array<{day, date, focus, tasks, type}> }
 */
app.post('/api/planner', asyncHandler(async (req, res) => {
  const err = validatePlan(req.body);
  if (err) return res.status(400).json({ error: err });

  const { examDate, hours, topics } = req.body;
  const hoursNum = parseFloat(hours);
  const topicList = parseTopicsInput(topics);
  if (!topicList.length) {
    return res.status(400).json({ error: 'Please provide at least one valid topic.' });
  }

  const startDate = parseDateOnly(new Date().toISOString().slice(0, 10));
  const exam = parseDateOnly(examDate);
  const totalDays = Math.floor((exam - startDate) / 86_400_000) + 1;
  const revisionDays = Math.max(1, Math.ceil(totalDays * 0.2));
  const revisionStartDay = Math.max(1, totalDays - revisionDays + 1);
  const studyDays = Math.max(0, totalDays - revisionDays);
  const phaseCycle = [
    {
      label: 'Basic Foundation',
      tasks: (topic, theoryHours, practiceHours) => [
        `Learn core basics of ${topic} and make short concept notes (${formatHours(theoryHours)}h)`,
        `Solve beginner-level questions on ${topic} and do 10-minute recall (${formatHours(practiceHours)}h)`,
      ],
    },
    {
      label: 'Intermediate Build',
      tasks: (topic, theoryHours, practiceHours) => [
        `Strengthen important patterns in ${topic} and refine notes (${formatHours(theoryHours)}h)`,
        `Solve intermediate questions for ${topic} with full steps (${formatHours(practiceHours)}h)`,
      ],
    },
    {
      label: 'Advanced Problem Solving',
      tasks: (topic, theoryHours, practiceHours) => [
        `Review edge cases and tricky scenarios for ${topic} (${formatHours(theoryHours)}h)`,
        `Practice advanced + exam-style problems for ${topic} (${formatHours(practiceHours)}h)`,
      ],
    },
    {
      label: 'Mastery Check',
      tasks: (topic, theoryHours, practiceHours) => [
        `Run a no-notes self-check for ${topic} and identify gaps (${formatHours(theoryHours)}h)`,
        `Redo weak advanced questions of ${topic} and correct mistakes (${formatHours(practiceHours)}h)`,
      ],
    },
  ];

  const studySlots = [];
  let pass = 0;
  while (studySlots.length < studyDays) {
    const phase = phaseCycle[pass % phaseCycle.length];
    const cycleNumber = Math.floor(pass / phaseCycle.length) + 1;
    for (const topic of topicList) {
      studySlots.push({ topic, phase, cycleNumber });
      if (studySlots.length >= studyDays) break;
    }
    pass++;
  }

  const plan = [];

  for (let day = 1; day <= totalDays; day++) {
    const date = formatDateUTC(addDaysUTC(startDate, day - 1));
    const isRevision = day >= revisionStartDay;
    const theoryRatio = isRevision ? 0.45 : 0.55;
    const studyBlockHours = Math.max(0.5, Math.round(hoursNum * theoryRatio * 10) / 10);
    const practiceBlockHours = Math.max(0.5, Math.round(hoursNum * (1 - theoryRatio) * 10) / 10);
    let focus = '';
    let tasks = [];

    if (!isRevision) {
      const slot = studySlots[day - 1];
      const cycleSuffix = slot.cycleNumber > 1 ? ` (Cycle ${slot.cycleNumber})` : '';
      focus = `${slot.phase.label}${cycleSuffix}: ${slot.topic}`;
      tasks = slot.phase.tasks(slot.topic, studyBlockHours, practiceBlockHours);
    } else {
      const revisionIndex = day - revisionStartDay;
      const revisionTopics = buildTopicWindow(topicList, revisionIndex, Math.min(3, topicList.length));
      const isMockDay = ((revisionIndex + 1) % 3 === 0) || (day === totalDays);
      const revisionLabel = revisionTopics.length > 1 ? revisionTopics.join(', ') : revisionTopics[0];
      focus = `Revision Sprint: ${revisionLabel}`;
      tasks = [
        `Revise key notes, formulas, and mistakes for ${revisionLabel} (${formatHours(studyBlockHours)}h)`,
        isMockDay
          ? `Take a timed mixed test from all covered topics, then analyze mistakes (${formatHours(practiceBlockHours)}h)`
          : `Solve mixed revision questions for ${revisionLabel} and mark weak points (${formatHours(practiceBlockHours)}h)`,
      ];
    }

    plan.push({
      day,
      date,
      focus,
      tasks,
      type: isRevision ? 'revision' : 'study',
    });
  }

  res.json({ json: plan });
}));

/**
 * POST /api/doubt
 * Body: { history: Array<{role, text}>, question: string }
 * Returns: { html: string }
 */
app.post('/api/doubt', asyncHandler(async (req, res) => {
  const err = validateChat(req.body, false); // false = no sourceText required
  if (err) return res.status(400).json({ error: err });

  const { history = [], question } = req.body;
  const historyStr = history.slice(-6)
    .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`)
    .join('\n');

  const result = await callClaude(
    `Conversation:\n${historyStr}\nStudent: ${question}\n\nAnswer now.`,
    PROMPTS.doubt
  );
  res.json(result);
}));

// ═══════════════════════════════════════════════════════
//  MODULE E · Error handling
// ═══════════════════════════════════════════════════════
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 for anything else
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ═══════════════════════════════════════════════════════
//  MODULE F · Start
// ═══════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n🚀  Study Buddy backend running at http://localhost:${PORT}`);
  console.log(`    Accepting requests from: ${ALLOWED_ORIGIN}\n`);
});
