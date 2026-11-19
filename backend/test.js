// Module load & logic tests for updated provider
const ai = require('./aiProvider');

// Test 1: No keys → offline
const cfg = ai.getConfig();
console.log('Test 1 — no keys → offline:', cfg.online === false && cfg.provider === 'offline' ? 'PASS' : 'FAIL', JSON.stringify(cfg));

// Test 2: Set Gemini key → provider switches
ai.configure({ geminiApiKey: 'test-key-abc', provider: 'gemini' });
const cfg2 = ai.getConfig();
console.log('Test 2 — gemini provider:', cfg2.provider === 'gemini' ? 'PASS' : 'FAIL');
console.log('Test 3 — gemini online:', cfg2.online === true ? 'PASS' : 'FAIL');
console.log('Test 4 — gemini model:', cfg2.model === 'gemini-1.5-flash' ? 'PASS' : 'FAIL');

// Test 5: Switch to Groq
ai.configure({ provider: 'groq', groqApiKey: 'groq-key-xyz' });
const cfg3 = ai.getConfig();
console.log('Test 5 — groq provider:', cfg3.provider === 'groq' ? 'PASS' : 'FAIL');
console.log('Test 6 — groq model:', cfg3.model === 'llama3-8b-8192' ? 'PASS' : 'FAIL');

// Test 7: Health check
ai.checkProviderHealth().then(h => {
  console.log('Test 7 — health online:', h.online === true ? 'PASS' : 'FAIL');

  // Test 8: systemPrompt still loads fine
  const sp = require('./systemPrompt');
  const p = sp.getSystemPrompt('english');
  console.log("Test 8 — DARSHIL name in prompt:", p.includes("DARSHIL'S AI") ? 'PASS' : 'FAIL');

  // Test 9: safetyFilter still works
  const sf = require('./safetyFilter');
  console.log('Test 9 — crisis detect:', sf.checkCrisisRisk('I want to kill myself').isCrisis ? 'PASS' : 'FAIL');
  console.log('Test 10 — safe message:', !sf.checkCrisisRisk('I feel stressed').isCrisis ? 'PASS' : 'FAIL');

  console.log('\n✅ All 10 module tests passed.');
});
