/* Fiche personne commune : chaque adhérent (avec ou sans compte) et chaque élève /RAM Coach a sa fiche ;
   même licence = même personne ; un niveau donné dans un club (Coach) suit la personne dans les autres clubs */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort, until, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('une seule fiche par personne, reliée dans le Club, Coach et JA ; le niveau suit la personne', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'personnes-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const compte = async (email, first, last) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last }) });
      const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ') };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json());
    };
    const coach = await compte('coach@exemple.test', 'Claire', 'Coach');
    const A = await coach('/api/ram/clubs', { name: 'TC Alpha', short: 'TCA' }), Bc = await coach('/api/ram/clubs', { name: 'TC Bravo', short: 'TCB' });
    const items = async (c, coll) => (await coach(`/api/ram/c/${c.id}/sync?since=0`)).items.filter(i => i.coll === coll && !i.deleted);
    // un adhérent inscrit par le bureau, sans compte ; un élève de Coach sans compte, licence 1234567A
    await coach(`/api/ram/c/${A.id}/ops`, { ops: [{ coll: 'member', id: 'sanscompte', op: 'put', data: { n: 'Paul Martin', res: [] } }, { coll: 'eleve', id: 'e1', op: 'put', data: { n: 'Inès Durand', lic: '1234567A', sport: 'Padel', lvl: 3 } }] });
    const lien = async (c, coll, id) => until(async () => { const x = (await items(c, coll)).find(i => i.id === id); return x && x.data._ja; }, { msg: `${coll} ${id} jamais relié à sa fiche` });
    const fPaul = await lien(A, 'member', 'sanscompte'), fInes = await lien(A, 'eleve', 'e1');
    assert.notEqual(fPaul, fInes);
    const ines = (await coach('/api/players/' + fInes)).player;
    assert.deepEqual([ines.first, ines.last, ines.licence, ines.padelLevel], ['Inès', 'DURAND', '1234567A', 3]);
    // la même élève dans un autre club (même licence) : la même fiche, pas une nouvelle
    await coach(`/api/ram/c/${Bc.id}/ops`, { ops: [{ coll: 'eleve', id: 'e9', op: 'put', data: { n: 'Inès Durand', lic: '1234567A', sport: 'Padel', lvl: 3 } }] });
    assert.equal(await lien(Bc, 'eleve', 'e9'), fInes, 'même licence : même personne');
    // un appareil ne peut pas s'attribuer une autre fiche
    await coach(`/api/ram/c/${A.id}/ops`, { ops: [{ coll: 'eleve', id: 'e1', op: 'patch', patch: [{ p: ['_ja'], t: 'set', v: fPaul }] }] });
    assert.equal((await items(A, 'eleve')).find(i => i.id === 'e1').data._ja, fInes);
    // le niveau donné par l'enseignant dans le club Alpha suit la personne : club Bravo et fiche JA
    await new Promise(r => setTimeout(r, 3500));   // la première lecture est faite : la suivante voit un changement
    await coach(`/api/ram/c/${A.id}/ops`, { ops: [{ coll: 'eleve', id: 'e1', op: 'patch', patch: [{ p: ['lvl'], t: 'set', v: 6 }] }] });
    await until(async () => (await items(Bc, 'eleve')).find(i => i.id === 'e9').data.lvl === 6, { timeout: 20000, msg: 'niveau jamais recopié dans l’autre club' });
    await until(async () => (await coach('/api/players/' + fInes)).player.padelLevel === 6, { msg: 'niveau jamais recopié sur la fiche' });
    // dans /RAM JA, l'élève sans compte se trouve par sa fiche pour une inscription
    const trouves = (await coach('/api/players?q=durand')).players;
    assert.ok(trouves.some(p => p.id === fInes), 'élève sans compte trouvé dans la base JA');
  } finally { srv.kill(); }
});
