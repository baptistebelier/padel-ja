/* Club de démonstration pour les testeurs d'Apple : à lancer dans la console de https://buvette.riseandmove.fr/demo,
   connecté avec le compte administrateur. Le contenu de la démo (membres, publications, discussions, équipes, buvette…)
   est envoyé au serveur (/api/admin/club-demo), qui le range dans le club « Club Démo /Buvette » du compte de démo
   (adresse DEMO_APPLE_EMAIL, mot de passe DEMO_APPLE_PASSWORD, posés sur Render). Relancer remet le club à neuf.
   « me » (l'adhérent de la démo) devient le compte de démo : le serveur remplace « __ME__ » par sa clé. */
(async () => {
  const J = o => JSON.parse(JSON.stringify(o)), out = [], now = Date.now(), H = 3600e3;
  const strip = (o, ks) => { const s = J(o); ks.forEach(k => delete s[k]); return s; };
  const add = (coll, id, d) => out.push({ coll, id, data: Object.assign(J(d), { id }) });
  const has = n => typeof window[n] !== 'undefined' || (() => { try { return typeof eval(n) !== 'undefined'; } catch (e) { return false; } })();
  const L = n => (has(n) ? eval(n) : []);
  const keys = Object.keys(M).filter(k => k !== 'club');
  const c = club();
  add('conf', 'main', { name: 'Club Démo /Buvette', short: 'DEMO', label: 'Club Démo /Buvette', dark: !!c.dark, accent: c.accent, accent2: c.accent2 || null, hot: c.hot,
    logo: c.logo || null, logoL: c.logoL || null, logoD: c.logoD || null, bg: c.bg, card: c.card, card2: c.card2, line: c.line, fg: c.fg, muted: c.muted,
    info: strip(CLUBINFO, ['joined', 'members', 'code']), form: FORM, season: S.season });
  // messages : heures étalées, le dernier il y a quelques minutes
  const box = (ref, list, fin) => (list || []).forEach((m, j, a) => {
    const at = m.at || fin - (a.length - 1 - j) * 47 * 60e3;
    const s = { ref, by: m.by, at };
    ['x', 'img', 'rep'].forEach(k => { if (m[k] != null && m[k] !== '') s[k] = J(m[k]); });
    if (m.re) { const re = {}; let i = 0; Object.entries(m.re).forEach(([v, n]) => { for (let x = 0; x < n && i < keys.length; x++) re[keys[i++]] = v; }); if (Object.keys(re).length) s.reBy = re; }
    add('msg', m._id || ref.replace(':', '') + 'm' + j, s);
  });
  // publications : de la plus récente à la plus ancienne, étalées sur les derniers jours ; j'aime et réponses répartis entre les adhérents
  posts.forEach((p, i) => {
    const s = strip(p, ['t', 'my', 'yes', 'maybe', 'wl', 'likes', 'com', 'ins']);
    s.at = p.at || now - (i * 7 + 1) * H;
    const lk = keys.filter(k => k !== p.by).slice(0, Math.min(p.likes || 0, keys.length - 1));
    if (lk.length) s.likers = lk;
    const my = {}; keys.filter(k => k !== 'me').slice(0, p.yes || 0).forEach(k => { my[k] = 'yes'; });
    if (Object.keys(my).length) s.myBy = my;
    if (Array.isArray(s.opts)) s.opts = s.opts.map(o => [o[0], 0]);
    add('post', p.id, s);
    box('p:' + p.id, p.com, Math.min(now - 5 * 60e3, s.at + (p.com || []).length * 47 * 60e3));
  });
  chans.forEach((ch, i) => { add('chan', ch.id, Object.assign(strip(ch, ['msgs', 'un', 'mute']), { at: ch.at || now - 30 * 864e5 })); box('c:' + ch.id, ch.msgs, now - (i * 13 + 4) * 60e3); });
  L('GROUPS').forEach(g => add(g.once ? 'cours' : 'group', g.id, Object.assign(J(g), { at: g.at || now - 20 * 864e5 })));
  L('OLDG').forEach(g => add('group', g.id, Object.assign(J(g), { old: 1, at: g.at || now - 200 * 864e5 })));
  L('CHAMPS').forEach(x => add('champ', x.id, Object.assign(J(x), { at: x.at || now - 40 * 864e5 })));
  L('OLDC').forEach(x => add('champ', x.id, Object.assign(J(x), { old: 1, at: x.at || now - 300 * 864e5 })));
  recs.forEach(r => { add('rec', r.id, Object.assign(strip(r, ['chat']), { at: r.at || now - 10 * 864e5 })); box('r:' + r.id, r.chat, now - 2 * H); });
  [['art', 'arts'], ['partner', 'PARTNERS'], ['comm', 'COMMS'], ['claim', 'CLAIMS'], ['form', 'QFORMS'], ['rep', 'QREPS'], ['bar', 'BAR'], ['order', 'ORDERS'], ['redeem', 'REDEEMS'],
    ['eleve', 'ELEVES'], ['seance', 'SEANCES'], ['objectif', 'OBJECTIFS'], ['suivi', 'SUIVI'], ['brouillon', 'BROUILLONS']]
    .forEach(([coll, n]) => L(n).forEach(x => x && x.id && !x._club && add(coll, x.id, Object.assign(J(x), { at: x.at || now - 5 * 864e5 }))));
  keys.forEach(k => {
    const s = strip(M[k], ['fol']);
    s.valid = (has('VALID') && VALID[k]) || S.season;
    if (has('CT') && CT[k]) s.ct = J(CT[k]);
    if (k === 'me') { s.n = 'Camille Démo'; s.fo = [...S.follow].filter(x => M[x] && x !== 'me'); delete s.ct; }
    add('member', k, s);
  });
  if (has('STATS')) Object.keys(STATS).forEach(k => { const s = STATS[k]; if (M[k] && k !== 'club') add('stats', k, { c: s.c, k: [...s.k], got: s.got, lvl: s.lvl }); });
  add('prefs', 'me', { follow: [...S.follow], blocked: [], nset: S.nset, share: S.share, setup: { done: 1 }, motif: S.motif || 'ram-mixte', favs: S.favs || [] });
  // l'adhérent « me » de la démo devient le compte de démo
  const remap = v => Array.isArray(v) ? v.map(remap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k === 'me' ? '__ME__' : k, remap(x)])) : v === 'me' ? '__ME__' : v;
  const items = out.map(x => ({ coll: x.coll, id: x.id === 'me' ? '__ME__' : x.id, data: remap(x.data) }));
  const r = await fetch('/api/admin/club-demo', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
  const d = await r.json().catch(() => ({}));
  console.log('Club de démo :', r.status, d, items.length + ' éléments envoyés');
  return { status: r.status, d, n: items.length };
})();
