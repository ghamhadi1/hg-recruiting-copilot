// Parses the JD from OpenAI and builds the public markdown + the payload for hg_role_save.
const req = $('Build JD Prompt').first().json;
const res = $input.first().json;
let jd;
try {
  jd = JSON.parse(res.choices[0].message.content);
} catch (e) {
  throw new Error('OpenAI did not return a valid JD: ' + JSON.stringify(res).slice(0, 300));
}

const bullets = arr => (arr || []).map(x => '- ' + x).join('\n') || '- Not specified';
const md = [
  '# ' + jd.title,
  '_' + jd.client_summary_public + '_',
  '',
  '## About the role', jd.about_the_role, '',
  '## Must-haves', bullets(jd.must_haves), '',
  '## Nice-to-haves', bullets(jd.nice_to_haves), '',
  '## What you will do', bullets(jd.responsibilities), '',
  '## Languages', bullets(jd.languages), '',
  '## Details',
  '- Hours: ' + jd.hours,
  '- Type: ' + jd.employment_type,
  '- Pay: ' + jd.rate_band,
  '- Start: ' + jd.start_date,
  '- Reports to: ' + jd.reports_to,
  '- Interview process: ' + jd.interview_process
].join('\n');

return [{
  json: {
    p: {
      id: req.role_id,
      title: jd.title,
      client_name: req.client_name,
      client_email: req.client_email,
      transcript: req.transcript,
      jd: jd,
      jd_markdown: md,
      search_query: jd.search_query
    }
  }
}];
