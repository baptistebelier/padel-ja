/* Google Agenda en temps réel : on écrit ce qui a changé, Calendly n'y passe pas, une panne se rattrape */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createGoogleAgenda, lireCompte, idDe } = require('../lib/google-agenda');
const { createCoachTables } = require('../lib/coach-tables');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const COMPTE = { client_email: 'ram@projet.iam.gserviceaccount.com', private_key: privateKey };
const CAL = 'agenda@group.calendar.google.com', MAINTENANT = Date.parse('2026-11-02T12:00:00Z');
const S = o => Object.assign({ club: 'c', groupe: 'g1', cours: true, nom: 'Cours individuel', date: '2026-11-03', heure: '11 h', minutes: 60, eleves: ['e1'] }, o);

/* un faux Google : un agenda en mémoire ; panne : le statut à renvoyer */
function monde(seances) {
  const ev = new Map(), appels = [], reglages = {}, hooks = [], taches = { handlers: {}, file: [] }, g = { panne: 0 };
  const fetchFn = async (url, o) => {
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'jeton', expires_in: 3600 }) };
    const id = decodeURIComponent(url.split('/events')[1].slice(1)), b = o.body && JSON.parse(o.body);
    appels.push(o.method);
    if (g.panne) return { status: g.panne };
    if (o.method === 'POST') { if (ev.has(b.id)) return { status: 409 }; ev.set(b.id, b); return { status: 200 }; }
    if (o.method === 'PUT') { if (!ev.has(id)) return { status: 404 }; ev.set(id, b); return { status: 200 }; }
    if (!ev.has(id)) return { status: 404 };
    ev.delete(id);
    return { status: 204 };
  };
  const ram = { onOps: fn => hooks.push(fn), audience: async () => ({ name: 'Club Test', user: { k1: 'u1' }, get: (c, k) => (k === 'e1' ? { n: 'Thibault Lacoste' } : null) }) };
  const store = { getSetting: async k => reglages[k] || null, saveSetting: async (k, v) => { reglages[k] = v; } };
  const file = { on: (k, fn) => { taches.handlers[k] = fn; }, enqueue: async (k, p, o) => { taches.file.push({ k, p, o }); } };
  const coachTables = { pourAgenda: async () => ({ seances: seances() }) };
  const gag = createGoogleAgenda({ ram, store, coachTables, taches: file, compte: COMPTE, fetchFn, now: () => MAINTENANT });
  return { gag, ev, appels, reglages, hooks, taches, g };
}

test('relier : un essai d’écriture, effacé, puis tout le planning part dans l’agenda', async () => {
  const m = monde(() => [S(), S({ groupe: 'g2', cours: false, nom: 'Collectif', date: '2026-11-04' }), S({ groupe: 'g3', annule: true })]);
  const e = await m.gag.relier('u1', CAL);
  assert.equal(e.cal, CAL);
  assert.equal(m.ev.size, 0, 'l’essai est effacé');
  assert.equal(m.taches.file.length, 1);
  assert.deepEqual(await m.gag.synchroniser('u1'), { ajoutes: 2, modifies: 0, retires: 0 });
  const b = m.ev.get(idDe(S()));
  assert.equal(b.summary, 'Cours individuel · Thibault Lacoste');
  assert.equal(b.location, 'Club Test');
  assert.equal(b.start.dateTime, '2026-11-03T10:00:00.000Z', 'Paris en novembre : UTC+1');
  assert.equal(b.end.dateTime, '2026-11-03T11:00:00.000Z');
  assert.match(idDe(S()), /^[0-9a-v]{5,}$/, 'identifiant accepté par Google');
});

test('synchroniser : rien à faire si rien n’a changé ; déplacé, modifié ; annulé, retiré', async () => {
  let l = [S(), S({ groupe: 'g2' })];
  const m = monde(() => l);
  await m.gag.relier('u1', CAL);
  await m.gag.synchroniser('u1');
  m.appels.length = 0;
  assert.deepEqual(await m.gag.synchroniser('u1'), { ajoutes: 0, modifies: 0, retires: 0 });
  assert.equal(m.appels.length, 0, 'aucun appel inutile');
  l = [S({ heure: '14 h' }), S({ groupe: 'g2', annule: true })];
  assert.deepEqual(await m.gag.synchroniser('u1'), { ajoutes: 0, modifies: 1, retires: 1 });
  assert.equal(m.ev.get(idDe(S())).start.dateTime, '2026-11-03T13:00:00.000Z');
  assert.equal(m.ev.size, 1);
});

test('une panne de Google : l’erreur est notée, la tâche reprend sans doublon', async () => {
  const m = monde(() => [S(), S({ groupe: 'g2' })]);
  await m.gag.relier('u1', CAL);
  m.g.panne = 503;
  await assert.rejects(m.gag.synchroniser('u1'), /503/);
  assert.match((await m.gag.etat('u1')).erreur, /503/);
  m.g.panne = 0;
  assert.deepEqual(await m.gag.synchroniser('u1'), { ajoutes: 2, modifies: 0, retires: 0 });
  assert.equal((await m.gag.etat('u1')).erreur, '');
  assert.equal((await m.gag.etat('u1')).seances, 2);
});

test('événement supprimé à la main, ou mémoire perdue : l’agenda se répare sans erreur', async () => {
  const m = monde(() => [S()]);
  await m.gag.relier('u1', CAL);
  await m.gag.synchroniser('u1');
  const id = idDe(S());
  m.reglages['gagenda-u1'].ev = {};
  assert.deepEqual(await m.gag.synchroniser('u1'), { ajoutes: 1, modifies: 0, retires: 0 }, 'déjà là : corrigé, pas doublé');
  assert.equal(m.ev.size, 1);
  m.ev.delete(id);
  m.reglages['gagenda-u1'].ev[id].h = 'autre';
  await m.gag.synchroniser('u1');
  assert.equal(m.ev.size, 1);
});

test('chaque changement d’un groupe ou d’un cours prévoit l’envoi, pour le bon enseignant seulement', async () => {
  const m = monde(() => []);
  await new Promise(ok => setImmediate(ok));
  await m.gag.relier('u1', CAL);
  m.taches.file.length = 0;
  m.hooks[0]('c', 'x', [{ coll: 'post', after: { coach: 'k1' } }]);
  m.hooks[0]('c', 'x', [{ coll: 'cours', after: { coach: 'autre' } }]);
  await new Promise(ok => setTimeout(ok, 20));
  assert.equal(m.taches.file.length, 0);
  m.hooks[0]('c', 'x', [{ coll: 'cours', before: { coach: 'k1' }, after: null }]);
  await new Promise(ok => setTimeout(ok, 20));
  assert.deepEqual(m.taches.file.map(x => x.p.uid), ['u1']);
  assert.ok(m.taches.file[0].o.at > MAINTENANT);
});

test('refus clairs, et délier retire les séances à venir', async () => {
  const m = monde(() => [S()]);
  await assert.rejects(m.gag.relier('u1', 'pas un agenda'), /identifiant/);
  m.g.panne = 403;
  await assert.rejects(m.gag.relier('u1', CAL), /partage cet agenda avec ram@projet/);
  m.g.panne = 0;
  await m.gag.relier('u1', CAL);
  await m.gag.synchroniser('u1');
  const e = await m.gag.delier('u1');
  assert.equal(e.cal, '');
  assert.equal(m.ev.size, 0);
  m.taches.file.length = 0;
  await m.gag.tous();
  assert.equal(m.taches.file.length, 0, 'plus aucun envoi');
  const sans = createGoogleAgenda({ ram: { onOps() {} }, store: { getSetting: async () => null }, taches: { on() {} }, compte: null });
  assert.equal((await sans.etat('u1')).dispo, false);
  await assert.rejects(sans.relier('u1', CAL), /pas encore activé/);
  assert.equal(lireCompte('pas du json'), null);
  assert.equal(lireCompte(JSON.stringify(COMPTE)).client_email, COMPTE.client_email);
});

test('pourAgenda : les réservations Calendly n’y sont pas, celles de /RAM et les groupes si', async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const G = { type: 'train', coach: 'k1', h: '11 h', dur: '1 h', mem: [], ext: [], day: 2 };
  const items = {
    cours: [{ id: 'cal1', data: Object.assign({}, G, { name: 'Calendly', once: '2026-11-03', cal: 'https://api.calendly.com/x' }) }, { id: 'ram1', data: Object.assign({}, G, { name: 'Réservé', once: '2026-11-03', cal: 'ram:ram1' }) }, { id: 'main', data: Object.assign({}, G, { name: 'À la main', once: '2026-11-03' }) }],
    group: [{ id: 'g1', data: Object.assign({}, G, { name: 'Groupe', cal: 'https://api.calendly.com/y' }) }],
    seance: []
  };
  const ram = { myClubs: async () => [{ id: 'c', key: 'k1', name: 'Club', role: 'coach' }], itemsOf: async (c, coll) => items[coll] || [] };
  const r = await createCoachTables({ ram }).pourAgenda('u1', '2026-11-03', '2026-11-03');
  Object.assign(process.env, saved.url ? { SUPABASE_URL: saved.url } : {}, saved.key ? { SUPABASE_SERVICE_KEY: saved.key } : {});
  assert.deepEqual(r.seances.map(s => s.nom).sort(), ['Groupe', 'Réservé', 'À la main'].sort());
});
