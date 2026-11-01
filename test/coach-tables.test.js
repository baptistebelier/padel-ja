/* /RAM Coach : planning d'un enseignant, tous clubs confondus (lib/coach-tables.js) ;
   la source « tables » est testée contre une fausse base qui répond comme PostgREST */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-tables-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createCoachTables } = require('../lib/coach-tables');
const ram = createRamClub(DIR), tables = createCoachTables({ ram });

let n = 0;
async function deuxClubs() {
  const id = 'C' + (++n), coach = { id, name: 'Sarah' }, a = await ram.create(coach, { name: 'Club A' }), b = await ram.create(coach, { name: 'Club B' });
  await ram.ops(id, a.id, [
    { coll: 'group', id: 'gm', op: 'put', data: { type: 'train', name: 'Mardi', coach: a.key, day: 2, h: '18 h', dur: '1 h 30', sport: 'Padel', from: '2026-11-03', to: '2026-11-24', skip: ['2026-11-10'], cancel: ['2026-11-17'], mem: ['k1'], ext: ['e1'] } },
    { coll: 'group', id: 'gt', op: 'put', data: { type: 'team', name: 'Équipe', coach: a.key, day: 2, mem: [] } },
    { coll: 'group', id: 'gx', op: 'put', data: { type: 'train', name: 'Autre enseignant', coach: 'autre', day: 2, mem: [] } },
    { coll: 'cours', id: 'c1', op: 'put', data: { type: 'train', name: 'Cours individuel', coach: a.key, once: '2026-11-05', h: '9 h', dur: '1 h', mem: [], ext: ['e2'] } },
    { coll: 'cours', id: 'c2', op: 'put', data: { type: 'train', name: 'Hors période', coach: a.key, once: '2027-03-01', h: '9 h', dur: '1 h', mem: [], ext: [] } },
    { coll: 'seance', id: 'gm.2026-11-03', op: 'put', data: { g: 'gm', d: '2026-11-03', theme: 'Bandeja', pres: { k1: 'P', e1: 'A' } } }
  ]);
  await ram.ops(id, b.id, [{ coll: 'cours', id: 'c3', op: 'put', data: { type: 'train', name: 'Duo', coach: b.key, once: '2026-11-04', h: '10 h', dur: '1 h', sport: 'Tennis', mem: [], ext: [] } }]);
  return { id, a, b };
}

test('planning : tous les clubs de l’enseignant, ses seules séances, sur la période', async () => {
  const { id, a, b } = await deuxClubs(), r = await tables.planning(id, '2026-11-01', '2026-11-30');
  assert.deepEqual(r.seances.map(s => [s.groupe, s.date]), [['gm', '2026-11-03'], ['c3', '2026-11-04'], ['c1', '2026-11-05'], ['gm', '2026-11-17'], ['gm', '2026-11-24']]);
  const s0 = r.seances[0];
  assert.deepEqual([s0.club, s0.nom, s0.minutes, s0.theme, s0.appel, s0.eleves, s0.cours], [a.id, 'Mardi', 90, 'Bandeja', { k1: 'P', e1: 'A' }, ['k1', 'e1'], false]);
  assert.equal(r.seances[1].club, b.id);
  assert.equal(r.seances[2].cours, true);
  assert.equal(r.seances[3].annule, true, 'séance annulée gardée et signalée');
  // un seul club ; un club où l'on n'enseigne pas ne donne rien
  assert.equal((await tables.planning(id, '2026-11-01', '2026-11-30', b.id)).seances.length, 1);
  assert.deepEqual((await tables.planning(id, '2026-11-01', '2026-11-30', 'inconnu')).seances, []);
  await ram.join({ id: 'E', name: 'Élève' }, a.code);
  assert.deepEqual((await tables.planning('E', '2026-11-01', '2026-11-30')).seances, [], 'un adhérent n’a pas de planning d’enseignant');
});

test('planning : période contrôlée', async () => {
  await assert.rejects(tables.planning('X', 'hier', '2026-11-30'), /Période invalide/);
  await assert.rejects(tables.planning('X', '2026-11-30', '2026-11-01'), /Période invalide/);
  await assert.rejects(tables.planning('X', '2026-01-01', '2028-01-01'), /400 jours/);
});

test('source « tables » : même résultat que les éléments, requêtes filtrées par enseignant et par période', async () => {
  const { id, a } = await deuxClubs();
  const rows = {
    coach_groups: [
      { club_id: a.id, id: 'gm', kind: 'groupe', name: 'Mardi', sport: 'Padel', once_date: null, day: 2, h: '18 h', dur: '1 h 30', from_date: '2026-11-03', to_date: '2026-11-24', every: null, skip_dates: ['2026-11-10'], extra_dates: [], cancelled_dates: ['2026-11-17'], off_periods: null, created_ms: 1, archived: false },
      { club_id: a.id, id: 'c1', kind: 'cours', name: 'Cours individuel', sport: null, once_date: '2026-11-05', day: null, h: '9 h', dur: '1 h', from_date: null, to_date: null, every: null, skip_dates: [], extra_dates: [], cancelled_dates: [], off_periods: null, created_ms: 1, archived: false }
    ],
    coach_group_students: [{ club_id: a.id, group_id: 'gm', student_key: 'k1', has_account: true, position: 1 }, { club_id: a.id, group_id: 'gm', student_key: 'e1', has_account: false, position: 1001 }, { club_id: a.id, group_id: 'c1', student_key: 'e2', has_account: false, position: 1001 }],
    coach_sessions: [{ club_id: a.id, id: 'gm.2026-11-03', theme: 'Bandeja' }],
    coach_attendance: [{ club_id: a.id, session_id: 'gm.2026-11-03', student_key: 'k1', status: 'P' }, { club_id: a.id, session_id: 'gm.2026-11-03', student_key: 'e1', status: 'A' }]
  };
  const urls = [], realFetch = global.fetch;
  global.fetch = async u => { const t = new URL(u); urls.push(decodeURIComponent(t.search)); return { ok: true, json: async () => rows[t.pathname.split('/').pop()] }; };
  process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_essai';
  const online = createCoachTables({ ram });
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  try {
    assert.equal(online.kind, 'tables');
    const r = await online.planning(id, '2026-11-01', '2026-11-30', a.id);
    global.fetch = realFetch;
    const l = await tables.planning(id, '2026-11-01', '2026-11-30', a.id);
    assert.deepEqual(r.seances, l.seances);
    assert.ok(urls[0].includes(`and(club_id.eq.${a.id},coach_key.eq.${a.key})`), 'seulement mes groupes');
    assert.ok(urls[0].includes('once_date.gte.2026-11-01') && urls[0].includes('once_date.lte.2026-11-30'), 'seulement les cours de la période');
    assert.ok(urls[2].includes('session_date=gte.2026-11-01'), 'seulement les séances de la période');
  } finally { global.fetch = realFetch; }
});
test('tableau de bord : séances de la période et chiffre d’affaires réel, un pack acheté avant la période compris', async () => {
  const { id, a } = await deuxClubs();
  const offres = { formules: [{ id: 'f', joueurs: 2, duree: 90, prix: 30, par: 'personne' }], packs: [{ id: 'p', formule: 'f', seances: 5, prix: 100 }], abos: [] };
  await ram.ops(id, a.id, [
    { coll: 'eleve', id: 'k1', op: 'put', data: { n: 'Avec pack', achats: [{ id: 'h1', t: 'pack', ref: 'p', d: '2026-09-01', n: 5, prix: 100, nom: 'Pack' }] } },
    { coll: 'eleve', id: 'e9', op: 'put', data: { n: 'Achat en novembre', achats: [{ id: 'h2', t: 'seance', ref: 'f', d: '2026-11-02', prix: 30, nom: 'Séance' }] } },
    { coll: 'seance', id: 'gm.2026-11-03', op: 'put', data: { g: 'gm', d: '2026-11-03', pres: { k1: 'P', e1: 'P' } } }
  ]);
  const r = await tables.tableau(id, '2026-11-01', '2026-11-30', [['2026-11-01', '2026-11-30']], offres, a.id);
  assert.deepEqual(r.seances.map(s => s.date), ['2026-11-03', '2026-11-05', '2026-11-17', '2026-11-24']);
  const c = r.chiffres[0];
  assert.equal(c.encaisse, 30, 'seul l’achat de novembre est encaissé sur la période');
  assert.equal(c.aEncaisser, 30, 'e1 est venu sans achat ; k1 est couvert par son pack de septembre');
  assert.equal(c.prepaye, 80, 'pack : 4 séances dues à 20 €');
  assert.deepEqual(c.parMois, { '2026-11': 30 });
  // connecteur : pas de période de chiffre d'affaires, pas d'achats lus
  assert.deepEqual((await tables.tableauClubs([{ id: a.id, key: a.key, name: 'A' }], '2026-11-01', '2026-11-30', [], null)).chiffres, []);
});
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
