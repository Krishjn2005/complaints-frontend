import { useState, useEffect, useMemo } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const STATUS = { pending: 'Pending', 'in-progress': 'In progress', resolved: 'Resolved' };
const CATS = ['plumbing', 'electrical', 'lift', 'security', 'cleaning', 'parking', 'other'];
const PRIO = ['low', 'normal', 'urgent'];
const RANK = { urgent: 0, normal: 1, low: 2 };
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
const floorOf = (r) => { const n = parseInt(r, 10); return n >= 100 ? Math.floor(n / 100) : null; };

function ago(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (isNaN(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const getToken = () => { try { return localStorage.getItem('admin_token'); } catch { return null; } };

export default function ComplaintsApp() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState(getToken());
  const [status, setStatus] = useState('all');
  const [cat, setCat] = useState('all');
  const [floor, setFloor] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('urgent');
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [login, setLogin] = useState(false);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ resident: '', issue: '', category: 'other', priority: 'normal' });
  const [cred, setCred] = useState({ username: '', password: '' });
  const [busy, setBusy] = useState(false);

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const call = async (path, opts = {}) => {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 401 && path !== '/login') { signOut(); say('Session expired. Sign in again.'); throw new Error('auth'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const load = async () => {
    try { setLoading(true); setError(''); setItems(await call('/complaints')); }
    catch { setError('Cannot reach the server. Check the API is running on port 5000.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const signOut = () => { try { localStorage.removeItem('admin_token'); } catch {} setToken(null); };

  const signIn = async () => {
    try {
      setBusy(true);
      const { token: t } = await call('/login', { method: 'POST', body: JSON.stringify(cred) });
      try { localStorage.setItem('admin_token', t); } catch {}
      setToken(t); setLogin(false); setCred({ username: '', password: '' }); say('Signed in as admin');
    } catch (e) { say(e.message); } finally { setBusy(false); }
  };

  const add = async () => {
    if (!form.resident.trim() || !form.issue.trim()) return say('Enter the flat and describe the issue.');
    try {
      setBusy(true);
      const c = await call('/complaints', { method: 'POST', body: JSON.stringify(form) });
      setItems((p) => [c, ...p]);
      setForm({ resident: '', issue: '', category: 'other', priority: 'normal' });
      setDrawer(false); say('Complaint added');
    } catch (e) { say(e.message); } finally { setBusy(false); }
  };

  const patch = async (id, body) => {
    try { const u = await call(`/complaints/${id}`, { method: 'PUT', body: JSON.stringify(body) }); setItems((p) => p.map((c) => (c.id === id ? u : c))); }
    catch (e) { if (e.message !== 'auth') say(e.message); }
  };
  const remove = async (id) => {
    try { await call(`/complaints/${id}`, { method: 'DELETE' }); setItems((p) => p.filter((c) => c.id !== id)); say('Complaint deleted'); }
    catch (e) { if (e.message !== 'auth') say(e.message); } finally { setConfirm(null); }
  };

  const byFloor = useMemo(() => {
    const m = {}; items.forEach((c) => { const f = floorOf(c.resident); if (f) (m[f] = m[f] || []).push(c); });
    return m;
  }, [items]);
  const top = Math.max(6, ...Object.keys(byFloor).map(Number));
  const floors = Array.from({ length: top }, (_, i) => top - i);

  const counts = useMemo(() => {
    const c = { all: items.length, pending: 0, 'in-progress': 0, resolved: 0 };
    items.forEach((x) => { if (c[x.status] !== undefined) c[x.status]++; });
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((c) => (status === 'all' || c.status === status) && (cat === 'all' || c.category === cat)
        && (!floor || floorOf(c.resident) === floor) && (!s || `${c.resident} ${c.issue}`.toLowerCase().includes(s)))
      .sort((a, b) => sort === 'urgent' ? (RANK[a.priority] - RANK[b.priority]) || (new Date(b.created_at) - new Date(a.created_at))
        : sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));
  }, [items, status, cat, floor, q, sort]);

  const admin = !!token;
  const openCount = counts.pending + counts['in-progress'];

  return (
    <div className="ca">
      <style>{css}</style>

      <header className="top">
        <div>
          <h1>Complaints desk</h1>
          <p>{items.length ? `${openCount} open, ${counts.resolved} resolved` : 'No complaints logged yet'}</p>
        </div>
        <div className="top-actions">
          <button className="solid" onClick={() => setDrawer(true)}>New complaint</button>
          {admin ? <button onClick={() => { signOut(); say('Signed out'); }}>Sign out</button> : <button onClick={() => setLogin(true)}>Admin sign in</button>}
        </div>
      </header>

      <div className="layout">
        <aside className="side">
          <h2>The building</h2>
          <p className="hint">Each window is a complaint. Tap a floor to filter.</p>
          <div className="tower">
            {floors.map((f) => {
              const list = byFloor[f] || [];
              return (
                <button key={f} className={`floor ${floor === f ? 'on' : ''}`} onClick={() => setFloor(floor === f ? null : f)} aria-label={`Floor ${f}, ${list.length} complaints`}>
                  <span className="fl">{f}</span>
                  <span className="wins">
                    {list.map((c) => <i key={c.id} className={`w s-${c.status} ${c.priority === 'urgent' && c.status !== 'resolved' ? 'urg' : ''}`} title={`Flat ${c.resident}: ${c.issue}`} />)}
                    {Array.from({ length: Math.max(0, 5 - list.length) }).map((_, i) => <i key={`e${i}`} className="w off" />)}
                  </span>
                </button>
              );
            })}
          </div>
          <ul className="legend">
            <li><i className="w s-pending" />Pending</li><li><i className="w s-in-progress" />In progress</li><li><i className="w s-resolved" />Resolved</li>
          </ul>
        </aside>

        <main>
          <div className="chips" role="tablist">
            {['all', 'pending', 'in-progress', 'resolved'].map((k) => (
              <button key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{k === 'all' ? 'All' : STATUS[k]} <b>{counts[k]}</b></button>
            ))}
          </div>
          <div className="tools">
            <input type="search" placeholder="Search flat or issue" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="all">All categories</option>{CATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="urgent">Urgent first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
          </div>
          {floor && <p className="filtered">Showing floor {floor} only. <button className="link" onClick={() => setFloor(null)}>Show all floors</button></p>}

          {error && <div className="err">{error} <button onClick={load}>Retry</button></div>}
          {loading && <p className="empty">Loading complaints…</p>}
          {!loading && !error && shown.length === 0 && <p className="empty">{items.length ? 'Nothing matches these filters.' : 'All quiet. Add the first complaint with the button above.'}</p>}

          <ul className="list">
            {shown.map((c) => (
              <li key={c.id} className={`row p-${c.priority} ${open === c.id ? 'open' : ''}`}>
                <button className="head" onClick={() => { setOpen(open === c.id ? null : c.id); setConfirm(null); }} aria-expanded={open === c.id}>
                  <i className={`w s-${c.status}`} />
                  <span className="flat">{c.resident}</span>
                  <span className="txt"><b>{c.issue}</b><small>{ago(c.created_at)}</small></span>
                  <span className="tag">{cap(c.category || 'other')}</span>
                  {c.priority === 'urgent' && <span className="tag urgent">Urgent</span>}
                  <span className={`st s-${c.status}`}>{STATUS[c.status]}</span>
                </button>
                {open === c.id && (
                  <div className="more">
                    {admin ? (
                      <>
                        <div className="seg"><span>Status</span>{Object.keys(STATUS).map((k) => <button key={k} className={c.status === k ? 'on' : ''} onClick={() => patch(c.id, { status: k })}>{STATUS[k]}</button>)}</div>
                        <div className="seg"><span>Priority</span>{PRIO.map((k) => <button key={k} className={c.priority === k ? 'on' : ''} onClick={() => patch(c.id, { priority: k })}>{cap(k)}</button>)}</div>
                        {confirm === c.id
                          ? <div className="seg"><button className="danger" onClick={() => remove(c.id)}>Yes, delete it</button><button onClick={() => setConfirm(null)}>Keep</button></div>
                          : <button className="link bad" onClick={() => setConfirm(c.id)}>Delete this complaint</button>}
                      </>
                    ) : (
                      <p className="hint">Filed {new Date(c.created_at).toLocaleString()}. <button className="link" onClick={() => setLogin(true)}>Sign in as admin</button> to update it.</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </main>
      </div>

      <div className={`scrim ${drawer || login ? 'show' : ''}`} onClick={() => { setDrawer(false); setLogin(false); }} />

      <aside className={`drawer ${drawer ? 'show' : ''}`} aria-hidden={!drawer}>
        <h2>New complaint</h2>
        <label>Flat<input value={form.resident} onChange={(e) => setForm({ ...form, resident: e.target.value })} placeholder="e.g. 903" /></label>
        <label>What is wrong?<textarea rows="3" value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} placeholder="Describe the problem" /></label>
        <div className="group"><span>Category</span><div className="picks">{CATS.map((c) => <button key={c} className={form.category === c ? 'on' : ''} onClick={() => setForm({ ...form, category: c })}>{cap(c)}</button>)}</div></div>
        <div className="group"><span>Priority</span><div className="picks">{PRIO.map((p) => <button key={p} className={`${form.priority === p ? 'on' : ''} pr-${p}`} onClick={() => setForm({ ...form, priority: p })}>{cap(p)}</button>)}</div></div>
        <div className="foot"><button onClick={() => setDrawer(false)}>Cancel</button><button className="solid" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add complaint'}</button></div>
      </aside>

      {login && (
        <div className="modal" role="dialog" aria-label="Admin sign in">
          <h2>Admin sign in</h2>
          <label>Username<input value={cred.username} onChange={(e) => setCred({ ...cred, username: e.target.value })} autoFocus /></label>
          <label>Password<input type="password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && signIn()} /></label>
          <div className="foot"><button onClick={() => setLogin(false)}>Cancel</button><button className="solid" onClick={signIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap');
.ca{--ink:#10202e;--mute:#586a78;--line:#c9d3da;--bg:#e8eef2;--card:#f9fbfc;--pend:#e3a52b;--prog:#3a78c4;--done:#3d9a67;--urg:#d24b3e;
font-family:'Bricolage Grotesque',system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;padding:1.5rem clamp(1rem,4vw,3rem) 4rem}
.ca *{box-sizing:border-box}.ca h1,.ca h2{margin:0;letter-spacing:-.02em}
.ca button,.ca input,.ca select,.ca textarea{font:inherit;color:inherit}
.ca button{cursor:pointer;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:.45rem .85rem;font-weight:600;transition:transform .12s,background .15s,border-color .15s}
.ca button:hover{border-color:var(--ink)}.ca button:active{transform:scale(.97)}
.ca button:disabled{opacity:.5;cursor:not-allowed}
.ca button.solid{background:var(--ink);color:#fff;border-color:var(--ink)}
.ca :focus-visible{outline:2px solid var(--prog);outline-offset:2px}
.ca input,.ca select,.ca textarea{width:100%;padding:.6rem .75rem;border:1px solid var(--line);border-radius:6px;background:var(--card)}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem;max-width:1100px;margin-inline:auto}
.top h1{font-size:clamp(2rem,5vw,3.2rem);font-weight:800;line-height:1}.top p{margin:.4rem 0 0;color:var(--mute)}
.top-actions{display:flex;gap:.5rem}
.layout{display:grid;grid-template-columns:250px 1fr;gap:2rem;max-width:1100px;margin:0 auto;align-items:start}
.side{position:sticky;top:1rem}.side h2{font-size:1.1rem}.hint{color:var(--mute);font-size:.85rem;margin:.3rem 0 .8rem}
.tower{background:var(--ink);padding:.6rem;border-radius:4px 4px 0 0;display:flex;flex-direction:column;gap:3px;border-top:8px solid #2b4257}
.floor{display:flex;align-items:center;gap:.5rem;background:#182d3f!important;border:1px solid transparent!important;border-radius:3px!important;padding:.3rem .5rem!important;width:100%}
.floor:hover{background:#21394f!important}.floor.on{border-color:var(--pend)!important;background:#25415a!important}
.fl{color:#8aa2b5;font-size:.8rem;width:1.2rem;text-align:right}.wins{display:flex;gap:4px;flex:1;flex-wrap:wrap}
.w{display:inline-block;width:16px;height:20px;border-radius:2px 2px 0 0;background:var(--pend);font-style:normal;flex:none}
.w.s-in-progress{background:var(--prog)}.w.s-resolved{background:var(--done)}.w.off{background:#2b4257}
.w.urg{box-shadow:0 0 0 2px var(--urg);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 0 4px rgba(210,75,62,.25)}}
.legend{list-style:none;padding:0;margin:.8rem 0 0;display:flex;flex-wrap:wrap;gap:.4rem 1rem;font-size:.8rem;color:var(--mute)}
.legend li{display:flex;align-items:center;gap:.35rem}.legend .w{width:10px;height:12px}
.chips{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.8rem}
.chip{border-radius:999px!important}.chip b{color:var(--mute);margin-left:.3rem;font-weight:600}
.chip.on{background:var(--ink)!important;color:#fff;border-color:var(--ink)!important}.chip.on b{color:#b9c8d3}
.tools{display:grid;grid-template-columns:1fr 160px 150px;gap:.5rem;margin-bottom:1rem}
.filtered{font-size:.9rem;color:var(--mute)}.link{background:none!important;border:0!important;padding:0!important;text-decoration:underline;color:var(--prog)}.link.bad{color:var(--urg)}
.list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.row{border-bottom:1px solid var(--line);background:transparent;transition:background .15s}.row.open{background:var(--card)}
.row .head{display:flex;align-items:center;gap:.8rem;width:100%;text-align:left;background:none;border:0;border-radius:0;padding:.85rem .4rem;font-weight:400}
.row .head:hover{background:rgba(16,32,46,.04)}
.head .w{width:10px;height:14px}.flat{font-weight:800;min-width:3rem;font-size:1.05rem}
.txt{flex:1;min-width:0;display:flex;flex-direction:column}.txt b{font-weight:600}.txt small{color:var(--mute)}
.tag{font-size:.78rem;color:var(--mute);border:1px solid var(--line);border-radius:4px;padding:.1rem .45rem}.tag.urgent{color:#fff;background:var(--urg);border-color:var(--urg);font-weight:700}
.st{font-size:.85rem;font-weight:700;color:var(--pend);min-width:5.5rem;text-align:right}.st.s-in-progress{color:var(--prog)}.st.s-resolved{color:var(--done)}
.row.p-urgent{box-shadow:inset 3px 0 var(--urg)}
.more{padding:.2rem .8rem 1rem 3rem;display:flex;flex-direction:column;gap:.6rem;animation:in .18s ease-out}
@keyframes in{from{opacity:0;transform:translateY(-4px)}}
.seg{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}.seg>span{width:4.5rem;color:var(--mute);font-size:.85rem}
.seg button.on{background:var(--ink);color:#fff;border-color:var(--ink)}.seg button.danger{background:var(--urg);color:#fff;border-color:var(--urg)}
.empty{color:var(--mute);padding:2.5rem 0;text-align:center}.err{background:#fbe9e7;border:1px solid #efbdb7;color:#8f2b21;padding:.7rem 1rem;border-radius:6px;margin-bottom:1rem}
.scrim{position:fixed;inset:0;background:rgba(16,32,46,.45);opacity:0;pointer-events:none;transition:opacity .2s}.scrim.show{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:var(--card);padding:1.5rem;display:flex;flex-direction:column;gap:1rem;transform:translateX(100%);transition:transform .25s cubic-bezier(.2,.8,.2,1);overflow:auto}
.drawer.show{transform:none}
.ca label,.group>span{display:flex;flex-direction:column;gap:.3rem;font-weight:600;font-size:.9rem}
.picks{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.35rem}.picks button.on{background:var(--ink);color:#fff;border-color:var(--ink)}.picks .pr-urgent.on{background:var(--urg);border-color:var(--urg)}
.foot{display:flex;justify-content:flex-end;gap:.5rem;margin-top:auto}
.modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(380px,92%);background:var(--card);padding:1.5rem;border-radius:8px;display:flex;flex-direction:column;gap:1rem;animation:pop .18s ease-out}
@keyframes pop{from{opacity:0;transform:translate(-50%,-46%)}}
.toast{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:.7rem 1.2rem;border-radius:6px;font-weight:600;animation:in .2s}
@media(max-width:760px){.layout{grid-template-columns:1fr}.side{position:static}.tools{grid-template-columns:1fr}.tag:not(.urgent){display:none}}
@media(prefers-reduced-motion:reduce){.ca *{animation:none!important;transition:none!important}}
`;