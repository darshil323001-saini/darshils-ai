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
  groqModel:    process.env.GROQ_MODEL    || 'llama-3.3-70b-versatile',
  groqApiKey:   GROQ_KEY,
};

let currentConfig = { ...DEFAULT_CONFIG };

function configure(overrides) {
  currentConfig = { ...currentConfig, ...overrides };
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

// ── Health check ────────────────────────────────────────────────────────────
async function checkProviderHealth() {
  const p = currentConfig.provider;
  if (p === 'gemini' && currentConfig.geminiApiKey) return { online: true, provider: 'gemini', model: currentConfig.geminiModel };
  if (p === 'groq'   && currentConfig.groqApiKey)   return { online: true, provider: 'groq',   model: currentConfig.groqModel };
  return { online: false, provider: 'offline', model: null };
}

// Helper: wait ms
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Gemini API call (with Auto-Retry for 503/429) ───────────────────────────
async function chatWithGemini(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMsgs  = messages.filter(m => m.role !== 'system');

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

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data?.error?.message || JSON.stringify(data);
        // Retry automatically on temporary overload (503) or rate limit (429)
        if ((res.status === 503 || res.status === 429) && attempt < 3) {
          await sleep(1500 * attempt);
          continue;
        }
        throw new Error(`Gemini API error (${res.status}): ${errMsg}`);
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned an empty response. Check your API key and quota.');
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < 3 && (err.name === 'TimeoutError' || err.message.includes('503'))) {
        await sleep(1500 * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ── Groq API call ───────────────────────────────────────────────────────────
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
    signal: AbortSignal.timeout(45000),
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

// ── Unified chat function (with automatic fallback) ─────────────────────────
async function chat(messages) {
  const p = currentConfig.provider;
  if (p === 'gemini') {
    try {
      return await chatWithGemini(messages);
    } catch (err) {
      // If Gemini fails and Groq backup key exists, seamlessly switch to Groq
      if (currentConfig.groqApiKey) {
        return await chatWithGroq(messages);
      }
      throw err;
    }
  }
  if (p === 'groq') return chatWithGroq(messages);
  throw new Error('No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY in environment.');
}

module.exports = { configure, getConfig, checkProviderHealth, chat };
