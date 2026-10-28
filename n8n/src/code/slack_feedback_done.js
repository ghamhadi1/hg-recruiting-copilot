// After the feedback form: mark the old Slack message as "changes requested" (the new version is posted separately).
const a = $('Parse Action').first().json;
const r = $input.first().json;
const role = r.role || {};
const text = '✏️ *' + (role.title || 'JD') + '* v' + role.version + ': changes requested by @' + a.user + ': "' +
  String(a.feedback || '').slice(0, 500) + '". A rewritten version is posted below for approval.';
return [{ json: { ok: !!r.ok, body: { channel: role.slack_channel, ts: role.slack_ts, text: text,
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: text } }] } } }];
