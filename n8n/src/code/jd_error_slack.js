// Transcript was rejected before calling the AI: tell the channel why.
const cfg = $('Config').first().json;
const j = $input.first().json;
return [{ json: { body: { channel: cfg.slack_channel_id, text: '⚠️ Could not write a JD (requested by ' + j.requested_by + '): ' + j.error } } }];
