// Slack approval message for a JD: summary + Approve / Request changes / Reject buttons.
const cfg = $('Config').first().json;
const role = $input.first().json;
const jd = role.jd || {};
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const bl = arr => (arr || []).map(x => '• ' + esc(x)).join('\n') || '• Not specified';
const id = String(role.id);

const blocks = [
  { type: 'header', text: { type: 'plain_text', text: cut('📝 JD for approval: ' + role.title, 150) } },
  { type: 'section', text: { type: 'mrkdwn', text: cut(
    '*Client:* ' + esc(role.client_name || 'unknown') + '  (candidates see: _' + esc(jd.client_summary_public) + '_)\n' +
    '*Hours:* ' + esc(jd.hours) + '\n*Pay:* ' + esc(jd.rate_band) + '\n*Type:* ' + esc(jd.employment_type) +
    '\n*Start:* ' + esc(jd.start_date), 2900) } },
  { type: 'section', text: { type: 'mrkdwn', text: cut('*Must-haves*\n' + bl(jd.must_haves), 2900) } },
  { type: 'section', text: { type: 'mrkdwn', text: cut('*Nice-to-haves*\n' + bl(jd.nice_to_haves), 2900) } },
  { type: 'section', text: { type: 'mrkdwn', text: cut('*About the role*\n' + esc(jd.about_the_role), 2900) } }
];
if ((jd.open_questions || []).length) {
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cut('⚠️ *Confirm with the client*\n' + bl(jd.open_questions), 2900) } });
}
if ((jd.internal_notes || []).length) {
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: cut('🔒 Internal only: ' + jd.internal_notes.map(esc).join(' · '), 2900) }] });
}
blocks.push({
  type: 'actions', block_id: 'jd_actions',
  elements: [
    { type: 'button', style: 'primary', action_id: 'jd_approve', value: id, text: { type: 'plain_text', text: '✅ Approve' } },
    { type: 'button', action_id: 'jd_changes', value: id, text: { type: 'plain_text', text: '✏️ Request changes' } },
    { type: 'button', style: 'danger', action_id: 'jd_reject', value: id, text: { type: 'plain_text', text: '❌ Reject' },
      confirm: { title: { type: 'plain_text', text: 'Reject this JD?' }, text: { type: 'plain_text', text: 'Nothing will be sent to the client.' },
        confirm: { type: 'plain_text', text: 'Reject' }, deny: { type: 'plain_text', text: 'Cancel' } } }
  ]
});
const portal = cfg.portal_url ? ' · <' + cfg.portal_url + '/role.html?id=' + id + '|Full JD in portal>' : '';
blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Role #' + id + ' · version ' + role.version + portal +
  ' · Nothing goes to the client until someone clicks Approve.' }] });

return [{ json: { role_id: role.id, body: { channel: cfg.slack_channel_id, text: '📝 JD for approval: ' + role.title, blocks: blocks } } }];
