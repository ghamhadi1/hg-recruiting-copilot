// Slack returns HTTP 200 even on errors; fail loudly instead of silently.
const r = $input.first().json;
if (!r.ok) throw new Error('Slack API error: ' + (r.error || JSON.stringify(r).slice(0, 200)) +
  (r.error === 'not_in_channel' || r.error === 'channel_not_found' ? ' (invite the bot to the channel: /invite @HG Recruiting Copilot)' : ''));
return [{ json: { channel: r.channel, ts: r.ts } }];
