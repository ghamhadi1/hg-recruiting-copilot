// Portal actions (POST /api/action). Everything that sends anything still needs a Slack Approve click.
const { isAuthed, send, readJson, sb, n8n } = require('./_lib');

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { error: 'Please log in' });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  let b;
  try { b = await readJson(req); } catch (e) { return send(res, 400, { error: 'Bad request' }); }
  try {
    switch (b.action) {
      case 'new_role': {
        const transcript = String(b.transcript || '').trim();
        if (transcript.length < 200) return send(res, 400, { error: 'Please paste the full transcript (at least a few paragraphs).' });
        return send(res, 200, await n8n('transcript', { transcript, client_name: b.client_name || null,
          client_email: b.client_email || null, requested_by: 'portal' }, 20000));
      }
      case 'upload_cv': {
        if (!b.file_name || !b.data_base64) return send(res, 400, { error: 'No file' });
        // any file type is forwarded: n8n flags what it can't read instead of skipping it
        return send(res, 200, await n8n('cv', { file_name: b.file_name, mime_type: b.mime_type, data_base64: b.data_base64, source: 'portal' }, 58000));
      }
      case 'search': {
        const question = String(b.question || '').trim();
        if (!question) return send(res, 400, { error: 'Type a question' });
        const r = await n8n('search', { question, role_id: b.role_id || null, source: 'portal', save: false }, 58000);
        delete r.blocks;
        return send(res, 200, r);
      }
      case 'run_eval':
        return send(res, 200, await n8n('eval', {}, 20000));
      case 'stop_outreach': {
        await sb('rpc/hg_stop_outreach', { method: 'POST', body: { p_id: Number(b.outreach_id), p_reason: 'Stopped from portal' } });
        return send(res, 200, { ok: true });
      }
      default:
        return send(res, 400, { error: 'Unknown action' });
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'n8n took too long to answer. Check the n8n executions list.' : e.message;
    return send(res, 502, { error: msg });
  }
};
