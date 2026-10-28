// A reply stopped the sequence: prepare the GHL stage move + Slack notice.
const cfg = $('Config').first().json;
const out = [];
$input.all().forEach((it, i) => {
  const r = it.json || {};
  if (!r.matched || r.already) return;
  out.push({
    json: {
      opportunity_id: r.ghl_opportunity_id || null,
      stage_id: (cfg.ghl_stage_ids || {}).replied || null,
      slack: { channel: cfg.slack_channel_id, text: '📬 *' + r.candidate_name + '* replied about *' + r.role_title +
        '*. Outreach stopped after ' + r.emails_sent + ' email(s). GHL stage → *Replied*. Time to book the screening call!' }
    },
    pairedItem: { item: i }
  });
});
return out;
