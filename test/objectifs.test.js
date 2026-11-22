/* Objectifs et compétences : règles partagées (regles.js) et accès dans /Buvette (lib/ramclub.js, collection « objectif »).
   Pure logique : aucun service réseau ni base (les variables SUPABASE_* ne servent à rien ici). */
const test = require('node:test');
const assert = require('node:assert/strict');
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const REGLES = require('../club/regles.js');
const { readable, checkOp, COLLS } = require('../lib/ramclub');
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const objectif = () => ({ id: 'o1', to: 'e1', nom: 'Maîtriser la bandeja', ord: 0, comps: [{ id: 'c1', nom: 'Placement' }, { id: 'c2', nom: 'Frappe plate' }, { id: 'c3', nom: 'Retombée' }] });

test('objectifs : validation individuelle et progression par objectif (3/5 compétences)', () => {
  const o = objectif();
  assert.deepEqual(REGLES.objProgres(o, ['e1']), { ok: 0, total: 3, comps: 3 });
  assert.equal(REGLES.objBascule(o, 'c1', 'e1', '2026-11-16'), true, 'validée');
  assert.equal(REGLES.objBascule(o, 'c2', 'e1', '2026-11-16'), true);
  assert.deepEqual(REGLES.objProgres(o, ['e1']), { ok: 2, total: 3, comps: 3 });
  assert.equal(REGLES.objBascule(o, 'c1', 'e1', '2026-11-17'), false, 'un second toucher dévalide');
  assert.deepEqual(REGLES.objProgres(o, ['e1']), { ok: 1, total: 3, comps: 3 });
  REGLES.objBascule(o, 'c2', 'e1', 'x');
  assert.equal(o.ok, undefined, 'plus aucune validation : le champ disparaît');
});

test('objectifs de groupe : appliqués à chaque élève, validés élève par élève', () => {
  const o = { id: 'o2', g: 'g1', nom: 'Jeu de vitres', comps: [{ id: 'c1', nom: 'Sortie de vitre' }, { id: 'c2', nom: 'Double vitre' }] };
  REGLES.objBascule(o, 'c1', 'a', '2026-11-16');
  REGLES.objBascule(o, 'c1', 'b', '2026-11-16');
  REGLES.objBascule(o, 'c2', 'a', '2026-11-16');
  assert.deepEqual(REGLES.objProgres(o, ['a', 'b', 'c']), { ok: 3, total: 6, comps: 2 }, 'trois validations sur six possibles');
  assert.deepEqual(REGLES.objProgres(o, ['a']), { ok: 2, total: 2, comps: 2 }, 'chaque élève garde sa propre progression');
  assert.deepEqual(REGLES.objProgres(o, ['c']), { ok: 0, total: 2, comps: 2 });
  // un élève voit ses objectifs et ceux de ses groupes, jamais ceux d'un autre élève ou d'un autre groupe
  const liste = [objectif(), o, { id: 'o3', to: 'autre', nom: 'Autre', comps: [] }, { id: 'o4', g: 'g9', nom: 'Autre groupe', comps: [] }];
  assert.deepEqual(REGLES.objDe(liste, 'e1', ['g1']).map(x => x.id).sort(), ['o1', 'o2']);
});

test('objectifs : collection « objectif » écrite par l’équipe pédagogique, lue par l’élève, ses parents et son groupe', () => {
  assert.ok(COLLS.includes('objectif'));
  const get = (c, id) => (c === 'group' && id === 'g1' ? { mem: ['e1', 'e2'] } : null);
  const staff = { valid: true, staff: true, key: 'prof' }, eleve = { valid: true, key: 'e1', kids: [] }, parent = { valid: true, key: 'p1', kids: ['e1'] }, autre = { valid: true, key: 'e9', kids: [] };
  const perso = { id: 'o1', to: 'e1', nom: 'x' }, groupe = { id: 'o2', g: 'g1', nom: 'y' };
  assert.equal(readable(staff, 'objectif', 'o1', perso, get), true);
  assert.equal(readable(eleve, 'objectif', 'o1', perso, get), true, 'l’élève lit les siens');
  assert.equal(readable(parent, 'objectif', 'o1', perso, get), true, 'son parent aussi');
  assert.equal(readable(autre, 'objectif', 'o1', perso, get), false, 'jamais ceux d’un autre élève');
  assert.equal(readable(eleve, 'objectif', 'o2', groupe, get), true, 'un objectif de groupe : les membres du groupe');
  assert.equal(readable(autre, 'objectif', 'o2', groupe, get), false, 'pas les autres adhérents');
  // écriture : l'équipe pédagogique seulement
  const club = { items: new Map() };
  assert.ok(checkOp(club, staff, { coll: 'objectif', id: 'o1', op: 'put', data: perso }));
  assert.throws(() => checkOp(club, eleve, { coll: 'objectif', id: 'o1', op: 'put', data: perso }), /non autorisée/);
  assert.throws(() => checkOp(club, autre, { coll: 'objectif', id: 'o5', op: 'put', data: { to: 'e9', nom: 'moi-même' } }), /non autorisée/);
});
