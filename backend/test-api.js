// Integration test: starts the server, tests endpoints, then exits.
const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port: 3001, path, method, headers: { 'Content-Type': 'application/json' }, timeout: 5000 };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  // Import and start server
  require('./server');
  
  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 1000));

  let pass = 0, fail = 0;
  function assert(name, cond) {
    if (cond) { console.log('  ✅', name); pass++; }
    else { console.log('  ❌', name); fail++; }
  }

  console.log('\n--- API ENDPOINT TESTS ---\n');

  // 1. Health check
  const h = await request('GET', '/api/health');
  assert('GET /api/health returns 200', h.status === 200);
  assert('Health response has status', h.body.status === 'ok');

  // 2. AI status
  const s = await request('GET', '/api/ai/status');
  assert('GET /api/ai/status returns 200', s.status === 200);
  assert('AI status has online field', typeof s.body.online === 'boolean');

  // 3. Chat - normal message (Ollama offline → should return offline mode)
  const c = await request('POST', '/api/chat', { message: 'I feel stressed', sessionId: 'test-1', language: 'english' });
  assert('POST /api/chat returns 200', c.status === 200);
  assert('Chat returns offline or reply', c.body.offline === true || typeof c.body.reply === 'string');

  // 4. Chat - crisis message
  const cr = await request('POST', '/api/chat', { message: 'I want to kill myself', sessionId: 'test-2' });
  assert('Crisis message returns 200', cr.status === 200);
  assert('Crisis detected', cr.body.isCrisis === true);
  assert('Crisis has reply with helpline', cr.body.reply && cr.body.reply.includes('112'));

  // 5. Chat - Hindi crisis
  const hcr = await request('POST', '/api/chat', { message: 'mujhe khudkushi karni hai', sessionId: 'test-3' });
  assert('Hindi crisis detected', hcr.body.isCrisis === true);

  // 6. Chat - empty message
  const em = await request('POST', '/api/chat', { message: '', sessionId: 'test-4' });
  assert('Empty message returns 400', em.status === 400);

  // 7. Clear session
  const cl = await request('POST', '/api/chat/clear', { sessionId: 'test-1' });
  assert('Clear session returns success', cl.body.success === true);

  // 8. Emergency resources
  const r = await request('GET', '/api/resources');
  assert('GET /api/resources returns 200', r.status === 200);
  assert('Resources has india field', Array.isArray(r.body.india));

  // 9. 404
  const nf = await request('GET', '/api/nonexistent');
  assert('Unknown route returns 404', nf.status === 404);

  // 10. AI config update
  const cfg = await request('POST', '/api/ai/config', { model: 'test-model' });
  assert('AI config update succeeds', cfg.body.success === true);
  assert('Model updated in response', cfg.body.config.model === 'test-model');

  console.log(`\n--- RESULTS: ${pass} passed, ${fail} failed ---\n`);
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Test error:', e); process.exit(1); });
