// Reply in Slack after Approve / Not a fit on a candidate.
const a = $('Parse Action').first().json;
const d = $('Candidate Decide').first().json;
const safe = name => { try { return $(name).first().json; } catch (e) { return null; } };
const contact = safe('GHL Contact');
const opp = safe('GHL Opportunity');
const started = safe('Start Outreach');

const name = d.candidate ? d.candidate.full_name : 'Candidate';
let text;
let ephemeral = false;
if (!d.ok) {
  text = '⚠️ ' + d.error;
  ephemeral = true;
} else if (d.decision === 'reject') {
  text = '❌ *' + name + '* marked as not a fit by @' + a.user + '. No email will be sent.';
} else if (d.already) {
  text = 'ℹ️ *' + name + '* is already approved for this role, so no second email will be sent.';
  ephemeral = true;
} else if (started && started.ok) {
  const warn = [];
  if (!contact || contact.error || !contact.contact) warn.push('GHL contact failed: ' + JSON.stringify((contact && contact.error) || contact).slice(0, 150));
  if (!opp || opp.error || !opp.opportunity) warn.push('GHL opportunity failed: ' + JSON.stringify((opp && opp.error) || opp).slice(0, 150));
  text = '✅ *' + name + '* approved for *' + d.role.title + '* by @' + a.user + '.\n' +
    '• GHL: added to pipeline *HG- Candidates* → stage *Approved*\n' +
    '• Outreach: email 1 goes out within a few minutes to `' + started.outreach.to_email + '`. Follow-ups stop automatically when they reply.\n' +
    '📄 Based on CV: `' + d.cv_file_name + '`' + (warn.length ? '\n⚠️ ' + warn.join('\n⚠️ ') : '');
} else {
  text = '⚠️ ' + name + ' was approved, but outreach could not start: ' + ((started && started.error) || 'unknown error');
}
return [{ json: { url: a.response_url, body: { response_type: ephemeral ? 'ephemeral' : 'in_channel', replace_original: false, text: text } } }];
