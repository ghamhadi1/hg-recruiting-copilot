// Asks OpenAI to pull a structured profile out of the CV text (skills with years, languages, CV date).
const j = $input.first().json;
const cfg = $('Config').first().json;
const nstr = { type: ['string', 'null'] };
const schema = {
  type: 'object', additionalProperties: false,
  required: ['full_name', 'email', 'phone', 'location', 'timezone', 'headline', 'total_years', 'languages', 'skills', 'cv_date', 'summary'],
  properties: {
    full_name: { type: 'string' },
    email: nstr, phone: nstr, location: nstr,
    timezone: Object.assign({ description: 'IANA timezone guessed from location, e.g. Asia/Beirut' }, nstr),
    headline: { type: 'string' },
    total_years: { type: ['number', 'null'] },
    languages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['language', 'level'],
      properties: { language: { type: 'string' }, level: { type: 'string' } } } },
    skills: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'years'],
      properties: { name: { type: 'string' }, years: { type: ['number', 'null'] } } } },
    cv_date: Object.assign({ description: 'YYYY-MM' }, nstr),
    summary: { type: 'string' }
  }
};
const system = [
  'You extract facts from a CV. Use ONLY what is written. Today is ' + cfg.today + '.',
  'Skills: list every tool/skill. Use canonical names: "GoHighLevel" (for GHL, HighLevel, Go High Level), "QuickBooks Online" (QBO),',
  '"QuickBooks Desktop", "n8n", "Zapier", "Make" (Make.com/Integromat), "React", "Node.js", "TypeScript", "AWS", "Xero", "Gusto",',
  '"Salesforce", "HubSpot", "Cold calling", "Appointment setting", "Transaction coordination", "Calendar management".',
  'Skill years: if the CV states a number for that skill (e.g. "5 years of GoHighLevel", "2.5 years"), use that number.',
  'Otherwise add up the durations of the jobs where the skill was clearly used ("Present" = today). Round to 1 decimal. null if unknown.',
  'Languages: one entry per language with the level as written (native, fluent, C1, intermediate, basic...).',
  'cv_date: an explicit "last updated" / "updated" date if the CV has one; otherwise the most recent month/year that appears',
  'as a job start or end date (ignore the word "Present"). Format YYYY-MM. null if no dates.',
  'email: lowercase. total_years: total professional experience.'
].join('\n');
return [{
  json: Object.assign({}, j, {
    openai_body: {
      model: cfg.openai_model,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'cv_profile', strict: true, schema: schema } },
      messages: [{ role: 'system', content: system }, { role: 'user', content: 'CV TEXT:\n"""\n' + j.text.slice(0, 20000) + '\n"""' }]
    }
  })
}];
