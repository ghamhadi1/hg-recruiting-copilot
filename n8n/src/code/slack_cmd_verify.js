// /find and /jd slash commands. Verifies the request really comes from our Slack app.
const cfg = $('Config').first().json;
const b = $('Webhook').first().json.body || {};
if (!cfg.slack_verification_token || b.token !== cfg.slack_verification_token) {
  return [{ json: { action: 'none', reply: { response_type: 'ephemeral', text: '⛔ Request not verified.' } } }];
}
const cmd = String(b.command || '').toLowerCase();
let text = String(b.text || '').trim();
let roleId = null;
const m = text.match(/^(?:#|role:\s*)(\d+)\s+/i);
if (m) {
  roleId = Number(m[1]);
  text = text.slice(m[0].length).trim();
}
let action = 'none';
let reply;
if (cmd.indexOf('find') !== -1) {
  if (!text || text.toLowerCase() === 'help') {
    reply = { response_type: 'ephemeral', text: 'Ask in plain English, e.g. `/find who has 3+ years of GHL and speaks Arabic?`\n' +
      'Link results to a role so you can approve them: `/find #3 who has QuickBooks and Gusto?` (role numbers are in the portal).' };
  } else {
    action = 'find';
    reply = { response_type: 'ephemeral', text: '🔎 Searching the CV database for: "' + text + '". Results in about 15 seconds…' };
  }
} else if (cmd.indexOf('jd') !== -1) {
  if (text.length < 200) {
    reply = { response_type: 'ephemeral', text: 'Paste the full call transcript after `/jd` (at least a few paragraphs). ' +
      'For long transcripts use the portal: Roles → New role from transcript.' };
  } else {
    action = 'jd';
    reply = { response_type: 'ephemeral', text: '📝 Writing the job description… it will appear in the channel for approval in about 20 seconds.' };
  }
} else {
  reply = { response_type: 'ephemeral', text: 'Unknown command ' + cmd };
}
return [{ json: { action: action, reply: reply, question: text, role_id: roleId, response_url: b.response_url, user: b.user_name || 'someone' } }];
