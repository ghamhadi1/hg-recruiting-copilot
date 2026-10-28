// Reads the parsed requirements and prepares the embedding request + keyword list.
const prev = Object.assign({}, $('Build Parse Prompt').first().json);
delete prev.openai_body;
const cfg = $('Config').first().json;
let parsed;
try {
  parsed = JSON.parse($input.first().json.choices[0].message.content);
} catch (e) {
  throw new Error('Could not parse the question: ' + JSON.stringify($input.first().json).slice(0, 300));
}
const terms = [];
const add = t => {
  t = String(t || '').trim();
  if (t.length > 1 && terms.map(x => x.toLowerCase()).indexOf(t.toLowerCase()) === -1) terms.push(t);
};
(parsed.skills || []).forEach(s => { add(s.name); (s.synonyms || []).forEach(add); });
(parsed.languages || []).forEach(l => add(l.language));
(parsed.search_terms || []).forEach(add);
return [{ json: Object.assign(prev, { parsed: parsed, terms: terms.slice(0, 25),
  embed_body: { model: cfg.embedding_model, input: parsed.semantic_query || prev.question } }) }];
