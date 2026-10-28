// Auto-shortlist after a JD is approved: post it to the channel with Approve buttons.
const cfg = $('Config').first().json;
const d = $('JD Decision Message').first().json;
const r = $input.first().json || {};
let body;
if (r.error || !r.ok) {
  body = { channel: cfg.slack_channel_id, text: '⚠️ Could not build the shortlist for ' + d.title + ': ' +
    String((r.error && (r.error.message || r.error)) || 'unknown error').slice(0, 300) };
} else {
  body = { channel: cfg.slack_channel_id, text: '📋 Shortlist for ' + d.title + ': ' + r.text,
    blocks: [{ type: 'header', text: { type: 'plain_text', text: ('📋 Shortlist: ' + d.title).slice(0, 150) } }].concat(r.blocks || []).slice(0, 50) };
}
return [{ json: { body: body } }];
