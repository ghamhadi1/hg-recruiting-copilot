// Checks the portal's security basics without any real accounts.
// Run: node tests/test_portal_api.js
const assert = require('assert');
const path = require('path');
process.env.PORTAL_PASSWORD = 'correct horse';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_mock';
let lastHeaders = null;
global.fetch = async (url, opts) => { lastHeaders = opts.headers; return { ok: true, status: 200, text: async () => '[]' }; };

const api = f => require(path.join(__dirname, '..', 'portal', 'api', f));
function call(handler, req) {
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(b) { resolve({ status: this.statusCode, headers: this.headers, body: JSON.parse(b || '{}') }); } };
    handler(Object.assign({ headers: {}, query: {}, method: 'GET' }, req), res);
  });
}

(async () => {
  const noCookie = await call(api('data.js'), { query: { view: 'roles' } });
  assert.strictEqual(noCookie.status, 401, 'data without login must be 401');
  const forged = await call(api('data.js'), { query: { view: 'roles' }, headers: { cookie: 'hg_session=abc' } });
  assert.strictEqual(forged.status, 401, 'forged cookie must be 401');
  const act = await call(api('action.js'), { method: 'POST', body: { action: 'run_eval' } });
  assert.strictEqual(act.status, 401, 'actions without login must be 401');

  const bad = await call(api('login.js'), { method: 'POST', body: { password: 'nope' } });
  assert.strictEqual(bad.status, 401);
  const good = await call(api('login.js'), { method: 'POST', body: { password: 'correct horse' } });
  assert.strictEqual(good.status, 200);
  const cookie = good.headers['set-cookie'];
  assert.ok(/HttpOnly/.test(cookie) && /Secure/.test(cookie), 'cookie is HttpOnly + Secure');
  const session = cookie.split(';')[0];

  const ok = await call(api('data.js'), { query: { view: 'roles' }, headers: { cookie: session } });
  assert.strictEqual(ok.status, 200);
  assert.ok(!lastHeaders.Authorization, 'new sb_secret_ keys are not sent as Bearer');
  assert.strictEqual(lastHeaders.apikey, 'sb_secret_mock');

  const unknown = await call(api('data.js'), { query: { view: 'secrets' }, headers: { cookie: session } });
  assert.strictEqual(unknown.status, 400);
  console.log('portal API security checks: all passed');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
