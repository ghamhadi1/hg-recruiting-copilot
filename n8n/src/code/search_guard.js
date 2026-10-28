// Step 4: deterministic safety net over the model's ranking.
//  - drops any candidate id that is not in the database results (no invented people)
//  - one row per person, every row names its CV file
//  - hard checks: required language (not "basic"), required skill present, minimum years
//  - the evidence quote must really be in that CV
//  Any failed check caps the score below the threshold, so it can't be recommended.
const cfg = $('Config').first().json;
const q = $('Parse Query').first().json;
const parsed = q.parsed || {};
const threshold = Number(cfg.match_threshold || 60);
const cands = $('Search DB').all().map(i => i.json).filter(c => c && c.candidate_id);
const byId = {};
cands.forEach(c => { byId[c.candidate_id] = c; });

let llm;
try {
  llm = JSON.parse($input.first().json.choices[0].message.content);
} catch (e) {
  throw new Error('Ranking returned invalid JSON: ' + JSON.stringify($input.first().json).slice(0, 300));
}

const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
const flat = s => norm(s).replace(/[^a-z0-9؀-ۿ+.# ]/g, ' ').replace(/\s+/g, ' ').trim();
const WEAK = /(basic|beginner|elementary|\ba1\b|\ba2\b|reading|limited)/i;

function langOk(c, lang) {
  const L = norm(lang);
  const list = c.languages || [];
  if (list.length) return list.some(l => norm(l.language).indexOf(L) !== -1 && !WEAK.test(l.level || ''));
  return norm(c.cv_text).indexOf(L) !== -1;
}
function skillCheck(c, s) {
  const names = [s.name].concat(s.synonyms || []).map(norm).filter(n => n.length > 1);
  let found = false;
  let years = null;
  (c.skills || []).forEach(k => {
    const kn = norm(k.name);
    if (names.some(n => kn.indexOf(n) !== -1 || (kn.length > 2 && n.indexOf(kn) !== -1))) {
      found = true;
      if (typeof k.years === 'number') years = Math.max(years || 0, k.years);
    }
  });
  if (!found) {
    const t = norm(c.cv_text);
    found = names.some(n => t.indexOf(n) !== -1);
  }
  return { found: found, years: years };
}
function evidenceOk(c, ev) {
  const t = flat(c.cv_text);
  const e = flat(ev);
  if (!e) return false;
  if (t.indexOf(e) !== -1) return true;
  const words = e.split(' ').filter(w => w.length > 2);
  if (!words.length) return false;
  return words.filter(w => t.indexOf(w) !== -1).length / words.length >= 0.8;
}

const seen = {};
const dropped = [];
const scored = [];
(llm.results || []).forEach(r => {
  const c = byId[r.candidate_id];
  if (!c) { dropped.push(r.candidate_id); return; }
  if (seen[c.candidate_id]) return;
  seen[c.candidate_id] = true;
  let score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
  const gaps = [];
  (parsed.languages || []).filter(l => l.required).forEach(l => {
    if (!langOk(c, l.language)) gaps.push('does not speak ' + l.language + ' (fluently)');
  });
  (parsed.skills || []).filter(s => s.required).forEach(s => {
    const k = skillCheck(c, s);
    if (!k.found) gaps.push('no ' + s.name + ' in CV');
    else if (s.min_years && k.years !== null && k.years + 0.05 < s.min_years) gaps.push(k.years + ' yrs ' + s.name + ', needs ' + s.min_years + '+');
  });
  const evOk = evidenceOk(c, r.evidence);
  if (!evOk) gaps.push('quote not found in CV');
  if (gaps.length) score = Math.min(score, threshold - 1);
  scored.push({
    candidate_id: c.candidate_id, cv_id: c.cv_id, cv_file_name: c.cv_file_name,
    name: c.full_name, email: c.email, location: c.location, score: score,
    reason: [r.reason_line_1, r.reason_line_2].map(s => String(s || '').trim()).filter(Boolean).join('\n'),
    evidence: r.evidence, evidence_verified: evOk, gaps: gaps
  });
});
scored.sort((a, b) => b.score - a.score);
const good = scored.filter(s => s.score >= threshold).slice(0, 5);
good.forEach((s, i) => { s.rank = i + 1; });
const closest = scored.filter(s => s.score < threshold).slice(0, 2);
const noMatch = good.length === 0;
const message = noMatch
  ? 'No good match: nobody scored ' + threshold + '+ out of 100.' +
    (closest.length ? ' Closest: ' + closest.map(c => c.name + ' (' + c.score + ', ' + (c.gaps.join('; ') || 'weak fit') + ')').join(' | ') : ' No one in the CV database is close.')
  : 'Top ' + good.length + ' candidate' + (good.length > 1 ? 's' : '');

return [{
  json: {
    question: q.question, role: q.role, role_id: q.role_id, source: q.source, save: q.save,
    parsed: parsed, threshold: threshold, no_match: noMatch, message: message,
    results: good, closest: closest, dropped_ids: dropped, considered: cands.length,
    save_payload: {
      p: {
        question: q.question, role_id: q.role_id, source: q.source, parsed: parsed, no_match: noMatch, message: message,
        results: good.map(g => ({ candidate_id: g.candidate_id, cv_id: g.cv_id, cv_file_name: g.cv_file_name, rank: g.rank,
          score: g.score, reason: g.reason, evidence: g.evidence }))
      }
    }
  }
}];
