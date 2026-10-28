// Profile → searchable chunks. Chunk 0 is a compact profile card, then the raw CV text in overlapping pieces.
const prev = Object.assign({}, $('Profile Prompt').first().json);
delete prev.openai_body;
const cfg = $('Config').first().json;
let p;
try {
  p = JSON.parse($input.first().json.choices[0].message.content);
} catch (e) {
  throw new Error('Profile extraction failed for ' + prev.file_name + ': ' + JSON.stringify($input.first().json).slice(0, 300));
}
const langs = (p.languages || []).map(l => l.language + ' (' + l.level + ')').join(', ');
const skills = (p.skills || []).map(s => s.name + (s.years != null ? ' ' + s.years + ' yrs' : '')).join(', ');
const chunks = [
  p.full_name + ' | ' + p.headline + ' | Location: ' + (p.location || '?') + ' | Languages: ' + langs +
  ' | Skills: ' + skills + ' | ' + p.summary
];
const text = prev.text;
const size = 1200;
const overlap = 200;
for (let i = 0; i < text.length && chunks.length < 9; i += size - overlap) chunks.push(text.slice(i, i + size));
return [{ json: Object.assign(prev, { profile: p, chunks: chunks, embed_body: { model: cfg.embedding_model, input: chunks } }) }];
