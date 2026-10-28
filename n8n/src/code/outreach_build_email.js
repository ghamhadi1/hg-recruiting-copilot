// Writes email 1 / follow-up 2 / follow-up 3 as a raw Gmail message (follow-ups stay in the same thread).
const cfg = $('Config').first().json;
const sender = cfg.sender_name || 'HG Talent Team';
const out = [];
$input.all().forEach((it, i) => {
  const d = it.json;
  if (d.thread_error || d.replied) return; // never send blind if we could not read the thread
  const first = d.first_name || 'there';
  const why = String(d.reason || '').split('\n')[0];
  const subject0 = d.role_title + ' role with a US client: quick question, ' + first;
  let subject = subject0;
  let text;
  if (d.step === 0) {
    text = 'Hi ' + first + ',\n\nI\'m reaching out from ' + sender + '. We\'re hiring a ' + d.role_title + ' for a US client' +
      (d.hours ? ' (' + d.hours + ')' : '') + (d.rate ? ', ' + d.rate : '') + '.\n\n' +
      (why ? 'Your background stood out: ' + why + '\n\n' : '') +
      'Would you be open to a 15-minute call this week? Just reply to this email and I\'ll send a few times.\n\nBest,\n' + sender;
  } else if (d.step === 1) {
    subject = d.subject ? (/^re:/i.test(d.subject) ? d.subject : 'Re: ' + d.subject) : 'Re: ' + subject0;
    text = 'Hi ' + first + ',\n\nJust bumping this up: are you interested in the ' + d.role_title + ' role? A quick yes or no is perfect.\n\nThanks,\n' + sender;
  } else {
    subject = d.subject ? (/^re:/i.test(d.subject) ? d.subject : 'Re: ' + d.subject) : 'Re: ' + subject0;
    text = 'Hi ' + first + ',\n\nLast note from me. I\'ll close your file for the ' + d.role_title + ' role this week unless I hear back. ' +
      'If the timing is just wrong, reply "later" and I\'ll check in next quarter.\n\nAll the best,\n' + sender;
  }
  if (cfg.test_mode !== false) text += '\n\n[TEST MODE: in production this goes to the candidate, ' + d.candidate_name + ']';
  const headers = ['To: ' + d.to_email, 'Subject: =?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=',
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'];
  if (d.step > 0 && d.last_rfc_message_id) {
    headers.push('In-Reply-To: ' + d.last_rfc_message_id, 'References: ' + d.last_rfc_message_id);
  }
  const mime = headers.join('\r\n') + '\r\n\r\n' + Buffer.from(text, 'utf8').toString('base64');
  const raw = Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  out.push({
    json: Object.assign({}, d, { gmail_body: d.step > 0 && d.thread_id ? { raw: raw, threadId: d.thread_id } : { raw: raw } }),
    pairedItem: { item: i }
  });
});
return out;
