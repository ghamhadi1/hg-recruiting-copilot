// Turns the hg_settings rows (key/value) into one config object for this run.
const cfg = {};
for (const item of $input.all()) {
  if (item.json && item.json.key) cfg[item.json.key] = item.json.value;
}
if (!cfg.openai_model) throw new Error('hg_settings is empty: run supabase/schema.sql and scripts/setup.py supabase');
cfg.today = new Date().toISOString().slice(0, 10);
return [{ json: cfg }];
