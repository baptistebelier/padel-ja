/* Compression des fichiers de l'appli : le visiteur n'attend jamais la version définitive */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const Compress = require('../lib/compress.js');

const texte = n => Buffer.from(Array.from({ length: n }, (_, i) => `function f${i}(a,b){return a+b*${i}; /* commentaire ${i % 7} */}\n`).join(''));
const req = ae => ({ headers: { 'accept-encoding': ae } });
const faux = () => { const r = { code: 0, headers: null, body: null, writeHead(c, h) { r.code = c; r.headers = h; }, end(b) { r.body = b; } }; return r; };
const H = { 'Content-Type': 'text/javascript; charset=utf-8' };
const clair = (enc, b) => (enc === 'br' ? zlib.brotliDecompressSync(b) : zlib.gunzipSync(b));

test('première demande : compression rapide tout de suite, version définitive préparée ensuite', async () => {
  const buf = texte(4000), key = 'a.js"1"';
  const res = faux();
  await Compress.send(req('br, gzip'), res, 200, H, buf, key);
  assert.equal(res.headers['Content-Encoding'], 'br');
  assert.deepEqual(clair('br', res.body), buf, 'le contenu est intact');
  const rapide = res.body.length;
  // la version rapide n'entre pas dans le cache définitif : à ce stade il n'y a rien
  assert.equal(Compress._final.get(key), undefined, 'rien de définitif tant que la préparation n’a pas fini');
  await Compress.reposee();
  const def = Compress._final.get(key);
  assert.ok(def && def.br, 'la version définitive est prête après la préparation');
  assert.ok(def.br.length < rapide, 'plus petite que la version rapide');
  // les visiteurs suivants reçoivent la version définitive telle quelle
  const res2 = faux();
  await Compress.send(req('br'), res2, 200, H, buf, key);
  assert.equal(res2.body, def.br);
});

test('gzip : même principe, et un appareil sans compression reçoit le fichier brut', async () => {
  const buf = texte(3000), key = 'b.js"1"';
  const res = faux();
  await Compress.send(req('gzip'), res, 200, H, buf, key);
  assert.equal(res.headers['Content-Encoding'], 'gzip');
  assert.deepEqual(clair('gzip', res.body), buf);
  await Compress.reposee();
  assert.ok(Compress._final.get(key).gzip);
  const nu = faux();
  await Compress.send(req(''), nu, 200, H, buf, key);
  assert.equal(nu.headers['Content-Encoding'], undefined);
  assert.deepEqual(nu.body, buf);
});

test('préparation au démarrage : un fichier à la fois, sans bloquer le serveur, et petits fichiers ou images ignorés', async () => {
  assert.equal(Compress.preparer('petit', Buffer.from('x'), 'text/javascript'), false, 'trop petit : rien à préparer');
  assert.equal(Compress.preparer('img', Buffer.alloc(5000), 'image/png'), false, 'image : déjà compressée');
  const cles = ['p1', 'p2', 'p3', 'p4'].map(k => k + '.js');
  cles.forEach((k, i) => assert.equal(Compress.preparer(k, texte(1500 + i), 'text/javascript; charset=utf-8'), true));
  // le serveur reste réactif : des tours de boucle d'événements passent pendant que la file se vide
  let tours = 0; const t = setInterval(() => { tours++; }, 1);
  const vues = [];
  const suivi = setInterval(() => { vues.push(cles.filter(k => Compress._final.get(k)).length); }, 1);
  await Compress.reposee();
  clearInterval(t); clearInterval(suivi);
  assert.ok(cles.every(k => Compress._final.get(k).br), 'tous sont préparés');
  assert.ok(vues.every((n, i) => i === 0 || n - vues[i - 1] <= 1), 'un seul fichier à la fois : ' + vues.join(','));
  assert.ok(tours > 0, 'la boucle d’événements a continué de tourner');
});

test('un fichier demandé par un visiteur passe devant la file', async () => {
  const attente = ['q1', 'q2', 'q3'].map(k => k + '.js');
  attente.forEach((k, i) => Compress.preparer(k, texte(2500 + i), 'text/javascript'));
  const demande = texte(2600), res = faux();
  await Compress.send(req('br'), res, 200, H, demande, 'urgent.js');
  await Compress.reposee();
  assert.ok(Compress._final.get('urgent.js').br);
  assert.ok(attente.every(k => Compress._final.get(k).br), 'et la file a fini ensuite');
});

test('réponses de l’API : compressées à la volée, jamais gardées', async () => {
  const json = Buffer.from(JSON.stringify({ liste: Array.from({ length: 400 }, (_, i) => ({ id: i, nom: 'Tournoi ' + i })) }));
  const res = faux();
  const avant = Compress._final.size;
  await Compress.send(req('br'), res, 200, { 'Content-Type': 'application/json' }, json);
  assert.equal(res.headers['Content-Encoding'], 'br');
  assert.deepEqual(clair('br', res.body), json);
  assert.equal(Compress._final.size, avant);
});
