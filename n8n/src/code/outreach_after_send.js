// Pairs each Gmail send result with its outreach row for the DB update.
return $input.all().map((it, i) => {
  const d = $('Build Email').itemMatching(i).json;
  const r = it.json || {};
  return {
    json: {
      ok: !!r.id && !r.error,
      error: r.error ? String(r.error.message || JSON.stringify(r.error)).slice(0, 300) : null,
      outreach_id: d.outreach_id, step_before: d.step, ghl_opportunity_id: d.ghl_opportunity_id || null,
      candidate_name: d.candidate_name, role_title: d.role_title,
      rpc: { p_id: d.outreach_id, p_message_id: r.id || null, p_thread_id: r.threadId || null }
    },
    pairedItem: { item: i }
  };
});
