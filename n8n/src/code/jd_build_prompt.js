// Builds the OpenAI request that turns a call transcript into a structured job description.
// Also handles "request changes": if role_id + feedback are sent, the previous JD is revised.
const body = $('Webhook').first().json.body || {};
const cfg = $('Config').first().json;
const old = $('Load Role').all().map(i => i.json).filter(r => r && r.id)[0] || null;

const transcript = String(body.transcript || (old && old.transcript) || '').trim();
const requestedBy = body.requested_by || 'portal';
if (transcript.length < 200) {
  return [{ json: { error: 'Transcript too short (' + transcript.length + ' characters). Paste the full call notes.', requested_by: requestedBy } }];
}

const list = { type: 'array', items: { type: 'string' } };
const schema = {
  type: 'object', additionalProperties: false,
  required: ['title', 'client_summary_public', 'about_the_role', 'must_haves', 'nice_to_haves', 'responsibilities',
    'languages', 'hours', 'employment_type', 'rate_band', 'start_date', 'reports_to', 'interview_process',
    'internal_notes', 'open_questions', 'search_query'],
  properties: {
    title: { type: 'string' },
    client_summary_public: { type: 'string', description: 'Anonymised one-liner about the client, no company name' },
    about_the_role: { type: 'string', description: '3-4 sentence pitch for candidates' },
    must_haves: list, nice_to_haves: list, responsibilities: list, languages: list,
    hours: { type: 'string' }, employment_type: { type: 'string' }, rate_band: { type: 'string' },
    start_date: { type: 'string' }, reports_to: { type: 'string' }, interview_process: { type: 'string' },
    internal_notes: Object.assign({ description: 'Things the recruiter must know but candidates/client-facing JD must NOT show' }, list),
    open_questions: Object.assign({ description: 'Missing or contradictory info the recruiter should confirm with the client' }, list),
    search_query: { type: 'string', description: 'One plain-English candidate search, e.g. "3+ years GoHighLevel, Zapier or Make, webhooks; Arabic preferred"' }
  }
};

const system = [
  'You are a senior recruiter at a remote-staffing agency that places people with US clients.',
  'Write a clear, honest job description from the client call transcript.',
  'Rules:',
  '- Use ONLY facts stated in the transcript. If something is not stated, write "Not specified" and add it to open_questions.',
  '- Must-haves = things the client called required/non-negotiable/minimum. Nice-to-haves = preferred/plus/bonus.',
  '- Put numbers in requirements exactly as said (e.g. "3+ years of GoHighLevel").',
  '- If the client changed their mind during the call, use the final answer and note the change in internal_notes.',
  '- Never show private remarks (e.g. "don\'t tell them we can pay more") in candidate-facing fields; put them in internal_notes.',
  '- client_summary_public must not contain the client company name.',
  '- Plain, friendly English. No buzzwords.'
].join('\n');

let user = 'Client (internal name): ' + (body.client_name || (old && old.client_name) || 'unknown') +
  '\n\nCALL TRANSCRIPT:\n"""\n' + transcript.slice(0, 30000) + '\n"""';
if (old && body.feedback) {
  user += '\n\nPREVIOUS JD (version ' + old.version + '):\n' + (old.jd_markdown || '') +
    '\n\nRECRUITER FEEDBACK (apply it exactly, keep everything else):\n' + body.feedback;
}

return [{
  json: {
    role_id: old ? old.id : null,
    client_name: body.client_name || (old && old.client_name) || null,
    client_email: body.client_email || (old && old.client_email) || null,
    transcript: transcript,
    requested_by: requestedBy,
    openai_body: {
      model: cfg.openai_model,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { name: 'job_description', strict: true, schema: schema } },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    }
  }
}];
