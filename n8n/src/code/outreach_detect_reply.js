// Looks at the Gmail thread: any message we did not send ourselves = the candidate replied.
return $input.all().map((it, i) => {
  const d = $('Due Item').itemMatching(i).json;
  const t = it.json || {};
  if (!d.has_thread) return { json: Object.assign({}, d, { replied: false }), pairedItem: { item: i } };
  const sent = d.sent_message_ids || [];
  const msgs = t.messages || [];
  const hdr = (m, n) => ((((m || {}).payload || {}).headers || []).filter(h => h.name.toLowerCase() === n.toLowerCase())[0] || {}).value || '';
  const reply = msgs.filter(m => sent.indexOf(m.id) === -1)[0];
  const ours = msgs.filter(m => sent.indexOf(m.id) !== -1);
  return {
    json: Object.assign({}, d, {
      replied: !!reply,
      reply_message_id: reply ? reply.id : null,
      last_rfc_message_id: hdr(ours[ours.length - 1], 'Message-ID'),
      subject: hdr(msgs[0], 'Subject'),
      thread_error: t.error ? String(t.error.message || JSON.stringify(t.error)).slice(0, 200) : null
    }),
    pairedItem: { item: i }
  };
});
