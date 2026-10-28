// Final answer: JSON for the portal/eval + ready-made Slack blocks with Approve buttons.
const g = Object.assign({}, $('Guard & Score').first().json);
delete g.save_payload;
const cfg = $('Config').first().json;
const saved = $input.first().json && $input.first().json.search_id ? $input.first().json : null;
const roles = $('Open Roles').all().map(i => i.json).filter(r => r && r.id);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const idByCand = {};
if (saved) (saved.items || []).forEach(it => { idByCand[it.candidate_id] = it.shortlist_id; });
g.results.forEach(r => { r.shortlist_id = idByCand[r.candidate_id] || null; });
g.search_id = saved ? saved.search_id : null;

const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: '🔎 *' + esc(g.question) + '*' +
  (g.role ? '\nFor role: *' + esc(g.role.title) + '* (#' + g.role.id + ')' : '') } }];

if (g.no_match) {
  let t = '🤷 *No good match.* Nobody scored ' + g.threshold + '+ out of 100, so I am not recommending anyone.';
  g.closest.forEach(c => {
    t += '\n• Closest: *' + esc(c.name) + '* (' + c.score + '/100): ' + esc(c.gaps.join('; ') || 'weak fit') + ' · 📄 `' + esc(c.cv_file_name) + '`';
  });
  if (!g.closest.length) t += '\nNo one in the CV database is even close.';
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: t.slice(0, 2900) } });
}

g.results.forEach(r => {
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: ('*' + r.rank + '. ' + esc(r.name) + '*  ·  *' + r.score + '/100*\n' +
    esc(r.reason) + '\n📄 CV: `' + esc(r.cv_file_name) + '`').slice(0, 2900) } });
  if (!r.shortlist_id) return;
  const els = [];
  if (g.role) {
    els.push({ type: 'button', style: 'primary', action_id: 'cand_approve', value: String(r.shortlist_id),
      text: { type: 'plain_text', text: '✅ Approve for outreach' } });
  } else if (roles.length) {
    els.push({ type: 'static_select', action_id: 'cand_approve_role', placeholder: { type: 'plain_text', text: '✅ Approve for role…' },
      options: roles.slice(0, 100).map(x => ({ text: { type: 'plain_text', text: ('#' + x.id + ' ' + x.title).slice(0, 75) },
        value: r.shortlist_id + ':' + x.id })) });
  }
  els.push({ type: 'button', action_id: 'cand_reject', value: String(r.shortlist_id), text: { type: 'plain_text', text: '❌ Not a fit' } });
  blocks.push({ type: 'actions', elements: els });
});
if (!g.role && !roles.length && g.results.length) {
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'No approved roles yet, so there is nothing to approve these candidates for.' }] });
}
blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Score = must-haves 50 · experience 20 · nice-to-haves 15 · language/location 15. ' +
  'Under ' + g.threshold + ' is never recommended. Only real CVs from the database are used.' +
  (cfg.portal_url ? ' <' + cfg.portal_url + '|Portal>' : '') }] });

g.text = g.no_match ? g.message : g.message + ' for "' + g.question + '"';
g.blocks = blocks.slice(0, 50);
g.ok = true;
return [{ json: g }];
