/* QR code maison : relu par un petit lecteur indépendant (zones fixes de la norme, format, masque,
   blocs entrelacés, syndromes Reed-Solomon) — le texte relu doit être exactement le texte encodé */
const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../public/js/qr.js');

// positions des motifs d'alignement (norme ISO 18004, annexe E) pour les versions testées
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 13: [6, 34, 62], 14: [6, 26, 46, 66] };
// correction « M » : [codes de correction par bloc, blocs du groupe 1, données par bloc 1, blocs du groupe 2, données par bloc 2]
const RS = { 1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44], 13: [22, 8, 37, 1, 38], 14: [24, 4, 40, 5, 41] };

function read(mod) {
  const size = mod.length, v = (size - 17) / 4;
  // zones fixes, reconstruites d'après la norme
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fixed[y][x] = true; };
  mark(0, 0, 9, 9); mark(size - 8, 0, 8, 9); mark(0, size - 8, 9, 8);   // repères, séparateurs, format
  mark(6, 0, 1, size); mark(0, 6, size, 1);                             // lignes de synchronisation
  const al = ALIGN[v];
  const last = al[al.length - 1];   // pas d'alignement sur les trois repères
  al.forEach(x => al.forEach(y => { if (!((x === 6 && y === 6) || (x === 6 && y === last) || (x === last && y === 6))) mark(x - 2, y - 2, 5, 5); }));
  if (v >= 7) {
    mark(size - 11, 0, 3, 6); mark(0, size - 11, 6, 3);   // version, comparée à la table de la norme
    let vb = 0; for (let i = 0; i < 18; i++) if (mod[Math.floor(i / 3)][size - 11 + (i % 3)]) vb |= 1 << i;
    const TABLE = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };
    if (TABLE[v]) assert.equal(vb, TABLE[v], 'bloc de version');
  }
  // format (copie autour du repère en haut à gauche), vérifié contre les 32 codes valides
  const fb = [];
  for (let i = 0; i <= 5; i++) fb[i] = mod[i][8];
  fb[6] = mod[7][8]; fb[7] = mod[8][8]; fb[8] = mod[8][7];
  for (let i = 9; i < 15; i++) fb[i] = mod[8][14 - i];
  const fmt = fb.reduce((a, b, i) => a | ((b ? 1 : 0) << i), 0);
  let mask = -1;
  for (let d = 0; d < 32; d++) {
    let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    if ((((d << 10) | r) ^ 0x5412) === fmt) { assert.equal(d >> 3, 0, 'correction M'); mask = d & 7; }
  }
  assert.ok(mask >= 0, 'format valide');
  const M = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask];
  // lecture en zigzag, de droite à gauche, deux colonnes à la fois
  const bits = [];
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < size; k++) {
      const y = up ? size - 1 - k : k;
      for (const x of [right, right - 1]) if (!fixed[y][x]) bits.push(mod[y][x] !== M(x, y) ? 1 : 0);
    }
    up = !up;
  }
  const words = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // désentrelacement et syndromes Reed-Solomon (tous nuls si les codes de correction sont justes)
  const [ec, n1, d1, n2, d2] = RS[v], lens = [...new Array(n1).fill(d1), ...new Array(n2).fill(d2)];
  const blocks = lens.map(() => []);
  let p = 0;
  for (let i = 0; i < Math.max(d1, d2); i++) lens.forEach((l, j) => { if (i < l) blocks[j].push(words[p++]); });
  for (let i = 0; i < ec; i++) blocks.forEach(b => b.push(words[p++]));
  const exp = [], log = [];
  for (let i = 0, x = 1; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  const gmul = (a, b) => (a && b ? exp[(log[a] + log[b]) % 255] : 0);
  blocks.forEach(b => {
    for (let i = 0; i < ec; i++) { let s = 0; for (const c of b) s = gmul(s, exp[i]) ^ c; assert.equal(s, 0, 'syndrome nul'); }
  });
  // données : mode octets, longueur, octets
  const data = blocks.flatMap((b, j) => b.slice(0, lens[j]));
  const db = data.flatMap(w => [7, 6, 5, 4, 3, 2, 1, 0].map(i => (w >> i) & 1));
  const take = n => { let x = 0; for (let i = 0; i < n; i++) x = (x << 1) | db.shift(); return x; };
  assert.equal(take(4), 4, 'mode octets');
  const len = take(v < 10 ? 8 : 16);
  return Buffer.from(Array.from({ length: len }, () => take(8))).toString('utf8');
}

test('QR code : relu à l’identique, toutes tailles de texte', () => {
  const texts = ['x', 'Bonjour', 'https://ja.riseandmove.fr/t/abc123/remote?pin=4821', 'é à ç — /RAM Club, saisie des scores',
    'https://club.riseandmove.fr/#/post/ja-x?club=c1234567890abcdef', 'y'.repeat(150), 'z'.repeat(300)];
  for (const t of texts) {
    const m = QR.encode(t);
    assert.ok(RS[(m.length - 17) / 4], 'version testée : ' + (m.length - 17) / 4);
    assert.equal(read(m), t);
  }
  assert.match(QR.svg('test'), /^<svg[^>]+viewBox="0 0 29 29"/);
});
