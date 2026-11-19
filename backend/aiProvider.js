// DARSHIL'S AI — AI Provider Abstraction Layer
// Supports Google Gemini API and Groq API via env vars.
// Zero extra npm dependencies — uses Node 18+ built-in fetch.

// ── Provider detection ──────────────────────────────────────────────────────
// Priority: GEMINI_API_KEY → GROQ_API_KEY → offline
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY   = process.env.GROQ_API_KEY   || '';

function detectProvider() {
  if (GEMINI_KEY) return 'gemini';
  if (GROQ_KEY)   return 'groq';
  return 'offline';
}

const DEFAULT_CONFIG = {
  provider: detectProvider(),
  // Gemini defaults
  geminiModel:  process.env.GEMINI_MODEL  || 'gemini-3.8-flash',
  geminiApiKey: GEMINI_KEY,
  // Groq defaults
  groqModel:    process.env.GROQ_MODEL    || 'llama3-8b-8192',
  groqApiKey:   GROQ_KEY,
};

let currentConfig = { ...DEFAULT_CONFIG };

function configure(overrides) {
  currentConfig = { ...currentConfig, ...overrides };
  // Re-detect provider whenever keys change
  if (!currentConfig.provider || currentConfig.provider === 'offline') {
    if (currentConfig.geminiApiKey) currentConfig.provider = 'gemini';
    else if (currentConfig.groqApiKey) currentConfig.provider = 'groq';
  }
}

function getConfig() {
  return {
    provider: currentConfig.provider,
    model: currentConfig.provider === 'groq' ? currentConfig.groqModel : currentConfig.geminiModel,
    online: currentConfig.provider !== 'offline',
  };
}

// ── Health check (synchronous determination — no network ping needed) ───────
async function checkProviderHealth() {
  const p = currentConfig.provider;
  if (p === 'gemini' && currentConfig.geminiApiKey) return { online: true, provider: 'gemini', model: currentConfig.geminiModel };
  if (p === 'groq'   && currentConfig.groqApiKey)   return { online: true, provider: 'groq',   model: currentConfig.groqModel };
  return { online: false, provider: 'offline', model: null };
}

// ── Gemini API call ─────────────────────────────────────────────────────────
// Uses the Gemini generateContent REST endpoint (free tier).
// Converts OpenAI-style messages [{role, content}] to Gemini's format.
async function chatWithGemini(messages) {
  // Split system prompt from conversation
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs  = messages.filter(m => m.role !== 'system');

  // Gemini uses "user" and "model" roles (not "assistant")
  const contents = chatMsgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const body = {
    system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
    contents,
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
    ],
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentConfig.geminiModel}:generateContent?key=${currentConfig.geminiApiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Gemini API error (${res.status}): ${errMsg}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response. Check your API key and quota.');
  return text;
}

// ── Groq API call ───────────────────────────────────────────────────────────
// Groq is OpenAI-compatible — uses /openai/v1/chat/completions.
async function chatWithGroq(messages) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentConfig.groqApiKey}`,
    },
    body: JSON.stringify({
      model: currentConfig.groqModel,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9,
    }),
    signal: AbortSignal.timeout(60000),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Groq API error (${res.status}): ${errMsg}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned an empty response. Check your API key and quota.');
  return text;
}

// ── Unified chat function ───────────────────────────────────────────────────
async function chat(messages) {
  const p = currentConfig.provider;
  if (p === 'gemini') return chatWithGemini(messages);
  if (p === 'groq')   return chatWithGroq(messages);
  throw new Error('No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY in environment.');
}

module.exports = { configure, getConfig, checkProviderHealth, chat };
