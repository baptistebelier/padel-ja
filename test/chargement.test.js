/* /RAM Club : clubs chargés à la demande — la recherche des joueurs et les recopies au démarrage
   ne gardent aucun club en mémoire ; un club ouvert l'est, puis libéré */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub.js');

test('clubs chargés à la demande, recherche des adhérents sans charger les clubs', async () => {
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-charge-'));
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  try {
    const ram = createRamClub(DIR);
    const a = await ram.create({ id: 'U1', name: 'Alice Martin' }, { name: 'TC Azur', short: 'TCA' });
    await ram.create({ id: 'U2', name: 'Bruno Petit' }, { name: 'Padel Brive', short: 'PB' });
    await ram.ops('U1', a.id, [{ coll: 'member', id: a.key, op: 'patch', patch: [{ p: ['lic'], t: 'set', v: '1234567A' }] }]);

    // nouveau démarrage du serveur : rien en mémoire
    const fresh = createRamClub(DIR);
    const hits = await fresh.searchMembers('alice');
    assert.deepEqual(hits.map(h => [h.name, h.club, h.licence]), [['Alice Martin', 'TC Azur', '1234567A']]);
    assert.equal((await fresh.searchMembers('1234567')).length, 1, 'recherche par licence');
    assert.equal(fresh.loaded(), 0, 'la recherche ne charge aucun club');

    // parcourir tous les espaces (recopies du démarrage) : chacun est libéré après son passage
    const seen = [];
    await fresh.eachSpace(async id => { seen.push(id); await fresh.roster(id); });
    assert.equal(seen.length, 2);
    assert.equal(fresh.loaded(), 0, 'rien ne reste en mémoire après le passage');

    // un club ouvert par un adhérent est chargé, et l'index suit ses changements
    await fresh.sync('U2', (await fresh.myClubs('U2'))[0].id, 0);
    assert.equal(fresh.loaded(), 1);
    const b = (await fresh.myClubs('U2'))[0];
    await fresh.ops('U2', b.id, [{ coll: 'member', id: b.key, op: 'patch', patch: [{ p: ['n'], t: 'set', v: 'Bruno Lefèvre' }] }]);
    assert.equal((await fresh.searchMembers('lefevre')).length, 1, 'nom changé : retrouvé (sans accent)');
  } finally {
    if (saved.url) process.env.SUPABASE_URL = saved.url;
    if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  }
});
