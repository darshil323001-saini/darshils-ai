// DARSHIL'S AI — Backend Server (zero npm dependencies)

// ── Load .env file (zero npm deps) ───────────────────────────────────────────
const fs = require('fs');
const path = require('path');
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

const http = require('http');
const { URL } = require('url');
const { checkCrisisRisk, EMERGENCY_RESOURCES } = require('./safetyFilter');
const { getSystemPrompt } = require('./systemPrompt');
const { configure, getConfig, checkProviderHealth, chat } = require('./aiProvider');

const PORT = process.env.PORT || 3001;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
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
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// In-memory session store (RAM only, never persisted)
const sessions = new Map();

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { messages: [], language: 'english', profile: null, createdAt: Date.now() });
  }
  return sessions.get(id);
}

// ── Routes ───────────────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // ─ Health ──────────────────────────────────────────────────────────────────
  if (path === '/api/health' && req.method === 'GET') {
    const ai = await checkProviderHealth();
    return sendJson(res, 200, {
      status: 'ok',
      ai: { provider: ai.provider, model: ai.model, online: ai.online }
    });
  }

  // ─ AI Status ───────────────────────────────────────────────────────────────
  if (path === '/api/ai/status' && req.method === 'GET') {
    const ai = await checkProviderHealth();
    return sendJson(res, 200, {
      online: ai.online,
      provider: ai.provider,
      model: ai.model,
    });
  }

  // ─ Update AI Config ────────────────────────────────────────────────────────
  if (path === '/api/ai/config' && req.method === 'POST') {
    const body = await parseBody(req);
    const overrides = {};
    if (body.geminiApiKey) overrides.geminiApiKey = body.geminiApiKey;
    if (body.geminiModel)  overrides.geminiModel  = body.geminiModel;
    if (body.groqApiKey)   overrides.groqApiKey   = body.groqApiKey;
    if (body.groqModel)    overrides.groqModel    = body.groqModel;
    if (body.provider)     overrides.provider     = body.provider;
    configure(overrides);
    return sendJson(res, 200, { success: true, config: getConfig() });
  }

  // ─ Chat ────────────────────────────────────────────────────────────────────
  if (path === '/api/chat' && req.method === 'POST') {
    const body = await parseBody(req);
    const { message, sessionId = 'default', language = 'english', profile = null } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return sendJson(res, 400, { error: 'Message is required.' });
    }

    // 1. Safety check FIRST — always, before any AI call
    const crisis = checkCrisisRisk(message);
    if (crisis.isCrisis) {
      return sendJson(res, 200, {
        reply: crisis.message,
        isCrisis: true,
        resources: crisis.resources,
        source: 'safety-filter'
      });
    }

    // 2. Build conversation context
    const session = getSession(sessionId);
    if (profile) session.profile = profile;
    session.language = language;
    session.messages.push({ role: 'user', content: message });

    // Keep context window manageable (last 40 messages)
    if (session.messages.length > 40) {
      session.messages = session.messages.slice(-40);
    }

    const systemMsg  = { role: 'system', content: getSystemPrompt(language, session.profile) };
    const chatMessages = [systemMsg, ...session.messages];

    // 3. Check provider availability
    const aiStatus = await checkProviderHealth();
    if (!aiStatus.online) {
      return sendJson(res, 200, {
        reply: null,
        offline: true,
        offlineMessage: 'No AI provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY in the backend .env file to enable AI chat.',
        source: 'offline'
      });
    }

    // 4. Call AI
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
      return sendJson(res, 500, { error: `AI request failed: ${err.message}`, source: 'error' });
    }
  }

  // ─ Clear Session ───────────────────────────────────────────────────────────
  if (path === '/api/chat/clear' && req.method === 'POST') {
    const body = await parseBody(req);
    const sid = body.sessionId || 'default';
    sessions.delete(sid);
    return sendJson(res, 200, { success: true });
  }

  // ─ Emergency Resources ─────────────────────────────────────────────────────
  if (path === '/api/resources' && req.method === 'GET') {
    return sendJson(res, 200, EMERGENCY_RESOURCES);
  }

  // ─ 404 ─────────────────────────────────────────────────────────────────────
  sendJson(res, 404, { error: 'Not found' });
}

// ── Start ─────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  const cfg = getConfig();
  console.log(`\n  🧠 DARSHIL'S AI Backend running on http://localhost:${PORT}`);
  console.log(`  🤖 Provider: ${cfg.provider}  |  Model: ${cfg.model || 'none'}`);
  if (!cfg.online) {
    console.log(`  ⚠️  No API key found. Set GEMINI_API_KEY or GROQ_API_KEY in environment.\n`);
  } else {
    console.log(`  ✅ AI provider ready.\n`);
  }
});
