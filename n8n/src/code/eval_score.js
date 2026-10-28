// Grades the bot on the 10 test questions (answers come back in the same order as the questions).
const qs = $('Load Questions').all().map(i => i.json);
const answers = $input.all().map(i => i.json || {});
const results = qs.map((q, i) => {
  const a = answers[i] || {};
  const res = a.results || [];
  const emails = res.map(r => String(r.email || '').toLowerCase());
  const problems = [];
  if (a.error) problems.push('search failed: ' + String(a.error.message || JSON.stringify(a.error)).slice(0, 150));
  if (q.expect_no_match) {
    if (!a.no_match) problems.push('expected "no good match" but the bot recommended: ' + res.map(r => r.name).join(', '));
  } else {
    if (a.no_match) problems.push('bot said "no good match"');
    (q.must_include || []).forEach(e => { if (emails.indexOf(e.toLowerCase()) === -1) problems.push('missing ' + e); });
  }
  (q.must_not_include || []).forEach(e => { if (emails.indexOf(e.toLowerCase()) !== -1) problems.push('should NOT include ' + e); });
  if (emails.filter((e, k) => emails.indexOf(e) !== k).length) problems.push('same person listed twice');
  res.forEach(r => { if (!r.cv_file_name) problems.push(r.name + ' has no CV file named'); });
  const req = q.required_cv || {};
  Object.keys(req).forEach(e => {
    const r = res.filter(x => String(x.email || '').toLowerCase() === e.toLowerCase())[0];
    if (r && r.cv_file_name !== req[e]) problems.push(r.name + ' cited ' + r.cv_file_name + ' instead of ' + req[e]);
  });
  return {
    id: q.id, question: q.question, expected: q.expected_answer, tests: q.tests, passed: problems.length === 0, problems: problems,
    bot_answer: a.no_match ? a.message : res.map(r => r.name + ' (' + r.score + ')').join(', '),
    results: res.map(r => ({ name: r.name, email: r.email, score: r.score, reason: r.reason, cv_file_name: r.cv_file_name })),
    closest: (a.closest || []).map(r => ({ name: r.name, score: r.score, gaps: r.gaps }))
  };
});
const score = results.filter(r => r.passed).length;
return [{ json: { run_id: $('Create Run').first().json.id,
  body: { status: 'done', score: score, total: results.length, results: results, finished_at: new Date().toISOString() } } }];
