/* ---------- RAM Club en vrai : compte /RAM, club réel, synchronisation ----------
   Servie par le serveur Padel JA (club.riseandmove.fr ou /club/), l'appli :
   1. lit la session /RAM (le même compte que Padel JA) ;
   2. charge le club de l'adhérent (ou propose d'en créer un / d'en rejoindre un avec le code) ;
   3. remplace les données de démo par celles du club ;
   4. après chaque action, compare l'état de l'appli à la dernière version connue et envoie
      les différences (petites opérations) ; toutes les quelques secondes, récupère ce que
      les autres ont changé.
   Sans serveur (GitHub Pages) ou sans club, l'appli reste la démo. */
(function () {
  if (window.RAM) return;   // déjà chargé (jamais deux synchronisations dans la même page)
  const JA = 'https://ja.riseandmove.fr';
  const onClubHost = /^club\./.test(location.hostname);
  const served = onClubHost || location.pathname.startsWith('/club');   // sinon : démo sans serveur
  const here = () => location.href.split('#')[0];
  const loginUrl = () => (onClubHost ? JA : '') + '/connexion?retour=' + encodeURIComponent(onClubHost ? here() : location.pathname);
  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const J = o => JSON.stringify(o);
  const copy = o => (o === undefined ? undefined : JSON.parse(J(o)));
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (x) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (x) {} } };

  const R = window.RAM = { user: undefined, clubs: [], club: null, key: null, role: null, rev: 0, base: new Map(), bad: new Map(), notified: new Set(), fol: {}, roles: {}, live: false };
  let readyFn; window.ramReady = new Promise(r => { readyFn = r; });

  async function api(path, body) {
    const r = await fetch(path, body ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: J(body) } : { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Erreur ' + r.status), { status: r.status });
    return d;
  }

  /* ---------- dates : « Il y a 5 min », « Hier », « 10:44 » ---------- */
  const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function rel(at) {
    if (!at) return '';
    const d = new Date(at), now = new Date(), s = (now - d) / 1000, days = Math.round((new Date(isoOf(now)) - new Date(isoOf(d))) / 864e5);
    if (s < 60) return "À l'instant";
    if (s < 3600) return 'Il y a ' + Math.floor(s / 60) + ' min';
    if (days === 0) return 'Il y a ' + Math.floor(s / 3600) + ' h';
    if (days === 1) return 'Hier';
    if (days < 7) return DAYS[d.getDay()];
    return fmtD(isoOf(d));
  }
  function clock(at) {
    if (!at) return '';
    const d = new Date(at), days = Math.round((new Date(isoOf(new Date())) - new Date(isoOf(d))) / 864e5);
    return days === 0 ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : days === 1 ? 'Hier' : days < 7 ? DA[d.getDay()] : fmtD(isoOf(d), 1);
  }
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- traduction appli ⇄ serveur, collection par collection ----------
     « partagé » = ce que le serveur garde ; les réponses personnelles (inscription, vote, like,
     réaction) y sont rangées par adhérent (myBy, likers, reBy), jamais en simple compteur. */
  const others = (map, me) => Object.entries(map || {}).filter(([k]) => k !== me);
  const POST_LOCAL = ['t', 'my', 'yes', 'maybe', 'wl', 'likes', 'com', 'ins'];
  function postOut(p, prev) {
    const s = copy(p); POST_LOCAL.forEach(k => delete s[k]);
    if (!p.at && !R.base.has('post/' + p.id)) p.at = Date.now();
    if (p.at) s.at = p.at;
    const my = Object.assign({}, (prev && prev.myBy) || {}); if (p.my == null) delete my[R.key]; else my[R.key] = p.my;
    if (Object.keys(my).length) s.myBy = my; else delete s.myBy;
    const lk = ((prev && prev.likers) || []).filter(k => k !== R.key); if (S.liked.has(p.id)) lk.push(R.key);
    if (lk.length) s.likers = lk; else delete s.likers;
    if (Array.isArray(s.opts)) s.opts = s.opts.map(o => [o[0], 0]);
    return s;
  }
  function postIn(s) {
    const p = copy(s), o = others(s.myBy, R.key), n = v => o.filter(([, x]) => x === v).length;
    delete p.myBy; delete p.likers;
    p.my = s.myBy && s.myBy[R.key] != null ? s.myBy[R.key] : null;
    p.yes = n('yes'); p.maybe = n('maybe'); p.wl = n('wait'); p.ins = o.filter(([, x]) => x === 'yes').map(([k]) => k).filter(k => M[k]);
    if (Array.isArray(p.opts)) p.opts = p.opts.map((x, i) => [x[0], n(i)]);
    const lk = s.likers || []; p.likes = lk.filter(k => k !== R.key).length;
    if (lk.includes(R.key)) S.liked.add(p.id); else S.liked.delete(p.id);
    p.t = rel(s.at); p.com = []; return p;
  }
  function msgOut(m, ref, prev) {
    const s = { ref, by: m.by, at: m.at || (m.at = Date.now()) };
    ['x', 'img', 'rep'].forEach(k => { if (m[k] != null && m[k] !== '') s[k] = copy(m[k]); });
    const re = Object.assign({}, (prev && prev.reBy) || {}); if (m.my) re[R.key] = m.my; else delete re[R.key];
    if (Object.keys(re).length) s.reBy = re;
    return s;
  }
  function msgIn(s, id) {
    const m = { _id: id, by: s.by, at: s.at, t: clock(s.at) };
    ['x', 'img', 'rep'].forEach(k => { if (s[k] != null) m[k] = copy(s[k]); });
    const re = {}; Object.values(s.reBy || {}).forEach(v => { re[v] = (re[v] || 0) + 1; });
    if (Object.keys(re).length) m.re = re;
    m.my = (s.reBy || {})[R.key] || null; return m;
  }
  const strip = (o, keys) => { const s = copy(o); keys.forEach(k => delete s[k]); return s; };

  /* éléments de l'appli à surveiller : [collection, id, objet local, version partagée] */
  function collect() {
    const out = [], add = (coll, id, s) => out.push([coll, id, JSON.parse(J(Object.assign({}, s, { id })))]);
    const prev = (c, id) => (R.base.get(c + '/' + id) || {}).data;
    const at = (o, coll) => { if (!o.at && !R.base.has(coll + '/' + o.id)) o.at = Date.now(); };
    const c = club();
    add('conf', 'main', { name: c.name, short: c.short, label: c.label || c.name, dark: !!c.dark, accent: c.accent, hot: c.hot, logo: c.logo || null,
      bg: c.bg, card: c.card, card2: c.card2, line: c.line, fg: c.fg, muted: c.muted, info: strip(CLUBINFO, ['joined', 'members', 'code']), form: FORM, season: S.season });
    posts.forEach(p => { if (!p.id) p.id = newId('p'); add('post', p.id, postOut(p, prev('post', p.id))); });
    chans.forEach(ch => { at(ch, 'chan'); add('chan', ch.id, strip(ch, ['msgs', 'un', 'mute'])); });
    GROUPS.forEach(g => { at(g, 'group'); add('group', g.id, g); });
    OLDG.forEach(g => { at(g, 'group'); add('group', g.id, Object.assign(copy(g), { old: 1 })); });
    CHAMPS.forEach(x => { at(x, 'champ'); add('champ', x.id, x); });
    OLDC.forEach(x => { at(x, 'champ'); add('champ', x.id, Object.assign(copy(x), { old: 1 })); });
    recs.forEach(r => { at(r, 'rec'); add('rec', r.id, strip(r, ['chat'])); });
    arts.forEach(a => { at(a, 'art'); add('art', a.id, a); });
    PARTNERS.forEach(x => { at(x, 'partner'); add('partner', x.id, x); });
    COMMS.forEach(x => { at(x, 'comm'); add('comm', x.id, x); });
    REPORTS.forEach(r => { if (!r.id) r.id = newId('rp'); add('report', r.id, Object.assign(strip(r, ['com', 'msg']), { mid: (r.com || r.msg || {})._id || r.mid || null })); });
    if (typeof CLAIMS !== 'undefined') CLAIMS.forEach(x => add('claim', x.id, x));
    Object.keys(M).forEach(k => {
      if (k === 'club') return;
      const s = strip(M[k], ['fol']); s.valid = VALID[k] || '';
      if (k === R.key) { const ct = {}; ['tel', 'mail'].forEach(x => { if (S.share[x] && MYCT[x][2]) ct[x] = MYCT[x][2]; }); if (S.share.soc && MYCT.soc[2]) ct.soc = [MYCT.soc[1], MYCT.soc[2]]; s.ct = ct; }
      add('member', k, s);
    });
    if (typeof STATS !== 'undefined') Object.keys(STATS).forEach(k => { const s = STATS[k]; if (M[k] && k !== 'club' && (k === R.key || R.base.has('stats/' + k) || s.k.size || Object.keys(s.c).length)) { add('stats', k, { c: s.c, k: [...s.k], got: s.got, lvl: s.lvl }); } });
    const read = Object.assign({}, (prev('prefs', R.key) || {}).read || {});
    chans.forEach(ch => { if (!ch.un) { const last = Math.max(0, ...(ch.msgs || []).map(m => m.at || 0)); if (last) read[ch.id] = Math.max(read[ch.id] || 0, last); } });
    add('prefs', R.key, { follow: [...S.follow], blocked: [...S.blocked], nset: S.nset, share: S.share, ct: MYCT, mute: chans.filter(ch => ch.mute).map(ch => ch.id), read, setup: S.setup || {}, invited: S.invited || 0 });
    // messages : groupes, direct des rencontres, commentaires des publications
    const box = (ref, list) => (list || []).forEach(m => { if (!m._id) m._id = newId('m'); add('msg', m._id, msgOut(m, ref, prev('msg', m._id))); });
    chans.forEach(ch => box('c:' + ch.id, ch.msgs));
    recs.forEach(r => box('r:' + r.id, r.chat));
    posts.forEach(p => box('p:' + p.id, p.com));
    return out;
  }
  /* conteneurs de messages encore affichés : un message absent d'un conteneur présent a été supprimé */
  function openRefs() {
    const s = new Set();
    chans.forEach(ch => ch.msgs && s.add('c:' + ch.id)); recs.forEach(r => r.chat && s.add('r:' + r.id)); posts.forEach(p => p.com && s.add('p:' + p.id));
    return s;
  }

  /* différences entre deux versions → opérations (set, unset, add, rm) */
  /* un champ vide créé à l'affichage (lineup: {}, cancel: []) vaut un champ absent : rien à envoyer */
  const empty = v => (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);
  function diff(a, b, p = [], out = []) {
    Object.keys(b).forEach(k => {
      const x = a[k], y = b[k];
      // nouvelle liste ou nouvel objet : détaillés champ par champ (« ma réaction », « mon like »), pour rester une réponse personnelle
      if (!(k in a)) {
        if (empty(y)) return;
        if (isObj(y)) diff({}, y, p.concat(k), out);
        else if (Array.isArray(y) && y.every(v => typeof v === 'string') && new Set(y).size === y.length) y.forEach(v => out.push({ p: p.concat(k), t: 'add', v }));
        else out.push({ p: p.concat(k), t: 'set', v: y });
      }
      else if (J(x) === J(y)) return;
      else if (isObj(x) && isObj(y)) diff(x, y, p.concat(k), out);
      else if (Array.isArray(x) && Array.isArray(y) && x.concat(y).every(v => typeof v === 'string') && new Set(x).size === x.length && new Set(y).size === y.length) {
        const rm = x.filter(v => !y.includes(v)), ad = y.filter(v => !x.includes(v));
        if (J(x.filter(v => !rm.includes(v)).concat(ad)) === J(y)) { rm.forEach(v => out.push({ p: p.concat(k), t: 'rm', v })); ad.forEach(v => out.push({ p: p.concat(k), t: 'add', v })); }
        else out.push({ p: p.concat(k), t: 'set', v: y });
      } else out.push({ p: p.concat(k), t: 'set', v: y });
    });
    Object.keys(a).forEach(k => { if (!(k in b) && !empty(a[k])) out.push({ p: p.concat(k), t: 'unset' }); });
    return out;
  }

  /* ---------- appliquer ce qui arrive du serveur ---------- */
  const LISTS = { post: () => posts, chan: () => chans, art: () => arts, partner: () => PARTNERS, comm: () => COMMS, rec: () => recs, report: () => REPORTS, claim: () => (typeof CLAIMS !== 'undefined' ? CLAIMS : []) };
  function place(list, obj, desc) {
    const i = list.findIndex(x => x.id === obj.id);
    if (i >= 0) { list[i] = obj; return; }
    const j = list.findIndex(x => (desc ? (x.at || 0) < (obj.at || 0) : (x.at || 0) > (obj.at || 0)));
    if (j < 0) list.push(obj); else list.splice(j, 0, obj);
  }
  const drop = (list, id) => { const i = list.findIndex(x => x.id === id); if (i >= 0) list.splice(i, 1); };
  function msgBox(ref) {
    const [k, id] = [ref.slice(0, 1), ref.slice(2)];
    if (k === 'c') { const c = chans.find(x => x.id === id); return c && (c.msgs = c.msgs || []); }
    if (k === 'r') { const r = recs.find(x => x.id === id); return r && r.st === 'live' ? (r.chat = r.chat || []) : null; }
    if (k === 'p') { const p = posts.find(x => x.id === id); return p && p.com; }
    return null;
  }
  let fresh = [];   // nouveautés arrivées pendant cette synchronisation (pour notifier)
  function applyItem(it, initial) {
    const key = it.coll + '/' + it.id, s = it.data, id = it.id;
    if (it.coll === 'member' && s && !s.res) s.res = [];
    if (it.del) R.base.delete(key); else R.base.set(key, { data: s });
    switch (it.coll) {
      case 'conf': {
        CLUBS.length = 1; const c = CLUBS[0] || (CLUBS[0] = {});
        Object.keys(c).forEach(k => delete c[k]);
        ['name', 'short', 'label', 'dark', 'accent', 'hot', 'logo', 'bg', 'card', 'card2', 'line', 'fg', 'muted'].forEach(k => { if (s[k] != null) c[k] = s[k]; });
        Object.keys(CLUBINFO).forEach(k => delete CLUBINFO[k]); Object.assign(CLUBINFO, copy(s.info || {}));
        CLUBINFO.mods = CLUBINFO.mods || { actus: true, comm: true };
        if (R.code) CLUBINFO.code = R.code;
        FORM.length = 0; (s.form || []).forEach(f => FORM.push(copy(f)));
        S.season = s.season || S.season; setTheme(0); return;
      }
      case 'post': {
        if (it.del) { drop(posts, id); return; }
        const p = postIn(s), old = posts.find(x => x.id === id);
        if (old) p.com = old.com; else if (!initial && s.by !== R.key) fresh.push(['post', p]);
        place(posts, p, true);
        R.base.forEach((v, k2) => { if (k2.startsWith('msg/') && v.data && v.data.ref === 'p:' + id && !p.com.some(m => m._id === k2.slice(4))) place2(p.com, msgIn(v.data, k2.slice(4))); });
        return;
      }
      case 'msg': {
        if (it.del) { [...chans.map(c => c.msgs), ...recs.map(r => r.chat), ...posts.map(p => p.com)].forEach(l => { if (!l) return; const i = l.findIndex(m => m._id === id); if (i >= 0) l.splice(i, 1); }); return; }
        const l = msgBox(s.ref); if (!l) return;
        const m = msgIn(s, id), i = l.findIndex(x => x._id === id);
        if (i >= 0) { l[i] = m; return; }
        place2(l, m);
        if (!initial && s.by !== R.key) fresh.push(['msg', m, s.ref]);
        return;
      }
      case 'chan': {
        if (it.del) { drop(chans, id); return; }
        const old = chans.find(x => x.id === id), c = Object.assign(copy(s), { msgs: old ? old.msgs : [], un: old ? old.un : 0, mute: old ? old.mute : false });
        if (!old) R.base.forEach((v, k2) => { if (k2.startsWith('msg/') && v.data && v.data.ref === 'c:' + id) place2(c.msgs, msgIn(v.data, k2.slice(4))); });
        place(chans, c, false); return;
      }
      case 'group': case 'champ': {
        const [cur, old] = it.coll === 'group' ? [GROUPS, OLDG] : [CHAMPS, OLDC];
        drop(cur, id); drop(old, id);
        if (it.del) return;
        const o = copy(s); const arch = !!o.old; delete o.old;
        place(arch ? old : cur, o, false); return;
      }
      case 'rec': {
        if (it.del) { drop(recs, id); return; }
        const old = recs.find(x => x.id === id), r = copy(s);
        if (r.st === 'live') { r.chat = old && old.chat ? old.chat : []; if (!old || !old.chat) R.base.forEach((v, k2) => { if (k2.startsWith('msg/') && v.data && v.data.ref === 'r:' + id) place2(r.chat, msgIn(v.data, k2.slice(4))); }); }
        place(recs, r, false); return;
      }
      case 'report': {
        if (it.del) { drop(REPORTS, id); return; }
        const r = copy(s);
        if (r.mid) { const all = [...chans.map(c => c.msgs), ...recs.map(x => x.chat), ...posts.map(p => p.com)].filter(Boolean).flat(); const m = all.find(x => x._id === r.mid); if (m) r[r.kind === 'com' ? 'com' : 'msg'] = m; }
        place(REPORTS, r, false); return;
      }
      case 'member': {
        if (it.del) { delete M[id]; delete VALID[id]; delete CT[id]; return; }
        const m = copy(s); VALID[id] = m.valid || ''; delete m.valid;
        if (m.ct && id !== R.key) CT[id] = m.ct; else delete CT[id];
        delete m.ct; m.res = m.res || []; m.fol = Math.max(0, (R.fol[id] || 0) - (S.follow.has(id) ? 1 : 0));
        M[id] = m; return;
      }
      case 'prefs': {
        if (it.del || id !== R.key) return;
        S.follow = new Set(s.follow || []); S.blocked = new Set(s.blocked || []);
        if (s.nset) Object.assign(S.nset, s.nset);
        if (s.share) Object.assign(S.share, s.share);
        if (s.ct) ['tel', 'mail', 'soc'].forEach(k => { if (s.ct[k]) MYCT[k] = s.ct[k]; });
        S.setup = s.setup || {}; S.invited = s.invited || 0;
        R.prefs = s; return;
      }
      case 'stats': {
        if (typeof STATS === 'undefined') return;
        if (it.del) { delete STATS[id]; return; }
        STATS[id] = { c: copy(s.c || {}), k: new Set(s.k || []), got: copy(s.got || {}), lvl: s.lvl == null ? null : s.lvl }; return;
      }
      default: {
        const list = LISTS[it.coll] && LISTS[it.coll]();
        if (!list) return;
        if (it.del) drop(list, id); else place(list, copy(s), it.coll === 'art');
      }
    }
  }
  function place2(list, m) { const j = list.findIndex(x => (x.at || 0) > (m.at || 0)); if (j < 0) list.push(m); else list.splice(j, 0, m); }

  /* ---------- tout ce qui dépend des autres éléments, recalculé après chaque arrivée ---------- */
  function derive() {
    JOINREQ.length = 0;
    Object.keys(M).forEach(k => { if (k !== 'club' && M[k].req && VALID[k] !== S.season) JOINREQ.push({ id: k, n: M[k].n, mail: M[k].mail || '', via: M[k].via || 'le code du club' }); });
    const mem = Object.keys(M).filter(k => k !== 'club');
    CLUBINFO.joined = mem.filter(k => VALID[k] === S.season || R.roles[k] === 'bureau' || R.roles[k] === 'coach').length;
    if (!(CLUBINFO.members >= CLUBINFO.joined)) CLUBINFO.members = CLUBINFO.joined;
    // rôle dans l'appli : bureau → gestion complète, enseignant, capitaine d'une équipe, adhérent
    S.role = R.role === 'bureau' ? 'admin' : R.role === 'coach' ? 'coach' : GROUPS.some(g => g.type === 'team' && g.cap === R.key) ? 'cap' : 'mem';
    if (R.role === 'bureau' || R.role === 'coach') VALID[R.key] = S.season;
    const read = (R.prefs && R.prefs.read) || {}, mute = (R.prefs && R.prefs.mute) || [];
    chans.forEach(c => {
      c.mute = mute.includes(c.id);
      const v = view(); if (v.v === 'chan' && v.id === c.id) { c.un = 0; return; }
      // non lus : messages des autres arrivés après ma dernière lecture (ou après l'ouverture de l'appli)
      const since = read[c.id] || R.loadAt || 0;
      c.un = (c.msgs || []).filter(m => m.at > since && m.by !== R.key).length;
    });
    posts.forEach(p => { if (p.at) p.t = rel(p.at); });
  }

  /* ---------- envoi et réception ---------- */
  let busy = false, again = false, timer = null, pushT = null;
  function ops() {
    const list = [], seen = new Set(), refs = openRefs();
    collect().forEach(([coll, id, s]) => {
      const k = coll + '/' + id; seen.add(k);
      const b = R.base.get(k);
      if (R.bad.get(k) === J(s)) return;                                   // déjà refusé tel quel : on n'insiste pas
      if (!b) list.push({ coll, id, op: 'put', data: s });
      else if (J(b.data) !== J(s)) { const patch = diff(b.data || {}, s); if (patch.length) list.push({ coll, id, op: 'patch', patch, _s: s }); }
    });
    R.base.forEach((b, k) => {
      if (seen.has(k)) return;
      const [coll, id] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
      if (coll === 'conf' || coll === 'prefs' || coll === 'stats') return;
      if (coll === 'msg' && !(b.data && refs.has(b.data.ref))) return;      // conteneur fermé (direct terminé…) : on garde
      if (coll === 'member' && !M[id] && id === R.key) return;
      list.push({ coll, id, op: 'del' });
    });
    return list;
  }
  async function tick() {
    if (!R.live) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const list = ops();
      if (list.length) {
        const sent = list.map(o => { const x = Object.assign({}, o); delete x._s; return x; });
        const r = await api('/api/ram/c/' + R.club + '/ops', { ops: sent });
        const bad = new Set((r.rejected || []).map(x => x.coll + '/' + x.id));
        list.forEach(o => { if (bad.has(o.coll + '/' + o.id)) R.bad.set(o.coll + '/' + o.id, J(o.data || o._s)); });
        list.forEach(o => { const k = o.coll + '/' + o.id; if (bad.has(k)) return; if (o.op === 'del') R.base.delete(k); else R.base.set(k, { data: o.data || o._s }); });
        if (bad.size) {
          console.warn('RAM Club : refusé ' + J(r.rejected));
          toast("Une modification n'a pas été enregistrée : elle n'est pas autorisée pour ton compte");
          // on revient à la version du serveur pour ces éléments
          list.filter(o => bad.has(o.coll + '/' + o.id)).forEach(o => { const b = R.base.get(o.coll + '/' + o.id); applyItem(b ? { coll: o.coll, id: o.id, data: b.data } : { coll: o.coll, id: o.id, del: 1 }, false); });
          derive(); safeRender();
        }
      }
      await pull();
    } catch (x) {
      if (x.status === 401 || x.status === 404) { stop(); toast(x.status === 401 ? 'Ta session /RAM a expiré : reconnecte-toi' : "Tu ne fais plus partie de ce club"); }
      else console.warn('RAM Club : synchronisation', x.message);
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(tick, 50); }
    }
  }
  async function pull() {
    const d = await api('/api/ram/c/' + R.club + '/sync?since=' + R.rev);
    // accès validé par le bureau ou rôle changé : ce qu'on a le droit de voir change, on recharge tout le club
    if (d.me && (d.me.valid !== R.valid || d.me.role !== R.role)) {
      const opened = d.me.valid && !R.valid;
      await start(R.club);
      if (opened) toast('Ton accès au club est validé : bienvenue !');
      return;
    }
    if (!d.items.length) { R.rev = d.rev; return; }
    const local = new Map(collect().map(([coll, id, s]) => [coll + '/' + id, J(s)]));
    fresh = [];
    d.items.forEach(it => {
      const k = it.coll + '/' + it.id, b = R.base.get(k);
      // modifié ici depuis le dernier envoi : on garde la version locale (elle partira au prochain envoi)
      if (b && local.has(k) && local.get(k) !== J(b.data) && !it.del) { R.base.set(k, { data: it.data }); return; }
      applyItem(it, false);
    });
    R.rev = d.rev;
    derive();
    fresh.forEach(([kind, o, ref]) => {
      // une seule notification par message ou publication, même s'il arrive deux fois
      const nk = kind + '/' + (o._id || o.id); if (R.notified.has(nk)) return; R.notified.add(nk);
      if (kind === 'post' && canSee(o)) notify(o.by === 'club' ? 'club' : 'follow', o.by, o.kind === 'perf' || o.kind === 'padel' ? 'a publié un résultat' : 'a publié sur le mur', { v: 'post', id: o.id });
      if (kind === 'msg' && ref.startsWith('c:')) { const c = chans.find(x => x.id === ref.slice(2)); const v = view(); if (c && !(v.v === 'chan' && v.id === c.id)) { if (!c.mute && chanOk(c)) notify('chan', o.by, 'a écrit dans ' + c.name, { v: 'chan', id: c.id }, false); } }
    });
    safeRender();
  }
  /* redessine sans gêner : pas pendant la saisie dans l'écran, ni sous une fenêtre ouverte */
  let pend = false;
  function safeRender() {
    const a = document.activeElement;
    if ($('sheet') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#main'))) { pend = true; return; }
    pend = false; ramRender(true);
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (pend && R.live) safeRender(); }, 300));
  function schedule() {
    clearTimeout(timer);
    const v = view(), hot = (v.v === 'chan') || (v.v === 'rec') || recs.some(r => r.st === 'live');
    // connexion en direct ouverte : les nouveautés arrivent aussitôt, la vérification régulière n'est qu'un filet de sécurité
    const direct = es && es.readyState === 1;
    timer = setTimeout(() => { tick().finally(schedule); }, document.hidden ? 60000 : direct ? 30000 : hot ? 3000 : 10000);
  }
  /* connexion en direct avec le serveur (comme une messagerie) : prévenu à chaque changement du club */
  let es = null;
  function listen() {
    if (es) es.close();
    if (!window.EventSource) return;
    es = new EventSource('/api/ram/c/' + R.club + '/events', { withCredentials: true });
    es.onmessage = ev => {
      let d = {}; try { d = JSON.parse(ev.data); } catch (x) {}
      if (d.rev < 0) { stop(); toast("Tu ne fais plus partie de ce club"); return; }
      if (d.rev > R.rev) tick();
    };
    es.onopen = () => { tick(); schedule(); };        // reconnecté : on rattrape ce qui a pu être manqué
    es.onerror = () => schedule();                    // coupé : vérification rapprochée en attendant la reconnexion
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && R.live) { tick(); schedule(); } });
  function stop() { R.live = false; clearTimeout(timer); if (es) { es.close(); es = null; } }

  /* chaque affichage peut suivre une action : on envoie les changements juste après */
  const ramRender = render;
  render = function (keep) { ramRender(keep); if (R.live) { clearTimeout(pushT); pushT = setTimeout(tick, 120); } };

  /* ---------- démarrage dans un vrai club ---------- */
  function wipe() {
    [posts, chans, GROUPS, CHAMPS, OLDG, OLDC, recs, arts, PARTNERS, COMMS, REPORTS, NOTIFS, JOINREQ, FORM].forEach(l => { l.length = 0; });
    Object.keys(M).forEach(k => { if (k !== 'club') delete M[k]; });
    [VALID, CT].forEach(o => Object.keys(o).forEach(k => delete o[k]));
    if (typeof XP !== 'undefined') Object.keys(XP).forEach(k => delete XP[k]);
    if (typeof STATS !== 'undefined') Object.keys(STATS).forEach(k => delete STATS[k]);
    if (typeof CLAIMS !== 'undefined') CLAIMS.length = 0;
    ['tel', 'mail'].forEach(k => { MYCT[k][2] = ''; }); MYCT.soc = ['at', 'Instagram', ''];
    S.liked.clear(); S.follow = new Set(); S.blocked = new Set(); S.share = { tel: false, mail: false, soc: false };
    S.tab = 'home'; S.stack = []; S.scoring = false; S.setup = {}; S.invited = 0;
    TODAY = isoOf(new Date()); S.plan.d = TODAY;
  }
  async function start(id) {
    const d = await api('/api/ram/c/' + id + '/sync?since=0');
    stop(); wipe();
    R.club = id; R.key = d.me.key; R.role = d.me.role; R.valid = d.me.valid; R.loadAt = Date.now(); R.code = d.club.code; R.fol = d.fol || {}; R.roles = d.roles || {}; R.base = new Map(); R.bad = new Map();
    window.RAM_KEY = R.key;
    const order = ['conf', 'member', 'prefs', 'stats', 'chan', 'group', 'champ', 'rec', 'post', 'art', 'partner', 'comm', 'claim', 'msg', 'report'];
    d.items.sort((a, b) => order.indexOf(a.coll) - order.indexOf(b.coll)).forEach(it => applyItem(it, true));
    if (!M[R.key]) M[R.key] = { n: 'Moi', r: 'NC', team: '', fol: 0, g: 'H', bd: '', res: [] };
    R.rev = d.rev; R.live = true; LS.set('ram-club', id);
    derive(); ramRender(); schedule(); listen();
  }

  /* ---------- actions propres au vrai club ---------- */
  const _joinNo = A.joinNo, _joinOk = A.joinOk, _readh = A.readh, _delAccount = A.delAccount;
  // demande validée : l'e-mail et la mention « demande » quittent le profil visible du club
  A.joinOk = d => { const j = JOINREQ[+d.i]; _joinOk(d); if (R.live && j && M[j.id]) { ['req', 'mail', 'via'].forEach(k => delete M[j.id][k]); render(true); } };
  A.joinNo = d => {
    if (!R.live) return _joinNo(d);
    const j = JOINREQ[+d.i]; if (!j) return;
    api('/api/ram/c/' + R.club + '/remove', { key: j.id }).then(() => { R.base.delete('member/' + j.id); delete M[j.id]; derive(); ramRender(true); toast(`Demande de ${j.n} refusée`); }, x => toast(x.message));
  };
  A.readh = d => { _readh(d); if (R.live) { const m = M[ME()]; m.req = 1; m.via = "une reprise d'adhésion"; render(true); } };
  A.ramRole = d => api('/api/ram/c/' + R.club + '/role', { key: d.id, role: d.r }).then(() => { R.roles[d.id] = d.r; const m = M[d.id]; if (m && d.r !== 'mem' && VALID[d.id] !== S.season) VALID[d.id] = S.season; render(true); toast(`${first(d.id)} : ${{ bureau: 'membre du bureau', coach: 'enseignant', mem: 'adhérent' }[d.r]}`); }, x => toast(x.message));
  A.ramRemove = d => sheet('Retirer ' + first(d.id), `<div class="body"><div class="note">${e(name(d.id))} n'aura plus accès à l'appli du club. Ses messages restent affichés.</div><button class="btn full hot" data-a="ramRemoveOk" data-id="${d.id}">Retirer du club</button></div>`);
  A.ramRemoveOk = d => api('/api/ram/c/' + R.club + '/remove', { key: d.id }).then(() => { closeSheet(); R.base.delete('member/' + d.id); delete M[d.id]; S.stack.pop(); derive(); ramRender(); toast('Adhérent retiré du club'); }, x => toast(x.message));
  A.delAccount = d => {
    if (!R.live) return _delAccount(d);
    sheet('Quitter le club', `<div class="body"><div class="note">Tu quittes ${e(club().name)} : ton profil et tes réglages sont retirés de l'appli du club. Tes messages restent affichés. Ton compte /RAM (le même que Padel JA) est conservé.</div><button class="btn full hot" data-a="ramLeave">Quitter ${e(club().name)}</button></div>`);
  };
  A.ramLeave = () => api('/api/ram/c/' + R.club + '/remove', { key: R.key }).then(() => { closeSheet(); stop(); LS.set('ram-club', ''); location.reload(); }, x => toast(x.message));
  A.ramSwitch = d => { closeSheet(); start(d.id).catch(x => toast(x.message)); };
  A.ramClubs = () => sheet('Mes clubs', `<div class="body"><div class="menu">${R.clubs.map(c => `<button data-a="ramSwitch" data-id="${c.id}">${ic(c.id === R.club ? 'check' : 'club')}${e(c.name)}</button>`).join('')}<button data-a="ramStart">${ic('plus')}Créer ou rejoindre un autre club</button></div></div>`);
  A.ramStart = () => onboard();
  A.ramCopy = () => { const t = `Rejoins ${club().name} sur RAM Club : ${location.origin}${onClubHost ? '/' : '/club/'} · code du club ${R.code}`; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { (S.setup = S.setup || {}).inv = true; render(true); toast('Invitation copiée'); }).catch(() => toast('Copie impossible ici : note le code ' + R.code)); };

  /* ---------- créer un club ou rejoindre le sien ---------- */
  function onboard() {
    sheet('Ton club sur RAM Club', `<div class="body">
      <form id="ram-join" class="stack"><span class="kicker">Rejoindre mon club</span><p class="muted small">Le bureau de ton club te donne son code (par exemple TPC-4821).</p>
        <div class="fld"><label for="rj-code">Code du club</label><input id="rj-code" required autocomplete="off" autocapitalize="characters" placeholder="TPC-4821"></div>
        <button class="btn full">Envoyer ma demande</button></form>
      <form id="ram-new" class="stack" style="margin-top:22px"><span class="kicker">Créer l'appli de mon club</span><p class="muted small">Tu seras au bureau : tu valides les adhérents et tu gères le club.</p>
        <div class="two"><div class="fld"><label for="rn-name">Nom du club</label><input id="rn-name" required maxlength="60" autocomplete="organization" placeholder="TC Les Tilleuls"></div>
        <div class="fld"><label for="rn-short">Sigle</label><input id="rn-short" required maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="TCT"></div></div>
        <button class="btn full ghost">Créer le club</button></form>
      <p class="muted small" style="margin-top:14px">Sans club, l'appli reste en démonstration avec un club fictif.</p></div>`);
  }
  document.addEventListener('submit', ev => {
    const f = ev.target; if (f.id !== 'ram-join' && f.id !== 'ram-new') return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    const go = f.id === 'ram-join' ? api('/api/ram/join', { code: $('rj-code').value }) : api('/api/ram/clubs', { name: $('rn-name').value, short: $('rn-short').value });
    go.then(async c => { closeSheet(); R.clubs = (await api('/api/ram/clubs')).clubs; await start(c.id); toast(f.id === 'ram-join' ? `Demande envoyée à ${c.name} · le bureau va valider ton accès` : `${c.name} est créé · code à donner aux adhérents : ${c.code}`); }, x => toast(x.message));
  }, true);

  /* ---------- écrans : compte /RAM, bandeau de démo, gestion d'un adhérent ---------- */
  window.ramTeam = () => Object.keys(M).filter(k => k !== 'club' && (R.roles[k] === 'bureau' || R.roles[k] === 'coach'));
  function accountCard() {
    const u = R.user, logo = `<img src="${ramLogo()}" alt="/RAM Club" class="ram-acc-logo">`;
    if (!u) return `${logo}<div class="grow"><b>Compte /RAM</b><span>Connecte-toi avec ton compte /RAM : le même que pour Padel JA.</span></div><a class="btn sm" href="${loginUrl()}">Se connecter</a>`;
    const nm = e([u.first, u.last].filter(Boolean).join(' ') || u.name || u.email);
    return `${logo}<div class="grow"><b>Compte /RAM</b><span>${nm} · ${e(u.email || '')}</span><small>${R.live ? (R.clubs.length > 1 ? `<button class="nm" data-a="ramClubs" style="color:var(--accent)">Changer de club</button>` : `Le même compte que Padel JA.`) : `<button class="nm" data-a="ramStart" style="color:var(--accent)">Créer ou rejoindre mon club</button>`}</small></div><a class="btn sm ghost" href="${onClubHost ? JA : ''}/deconnexion">Se déconnecter</a>`;
  }
  function fill() {
    const el = document.getElementById('ramAccount');
    if (!el || el.dataset.done || R.user === undefined || !served) return;
    el.dataset.done = '1'; el.hidden = false; el.innerHTML = accountCard();
  }
  new MutationObserver(fill).observe(document.getElementById('main'), { childList: true, subtree: true });

  const _home = V.home;
  V.home = function () {
    const h = _home.apply(this, arguments);
    if (R.live || !served || R.user === undefined) return h;
    const card = R.user
      ? `<div class="card"><span class="kicker">Démonstration</span><p>Tu regardes un club fictif. Crée l'appli de ton club ou rejoins-le avec son code.</p><button class="btn full" data-a="ramStart">Créer ou rejoindre mon club</button></div>`
      : `<div class="card"><span class="kicker">Démonstration</span><p>Tu regardes un club fictif. Connecte-toi avec ton compte /RAM pour retrouver ton club.</p><a class="btn full" href="${loginUrl()}">Se connecter</a></div>`;
    return '<div class="pad" style="padding-bottom:0">' + card + '</div>' + h;
  };
  const _profile = profile;
  profile = function (id) {
    let h = _profile(id);
    if (!R.live) return h;
    if (id === ME() && isBureau() && R.code) h = h.replace('<div class="phero">', `<div class="card"><span class="kicker">Code du club</span><p><b style="font-size:22px;letter-spacing:.06em">${e(R.code)}</b></p><p class="muted small">Donne ce code aux adhérents : ils l'entrent dans l'appli, puis tu valides leur demande.</p><button class="btn sm ghost" data-a="ramCopy">Copier l'invitation</button></div><div class="phero">`);
    if (id !== ME() && isBureau() && !isMinor(id) && R.roles[id]) {
      const r = R.roles[id], chip = (v, l) => `<button class="chip" data-a="ramRole" data-id="${id}" data-r="${v}" aria-pressed="${r === v}">${l}</button>`;
      h = h.replace(/<\/div>$/, `<div class="card"><span class="kicker">Accès à l'appli</span><div class="chips">${chip('mem', 'Adhérent')}${chip('coach', 'Enseignant')}${chip('bureau', 'Bureau')}</div><p class="muted small">Le bureau gère tout le club. Un enseignant gère les groupes, les stages et publie au nom du club. Le capitaine d'une équipe se choisit dans l'équipe.</p><button class="btn sm ghost" style="color:var(--hot-tx)" data-a="ramRemove" data-id="${id}">Retirer du club</button></div></div>`);
    }
    return h;
  };

  /* ---------- lancement ---------- */
  (async () => {
    if (!served) { R.user = null; readyFn(); return; }
    // première ouverture après une mise à jour : des fichiers de l'ancienne version peuvent venir du cache
    // (TODAY n'y était pas modifiable) → on vide le cache et on recharge, une seule fois
    try { TODAY = TODAY; } catch (x) {
      if (!sessionStorage.getItem('ram-refresh')) {
        sessionStorage.setItem('ram-refresh', '1');
        try { await Promise.all((await caches.keys()).map(k => caches.delete(k))); const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (y) {}
        location.reload(); return;
      }
      R.user = null; readyFn(); return;
    }
    try {
      const me = await api('/api/me');
      R.user = me.user && !me.user.guest ? me.user : null;
      if (R.user) {
        R.clubs = (await api('/api/ram/clubs')).clubs;
        const want = LS.get('ram-club'), c = R.clubs.find(x => x.id === want) || R.clubs[0];
        if (c) await start(c.id);
      }
    } catch (x) { console.warn('RAM Club : démarrage', x.message); if (R.user === undefined) R.user = null; }
    readyFn();
    if (!R.live) { render(true); fill(); }
  })();
})();
