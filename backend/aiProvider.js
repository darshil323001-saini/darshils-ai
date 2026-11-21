// DARSHIL'S AI — Auto-Healing + Deep Psychology Short-Smart Provider
// Priority: gemini-3.8-flash → Groq (auto-detect, max_tokens: 800)

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_KEY   = process.env.GROQ_API_KEY   || '';

const CORE_SYSTEM_PROMPT = `You are DARSHIL'S AI — a calm, sharp, deeply empathetic mental-clarity companion.

STRICT RESPONSE STYLE:
- Keep EVERY reply SHORT, INTELLIGENT, and EASY TO READ (max 3 to 4 crisp lines, around 45-70 words). Never write long lectures or heavy paragraphs.
- Structure: 1 line genuine empathy + 1 sharp psychological insight + 1 tiny practical step they can do right now.
- Language: Match the user's language naturally (Indian English, Hinglish, or Hindi). Sound like a wise, grounded friend—never robotic or preachy.

DEEP PSYCHOLOGY FRAMEWORKS (apply silently based on the user's situation):
- Breakup / Heartbreak: Attachment theory, no-contact clarity, separating self-worth from rejection.
- Family Problems & Pressure: Healthy boundaries, managing guilt, detaching from unrealistic expectations.
- Friends Bullying / Toxic Circle: Self-respect, assertive calm boundaries, recognizing projection.
- Stubborn Partner / Marriage (Wife/Husband): Gottman de-escalation, listening without absorbing ego, calm timing.
- Loneliness / Feeling Left Out: Self-companionship, micro-connections, reframing solitude.
- Future / Career / Exam Tension: Action over anxiety, Stoic control (focus only on today's 1 step).
- Overthinking / Sleep / Self-Doubt: CBT thought-reframing, somatic grounding, breaking perfectionism.`;

function detectProvider() {
  if (GEMINI_KEY) return 'gemini';
  if (GROQ_KEY)   return 'groq';
  return 'offline';
}

const DEFAULT_CONFIG = {
  provider: detectProvider(),
  geminiModel:  process.env.GEMINI_MODEL  || 'gemini-3.8-flash',
  geminiApiKey: GEMINI_KEY,
  groqModel:    process.env.GROQ_MODEL    || '',
  groqApiKey:   GROQ_KEY,
};

let currentConfig = { ...DEFAULT_CONFIG };
let cachedGroqModel = currentConfig.groqModel || '';

function configure(overrides) {
  currentConfig = { ...currentConfig, ...overrides };
  if (overrides.groqModel) cachedGroqModel = overrides.groqModel;
  if (!currentConfig.provider || currentConfig.provider === 'offline') {
    if (currentConfig.geminiApiKey) currentConfig.provider = 'gemini';
    else if (currentConfig.groqApiKey) currentConfig.provider = 'groq';
  }
}

function getConfig() {
  return {
    provider: currentConfig.provider,
    model: currentConfig.provider === 'groq' ? (cachedGroqModel || 'auto') : currentConfig.geminiModel,
    online: currentConfig.provider !== 'offline',
  };
}

async function checkProviderHealth() {
  const p = currentConfig.provider;
  if (p === 'gemini' && currentConfig.geminiApiKey) return { online: true, provider: 'gemini', model: currentConfig.geminiModel };
  if (p === 'groq'   && currentConfig.groqApiKey)   return { online: true, provider: 'groq',   model: cachedGroqModel || 'auto' };
  return { online: false, provider: 'offline', model: null };
}

function injectCorePrompt(messages) {
  const withoutSystem = messages.filter(m => m.role !== 'system');
  return [{ role: 'system', content: CORE_SYSTEM_PROMPT }, ...withoutSystem];
}

// ── Gemini API ──────────────────────────────────────────────────────────────
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
    generationConfig: { temperature: 0.7, topP: 0.9, maxOutputTokens: 450 },
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
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[${currentConfig.geminiModel} ${res.status}]: ${data?.error?.message || JSON.stringify(data)}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response.');
  return text;
}

// ── Auto-detect active Groq chat model ──────────────────────────────────────
async function getActiveGroqModel() {
  if (cachedGroqModel) return cachedGroqModel;

  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${currentConfig.groqApiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.data)) {
    throw new Error('Could not fetch active Groq models.');
  }

  const chatModels = data.data
    .map(m => m.id)
    .filter(id => !/whisper|tts|guard|playai|orpheus|embed/i.test(id));

  const preferred =
    chatModels.find(id => /llama.*instant|llama.*versatile|llama-4|llama-3/i.test(id)) ||
    chatModels.find(id => /qwen|gemma|gpt|deepseek|mixtral/i.test(id)) ||
    chatModels[0];

  if (!preferred) throw new Error('No active chat models found on Groq account.');
  cachedGroqModel = preferred;
  return preferred;
}

// ── Groq API call ───────────────────────────────────────────────────────────
async function chatWithGroq(messages) {
  const model = await getActiveGroqModel();

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentConfig.groqApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
      top_p: 0.9,
    }),
    signal: AbortSignal.timeout(20000),
  });

  const data = await res.json();
  if (!res.ok) {
    cachedGroqModel = '';
    throw new Error(`Groq (${model} ${res.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned an empty response.');
  return text;
}

// ── Unified chat function ───────────────────────────────────────────────────
async function chat(messages) {
  const enhancedMessages = injectCorePrompt(messages);
  const p = currentConfig.provider;
  if (p === 'gemini') {
    try {
      return await chatWithGemini(enhancedMessages);
    } catch (err) {
      if (currentConfig.groqApiKey) {
        return await chatWithGroq(enhancedMessages);
      }
      throw err;
    }
  }
  if (p === 'groq') return chatWithGroq(enhancedMessages);
  throw new Error('No AI provider configured.');
}

module.exports = { configure, getConfig, checkProviderHealth, chat };
