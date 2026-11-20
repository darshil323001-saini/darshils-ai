// DARSHIL'S AI — Clean & Reliable AI Provider Layer
// Priority: gemini-3.8-flash → gemini-2.5-flash → Groq (if configured)

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY   = process.env.GROQ_API_KEY   || '';

function detectProvider() {
  if (GEMINI_KEY) return 'gemini';
  if (GROQ_KEY)   return 'groq';
  return 'offline';
}

const DEFAULT_CONFIG = {
  provider: detectProvider(),
  geminiModel:  process.env.GEMINI_MODEL  || 'gemini-3.8-flash',
  geminiApiKey: GEMINI_KEY,
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

async function checkProviderHealth() {
  const p = currentConfig.provider;
  if (p === 'gemini' && currentConfig.geminiApiKey) return { online: true, provider: 'gemini', model: currentConfig.geminiModel };
  if (p === 'groq'   && currentConfig.groqApiKey)   return { online: true, provider: 'groq',   model: currentConfig.groqModel };
  return { online: false, provider: 'offline', model: null };
}

// ── Call a specific Gemini model (25s timeout) ──────────────────────────────
async function callGeminiModel(modelName, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentConfig.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    throw new Error(`[${modelName} ${res.status}]: ${errMsg}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`[${modelName}]: Returned empty response.`);
  return text;
}

// ── Gemini API with clean fallback ──────────────────────────────────────────
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

  const modelsToTry = [...new Set([
    currentConfig.geminiModel, // Pehle gemini-3.8-flash
    'gemini-2.5-flash'         // Backup
  ])];

  const errors = [];
  for (const model of modelsToTry) {
    try {
      return await callGeminiModel(model, body);
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.join(' | '));
}

// ── Groq API call ───────────────────────────────────────────────────────────
async function chatWithGroq(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
    signal: AbortSignal.timeout(20000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Groq (${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned an empty response.');
  return text;
}

// ── Unified chat function ───────────────────────────────────────────────────
async function chat(messages) {
  const p = currentConfig.provider;
  if (p === 'gemini') {
    try {
      return await chatWithGemini(messages);
    } catch (err) {
      if (currentConfig.groqApiKey) {
        return await chatWithGroq(messages);
      }
      throw err;
    }
  }
  if (p === 'groq') return chatWithGroq(messages);
  throw new Error('No AI provider configured.');
}

module.exports = { configure, getConfig, checkProviderHealth, chat };
