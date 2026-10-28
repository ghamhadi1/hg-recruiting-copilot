// Step 1 of search: turn the plain-English question into structured requirements.
const body = $('Webhook').first().json.body || {};
const cfg = $('Config').first().json;
const role = $('Load Role').all().map(i => i.json).filter(r => r && r.id)[0] || null;
const question = String(body.question || (role && role.search_query) || '').trim().slice(0, 1000);
if (!question) throw new Error('Empty question');

const schema = {
  type: 'object', additionalProperties: false,
  required: ['skills', 'languages', 'location', 'other_requirements', 'semantic_query', 'search_terms'],
  properties: {
    skills: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['name', 'synonyms', 'min_years', 'required'],
      properties: { name: { type: 'string' }, synonyms: { type: 'array', items: { type: 'string' } },
        min_years: { type: ['number', 'null'] }, required: { type: 'boolean' } } } },
    languages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['language', 'required'],
      properties: { language: { type: 'string' }, required: { type: 'boolean' } } } },
    location: { type: ['string', 'null'] },
    other_requirements: { type: 'array', items: { type: 'string' } },
    semantic_query: { type: 'string' },
    search_terms: { type: 'array', items: { type: 'string' } }
  }
};
const system = [
  'Turn a recruiter\'s candidate search into structured requirements.',
  'skills: concrete tools, skills or job functions. Canonical names: GoHighLevel (GHL/HighLevel), QuickBooks Online (QBO), n8n, Zapier,',
  'Make, React, Node.js, TypeScript, AWS, Xero, Gusto, Salesforce, HubSpot, Cold calling, Appointment setting,',
  'Transaction coordination, Calendar management. synonyms: other spellings/abbreviations of the same thing (not related tools).',
  'Alternatives: "X or Y" is ONE skill named X with Y in its synonyms (either one satisfies it). Never list X and Y separately.',
  'required = true unless the recruiter says preferred / nice to have / bonus / ideally. min_years only if a number is given ("3+ years" = 3).',
  'languages: spoken languages mentioned ("speaks Arabic", "bilingual Spanish"). required = true unless "preferred".',
  'other_requirements: anything else (industry like "solar", location, seniority) in short phrases.',
  'search_terms: canonical names + synonyms + languages + key industry words, for keyword matching.',
  'semantic_query: one sentence describing the ideal candidate.'
].join('\n');

return [{
  json: {
    question: question,
    role: role,
    role_id: role ? role.id : null,
    source: body.source || 'api',
    save: body.save !== false,
    openai_body: {
      model: cfg.openai_model, temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'search_request', strict: true, schema: schema } },
      messages: [{ role: 'system', content: system }, { role: 'user', content: question }]
    }
  }
}];
