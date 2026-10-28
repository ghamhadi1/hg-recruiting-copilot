// Tell the channel when an updated CV replaced an old one (duplicates are only logged).
const r = $input.first().json;
const cfg = $('Config').first().json;
const file = $('Profile & Chunks').first().json.file_name;
let text = '';
if (r.action === 'replaced') {
  text = '🔁 *Updated CV:* ' + r.name + ' sent a newer CV. `' + r.old_file + '` was replaced by `' + file +
    '`. Search now uses the new CV only.';
}
return [{ json: { notify: !!text, body: { channel: cfg.slack_channel_id, text: text } } }];
