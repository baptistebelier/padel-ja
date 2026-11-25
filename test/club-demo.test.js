/* Club de démonstration (testeurs d'Apple) : contenu remplacé d'un coup, ancien contenu retiré, profil du compte gardé */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub');

test('club de démo : remplacement complet du contenu', async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const ram = createRamClub(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-demo-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const u = { id: 'U-demo', name: 'Camille Démo', email: 'demo@exemple.test' };
  const cl = await ram.create(u, { name: 'Club Démo', short: 'DEMO' });
  const n = await ram.serverReplace(cl.id, [
    { coll: 'conf', id: 'main', data: { name: 'Club Démo', season: '2026-2027' } },
    { coll: 'post', id: 'p1', data: { by: cl.key, x: 'Bienvenue <script>x</script>' } },
    { coll: 'member', id: 'ines', data: { n: 'Inès Faure' } },
    { coll: 'pirate', id: 'x', data: {} }
  ]);
  assert.ok(n >= 3);
  const s = await ram.sync(u.id, cl.id, 0), ids = s.items.filter(i => !i.del && i.data).map(i => i.coll + '/' + i.id);
  assert.ok(ids.includes('post/p1') && ids.includes('member/ines') && ids.includes('member/' + cl.key), ids.join(' '));
  assert.ok(!ids.includes('chan/general'), 'ancien contenu retiré');
  assert.ok(!JSON.stringify(s.items).includes('<script>'), 'texte nettoyé');
});
