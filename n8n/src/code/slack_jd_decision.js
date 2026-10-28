// After Approve/Reject on a JD: rewrite the Slack message (buttons replaced by the decision).
const a = $('Parse Action').first().json;
const r = $input.first().json;
const cfg = $('Config').first().json;
const role = r.role || {};
let line;
if (!r.ok) {
  line = 'ℹ️ Already decided: this JD is *' + role.status + '* (by ' + (role.decided_by || '?') + '). Nothing changed.';
} else if (a.action === 'jd_approve') {
  line = '✅ *Approved* by @' + a.user + '. The role is open, the JD was sent to the client, and the shortlist is being built…';
} else {
  line = '❌ *Rejected* by @' + a.user + '. Nothing was sent to the client.';
}
const blocks = (a.message_blocks || []).filter(b => b.type !== 'actions');
blocks.push({ type: 'section', text: { type: 'mrkdwn', text: line } });

const approved = !!(r.ok && a.action === 'jd_approve');
const jd = role.jd || {};
const to = cfg.test_mode === false ? role.client_email : cfg.test_recipient;
let raw = null;
if (approved && to) {
  const subject = 'Job description for your approval record: ' + role.title;
  const text = 'Hi,\n\nThanks for the call. Here is the final job description we will use to find your ' + role.title + '.\n\n' +
    role.jd_markdown + '\n\nWe will share a shortlist shortly.\n\nBest,\n' + (cfg.sender_name || 'HG Talent Team') +
    (cfg.test_mode === false ? '' : '\n\n[TEST MODE: the real client email would be ' + (role.client_email || 'not set') + ']');
  const mime = ['To: ' + to, 'Subject: =?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=', 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(text, 'utf8').toString('base64')].join('\r\n');
  raw = Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
return [{ json: {
  approved: approved, send_client_email: !!raw, gmail_body: raw ? { raw: raw } : null,
  role_id: role.id, search_query: role.search_query, title: role.title,
  update: { replace_original: true, text: line, blocks: blocks }
} }];
