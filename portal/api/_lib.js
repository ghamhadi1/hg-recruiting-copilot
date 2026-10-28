// Shared server-side helpers. Secrets live only in Vercel environment variables.
const crypto = require('crypto');

const env = k => (process.env[k] || '').trim();

function sessionToken() {
  return crypto.createHmac('sha256', env('SESSION_SECRET') || 'hg-' + env('PORTAL_PASSWORD'))
    .update('hg-portal-v1:' + env('PORTAL_PASSWORD')).digest('hex');
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  if (!env('PORTAL_PASSWORD')) return false;
  const a = Buffer.from(cookies(req).hg_session || '');
  const b = Buffer.from(sessionToken());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// Supabase REST with the service key (server only). New sb_secret_ keys go in "apikey" only.
async function sb(pathAndQuery, opts) {
  opts = opts || {};
  const key = env('SUPABASE_SERVICE_KEY');
  const headers = Object.assign({ apikey: key, 'Content-Type': 'application/json' }, opts.headers || {});
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/' + pathAndQuery, {
    method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error('Database error ' + r.status + ': ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

async function settings() {
  const rows = await sb('hg_settings?select=key,value');
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return s;
}

// Calls one of our n8n webhooks with the shared secret header.
async function n8n(path, body, timeoutMs) {
  const base = env('N8N_BASE_URL').replace(/\/$/, '');
  const prefix = env('WEBHOOK_PATH_PREFIX') || 'hg-p3';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 55000);
  try {
    const r = await fetch(base + '/webhook/' + prefix + '-' + path, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-HG-Secret': env('WEBHOOK_SECRET') },
      body: JSON.stringify(body || {})
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { message: text.slice(0, 300) }; }
    if (!r.ok) throw new Error('n8n ' + r.status + ': ' + (data.message || text).slice(0, 300));
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function ghl(path) {
  const r = await fetch('https://services.leadconnectorhq.com' + path, {
    headers: { Authorization: 'Bearer ' + env('GHL_API_KEY'), Version: '2021-07-28', Accept: 'application/json' }
  });
  const text = await r.text();
  if (!r.ok) throw new Error('GHL ' + r.status + ': ' + text.slice(0, 200));
  return JSON.parse(text);
}

module.exports = { env, sessionToken, isAuthed, send, readJson, sb, settings, n8n, ghl };
