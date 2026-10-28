const crypto = require('crypto');
const { env, sessionToken, send, readJson } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', 'hg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return send(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!env('PORTAL_PASSWORD')) return send(res, 500, { error: 'PORTAL_PASSWORD is not set in Vercel' });
  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, { error: 'Bad request' }); }
  const a = crypto.createHash('sha256').update(String(body.password || '')).digest();
  const b = crypto.createHash('sha256').update(env('PORTAL_PASSWORD')).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    await new Promise(r => setTimeout(r, 600)); // slow down guessing
    return send(res, 401, { error: 'Wrong password' });
  }
  res.setHeader('Set-Cookie', 'hg_session=' + sessionToken() + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + 60 * 60 * 24 * 14);
  return send(res, 200, { ok: true });
};
