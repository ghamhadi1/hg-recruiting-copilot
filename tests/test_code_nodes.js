// Offline tests for the n8n Code nodes (the "brain" of the copilot).
// Run: node tests/test_code_nodes.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { runCode } = require('./harness');

const CFG = { openai_model: 'gpt-4.1-mini', embedding_model: 'text-embedding-3-small', match_threshold: 60, today: '2026-10-25',
  slack_channel_id: 'C123', slack_verification_token: 'tok', test_mode: true, test_recipient: 'me@example.com',
  portal_url: 'https://portal.example', sender_name: 'HG Talent Team', ghl_stage_ids: { replied: 'st_rep' } };
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' → ' + e.message]); }
}

// minimal .zip reader (stands in for n8n's Compression node)
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.slice(start, start + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const cand = (id, name, email, langs, skills, text, file) => ({ candidate_id: id, full_name: name, email, cv_id: id * 10,
  cv_file_name: file || name.replace(/ /g, '_') + '.pdf', location: 'x', languages: langs, skills, cv_text: text });
const OMAR = cand(1, 'Omar Haddad', 'omar.haddad@example.com', [{ language: 'Arabic', level: 'native' }],
  [{ name: 'GoHighLevel', years: 5.2 }], 'Marketing automation specialist with 5 years of hands-on GoHighLevel (HighLevel) experience building workflows');
const KARIM = cand(2, 'Karim Mansour', 'karim.mansour@example.org', [{ language: 'Arabic', level: 'native' }],
  [{ name: 'GoHighLevel', years: 2.5 }], 'GHL builder with 2.5 years of GoHighLevel experience (since April 2024)');
const DANIEL = cand(3, 'Daniel Brooks', 'dan.brooks@example.com', [{ language: 'English', level: 'native' }],
  [{ name: 'GoHighLevel', years: 6 }], '6 years with GoHighLevel since its early days.');
const TARIQ = cand(4, 'Tariq Saeed', 'tariq.saeed@example.com', [{ language: 'Urdu', level: 'native' }, { language: 'Arabic', level: 'basic reading' }],
  [{ name: 'GoHighLevel', years: 4 }], 'GoHighLevel 4 years for coaches');
const PARSED = { skills: [{ name: 'GoHighLevel', synonyms: ['GHL', 'HighLevel'], min_years: 3, required: true }],
  languages: [{ language: 'Arabic', required: true }], location: null, other_requirements: [], semantic_query: 'x', search_terms: [] };
const llm = obj => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

(async () => {
  await test('guard: drops invented ids, dedupes, enforces years/language/evidence', async () => {
    const out = await runCode('search_guard', {
      nodes: { Config: [CFG], 'Parse Query': [{ question: 'Who has 3+ years of GHL and speaks Arabic?', parsed: PARSED, role: null, role_id: null, source: 'test', save: true }],
        'Search DB': [OMAR, KARIM, DANIEL, TARIQ] },
      input: [llm({ note: '', results: [
        { candidate_id: 1, score: 92, reason_line_1: '5 yrs GHL', reason_line_2: 'Arabic native', evidence: '5 years of hands-on GoHighLevel (HighLevel) experience' },
        { candidate_id: 999, score: 99, reason_line_1: 'Invented person', reason_line_2: '', evidence: 'nothing' },
        { candidate_id: 1, score: 90, reason_line_1: 'dup', reason_line_2: '', evidence: '5 years' },
        { candidate_id: 2, score: 75, reason_line_1: 'GHL', reason_line_2: '', evidence: '2.5 years of GoHighLevel experience' },
        { candidate_id: 3, score: 80, reason_line_1: '6 yrs', reason_line_2: '', evidence: '6 years with GoHighLevel' },
        { candidate_id: 4, score: 70, reason_line_1: 'Arabic', reason_line_2: '', evidence: 'GoHighLevel 4 years for coaches' }] })]
    });
    const g = out[0].json;
    assert.deepStrictEqual(g.results.map(r => r.name), ['Omar Haddad']);
    assert.deepStrictEqual(g.dropped_ids, [999]);
    assert.strictEqual(g.results[0].cv_file_name, 'Omar_Haddad.pdf');
    assert.strictEqual(g.results[0].rank, 1);
    assert.ok(g.closest.length === 2 && g.closest.every(c => c.score < 60));
    assert.strictEqual(g.save_payload.p.results.length, 1);
  });

  await test('guard: evidence that is not in the CV caps the score', async () => {
    const out = await runCode('search_guard', {
      nodes: { Config: [CFG], 'Parse Query': [{ question: 'q', parsed: PARSED, save: false }], 'Search DB': [OMAR] },
      input: [llm({ note: '', results: [{ candidate_id: 1, score: 95, reason_line_1: 'a', reason_line_2: 'b', evidence: 'Led a team of 40 engineers at Google' }] })]
    });
    const g = out[0].json;
    assert.strictEqual(g.no_match, true);
    assert.ok(g.closest[0].gaps.indexOf('quote not found in CV') !== -1);
  });

  await test('guard: empty database → honest no match', async () => {
    const out = await runCode('search_guard', {
      nodes: { Config: [CFG], 'Parse Query': [{ question: 'q', parsed: PARSED, save: true }], 'Search DB': [{}] },
      input: [llm({ note: 'nobody', results: [] })]
    });
    assert.strictEqual(out[0].json.no_match, true);
    assert.ok(/No one in the CV database/.test(out[0].json.message));
  });

  await test('format: Slack blocks have approve buttons with shortlist ids and CV file names', async () => {
    const guard = (await runCode('search_guard', {
      nodes: { Config: [CFG], 'Parse Query': [{ question: 'GHL + Arabic', parsed: PARSED, role: { id: 7, title: 'GHL Specialist' }, role_id: 7, save: true }], 'Search DB': [OMAR] },
      input: [llm({ note: '', results: [{ candidate_id: 1, score: 88, reason_line_1: '5 yrs GHL', reason_line_2: 'Arabic', evidence: '5 years of hands-on GoHighLevel' }] })]
    }))[0].json;
    const out = await runCode('search_format', {
      nodes: { 'Guard & Score': [guard], Config: [CFG], 'Open Roles': [{}] },
      input: [{ search_id: 55, items: [{ shortlist_id: 501, candidate_id: 1, rank: 1 }] }]
    });
    const r = out[0].json;
    assert.strictEqual(r.results[0].shortlist_id, 501);
    const btn = r.blocks.filter(b => b.type === 'actions')[0].elements[0];
    assert.strictEqual(btn.action_id, 'cand_approve');
    assert.strictEqual(btn.value, '501');
    assert.ok(JSON.stringify(r.blocks).indexOf('Omar_Haddad.pdf') !== -1);
    assert.ok(!('save_payload' in r));
  });

  await test('format: no role → "approve for role" dropdown', async () => {
    const guard = { question: 'q', role: null, results: [{ candidate_id: 1, name: 'Omar', score: 80, reason: 'a\nb', cv_file_name: 'o.pdf' }], closest: [], no_match: false, threshold: 60, message: 'Top 1' };
    const out = await runCode('search_format', {
      nodes: { 'Guard & Score': [guard], Config: [CFG], 'Open Roles': [{ id: 3, title: 'Bookkeeper' }] },
      input: [{ search_id: 1, items: [{ shortlist_id: 9, candidate_id: 1 }] }]
    });
    const sel = out[0].json.blocks.filter(b => b.type === 'actions')[0].elements[0];
    assert.strictEqual(sel.type, 'static_select');
    assert.strictEqual(sel.options[0].value, '9:3');
  });

  await test('docx extraction reads text inside tables', async () => {
    const files = unzip(fs.readFileSync(path.join(__dirname, '..', 'data', 'cvs', 'Bilal Qureshi.docx')));
    const binary = {};
    Object.keys(files).forEach((k, i) => { binary['file_' + i] = { fileName: k.split('/').pop(), directory: k.split('/').slice(0, -1).join('/'), _buf: files[k] }; });
    const out = await runCode('cv_docx_text', {
      input: [{ json: {}, binary }],
      helpers: { getBinaryDataBuffer: async (i, key) => binary[key]._buf }
    });
    const t = out[0].json.text;
    assert.ok(t.indexOf('bilal.qureshi@example.com') !== -1, 'email from table cell');
    assert.ok(t.indexOf('AWS') !== -1);
  });

  await test('scanned PDF (no text) → needs OCR; Word with no text → unreadable', async () => {
    const pdf = await runCode('cv_check_text', { nodes: { 'Prepare File': [{ file_name: 'Scan_0007.pdf', ext: 'pdf', size: 1000, b64: 'xx' }] }, input: [{ text: ' \n ', method: 'text' }] });
    assert.strictEqual(pdf[0].json.needs_ocr, true);
    assert.ok(!('b64' in pdf[0].json));
    const docx = await runCode('cv_check_text', { nodes: { 'Prepare File': [{ file_name: 'x.docx', ext: 'docx', size: 10 }] }, input: [{ text: '', method: 'text', reason: '' }] });
    assert.strictEqual(docx[0].json.needs_ocr, false);
    assert.strictEqual(docx[0].json.readable, false);
  });

  await test('OCR result: UNREADABLE / API error / good text', async () => {
    const prev = { 'Check Text': [{ file_name: 'blank_scan.pdf', ext: 'pdf', text: '', readable: false }] };
    const a = await runCode('cv_ocr_result', { nodes: prev, input: [llm('x')].map(() => ({ choices: [{ message: { content: 'UNREADABLE' } }] })) });
    assert.strictEqual(a[0].json.readable, false);
    assert.ok(/no readable/.test(a[0].json.reason));
    const b = await runCode('cv_ocr_result', { nodes: prev, input: [{ error: { message: 'Invalid file' } }] });
    assert.ok(/OCR failed/.test(b[0].json.reason));
    const good = 'Sara Nasser GHL Automation Specialist Istanbul Turkey 4 years of GoHighLevel automation for marketing agencies. ' +
      'Builds multi-step workflows, webhooks and Zapier/Make integrations. Arabic native English fluent.';
    const c = await runCode('cv_ocr_result', { nodes: prev, input: [{ choices: [{ message: { content: good } }] }] });
    assert.strictEqual(c[0].json.readable, true);
    assert.strictEqual(c[0].json.method, 'ocr');
  });

  await test('unsupported file type is flagged with a reason', async () => {
    const out = await runCode('cv_unsupported', { nodes: { 'Prepare File': [{ ext: 'doc' }] } });
    assert.ok(/Unsupported file type ".doc"/.test(out[0].json.reason));
  });

  await test('prepare: base64 → binary, pdf keeps b64 for OCR', async () => {
    const out = await runCode('cv_prepare', { nodes: { Webhook: [{ body: { file_name: 'a/b.pdf', data_base64: 'data:application/pdf;base64,QUJD' } }] } });
    assert.strictEqual(out[0].json.file_name, 'a_b.pdf');
    assert.strictEqual(out[0].json.b64, 'QUJD');
    assert.strictEqual(out[0].binary.data.mimeType, 'application/pdf');
    const empty = await runCode('cv_prepare', { nodes: { Webhook: [{ body: { file_name: 'x.pdf' } }] } });
    assert.strictEqual(empty[0].json.ext, 'missing');
  });

  await test('chunks: profile card first, embeddings joined in order', async () => {
    const profile = { full_name: 'Omar Haddad', headline: 'GHL', location: 'Beirut', languages: [{ language: 'Arabic', level: 'native' }],
      skills: [{ name: 'GoHighLevel', years: 5 }], summary: 's' };
    const ch = await runCode('cv_chunks', { nodes: { 'Profile Prompt': [{ file_name: 'o.pdf', ext: 'pdf', method: 'text', text: 'x'.repeat(3000), openai_body: {} }], Config: [CFG] },
      input: [llm(profile)] });
    const j = ch[0].json;
    assert.ok(/GoHighLevel 5 yrs/.test(j.chunks[0]));
    assert.strictEqual(j.chunks.length, 4);
    const emb = { data: j.chunks.map((c, i) => ({ index: j.chunks.length - 1 - i, embedding: [j.chunks.length - 1 - i] })) };
    const p = await runCode('cv_ingest_payload', { nodes: { 'Profile & Chunks': [j] }, input: [emb] });
    assert.deepStrictEqual(p[0].json.p.chunks.map(c => c.embedding[0]), [0, 1, 2, 3]);
  });

  await test('slack: unverified requests are rejected', async () => {
    const bad = await runCode('slack_action_parse', { nodes: { Config: [CFG], Webhook: [{ body: { payload: JSON.stringify({ token: 'wrong', type: 'block_actions' }) } }] } });
    assert.strictEqual(bad[0].json.action, 'invalid');
    const cmd = await runCode('slack_cmd_verify', { nodes: { Config: [CFG], Webhook: [{ body: { token: 'nope', command: '/find', text: 'x' } }] } });
    assert.strictEqual(cmd[0].json.action, 'none');
  });

  await test('slack: approve-for-role dropdown and /find #3 parsing', async () => {
    const payload = { token: 'tok', type: 'block_actions', user: { username: 'maya' }, response_url: 'https://hooks', actions: [{ action_id: 'cand_approve_role', selected_option: { value: '12:3' } }] };
    const a = await runCode('slack_action_parse', { nodes: { Config: [CFG], Webhook: [{ body: { payload: JSON.stringify(payload) } }] } });
    assert.strictEqual(a[0].json.action, 'cand_approve');
    assert.strictEqual(a[0].json.shortlist_id, 12);
    assert.strictEqual(a[0].json.role_id, 3);
    const c = await runCode('slack_cmd_verify', { nodes: { Config: [CFG], Webhook: [{ body: { token: 'tok', command: '/find', text: '#3 who knows Xero?', user_name: 'maya' } }] } });
    assert.strictEqual(c[0].json.action, 'find');
    assert.strictEqual(c[0].json.role_id, 3);
    assert.strictEqual(c[0].json.question, 'who knows Xero?');
  });

  await test('slack: feedback modal submit is parsed', async () => {
    const payload = { token: 'tok', type: 'view_submission', user: { username: 'maya' },
      view: { callback_id: 'jd_feedback', private_metadata: '{"role_id":4}', state: { values: { feedback_block: { feedback: { value: 'Arabic is a must' } } } } } };
    const a = await runCode('slack_action_parse', { nodes: { Config: [CFG], Webhook: [{ body: { payload: JSON.stringify(payload) } }] } });
    assert.strictEqual(a[0].json.action, 'jd_feedback');
    assert.strictEqual(a[0].json.role_id, 4);
    assert.strictEqual(a[0].json.feedback, 'Arabic is a must');
  });

  await test('JD approval: buttons removed, client email only in test inbox', async () => {
    const role = { id: 4, title: 'GHL Automation Specialist', status: 'approved', jd_markdown: '# GHL', client_email: 'derek@client.example', search_query: 'GHL 3+ years' };
    const out = await runCode('slack_jd_decision', {
      nodes: { 'Parse Action': [{ action: 'jd_approve', user: 'maya', message_blocks: [{ type: 'header' }, { type: 'actions' }] }], Config: [CFG] },
      input: [{ ok: true, role }]
    });
    const j = out[0].json;
    assert.strictEqual(j.approved, true);
    assert.ok(!j.update.blocks.some(b => b.type === 'actions'));
    const mime = Buffer.from(j.gmail_body.raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    assert.ok(mime.indexOf('To: me@example.com') === 0, 'goes to test inbox, not the client');
    const again = await runCode('slack_jd_decision', {
      nodes: { 'Parse Action': [{ action: 'jd_approve', user: 'sam', message_blocks: [] }], Config: [CFG] },
      input: [{ ok: false, already: true, role }]
    });
    assert.strictEqual(again[0].json.approved, false, 'double click does nothing');
  });

  await test('candidate message: already approved → no second sequence', async () => {
    const out = await runCode('slack_cand_message', {
      nodes: { 'Parse Action': [{ user: 'maya', response_url: 'https://hooks' }], 'Candidate Decide': [{ ok: true, already: true, candidate: { full_name: 'Omar Haddad' } }] }
    });
    assert.ok(/already approved/.test(out[0].json.body.text));
    assert.strictEqual(out[0].json.body.response_type, 'ephemeral');
  });

  await test('outreach: reply detected only from messages we did not send', async () => {
    const due = [{ outreach_id: 1, thread_id: 't1', sent_message_ids: ['m1'], has_thread: true }];
    const thread = { messages: [{ id: 'm1', payload: { headers: [{ name: 'Message-ID', value: '<abc@mail>' }, { name: 'Subject', value: 'Hello' }] } }] };
    const r1 = await runCode('outreach_detect_reply', { nodes: { 'Due Item': due }, input: [thread] });
    assert.strictEqual(r1[0].json.replied, false);
    assert.strictEqual(r1[0].json.last_rfc_message_id, '<abc@mail>');
    thread.messages.push({ id: 'm2', payload: { headers: [] } });
    const r2 = await runCode('outreach_detect_reply', { nodes: { 'Due Item': due }, input: [thread] });
    assert.strictEqual(r2[0].json.replied, true);
    assert.strictEqual(r2[0].json.reply_message_id, 'm2');
  });

  await test('outreach: email 1 is new, follow-ups thread with In-Reply-To; unreadable thread = no send', async () => {
    const base = { outreach_id: 1, to_email: 'me+hg-c1@example.com', first_name: 'Omar', candidate_name: 'Omar Haddad', role_title: 'GHL Automation Specialist',
      reason: '5 yrs GoHighLevel, 120+ workflows\nArabic native', hours: '9-1 Central', rate: '$1,800-2,400/month' };
    const out = await runCode('outreach_build_email', { nodes: { Config: [CFG] }, input: [
      Object.assign({ step: 0 }, base),
      Object.assign({ step: 1, thread_id: 't1', subject: 'GHL role', last_rfc_message_id: '<abc@mail>' }, base),
      Object.assign({ step: 1, thread_id: 't2', thread_error: 'boom' }, base)] });
    assert.strictEqual(out.length, 2);
    const dec = r => Buffer.from(r.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    const m1 = dec(out[0].json.gmail_body.raw);
    assert.ok(m1.indexOf('To: me+hg-c1@example.com') === 0);
    assert.ok(!out[0].json.gmail_body.threadId);
    const body1 = Buffer.from(m1.split('\r\n\r\n')[1], 'base64').toString();
    assert.ok(/5 yrs GoHighLevel/.test(body1) && /TEST MODE/.test(body1));
    const m2 = dec(out[1].json.gmail_body.raw);
    assert.ok(/In-Reply-To: <abc@mail>/.test(m2));
    assert.strictEqual(out[1].json.gmail_body.threadId, 't1');
    assert.ok(/=\?UTF-8\?B\?/.test(m2));
    assert.strictEqual(Buffer.from(/Subject: =\?UTF-8\?B\?(.*)\?=/.exec(m2)[1], 'base64').toString(), 'Re: GHL role');
  });

  await test('eval scoring: pass/fail rules', async () => {
    const qs = [
      { id: 1, question: 'q1', expected_answer: 'e', must_include: ['a@x.com'], must_not_include: ['b@x.com'], required_cv: { 'a@x.com': 'new.pdf' }, expect_no_match: false },
      { id: 2, question: 'q2', expected_answer: 'e', must_include: [], must_not_include: [], required_cv: {}, expect_no_match: true },
      { id: 3, question: 'q3', expected_answer: 'e', must_include: ['a@x.com'], must_not_include: [], required_cv: { 'a@x.com': 'new.pdf' }, expect_no_match: false }];
    const out = await runCode('eval_score', { nodes: { 'Load Questions': qs, 'Create Run': [{ id: 77 }] }, input: [
      { no_match: false, results: [{ name: 'A', email: 'A@x.com', score: 80, cv_file_name: 'new.pdf' }] },
      { no_match: true, message: 'No good match', results: [] },
      { no_match: false, results: [{ name: 'A', email: 'a@x.com', score: 80, cv_file_name: 'old.pdf' }] }] });
    const b = out[0].json.body;
    assert.strictEqual(out[0].json.run_id, 77);
    assert.deepStrictEqual(b.results.map(r => r.passed), [true, true, false]);
    assert.strictEqual(b.score, 2);
  });

  await test('JD: too-short transcript is refused before calling the AI', async () => {
    const out = await runCode('jd_build_prompt', { nodes: { Webhook: [{ body: { transcript: 'hi' } }], Config: [CFG], 'Load Role': [{}] } });
    assert.ok(/too short/.test(out[0].json.error));
    const t = fs.readFileSync(path.join(__dirname, '..', 'data', 'transcripts', '01_brightpath_ghl_specialist.txt'), 'utf8');
    const ok = await runCode('jd_build_prompt', { nodes: { Webhook: [{ body: { transcript: t, client_name: 'BrightPath' } }], Config: [CFG], 'Load Role': [{}] } });
    assert.strictEqual(ok[0].json.openai_body.response_format.json_schema.strict, true);
  });

  await test('JD format + Slack approval message', async () => {
    const jd = { title: 'GHL Automation Specialist', client_summary_public: 'A US marketing agency', about_the_role: 'Own GHL.', must_haves: ['3+ years of GoHighLevel'],
      nice_to_haves: ['Arabic'], responsibilities: ['Build workflows'], languages: ['English'], hours: '9-1 CT overlap', employment_type: 'Full-time',
      rate_band: '$1,800-2,400/month', start_date: 'ASAP', reports_to: 'Ops manager', interview_process: 'Not specified',
      internal_notes: ['Client may pay more'], open_questions: ['Interview steps?'], search_query: '3+ years GoHighLevel; Arabic preferred' };
    const f = await runCode('jd_format', { nodes: { 'Build JD Prompt': [{ role_id: null, client_name: 'BrightPath', transcript: 't' }] }, input: [llm(jd)] });
    const md = f[0].json.p.jd_markdown;
    assert.ok(md.indexOf('Client may pay more') === -1, 'internal notes stay out of the public JD');
    const role = Object.assign({ id: 4, version: 1, jd }, f[0].json.p);
    const s = await runCode('jd_slack', { nodes: { Config: [CFG] }, input: [role] });
    const acts = s[0].json.body.blocks.filter(b => b.type === 'actions')[0].elements.map(e => e.action_id);
    assert.deepStrictEqual(acts, ['jd_approve', 'jd_changes', 'jd_reject']);
  });

  const failed = results.filter(r => r[0] === 'FAIL');
  results.forEach(r => console.log(r[0] + '  ' + r[1]));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})();
