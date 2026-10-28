/* Images des clubs rangées en fichiers : contrôle du type, adresse stable, conversion des images
   intégrées (anciennes versions de l'appli) et migration des clubs existants */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-medias-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createMedias, decode } = require('../lib/medias');
const { createRamClub, COLLS } = require('../lib/ramclub');
const medias = createMedias(DIR), ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

// une vraie image PNG de 1 × 1 point, gonflée pour dépasser le seuil des icônes
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'), Buffer.alloc(3000, 7)]);
const png = 'data:image/png;base64,' + PNG.toString('base64');

test('seules les vraies images sont acceptées (type lu dans le fichier, 4 Mo au plus)', () => {
  assert.equal(decode(png).ext, 'png');
  assert.equal(decode('data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')), null);
  assert.equal(decode('data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024, 0x89).toString('base64')), null);
  assert.equal(decode('https://exemple.fr/x.png'), null);
});

test('une image enregistrée se relit à son adresse ; la même image garde la même adresse', async () => {
  const u = await medias.save('club1', png);
  assert.match(u, /^\/medias\/club1\/[\w-]{24}\.png$/);
  assert.equal(await medias.save('club1', png), u);
  const f = await medias.read(u.slice(8));
  assert.equal(f.type, 'image/png');
  assert.ok(f.buf.equals(PNG));
  // adresses invalides : refusées sans toucher au disque
  assert.equal(await medias.read('../../serveur.json'), null);
  assert.equal(await medias.read('club1/inconnu00000000000000.png'), null);
});

test('opérations d’une ancienne version de l’appli : images intégrées converties en adresses', async () => {
  const ops = await medias.extractOps('club1', [
    { coll: 'member', id: 'k1', op: 'patch', patch: [{ p: ['photo'], t: 'set', v: png }] },
    { coll: 'post', id: 'p1', op: 'put', data: { txt: 'Bonjour', imgs: [png, png] } },
    { coll: 'post', id: 'p2', op: 'put', data: { txt: 'sans image' } }
  ]);
  assert.match(ops[0].patch[0].v, /^\/medias\/club1\//);
  assert.deepEqual(ops[1].data.imgs.map(x => x.startsWith('/medias/')), [true, true]);
  assert.deepEqual(ops[2].data, { txt: 'sans image' });
});

test('migration : les images déjà rangées dans un club deviennent des fichiers', async () => {
  const c = await ram.create({ id: 'A', name: 'Alice' }, { name: 'Club Photos' });
  await ram.ops('A', c.id, [{ coll: 'member', id: c.key, op: 'patch', patch: [{ p: ['photo'], t: 'set', v: png }] }, { coll: 'conf', id: 'main', op: 'patch', patch: [{ p: ['logo'], t: 'set', v: png }] }]);
  const n = await medias.migrate(ram, COLLS);
  assert.equal(n, 2);
  const s = await ram.sync('A', c.id, 0), get = (coll, id) => s.items.find(i => i.coll === coll && i.id === id).data;
  assert.match(get('member', c.key).photo, /^\/medias\//);
  assert.match(get('conf', 'main').logo, /^\/medias\//);
  assert.equal(await medias.migrate(ram, COLLS), 0, 'rien à refaire');
});
