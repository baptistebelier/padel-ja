/* Adresses personnalisées /reservation/<nom> : génération, validation, unicité (même en concurrence), noms réservés, anciens noms gardés */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNoms, slugify, erreur, RESERVES } = require('../lib/noms-resa');

const magasin = () => { const m = {}; return { getSetting: async k => (m[k] ? JSON.parse(JSON.stringify(m[k])) : null), saveSetting: async (k, v) => { await new Promise(r => setImmediate(r)); m[k] = JSON.parse(JSON.stringify(v)); }, m }; };

test('génération : minuscules, sans accent, tirets', () => {
  assert.equal(slugify('Baptiste Bélier'), 'baptiste-belier');
  assert.equal(slugify('  Éloïse  D’Œuvre–Çà '), 'eloise-d-oeuvre-ca');
  assert.equal(slugify('A'.repeat(80)).length, 40);
  assert.equal(slugify('---'), '');
  assert.equal(slugify('Jean-Luc 2'), 'jean-luc-2');
});

test('validation : longueur, caractères, noms réservés', () => {
  assert.equal(erreur('baptiste-belier'), '');
  assert.match(erreur('ab'), /Au moins/);
  assert.match(erreur('a'.repeat(41)), /Au plus/);
  assert.match(erreur('Baptiste'), /lettres sans accent/);
  assert.match(erreur('-abc'), /lettres sans accent/);
  assert.match(erreur('a--b'), /lettres sans accent/);
  for (const nom of ['admin', 'api', 'dojo', 'pista', 'buvette', 'reservation', 'i', 'r']) assert.ok(erreur(nom), nom + ' refusé');
  assert.ok(RESERVES.has('admin'));
});

test('unicité : un nom pris propose une variante, jamais deux enseignants sur le même nom', async () => {
  const st = magasin(), N = createNoms({ store: st });
  assert.deepEqual(await N.reserver('u1', 'Baptiste Bélier'), { nom: 'baptiste-belier', ancien: '' });
  assert.deepEqual(await N.disponible('u2', 'baptiste-belier'), { ok: true, libre: false, nom: 'baptiste-belier', erreur: 'Ce nom est déjà pris.', propose: 'baptiste-belier-2' });
  await assert.rejects(N.reserver('u2', 'baptiste-belier'), e => e.code === 'pris' && e.propose === 'baptiste-belier-2');
  assert.equal((await N.disponible('u1', 'baptiste-belier')).libre, true, 'le propriétaire peut le reprendre');
  assert.equal(await N.proposer('u2', 'Baptiste Bélier'), 'baptiste-belier-2', 'proposition de départ : une variante libre');
  assert.equal(await N.proposer('u1', 'Autre Nom'), 'baptiste-belier', 'déjà choisi : il reste');
  await assert.rejects(N.reserver('u2', 'admin'), e => e.code === 'invalide');
});

test('concurrence : deux validations en même temps, un seul gagnant', async () => {
  const st = magasin(), N = createNoms({ store: st });
  const r = await Promise.allSettled(['u1', 'u2', 'u3'].map(u => N.reserver(u, 'sarah-benali')));
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(r.filter(x => x.status === 'rejected' && x.reason.code === 'pris').length, 2);
  const qui = Object.values(st.m['resa-noms'].noms)[0].u;
  assert.equal((await N.resoudre('sarah-benali')).u, qui);
});

test('lecture ratée : l’enregistrement échoue sans rien écrire, le registre n’est jamais effacé', async () => {
  const st = magasin(), N = createNoms({ store: st });
  await N.reserver('u1', 'sarah-benali');
  const avant = JSON.stringify(st.m['resa-noms']), lireOk = st.getSetting, ecrireOk = st.saveSetting;
  let ecrit = false;
  st.getSetting = async () => { throw new Error('base indisponible'); };
  st.saveSetting = async (k, v) => { ecrit = true; return ecrireOk(k, v); };
  await assert.rejects(N.reserver('u2', 'autre-nom'), /base indisponible/);
  await assert.rejects(N.disponible('u2', 'autre-nom'), /base indisponible/);
  assert.equal(ecrit, false, 'rien n’a été écrit');
  assert.equal(await N.resoudre('sarah-benali'), null, 'en lecture seule : page introuvable plutôt qu’une erreur');
  st.getSetting = lireOk;
  assert.equal(JSON.stringify(st.m['resa-noms']), avant, 'le registre est intact');
  assert.equal((await N.resoudre('sarah-benali')).u, 'u1');
});

test('ancien nom : il redirige vers le nouveau et reste à son enseignant', async () => {
  const st = magasin(), N = createNoms({ store: st });
  await N.reserver('u1', 'sarah-benali');
  assert.deepEqual(await N.reserver('u1', 'sarah-coach'), { nom: 'sarah-coach', ancien: 'sarah-benali' });
  assert.deepEqual(await N.resoudre('sarah-benali'), { u: 'u1', nom: 'sarah-benali', courant: 'sarah-coach' }, 'l’ancien désigne toujours u1, courant : le nouveau');
  assert.deepEqual(await N.resoudre('sarah-coach'), { u: 'u1', nom: 'sarah-coach', courant: 'sarah-coach' });
  await assert.rejects(N.reserver('u2', 'sarah-benali'), e => e.code === 'pris', 'personne d’autre ne reprend l’ancien nom');
  assert.equal(await N.resoudre('inconnu-du-tout'), null, 'nom inconnu : rien');
  assert.equal(await N.resoudre('admin'), null);
  assert.equal(await N.resoudre('../etc'), null);
  // revenir à un ancien nom : possible, il redevient le nom courant
  assert.equal((await N.reserver('u1', 'sarah-benali')).ancien, 'sarah-coach');
  assert.equal((await N.resoudre('sarah-coach')).courant, 'sarah-benali');
});
