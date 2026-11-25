// AUREVIA — Hardened Backend Server (zero npm dependencies)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

// ── Load .env file (zero npm deps) ───────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
  console.log('  📄 Loaded .env file');
}

const { checkCrisisRisk, EMERGENCY_RESOURCES } = require('./safetyFilter');
const { getSystemPrompt } = require('./systemPrompt');
const { configure, getConfig, checkProviderHealth, chat } = require('./aiProvider');

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_BODY_BYTES = 16 * 1024; // 16 KB max payload
const MAX_MSG_LENGTH = 2000;
const ALLOWED_LANGS = new Set(['english', 'hinglish', 'hindi']);

// ── Rate Limiter (25 req / min per IP) ───────────────────────────────────────
const rateMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQ = 25;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX_REQ;
}

// ── In-Memory Session Store (RAM only, auto-expires after 1 hr) ──────────────
const sessions = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 500;

function getSession(id) {
  const safeId = String(id || 'default').slice(0, 64);
  if (!sessions.has(safeId)) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      sessions.delete(oldestKey);
    }
    sessions.set(safeId, { messages: [], language: 'english', profile: null, lastActive: Date.now() });
  }
  const s = sessions.get(safeId);
  s.lastActive = Date.now();
  return s;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions.entries()) {
    if (now - v.lastActive > SESSION_TTL_MS) sessions.delete(k);
  }
  for (const [ip, v] of rateMap.entries()) {
    if (now > v.resetAt) rateMap.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// ── Helpers ──────────────────────────────────────────────────────────────────
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        return reject(new Error('PAYLOAD_TOO_LARGE'));
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(data));
}

// ── Routes ───────────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret'
    });
    return res.end();
  }

  // ─ Health & AI Status ──────────────────────────────────────────────────────
  if (route === '/api/health' && req.method === 'GET') {
    const ai = await checkProviderHealth();
    return sendJson(res, 200, {
      app: 'AUREVIA',
      status: 'ok',
      ai: { provider: ai.provider, model: ai.model, online: ai.online }
    });
  }

  if (route === '/api/ai/status' && req.method === 'GET') {
    const ai = await checkProviderHealth();
    return sendJson(res, 200, { online: ai.online, provider: ai.provider, model: ai.model });
  }

  // ─ Admin-Only AI Config (Locked by default) ────────────────────────────────
  if (route === '/api/ai/config' && req.method === 'POST') {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    try {
      const body = await parseBody(req);
      const overrides = {};
      if (body.geminiApiKey) overrides.geminiApiKey = body.geminiApiKey;
      if (body.geminiModel)  overrides.geminiModel  = body.geminiModel;
      if (body.groqApiKey)   overrides.groqApiKey   = body.groqApiKey;
      if (body.groqModel)    overrides.groqModel    = body.groqModel;
      if (body.provider)     overrides.provider     = body.provider;
      configure(overrides);
      return sendJson(res, 200, { success: true });
    } catch {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
  }

  // ─ Chat ────────────────────────────────────────────────────────────────────
  if (route === '/api/chat' && req.method === 'POST') {
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      return sendJson(res, 429, { error: 'Too many messages. Please pause for a minute and try again.' });
    }

    let body;
    try {
      body = await parseBody(req);
    } catch (e) {
      return sendJson(res, 413, { error: 'Request too large.' });
    }

    const rawMsg = typeof body.message === 'string' ? body.message.trim() : '';
    if (!rawMsg) return sendJson(res, 400, { error: 'Message is required.' });
    if (rawMsg.length > MAX_MSG_LENGTH) {
      return sendJson(res, 400, { error: `Message is too long (max ${MAX_MSG_LENGTH} characters).` });
    }

    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : 'default';
    const language = ALLOWED_LANGS.has(body.language) ? body.language : 'english';

    // 1. Safety check FIRST — before any AI provider call
    const crisis = checkCrisisRisk(rawMsg);
    if (crisis.isCrisis) {
      return sendJson(res, 200, {
        reply: crisis.message,
        isCrisis: true,
        resources: crisis.resources,
        source: 'safety-filter'
      });
    }

    // 2. Build isolated conversation context
    const session = getSession(sessionId);
    session.language = language;
    session.messages.push({ role: 'user', content: rawMsg });
    if (session.messages.length > 30) {
      session.messages = session.messages.slice(-30);
    }

    const systemMsg = { role: 'system', content: getSystemPrompt(language, session.profile) };
    const chatMessages = [systemMsg, ...session.messages];

    // 3. Check provider availability
    const aiStatus = await checkProviderHealth();
    if (!aiStatus.online) {
      return sendJson(res, 200, {
        reply: null,
        offline: true,
        offlineMessage: 'AUREVIA AI is currently offline. Please try again later.',
        source: 'offline'
      });
    }

    // 4. Call AI (sanitized error handling)
    try {
      const reply = await chat(chatMessages);
      session.messages.push({ role: 'assistant', content: reply });
      return sendJson(res, 200, {
        reply,
        isCrisis: false,
        source: aiStatus.provider,
        model: aiStatus.model
      });
    } catch (err) {
      console.error('  ❌ AI error:', err.message);
      return sendJson(res, 502, { error: 'AUREVIA could not respond right now. Please tap Retry.', source: 'error' });
    }
  }

  // ─ Clear Session ───────────────────────────────────────────────────────────
  if (route === '/api/chat/clear' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const sid = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : 'default';
      sessions.delete(sid);
    } catch {}
    return sendJson(res, 200, { success: true });
  }

  // ─ Emergency Resources ─────────────────────────────────────────────────────
  if (route === '/api/resources' && req.method === 'GET') {
    return sendJson(res, 200, EMERGENCY_RESOURCES);
  }

  sendJson(res, 404, { error: 'Not found' });
}

// ── Start ─────────────────────────────────────────────────────────────────────
const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  const cfg = getConfig();
  console.log(`\n  🌿 AUREVIA Backend running on http://localhost:${PORT}`);
  console.log(`  🤖 Provider: ${cfg.provider}  |  Model: ${cfg.model || 'none'}`);
  if (!cfg.online) {
    console.log(`  ⚠️  No API key found. Set GEMINI_API_KEY or GROQ_API_KEY in environment.\n`);
  } else {
    console.log(`  ✅ AI provider ready.\n`);
  }
});
