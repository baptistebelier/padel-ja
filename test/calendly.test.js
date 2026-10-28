/* Réservations Calendly : signature du webhook, lecture de la réservation (heure de Paris),
   séance posée dans le planning /RAM Coach, inscrit de plus sur un collectif, annulation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-calendly-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createStore } = require('../lib/store');
const { createMcp } = require('../lib/mcp');
const Calendly = require('../lib/calendly');
const ram = createRamClub(DIR), store = createStore(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
const mcp = createMcp({ store, ram, Engine: {}, Ani: {}, getRoom: async () => null, mainClubOf: async () => null, currentUser: async () => null, readBody: async () => ({}), json: () => {}, redirect: () => {} });

const hook = (event, o = {}) => ({ event, payload: Object.assign({ name: 'Nina Anglade', email: 'Nina@Test.fr', text_reminder_number: '+33 6 00 00 00 00',
  questions_and_answers: [{ question: 'Avez-vous un objectif précis pour la séance ?', answer: 'Bandeja' }, { question: 'Nombre de participant(s)', answer: '1' }],
  scheduled_event: { uri: 'https://api.calendly.com/scheduled_events/E1', name: 'Cours de Padel | 1H30', start_time: '2026-11-05T17:30:00.000000Z', end_time: '2026-11-05T19:00:00.000000Z',
    event_memberships: [{ user_email: 'Coach@Test.fr' }] } }, o) });

test('Calendly : signature vérifiée, horodatage récent obligatoire', () => {
  const raw = JSON.stringify(hook('invitee.created')), t = Math.floor(Date.now() / 1000);
  const sig = k => `t=${t},v1=` + crypto.createHmac('sha256', k).update(t + '.' + raw).digest('hex');
  assert.equal(Calendly.verify(raw, sig(Calendly.signingKey())), true);
  assert.equal(Calendly.verify(raw, sig('autre-cle')), false);
  assert.equal(Calendly.verify(raw + ' ', sig(Calendly.signingKey())), false);
  assert.equal(Calendly.verify(raw, sig(Calendly.signingKey()), undefined, Date.now() + 10 * 60e3), false, 'rejouée 10 minutes plus tard');
  assert.equal(Calendly.verify(raw, ''), false);
});

test('Calendly : réservation lue à l’heure de Paris, avec objectif et participants', () => {
  const b = Calendly.booking(hook('invitee.created'));
  assert.deepEqual([b.type, b.date, b.heure, b.min, b.email, b.hote, b.objectif, b.nb], ['reservation', '2026-11-05', '18:30', 90, 'nina@test.fr', 'coach@test.fr', 'Bandeja', 1]);
  assert.equal(Calendly.paris('2026-07-15T17:30:00Z').heure, '19:30', 'heure d’été');
  const duo = Calendly.booking(hook('invitee.created', { questions_and_answers: [{ question: 'Participants (Indiquez le [Nom Prénom] des participants si séance collective)', answer: 'PERROUIN Johanna' }, { question: 'Nombre de participant(s)', answer: '2' }] }));
  assert.deepEqual([duo.nb, duo.participants], [2, ['PERROUIN Johanna']]);
  assert.equal(Calendly.booking(hook('invitee.canceled')).type, 'annulation');
  assert.equal(Calendly.booking({ event: 'routing_form_submission.created', payload: {} }).type, null);
});

test('Calendly : la séance arrive dans le planning /RAM Coach, puis l’annulation', async () => {
  const coach = { id: 'C1', email: 'coach@test.fr', pass_hash: 'h' };
  await store.saveUser(coach);
  // ses formules : le tarif d'une réservation vient de la formule correspondante (plus d'une grille fixe)
  await require('../lib/formules').save(store, 'C1', { formules: [{ id: 'f1', nom: 'Cours individuel', joueurs: 1, duree: 90, prix: 50 }, { id: 'f2', nom: 'Cours duo', joueurs: 2, duree: 60, prix: 30, par: 'personne' }] });
  const club = await ram.create({ id: 'C1', name: 'Baptiste Coach' }, { name: 'Chiquita Essai', short: 'chq' });
  await ram.ops('C1', club.id, [{ coll: 'eleve', id: 'e1', op: 'put', data: { n: 'Johanna Perrouin', mail: 'jo@test.fr', sport: 'Padel' } }]);
  const groups = async () => (await ram.sync('C1', club.id, 0)).items.filter(x => x.coll === 'group' && x.data.cal).map(x => x.data);
  const eleves = async () => (await ram.sync('C1', club.id, 0)).items.filter(x => x.coll === 'eleve').map(x => x.data);

  // nouvelle élève : fiche créée, séance ponctuelle avec l'objectif, au prix de la formule individuelle 1 h 30
  const r = await mcp.calendly.book(coach, Calendly.booking(hook('invitee.created')));
  assert.equal(r.nouveau_groupe, true);
  let g = (await groups())[0];
  assert.deepEqual([g.once, g.h, g.dur, g.name, g.goal, g.tarif.prix, g.ext.length], ['2026-11-05', '18 h 30', '1 h 30', 'Cours individuel', 'Bandeja', 50, 1]);
  assert.ok((await eleves()).some(e => e.n === 'Nina Anglade' && e.mail === 'nina@test.fr'));

  // même événement (collectif) : un inscrit de plus, pas de nouvelle séance ; le même e-mail ne recrée pas la fiche
  await mcp.calendly.book(coach, Calendly.booking(hook('invitee.created', { name: 'Johanna Perrouin', email: 'jo@test.fr' })));
  g = await groups();
  assert.equal(g.length, 1);
  assert.equal(g[0].ext.length, 2);
  await mcp.calendly.book(coach, Calendly.booking(hook('invitee.created')));
  assert.equal((await eleves()).filter(e => e.n === 'Nina Anglade').length, 1);

  // annulations : l'élève sort de la séance ; quand il n'y a plus personne, la séance est annulée
  await mcp.calendly.cancel(coach, Calendly.booking(hook('invitee.canceled')));
  g = (await groups())[0];
  assert.deepEqual([g.ext.length, (g.cancel || []).length], [1, 0]);
  const fin = await mcp.calendly.cancel(coach, Calendly.booking(hook('invitee.canceled', { name: 'Johanna Perrouin', email: 'jo@test.fr' })));
  assert.equal(fin.annulee, true);
  assert.deepEqual((await groups())[0].cancel, ['2026-11-05']);
  assert.equal((await mcp.calendly.cancel(coach, Object.assign(Calendly.booking(hook('invitee.canceled')), { cal: 'inconnu' }))).introuvable, true);
});
