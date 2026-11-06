/* Notifications : essai sur l'appareil, heures calmes (envoi groupé au réveil, urgences qui passent),
   suivi pour le bureau, regroupement des messages d'une même discussion.
   Chaque test a son propre dossier et ses propres comptes : rien ne dépend des vraies variables de Render. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { freePort } = require('./helpers');
const W = require('../lib/webpush');
const { createNotifier, suiviNotifs, debutParis } = require('../lib/pushnotif');
const { filNotif } = require('../club/fil-notif.js');

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/* un magasin local jetable, même si Render fournit SUPABASE_URL */
function localStore(nom) {
  const { createStore } = require('../lib/store');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  try { return createStore(fs.mkdtempSync(path.join(os.tmpdir(), nom))); }
  finally { if (saved.url) process.env.SUPABASE_URL = saved.url; if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key; }
}
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const sub = n => ({ endpoint: 'https://push.test/' + n, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(crypto.randomBytes(16)) } });
/* les envois vers les services de notification, interceptés (aucun appel réseau) */
async function avecFetch(fn) {
  const hits = [], real = global.fetch;
  global.fetch = async (u, o) => { hits.push({ to: String(u).split('/').pop(), urgency: o && o.headers && o.headers.Urgency }); return { ok: true, status: 201 }; };
  try { await fn(hits); } finally { global.fetch = real; }
  return hits;
}
/* heure de Paris maintenant, pour régler des heures calmes qui tombent (ou non) sur ce moment */
const hParis = () => +new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':')[0] % 24;

/* ---------- 2. heures calmes : le calcul ---------- */
test('heures calmes : 22 h à 7 h par défaut, heure de Paris, été comme hiver', () => {
  assert.deepEqual(W.calmeOf(null), { on: true, de: 22, a: 7 });
  // hiver (UTC+1) : 22 h 30 et 3 h à Paris sont calmes, 7 h et 21 h 59 ne le sont pas
  assert.equal(W.enCalme(null, Date.UTC(2026, 10, 6, 21, 30)), true);
  assert.equal(W.enCalme(null, Date.UTC(2026, 10, 7, 2, 0)), true);
  assert.equal(W.enCalme(null, Date.UTC(2026, 10, 7, 6, 0)), false);
  assert.equal(W.enCalme(null, Date.UTC(2026, 10, 6, 20, 59)), false);
  // été (UTC+2) : 22 h 30 à Paris = 20 h 30 UTC
  assert.equal(W.enCalme(null, Date.UTC(2026, 6, 6, 20, 30)), true);
  assert.equal(W.enCalme(null, Date.UTC(2026, 6, 6, 19, 30)), false);
  // réglables : 23 h à 6 h ; dans la journée (13 h à 15 h) ; coupées
  assert.equal(W.enCalme({ de: 23, a: 6 }, Date.UTC(2026, 10, 6, 21, 30)), false);
  assert.equal(W.enCalme({ de: 13, a: 15 }, Date.UTC(2026, 10, 6, 13, 0)), true);
  assert.equal(W.enCalme({ on: false }, Date.UTC(2026, 10, 7, 2, 0)), false);
  assert.deepEqual(W.calmeOf({ de: 'x', a: 30 }), { on: true, de: 22, a: 7 }, 'une heure invalide reprend le défaut');
  // réveil : le lendemain à 7 h de Paris (6 h UTC en hiver, 5 h UTC en été)
  assert.equal(new Date(W.reveilApres(null, Date.UTC(2026, 10, 6, 21, 30))).toISOString(), '2026-11-07T06:00:00.000Z');
  assert.equal(new Date(W.reveilApres(null, Date.UTC(2026, 6, 6, 22, 0))).toISOString(), '2026-07-07T05:00:00.000Z');
});

test('heures calmes : un cours qui commence dans les 2 h est urgent (heure de Paris)', () => {
  const { bientot } = require('../lib/pushnotif');
  assert.equal(new Date(debutParis('2026-11-06', '10 h 30')).toISOString(), '2026-11-06T09:30:00.000Z');
  assert.equal(new Date(debutParis('2026-07-06', '9 h')).toISOString(), '2026-07-06T07:00:00.000Z');
  const t = Date.UTC(2026, 10, 6, 8, 0);   // 9 h à Paris
  assert.equal(bientot('2026-11-06', '10 h 30', t), true);
  assert.equal(bientot('2026-11-06', '11 h 30', t), false);
  assert.equal(bientot('2026-11-07', '9 h', t), false);
});

/* ---------- 2 et 4. regroupement au réveil ---------- */
test('au réveil : une discussion compte une fois, plusieurs sujets donnent un seul résumé', () => {
  const chan = i => ({ msg: { title: 'TC Test', body: 'Inès dans Équipe 1 : message ' + i, url: '#/chan/g1?club=c1', tag: 'c1-chan-g1', fil: 'Équipe 1' } });
  const seul = W.regrouper([1, 2, 3, 4, 5].map(chan));
  assert.equal(seul.length, 1);
  assert.equal(seul[0].body, '5 nouveaux messages dans Équipe 1');
  assert.equal(seul[0].tag, 'c1-chan-g1', 'même tag : remplace la notification de la discussion');
  const tout = W.regrouper([chan(1), chan(2), { msg: { title: 'TC Test', body: 'Nouvelle publication : Tournoi', url: '#/post/p1?club=c1', tag: 'c1-post-p1' } },
    { msg: { title: 'TC Test', body: 'Rappel coach', url: '#/today?club=c1', tag: 'c1-veille', app: 'coach' } }]);
  assert.equal(tout.length, 2, 'un résumé par appli');
  const club = tout.find(m => !m.app);
  assert.equal(club.title, 'TC Test');
  assert.match(club.body, /^3 notifications pendant les heures calmes : 2 nouveaux messages dans Équipe 1 · Nouvelle publication : Tournoi$/);
  assert.equal(club.url, '#/notifs?club=c1');
  assert.equal(tout.find(m => m.app === 'coach').body, 'Rappel coach');
});

test('heures calmes : rien ne sonne, la cloche reçoit tout de suite, tout part au réveil ; une urgence passe', async () => {
  const store = localStore('ram-calme-'), plan = [];
  const push = W.createWebPush({ store, planifier: async (uid, at) => plan.push([uid, at]) });
  await push.subscribe('U', sub('tel'), 'Safari', 'club');
  const h = hParis();
  await push.setCalme('U', { on: true, de: h, a: (h + 2) % 24 });   // maintenant est dans les heures calmes
  const hits = await avecFetch(async hits => {
    await push.sendMany(['U'], { title: 'TC', body: 'Inès dans Équipe 1 : a', url: '#/chan/g1?club=c', tag: 'c-chan-g1', fil: 'Équipe 1' });
    await push.sendMany(['U'], { title: 'TC', body: 'Inès dans Équipe 1 : b', url: '#/chan/g1?club=c', tag: 'c-chan-g1', fil: 'Équipe 1' });
    assert.equal(hits.length, 0, 'le téléphone ne sonne pas');
    assert.equal((await push.boite('U', 0)).length, 2, 'la cloche a les deux messages');
    assert.equal((await push.attente('U')).length, 2);
    assert.equal(plan.length, 2);
    assert.ok(plan[0][1] > Date.now(), 'le réveil est planifié');
    // urgence : un cours annulé qui commence bientôt passe tout de suite
    await push.sendMany(['U'], { title: 'TC', body: 'Cours annulé : Mini-tennis', url: '#/agenda', tag: 'c-cx', urgent: true });
    assert.deepEqual(hits.map(x => [x.to, x.urgency]), [['tel', 'high']]);
    // encore calme : le réveil se replanifie, rien ne part
    assert.equal(await push.reveil('U'), 0);
    assert.equal(hits.length, 1);
    // fin des heures calmes (réglage coupé) : ce qui attendait part, regroupé en une seule notification
    await push.setCalme('U', { on: false });
  });
  assert.equal(hits.length, 2);
  assert.equal((await push.attente('U')).length, 0);
  assert.deepEqual(await push.calme('U'), { on: false, de: h, a: (h + 2) % 24 });
});

test('hors heures calmes : la notification part tout de suite ; sans appareil, rien n’attend', async () => {
  const store = localStore('ram-calme2-');
  const push = W.createWebPush({ store });
  await push.subscribe('U', sub('tel'), 'Chrome', 'club');
  const h = hParis();
  await push.setCalme('U', { on: true, de: (h + 2) % 24, a: (h + 4) % 24 });
  const hits = await avecFetch(() => push.send('U', { title: 'TC', body: 'x', tag: 't' }));
  assert.deepEqual(hits.map(x => [x.to, x.urgency]), [['tel', 'normal']]);
  await push.setCalme('V', { on: true, de: h, a: (h + 2) % 24 });
  await push.send('V', { title: 'TC', body: 'x', tag: 't' });
  assert.equal((await push.attente('V')).length, 0, 'compte sans appareil : rien à garder');
});

/* ---------- 1. notification d'essai ---------- */
test('essai : à cet appareil seulement, tout de suite, même en heures calmes, sans passer par la cloche', async () => {
  const store = localStore('ram-essai-');
  const push = W.createWebPush({ store });
  await push.subscribe('U', sub('iphone'), 'Safari', 'club');
  await push.subscribe('U', sub('ordi'), 'Chrome', 'club');
  const h = hParis();
  await push.setCalme('U', { on: true, de: h, a: (h + 1) % 24 });
  let r;
  const hits = await avecFetch(async () => { r = await push.essai('U', 'https://push.test/iphone', 'club'); });
  assert.deepEqual(r, { n: 1, appareils: 2 });
  assert.deepEqual(hits.map(x => [x.to, x.urgency]), [['iphone', 'high']]);
  assert.equal((await push.boite('U', 0)).length, 0, 'un essai ne remplit pas la cloche');
  assert.deepEqual(await push.essai('U', 'https://push.test/inconnu', 'club'), { n: 0, appareils: 2 });
});

/* ---------- 3. suivi pour le bureau ---------- */
test('suivi : N adhérents validés reçoivent les notifications sur M (un enfant par son parent)', async () => {
  const store = localStore('ram-suivi-');
  const push = W.createWebPush({ store });
  await push.subscribe('uA', sub('a'), 'Chrome', 'club');
  await push.subscribe('uB', sub('b'), 'Chrome', 'coach');   // seulement /RAM Coach : ne compte pas
  const au = { keys: ['a', 'b', 'c', 'kid', 'att'], user: { a: 'uA', b: 'uB', c: 'uC', att: 'uE' }, parent: { kid: 'a' },
    valid: { a: true, b: true, c: true, kid: true, att: false } };
  assert.deepEqual(await suiviNotifs(au, push), { n: 2, m: 4, sansCompte: 0 });
});

/* ---------- 4. discussion : le message porte son fil ; le téléphone remplace au lieu d'empiler ---------- */
test('discussion : plusieurs messages rapprochés donnent une seule notification qui se remplace', () => {
  const d = { title: 'TC', body: 'Inès dans Équipe 1 : Qui joue ?', tag: 'c-chan-g1', fil: 'Équipe 1', url: '#/chan/g1' }, t = 1e12;
  const a = filNotif(null, d, t);
  assert.equal(a.body, d.body);
  assert.equal(a.renotify, true);
  assert.deepEqual(a.data, { url: '#/chan/g1', n: 1, at: t });
  // 4 messages déjà affichés, le 5e arrive 30 s après : même notification, sans re-sonner
  const b = filNotif({ n: 4, at: t - 30e3 }, d, t);
  assert.equal(b.body, '5 nouveaux messages dans Équipe 1\nInès dans Équipe 1 : Qui joue ?');
  assert.equal(b.data.n, 5);
  assert.equal(b.renotify, false);
  // longtemps après : le téléphone sonne de nouveau
  assert.equal(filNotif({ n: 5, at: t - 10 * 60e3 }, d, t).renotify, true);
  // le résumé du réveil (déjà « 5 nouveaux messages ») ne se répète pas
  assert.equal(filNotif(null, Object.assign({}, d, { n: 5, body: '5 nouveaux messages dans Équipe 1' }), t).body, '5 nouveaux messages dans Équipe 1');
  // un message sans fil reste tel quel
  assert.equal(filNotif(null, { body: 'Nouvelle publication', tag: 'p' }, t).body, 'Nouvelle publication');
});

/* ---------- les messages du serveur : fil d'une discussion, urgence d'un cours annulé bientôt ---------- */
test('serveur : message de discussion avec son fil ; cours annulé dans les 2 h urgent, plus tard non', async () => {
  const { createRamClub } = require('../lib/ramclub');
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const ram = createRamClub(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-urg-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const sent = [], notifier = createNotifier({ ram, push: { send: async (uid, msg) => { sent.push([uid, msg]); return 1; } } });
  const club = await ram.create({ id: 'CO', name: 'Sarah Coach' }, { name: 'Club Urg', short: 'CU' });
  const key = (await ram.myClubs('CO'))[0].key;
  await ram.ops('CO', club.id, [{ coll: 'conf', id: 'main', op: 'put', data: { name: 'Club Urg', season: 'S' } }]);
  const j = await ram.join({ id: 'EL', name: 'Nina Anglade' }, club.code);
  await ram.ops('CO', club.id, [{ coll: 'member', id: j.key, op: 'put', data: { n: 'Nina Anglade', valid: 'S' } }]);
  // le cours commence dans une heure (heure de Paris)
  const dans1h = new Date(Date.now() + 3600e3), parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(dans1h).split(' ');
  const [hh, mm] = parts[1].split(':'), jour = parts[0], heure = `${+hh} h ${mm}`;
  await ram.ops('CO', club.id, [
    { coll: 'cours', id: 'bientot', op: 'put', data: { type: 'train', name: 'Cours de 1 h', once: jour, h: heure, dur: '1 h', coach: key, mem: [j.key] } },
    { coll: 'cours', id: 'tard', op: 'put', data: { type: 'train', name: 'Cours lointain', once: '2031-03-04', h: '9 h', dur: '1 h', coach: key, mem: [j.key] } },
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Équipe 1', mem: [key, j.key] } },
    { coll: 'chan', id: 'g1', op: 'put', data: { g: 'train', name: 'Équipe 1' } }]);
  await notifier.calme(); sent.length = 0;
  await ram.ops('CO', club.id, [{ coll: 'cours', id: 'bientot', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: jour }] },
    { coll: 'cours', id: 'tard', op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: '2031-03-04' }] }]);
  await notifier.calme();
  const urg = sent.find(x => /Cours de 1 h/.test(x[1].body)), tard = sent.find(x => /Cours lointain/.test(x[1].body));
  assert.ok(urg && tard, JSON.stringify(sent));
  assert.equal(urg[0], 'EL');
  assert.equal(urg[1].urgent, true, 'annulé dans l’heure : passe même en heures calmes');
  assert.equal(tard[1].urgent, undefined);
  sent.length = 0;
  await ram.ops('EL', club.id, [{ coll: 'msg', id: 'm1', op: 'put', data: { ref: 'c:g1', by: j.key, x: 'Qui joue samedi ?', at: Date.now() } }]);
  await notifier.calme();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1].fil, 'Équipe 1');
  assert.equal(sent[0][1].tag, club.id + '-chan-g1', 'un tag par discussion : la notification se remplace');
});

/* ---------- les routes, avec de vrais comptes sur un serveur jetable ---------- */
test('routes : heures calmes du compte, essai, suivi réservé au bureau', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-notifroutes-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await wait(100); } }
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const bur = await signup('bureau@exemple.test', 'Bea', 'TC Notifs');
    const space = await bur('/api/ram/clubs', { name: 'TC Notifs', short: 'TCN' });
    const season = (await bur(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.coll === 'conf').data.season;
    const mem = await signup('adherent@exemple.test', 'Max', '');
    const j = await mem('/api/ram/join', { code: space.code });
    await bur(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }] });

    // heures calmes : 22 h à 7 h par défaut, puis réglées
    const c0 = await mem('/api/ram/push/calme');
    assert.deepEqual([c0.on, c0.de, c0.a], [true, 22, 7]);
    const c1 = await mem('/api/ram/push/calme', { on: true, de: 23, a: 6 });
    assert.deepEqual([c1.on, c1.de, c1.a], [true, 23, 6]);
    const c2 = await mem('/api/ram/push/calme');
    assert.deepEqual([c2.de, c2.a], [23, 6]);

    // essai : sans appareil abonné, rien ne part ; avec, l'appareil est trouvé (service injoignable ici : n = 0)
    const s = sub('max');
    s.endpoint = 'https://push.invalid/max';
    assert.deepEqual((({ n, appareils }) => ({ n, appareils }))(await mem('/api/ram/push/essai', { endpoint: s.endpoint })), { n: 0, appareils: 0 });
    assert.equal((await mem('/api/ram/push/subscribe', { subscription: s, app: 'club' })).status, 200);
    assert.equal((await mem('/api/ram/push/essai', { endpoint: s.endpoint })).appareils, 1);

    // suivi : le bureau voit 1 adhérent sur 2 ; un adhérent n'y a pas accès
    const r = await bur('/api/ram/push/suivi?club=' + space.id);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.deepEqual([r.n, r.m], [1, 2]);
    assert.equal((await mem('/api/ram/push/suivi?club=' + space.id)).status, 403);
    assert.equal((await fetch(B + '/api/ram/push/calme')).status, 401, 'réservé aux comptes connectés');
  } finally { srv.kill(); }
});
