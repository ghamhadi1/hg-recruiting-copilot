// Shared helpers for every portal page. No secrets here: the browser only talks to /api/*.
const HG = {
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  async api(view, params) {
    const qs = new URLSearchParams(Object.assign({ view }, params || {}));
    const r = await fetch('/api/data?' + qs, { credentials: 'same-origin' });
    if (r.status === 401) { HG.toLogin(); throw new Error('Please log in'); }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  },
  async act(action, body) {
    const r = await fetch('/api/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, body || {})) });
    if (r.status === 401) { HG.toLogin(); throw new Error('Please log in'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  },
  toLogin() { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); },
  date(s) {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },
  badge(status) {
    const map = { approved: 'ok', active: 'ok', replied: 'ok', passed: 'ok', pending_approval: 'warn', suggested: 'info',
      changes_requested: 'warn', duplicate: 'warn', superseded: '', older_version: '', rejected: 'bad', unreadable: 'bad',
      stopped: '', completed: '' };
    const label = { pending_approval: 'waiting for approval', changes_requested: 'changes requested', older_version: 'older version' }[status] || status;
    return '<span class="badge ' + (map[status] || '') + '">' + HG.esc(label) + '</span>';
  },
  score(n) {
    return '<span class="score">' + n + '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, n)) + '%"></i></span></span>';
  },
  md(src) { // tiny, safe markdown for the JD
    const out = [];
    let inList = false;
    String(src || '').split('\n').forEach(line => {
      const l = HG.esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<em>$2</em>');
      const isLi = /^- /.test(line);
      if (isLi && !inList) { out.push('<ul>'); inList = true; }
      if (!isLi && inList) { out.push('</ul>'); inList = false; }
      if (/^# /.test(line)) out.push('<h1>' + l.slice(2) + '</h1>');
      else if (/^## /.test(line)) out.push('<h2>' + l.slice(3) + '</h2>');
      else if (isLi) out.push('<li>' + l.slice(2) + '</li>');
      else if (line.trim()) out.push('<p>' + l + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  },
  nav(active) {
    const links = [['roles', '/', 'Roles'], ['pipeline', '/pipeline.html', 'Pipeline'], ['cvs', '/cvs.html', 'CVs'],
      ['test', '/test.html', 'Test'], ['activity', '/activity.html', 'Activity']];
    document.getElementById('top').innerHTML = '<div class="in"><a class="brand" href="/">HG<span>·</span>Recruiting Copilot</a><nav>' +
      links.map(l => '<a href="' + l[1] + '" class="' + (l[0] === active ? 'on' : '') + '">' + l[2] + '</a>').join('') +
      '</nav><a class="logout small muted" href="#" id="logout">Log out</a></div>';
    document.getElementById('logout').onclick = async e => {
      e.preventDefault();
      await fetch('/api/login', { method: 'DELETE' });
      location.href = '/login.html';
    };
  },
  fail(el, e) { el.innerHTML = '<div class="notice bad">⚠️ ' + HG.esc(e.message) + '</div>'; },
  fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(new Error('Could not read ' + file.name));
      r.readAsDataURL(file);
    });
  }
};
