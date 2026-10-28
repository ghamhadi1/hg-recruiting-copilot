// Local preview of the portal with FAKE data (no accounts needed).
// Run: node tests/portal_dev_server.js  → http://localhost:3939  (password: demo)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

process.env.PORTAL_PASSWORD = 'demo';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'eyJmock';
process.env.N8N_BASE_URL = 'https://mock-n8n';
process.env.WEBHOOK_SECRET = 'x';

const ROOT = path.join(__dirname, '..', 'portal');
const now = Date.now();
const ago = m => new Date(now - m * 60000).toISOString();
const role = { id: 1, title: 'GHL Automation Specialist', client_name: 'BrightPath Marketing', status: 'approved', version: 2,
  search_query: '3+ years GoHighLevel, Zapier or Make, webhooks; Arabic preferred', decided_by: 'maya', decided_at: ago(30), created_at: ago(90),
  feedback: 'Make Arabic preferred, not required.',
  jd: { open_questions: ['Interview process not specified'], internal_notes: ['Client hinted budget can stretch above $2,400'] },
  jd_markdown: '# GHL Automation Specialist\n_A US marketing agency (14 people) running everything on GoHighLevel_\n\n## About the role\nOwn the GoHighLevel side: workflows, snapshots, sub-accounts.\n\n## Must-haves\n- 3+ years of GoHighLevel\n- Zapier or Make\n- Webhooks and basic JSON\n\n## Nice-to-haves\n- n8n\n- Arabic (preferred)\n\n## Details\n- Hours: 4h overlap, 9am-1pm Central\n- Pay: $1,800-2,400/month' };
const mk = (id, name, score, reason, file, status, outreach) => ({ id, rank: id, score, reason, evidence: '5 years of hands-on GoHighLevel', cv_file_name: file, status,
  decided_by: status !== 'suggested' ? 'maya' : null, hg_candidates: { id, full_name: name, location: 'Beirut, Lebanon' }, hg_cvs: { status: 'active' }, hg_outreach: outreach });
const DB = {
  hg_settings: [{ key: 'ghl_location_id', value: '' }, { key: 'ghl_pipeline_id', value: '' }],
  hg_roles: [role, Object.assign({}, role, { id: 2, title: 'Remote Bookkeeper (QBO)', client_name: 'Harbor Dental Group', status: 'pending_approval', version: 1 })],
  hg_shortlist: [
    mk(1, 'Omar Haddad', 91, '5.2 yrs GoHighLevel, 120+ workflows, Zapier + Make, webhooks\nArabic native, French basic', 'Omar_Haddad_CV.pdf', 'approved', { id: 1, status: 'replied', step: 1, max_steps: 3, stopped_reason: 'Candidate replied' }),
    mk(2, 'Sara Nasser', 86, '4 yrs GoHighLevel, owns 30 sub-accounts, Make + webhooks\nArabic native; CV was a scan (read with OCR)', 'Scan_0007.pdf', 'approved', { id: 2, status: 'active', step: 1, max_steps: 3 }),
    mk(3, 'Lina Khoury', 84, 'GoHighLevel since 2023 plus 40+ n8n workflows\nArabic native; updated CV Oct 2026', 'Lina Khoury - Resume 2026.pdf', 'suggested', null),
    mk(4, 'Youssef El Amrani', 78, '3 yrs GoHighLevel + n8n, 60+ workflows\nArabic + French; exactly at the 3-year minimum', 'Youssef-ElAmrani-CV.docx', 'rejected', null)],
  hg_outreach: [{ role_id: 1, status: 'replied' }, { role_id: 1, status: 'active' }],
  hg_candidates: Array.from({ length: 55 }, (_, i) => ({ id: i })),
  hg_cvs: [
    { id: 1, file_name: 'Omar_Haddad_CV.pdf', status: 'active', extraction_method: 'text', uploaded_at: ago(200), hg_candidates: { full_name: 'Omar Haddad' } },
    { id: 2, file_name: 'omar haddad cv final.docx', status: 'duplicate', status_note: 'Same person (matched by email) and same CV as Omar_Haddad_CV.pdf', extraction_method: 'text', uploaded_at: ago(190), hg_candidates: { full_name: 'Omar Haddad' } },
    { id: 3, file_name: 'Scan_0007.pdf', status: 'active', extraction_method: 'ocr', uploaded_at: ago(180), hg_candidates: { full_name: 'Sara Nasser' } },
    { id: 4, file_name: 'Lina_Khoury_CV.docx', status: 'superseded', status_note: 'Replaced by newer CV Lina Khoury - Resume 2026.pdf', extraction_method: 'text', uploaded_at: ago(170), hg_candidates: { full_name: 'Lina Khoury' } },
    { id: 5, file_name: 'corrupt_cv.pdf', status: 'unreadable', status_note: 'Too little text even after OCR (0 letters)', extraction_method: 'ocr', uploaded_at: ago(160), hg_candidates: null }],
  hg_eval_questions: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'questions.json'), 'utf8')),
  hg_eval_runs: [],
  hg_events: [{ kind: 'candidate_replied', message: 'Omar Haddad replied: sequence stopped', created_at: ago(5) },
    { kind: 'outreach_sent', message: 'Outreach email 1 sent to me+hg-c2@example.com', created_at: ago(12) },
    { kind: 'cv_unreadable', message: 'Unreadable CV: corrupt_cv.pdf', created_at: ago(160) }]
};
const qs = DB.hg_eval_questions;
DB.hg_eval_runs = [{ id: 1, status: 'done', score: 9, total: 10, started_at: ago(40), finished_at: ago(37), results: qs.map(q => ({
  id: q.id, passed: q.id !== 5, problems: q.id === 5 ? ['missing diego.ramirez@example.org'] : [], bot_answer: q.expect_no_match ? 'No good match: nobody scored 60+.' : '',
  results: q.expect_no_match ? [] : [{ name: 'Example Person', score: 82, cv_file_name: 'Example.pdf' }] })) }];

// fake fetch for Supabase / n8n
global.fetch = async (url, opts) => {
  const u = new URL(url);
  let body = [];
  if (u.hostname === 'mock.supabase.co') {
    const table = u.pathname.split('/').pop();
    body = DB[table] || [];
    const id = u.searchParams.get('id');
    if (id && id.startsWith('eq.')) body = body.filter(r => String(r.id) === id.slice(3));
    const rid = u.searchParams.get('role_id');
    if (table === 'hg_shortlist' && rid && rid.startsWith('eq.') && rid !== 'eq.1') body = [];
  } else {
    body = { ok: true, message: 'mock n8n accepted', action: 'new', results: [], closest: [], no_match: true };
  }
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
};

const handlers = { data: require(path.join(ROOT, 'api', 'data.js')), action: require(path.join(ROOT, 'api', 'action.js')), login: require(path.join(ROOT, 'api', 'login.js')) };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__width') {  // layout debug helper
    res.setHeader('Content-Type', 'text/html');
    return res.end('<body style="font:40px sans-serif"><script>document.body.textContent="viewport "+innerWidth</script></body>');
  }
  if (u.pathname.startsWith('/api/')) {
    req.query = Object.fromEntries(u.searchParams);
    if (process.env.PREVIEW_AUTOLOGIN) req.headers.cookie = 'hg_session=' + require(path.join(ROOT, 'api', '_lib.js')).sessionToken();
    return handlers[u.pathname.slice(5)](req, res);
  }
  let file = path.join(ROOT, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain');
  fs.createReadStream(file).pipe(res);
}).listen(3939, () => console.log('Portal preview on http://localhost:3939 (password: demo)'));
