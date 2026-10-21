/* Tirage au sort et formules : tableau final, poules, qualifications */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, act, demoTournament, seeded } = require('./helpers');

// paires réellement placées dans un tableau (toutes les sources « pair » des matchs)
const placedPairs = (T, phase) => T.matches.filter(m => !phase || m.phase === phase)
  .flatMap(m => [m.srcA, m.srcB]).filter(s => s && s.pair && s.pair !== 'BYE').map(s => s.pair);

test('tableau final direct : chaque paire retenue est placée une seule fois', () => {
  const T = demoTournament();
  assert.ok(T.draw && T.draw.built, 'tirage construit');
  const sel = E.selection(T);
  assert.equal(T.draw.entrants.length, sel.main.length);
  const placed = placedPairs(T, 'TF');
  assert.equal(new Set(placed).size, placed.length, 'aucune paire en double');
  assert.deepEqual(new Set(placed), new Set(T.draw.entrants));
});

test('le nombre de paires retenues respecte le maximum du tournoi', () => {
  const T = demoTournament({ fields: { maxPairs: 12 } });
  assert.equal(T.draw.entrants.length, 12);
  assert.equal(E.selection(T).waiting.length, 4);
});

test('tirage reproductible : même graine, même tableau ; graine différente, autre tableau', () => {
  const name = T => id => { const p = T.pairs.find(x => x.id === id); return p.p1.last + '/' + p.p2.last; };
  const sig = T => placedPairs(T, 'TF').map(name(T)).join(',');
  assert.equal(sig(demoTournament({ seed: 7 })), sig(demoTournament({ seed: 7 })));
  const sigs = new Set([1, 2, 3, 4, 5].map(seed => sig(demoTournament({ seed }))));
  assert.ok(sigs.size > 1, 'le hasard change le tableau');
});

test('têtes de série 1 et 2 dans des moitiés opposées du tableau', () => {
  for (const seed of [1, 2, 3]) {
    const T = demoTournament({ seed });
    const R = E.resolve(T);
    const ids = Object.keys(T.draw.seedNo || {});
    const ts1 = ids.find(id => T.draw.seedNo[id] === 1), ts2 = ids.find(id => T.draw.seedNo[id] === 2);
    assert.ok(ts1 && ts2, 'TS1 et TS2 désignées');
    const first = T.matches.filter(m => m.phase === 'TF' && m.a === 1 && m.depth === 1);
    const half = id => { const m = first.find(x => [R[x.id].A, R[x.id].B].includes(id) || [x.srcA, x.srcB].some(s => s && s.pair === id)); return m && m.idx < first.length / 2 ? 'haut' : 'bas'; };
    assert.notEqual(half(ts1), half(ts2));
  }
});

test('poules + tableau final : chaque paire dans une seule poule, toutes les rencontres de poule', () => {
  const T = demoTournament({ fields: { formula: 'poules_tf', pouleSize: 4, pouleQualif: 2, maxPairs: 16 } });
  assert.ok(T.poules.length >= 3);
  const inPoules = T.poules.flatMap(P => P.pairs || P.ids || []);
  if (inPoules.length) assert.equal(new Set(inPoules).size, inPoules.length);
  T.poules.forEach(P => {
    const ms = T.matches.filter(m => m.phase === 'P' && m.poule === P.id);
    const n = new Set(ms.flatMap(m => [m.srcA.pair, m.srcB.pair])).size;
    assert.equal(ms.length, n * (n - 1) / 2, `poule ${P.id} : ${n} paires, toutes les rencontres`);
  });
});

test('annuler le tirage remet le tournoi en inscriptions', () => {
  const T = demoTournament();
  act(T, 'draw/reset');
  assert.equal(T.draw, null);
  assert.equal(T.matches.length, 0);
  assert.equal(T.pairs.length, 16, 'les inscriptions sont conservées');
});

test('une paire engagée dans le tirage ne peut pas être supprimée', () => {
  const T = demoTournament();
  assert.throws(() => act(T, 'pair/remove', { id: T.draw.entrants[0] }), /Remplacer|WO/);
});

test('tirage carte par carte : il se termine et construit le tableau', () => {
  const rand = seeded(9);
  const T = demoTournament({ draw: false });
  act(T, 'draw/prepare', { method: 'physical' }, rand);
  for (let i = 0; i < 200 && E.currentPot(T.draw); i++) act(T, 'draw/flipRandom', {}, rand);
  assert.ok(T.draw.built);
  assert.ok(T.matches.length > 0);
});
