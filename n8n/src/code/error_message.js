// Any HG- workflow failure is posted to Slack, so nothing fails silently.
const cfg = $('Config').first().json;
const e = $('Error Trigger').first().json || {};
const ex = e.execution || {};
const wf = e.workflow || {};
const msg = (ex.error && (ex.error.message || ex.error.description)) || 'unknown error';
return [{ json: { body: { channel: cfg.slack_channel_id, text: '🚨 n8n workflow *' + (wf.name || '?') + '* failed at *' +
  (ex.lastNodeExecuted || '?') + '*: ' + String(msg).slice(0, 500) + (ex.url ? '\n<' + ex.url + '|Open the execution>' : '') } } }];
