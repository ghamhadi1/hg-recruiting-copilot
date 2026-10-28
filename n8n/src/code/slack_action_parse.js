// Every Slack button click / modal submit arrives here. Verify it, then work out what was clicked.
const cfg = $('Config').first().json;
let payload = {};
try {
  payload = JSON.parse($('Webhook').first().json.body.payload);
} catch (e) {
  return [{ json: { action: 'invalid' } }];
}
if (!cfg.slack_verification_token || payload.token !== cfg.slack_verification_token) return [{ json: { action: 'invalid' } }];

const u = payload.user || {};
const out = {
  user: u.username || u.name || 'someone',
  user_id: u.id || null,
  response_url: payload.response_url || null,
  trigger_id: payload.trigger_id || null,
  channel: payload.channel ? payload.channel.id : null,
  message_blocks: payload.message ? (payload.message.blocks || []) : [],
  role_id: null, shortlist_id: null
};
if (payload.type === 'block_actions') {
  const a = (payload.actions || [])[0] || {};
  out.action = a.action_id;
  const value = a.value || (a.selected_option ? a.selected_option.value : '') || '';
  if (out.action === 'cand_approve_role') {
    const parts = value.split(':');
    out.shortlist_id = Number(parts[0]);
    out.role_id = Number(parts[1]);
    out.action = 'cand_approve';
  } else if (String(out.action).indexOf('cand_') === 0) {
    out.shortlist_id = Number(value);
  } else {
    out.role_id = Number(value);
  }
} else if (payload.type === 'view_submission' && payload.view && payload.view.callback_id === 'jd_feedback') {
  out.action = 'jd_feedback';
  const meta = JSON.parse(payload.view.private_metadata || '{}');
  out.role_id = meta.role_id;
  const vals = (payload.view.state && payload.view.state.values) || {};
  out.feedback = ((vals.feedback_block || {}).feedback || {}).value || '';
} else {
  out.action = 'ignored';
}
return [{ json: out }];
