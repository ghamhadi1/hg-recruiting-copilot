// Builds the "flag as unreadable" DB payload and the Slack alert.
const j = $input.first().json;
const cfg = $('Config').first().json;
const link = cfg.portal_url ? '\n<' + cfg.portal_url + '/cvs.html|Open CV health page>' : '';
return [{
  json: {
    p: {
      file_name: j.file_name,
      file_type: j.ext,
      raw_text: String(j.text || '').slice(0, 2000),
      extraction_method: j.method,
      unreadable: true,
      unreadable_reason: j.reason || 'No readable text found'
    },
    slack: {
      channel: cfg.slack_channel_id,
      text: '⚠️ *Unreadable CV flagged:* `' + j.file_name + '`\nReason: ' + (j.reason || 'No readable text found') +
        '\nThis CV is NOT searchable. Please ask the candidate for a text PDF or Word file.' + link
    }
  }
}];
