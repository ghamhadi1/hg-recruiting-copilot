// Step 3: the model scores ONLY the candidates the database returned (it cannot see or invent anyone else).
const q = $('Parse Query').first().json;
const cfg = $('Config').first().json;
const cands = $input.all().map(i => i.json).filter(c => c && c.candidate_id).slice(0, 20);

const schema = {
  type: 'object', additionalProperties: false, required: ['results', 'note'],
  properties: {
    results: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['candidate_id', 'score', 'reason_line_1', 'reason_line_2', 'evidence'],
      properties: {
        candidate_id: { type: 'integer' }, score: { type: 'integer' },
        reason_line_1: { type: 'string' }, reason_line_2: { type: 'string' },
        evidence: { type: 'string', description: 'Exact quote copied from this candidate\'s CV text, max 15 words' }
      } } },
    note: { type: 'string' }
  }
};
const system = [
  'You rank candidates for a recruiter. Use ONLY the CV text given for each candidate. Never invent facts or candidates.',
  'Score 0-100: required skills/requirements met = 50, years of experience vs. what was asked = 20,',
  'nice-to-haves and other requirements = 15, language/location fit = 15.',
  'If ANY required item is missing, or below the minimum years asked, the score MUST be below 60.',
  'reason_line_1: why they fit, with concrete numbers (max 20 words). reason_line_2: the main gap or risk, or an extra strength (max 20 words).',
  'evidence: a short exact quote copied character-for-character from that candidate\'s CV text that proves reason_line_1.',
  'Only use candidate_id values from the list. Return at most 8 candidates, best first. Skip clearly irrelevant people.',
  'If nobody fits, return the closest 1-2 with honest low scores.'
].join('\n');
const list = cands.map(c =>
  '### candidate_id: ' + c.candidate_id + '\nName: ' + c.full_name + '\nCV file: ' + c.cv_file_name +
  '\nLocation: ' + (c.location || '?') + '\nLanguages (parsed): ' + JSON.stringify(c.languages) +
  '\nSkills with years (parsed): ' + JSON.stringify(c.skills) + '\nCV TEXT:\n' + String(c.cv_text || '').slice(0, 3500)
).join('\n\n');
const user = 'TODAY: ' + cfg.today + '\nREQUEST: ' + q.question + '\nPARSED REQUIREMENTS: ' + JSON.stringify(q.parsed) +
  (q.role ? '\nROLE: ' + q.role.title + '\nMUST-HAVES: ' + JSON.stringify((q.role.jd || {}).must_haves || []) : '') +
  '\n\nCANDIDATES (' + cands.length + '):\n\n' + (list || '(none)');

return [{
  json: {
    candidate_count: cands.length,
    openai_body: {
      model: cfg.openai_model, temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'ranking', strict: true, schema: schema } },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    }
  }
}];
