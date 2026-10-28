// Read-only data for the portal pages: GET /api/data?view=roles|role|pipeline|cvs|test|activity
const { isAuthed, send, sb, settings, ghl, env } = require('./_lib');

const STAGES = ['Approved', 'Outreach Sent', 'Replied', 'Screening Call', 'Submitted to Client', 'Placed', 'Not a Fit'];

async function roles() {
  const [list, short, outreach] = await Promise.all([
    sb('hg_roles?select=id,title,client_name,status,version,search_query,decided_by,decided_at,created_at&order=id.desc'),
    sb('hg_shortlist?select=role_id,status&role_id=not.is.null'),
    sb('hg_outreach?select=role_id,status')
  ]);
  list.forEach(r => {
    const s = short.filter(x => x.role_id === r.id);
    const o = outreach.filter(x => x.role_id === r.id);
    r.counts = { suggested: s.filter(x => x.status === 'suggested').length, approved: s.filter(x => x.status === 'approved').length,
      replied: o.filter(x => x.status === 'replied').length };
  });
  return { roles: list };
}

async function role(id) {
  id = Number(id);
  if (!id) throw new Error('Missing role id');
  const [r, list] = await Promise.all([
    sb('hg_roles?select=*&id=eq.' + id),
    sb('hg_shortlist?select=id,rank,score,reason,evidence,cv_file_name,status,decided_by,decided_at,ghl_opportunity_id,created_at,' +
       'hg_candidates(id,full_name,email,location),hg_cvs(status),hg_outreach(id,status,step,max_steps,replied_at,stopped_reason)' +
       '&role_id=eq.' + id + '&order=score.desc')
  ]);
  if (!r.length) throw new Error('Role not found');
  delete r[0].transcript;
  return { role: r[0], shortlist: list };
}

async function pipeline() {
  const s = await settings();
  if (env('GHL_API_KEY') && s.ghl_location_id && s.ghl_pipeline_id) {
    try {
      const pipes = await ghl('/opportunities/pipelines?locationId=' + encodeURIComponent(s.ghl_location_id));
      const pipe = (pipes.pipelines || []).filter(p => p.id === s.ghl_pipeline_id)[0];
      const opps = await ghl('/opportunities/search?location_id=' + encodeURIComponent(s.ghl_location_id) +
        '&pipeline_id=' + encodeURIComponent(s.ghl_pipeline_id) + '&limit=100');
      const stages = (pipe ? pipe.stages : []).map(st => ({ id: st.id, name: st.name, cards: [] }));
      (opps.opportunities || []).forEach(o => {
        const st = stages.filter(x => x.id === o.pipelineStageId)[0];
        if (st) st.cards.push({ name: o.name, contact: o.contact ? o.contact.name : '', updated: o.updatedAt || o.lastStatusChangeAt, status: o.status });
      });
      return { source: 'GoHighLevel (live)', pipeline: pipe ? pipe.name : 'HG- Candidates', stages };
    } catch (e) {
      return Object.assign(await pipelineFromDb(), { warning: 'Could not reach GHL, showing the copilot\'s own records. ' + e.message });
    }
  }
  return Object.assign(await pipelineFromDb(), { warning: 'GHL is not configured yet, showing the copilot\'s own records.' });
}

async function pipelineFromDb() {
  const rows = await sb('hg_shortlist?select=id,status,hg_candidates(full_name),hg_roles(title),hg_outreach(status,step)&status=eq.approved');
  const stages = STAGES.map(n => ({ name: n, cards: [] }));
  rows.forEach(r => {
    const o = r.hg_outreach || {};
    const o1 = Array.isArray(o) ? o[0] || {} : o;
    const name = o1.status === 'replied' ? 'Replied' : (o1.step > 0 ? 'Outreach Sent' : 'Approved');
    stages.filter(s => s.name === name)[0].cards.push({ name: (r.hg_candidates || {}).full_name, contact: (r.hg_roles || {}).title });
  });
  return { source: 'Copilot database', pipeline: 'HG- Candidates', stages };
}

async function cvs() {
  const [files, cands] = await Promise.all([
    sb('hg_cvs?select=id,file_name,file_type,status,status_note,extraction_method,cv_date,uploaded_at,candidate_id,' +
       'hg_candidates!hg_cvs_candidate_id_fkey(full_name)&order=uploaded_at.desc&limit=500'),
    sb('hg_candidates?select=id')
  ]);
  const count = st => files.filter(f => f.status === st).length;
  return { files, summary: { files: files.length, people: cands.length, active: count('active'), duplicate: count('duplicate'),
    superseded: count('superseded') + count('older_version'), unreadable: count('unreadable'),
    ocr: files.filter(f => f.extraction_method === 'ocr').length } };
}

async function test() {
  const [qs, runs] = await Promise.all([
    sb('hg_eval_questions?select=*&order=id'),
    sb('hg_eval_runs?select=*&order=id.desc&limit=1')
  ]);
  return { questions: qs, run: runs[0] || null };
}

async function activity() {
  return { events: await sb('hg_events?select=*&order=id.desc&limit=150') };
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { error: 'Please log in' });
  const q = req.query || {};
  try {
    const views = { roles, role: () => role(q.id), pipeline, cvs, test, activity };
    if (!views[q.view]) return send(res, 400, { error: 'Unknown view' });
    return send(res, 200, await views[q.view]());
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
};
