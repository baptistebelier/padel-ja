/* /RAM Coach : alerte dans la cloche quand un agenda relié devient illisible */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgendaAlerte, SEUIL } = require('../lib/agenda-alerte');
const { createAgenda } = require('../lib/agenda');
const { createWebPush, pourAppli } = require('../lib/webpush');
const Formules = require('../lib/formules');

const URL1 = 'https://calendar.google.com/calendar/ical/prof%40exemple.test/private-secret111/basic.ics';
const URL2 = 'https://outlook.office365.com/owa/calendar/abc/secret222/calendar.ics';
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:20301115T090000Z\r\nDTEND:20301115T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

/* stockage en mémoire, réseau simulé : chaque adresse répond ce qu'on lui dit (200, 404, panne, page HTML) */
function monde() {
  const settings = {}, coach = {}, reponse = {};
  const store = {
    async getSetting(k) { return settings[k] ? JSON.parse(JSON.stringify(settings[k])) : null; },
    async saveSetting(k, v) { settings[k] = JSON.parse(JSON.stringify(v)); },
    async getCoachSetting(o, k) { return coach[o + '/' + k] || null; },
    async saveCoachSetting(o, k, v) { coach[o + '/' + k] = v; },
    async listCoachOwners(k) { return Object.keys(coach).filter(x => x.endsWith('/' + k)).map(x => x.split('/')[0]); },
    async getAccount() { return null; },
    async listPushSubs() { return []; },
    async listPushSubsOf() { return []; }
  };
  const fetchFn = async url => {
    const r = reponse[url] || 200;
    if (r === 'panne') throw new Error('getaddrinfo ENOTFOUND');
    if (r === 'html') return new Response('<html>Connexion</html>', { status: 200 });
    return new Response(r === 200 ? ICS : 'non', { status: r });
  };
  const agenda = createAgenda({ fetchFn });
  const push = createWebPush({ store });
  const alerte = createAgendaAlerte({ store, agenda, push, Formules });
  const cloche = async uid => pourAppli(await push.boite(uid, 0), 'coach');
  const relier = (uid, icals) => Formules.save(store, uid, { icals });
  return { store, settings, reponse, alerte, cloche, relier, agenda };
}

test('agenda illisible : alerte au bout de plusieurs échecs de suite, une seule tant qu’il le reste', async () => {
  const w = monde();
  await w.relier('prof1', [URL1]);
  w.reponse[URL1] = 404;
  for (let i = 1; i < SEUIL; i++) {
    await w.alerte.tous();
    assert.equal((await w.cloche('prof1')).length, 0, `pas d’alerte après ${i} échec(s) : panne peut-être passagère`);
  }
  await w.alerte.tous();
  let l = await w.cloche('prof1');
  assert.equal(l.length, 1, 'alerte dans la cloche de /RAM Coach');
  assert.match(l[0].body, /agenda 1 est illisible/);
  assert.match(l[0].body, /Adresse secrète au format iCal/, 'adresse privée : la bonne explication');
  assert.equal(l[0].url, '#/me');
  // il reste illisible : toujours une seule alerte
  for (let i = 0; i < 4; i++) await w.alerte.tous();
  assert.equal((await w.cloche('prof1')).length, 1);
  // l'adresse est secrète : elle n'est jamais gardée en clair
  assert.ok(!JSON.stringify(w.settings).includes('secret111'));
});

test('agenda de nouveau lisible : l’alerte quitte la cloche ; une nouvelle panne alerte à nouveau, une fois', async () => {
  const w = monde();
  await w.relier('prof1', [URL1, URL2]);
  w.reponse[URL2] = 'panne';
  for (let i = 0; i < SEUIL; i++) await w.alerte.tous();
  let l = await w.cloche('prof1');
  assert.equal(l.length, 1, 'seul l’agenda en panne alerte');
  assert.match(l[0].body, /agenda 2 est illisible.*ne répond plus/);
  w.reponse[URL2] = 200;
  await w.alerte.tous();
  assert.equal((await w.cloche('prof1')).length, 0, 'retour à la normale : alerte effacée');
  assert.deepEqual(await w.store.getSetting('agenda-suivi-prof1'), {}, 'compteur remis à zéro');
  w.reponse[URL2] = 'html';
  for (let i = 0; i < SEUIL + 2; i++) await w.alerte.tous();
  l = await w.cloche('prof1');
  assert.equal(l.length, 1);
  assert.match(l[0].body, /finit par \.ics/, 'mauvais format : la bonne explication');
});

test('panne passagère : des échecs coupés par une lecture réussie n’alertent jamais', async () => {
  const w = monde();
  await w.relier('prof1', [URL1]);
  for (let tour = 0; tour < 3; tour++) {
    w.reponse[URL1] = 503;
    for (let i = 1; i < SEUIL; i++) await w.alerte.tous();
    w.reponse[URL1] = 200;
    await w.alerte.tous();
  }
  assert.equal((await w.cloche('prof1')).length, 0);
});

test('carte ouverte : un échec ne compte pas pour l’alerte, une lecture réussie l’efface ; agenda retiré : alerte retirée', async () => {
  const w = monde();
  await w.relier('prof1', [URL1]);
  w.reponse[URL1] = 403;
  // l'enseignant ouvre la carte plusieurs fois de suite : pas d'alerte en rafale
  for (let i = 0; i < SEUIL + 2; i++) await w.alerte.noter('prof1', [URL1], [await w.agenda.verifier(URL1)], false);
  assert.equal((await w.cloche('prof1')).length, 0);
  for (let i = 0; i < SEUIL; i++) await w.alerte.tous();
  assert.equal((await w.cloche('prof1')).length, 1);
  w.reponse[URL1] = 200;
  await w.alerte.noter('prof1', [URL1], [await w.agenda.verifier(URL1)], false);
  assert.equal((await w.cloche('prof1')).length, 0, 'carte ouverte, agenda relu : alerte effacée');
  // de nouveau illisible, puis retiré par l'enseignant
  w.reponse[URL1] = 404;
  for (let i = 0; i < SEUIL; i++) await w.alerte.tous();
  assert.equal((await w.cloche('prof1')).length, 1);
  await w.relier('prof1', []);
  await w.alerte.tous();
  assert.equal((await w.cloche('prof1')).length, 0, 'agenda retiré : son alerte part avec lui');
});

test('chaque enseignant reçoit seulement l’alerte de ses agendas ; un compte en erreur n’arrête pas les autres', async () => {
  const w = monde();
  await w.relier('prof0', [URL1]);   // le premier de la liste : son suivi ne s'enregistre pas
  await w.relier('prof1', [URL1]);
  await w.relier('prof2', [URL2]);
  await w.relier('prof3', []);
  w.reponse[URL1] = 404;
  const save = w.store.saveSetting;
  w.store.saveSetting = async (k, v) => { if (k === 'agenda-suivi-prof0') throw new Error('base indisponible'); return save(k, v); };
  for (let i = 0; i < SEUIL; i++) await w.alerte.tous();
  assert.equal((await w.cloche('prof1')).length, 1);
  assert.equal((await w.cloche('prof2')).length, 0);
  assert.equal((await w.cloche('prof3')).length, 0);
  assert.equal((await w.cloche('prof0')).length, 0, 'suivi impossible à enregistrer : aucune alerte plutôt qu’une à chaque lecture');
});
