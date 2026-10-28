// Normalises one outreach row (from the claim RPC or from the active-threads query).
return $input.all().filter(i => i.json && (i.json.outreach_id || i.json.id)).map((i, idx) => {
  const j = i.json;
  return {
    json: Object.assign({}, j, {
      outreach_id: j.outreach_id || j.id,
      sent_message_ids: j.sent_message_ids || [],
      has_thread: !!j.thread_id
    }),
    pairedItem: { item: idx }
  };
});
