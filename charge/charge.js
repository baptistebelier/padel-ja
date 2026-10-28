/* =========================================================================
   /RAM — test de charge du Club (hors des tests de Render : `node charge/charge.js`)
   Fabrique des clubs fictifs en mémoire (adhérents, publications, messages, groupes,
   séances), puis mesure ce que coûte chaque geste au serveur :
   - ouverture de l'appli (synchronisation complète) : temps et taille envoyée ;
   - synchronisation « rien de neuf » (toutes les 10 à 30 s par appareil) ;
   - écriture (un message) puis réveil de tous les appareils connectés.
   Réglages : CLUBS=20 ADHERENTS=300 MESSAGES=3000 SEANCES=1000 APPAREILS=50 PHOTO=0
   (PHOTO=1 : une photo de 180 Ko par adhérent, comme aujourd'hui en ligne)
   ========================================================================= */
'use strict';
const { createRamClub } = require('../lib/ramclub');

const N = k => +process.env[k];
const CLUBS = N('CLUBS') || 20, ADH = N('ADHERENTS') || 300, MSG = N('MESSAGES') || 3000, SES = N('SEANCES') || 1000, DEV = N('APPAREILS') || 50, PHOTO = process.env.PHOTO === '1';

function memoryBackend() {
  const clubs = [], members = [], items = new Map();
  return {
    kind: 'memoire',
    async clubs() { return clubs.slice(); }, async saveClub(c) { const i = clubs.findIndex(x => x.id === c.id); if (i >= 0) clubs[i] = c; else clubs.push(c); },
    async members() { return members.slice(); }, async saveMember(m) { members.push(m); }, async deleteMember() {},
    async items(id) { return [...(items.get(id) || new Map()).values()]; },
    async saveItems(id, rows) { if (!items.has(id)) items.set(id, new Map()); rows.forEach(r => items.get(id).set(r.coll + '/' + r.id, r)); }
  };
}
const ms = t => Math.round(Number(process.hrtime.bigint() - t) / 1e5) / 10;
const ko = o => Math.round(Buffer.byteLength(JSON.stringify(o)) / 1024);
const photo = PHOTO ? 'data:image/jpeg;base64,' + 'A'.repeat(180 * 1024) : '';

(async () => {
  const ram = createRamClub(null, { backend: memoryBackend() });
  const t0 = process.hrtime.bigint(), list = [];
  for (let c = 0; c < CLUBS; c++) {
    const boss = { id: 'b' + c, name: 'Bureau ' + c }, club = await ram.create(boss, { name: 'Club ' + c });
    const keys = [];
    for (let i = 0; i < ADH; i++) keys.push((await ram.join({ id: `u${c}-${i}`, name: 'Adhérent ' + i }, club.code)).key);
    const season = (await ram.sync(boss.id, club.id, 0)).items.find(x => x.coll === 'conf').data.season, ops = [];
    keys.forEach((k, i) => ops.push({ coll: 'member', id: k, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }].concat(photo ? [{ p: ['photo'], t: 'set', v: photo }] : []) }));
    for (let g = 0; g < 10; g++) ops.push({ coll: 'group', id: 'g' + g, op: 'put', data: { type: 'train', name: 'Groupe ' + g, coach: club.key, day: g % 7, h: '18:00', mem: keys.slice(g * 8, g * 8 + 8), tarif: { mode: 'seance', prix: 70 } } });
    for (let i = 0; i < SES; i++) ops.push({ coll: 'seance', id: `g${i % 10}.s${i}`, op: 'put', data: { g: 'g' + (i % 10), d: '2026-01-01', pres: Object.fromEntries(keys.slice((i % 10) * 8, (i % 10) * 8 + 8).map(k => [k, 'P'])) } });
    for (let i = 0; i < MSG; i++) ops.push({ coll: 'msg', id: 'm' + i, op: 'put', data: { by: club.key, ref: 'c:general', x: 'Message numéro ' + i + ' du club, avec un peu de texte.', at: Date.now() } });
    for (let i = 0; i < ops.length; i += 500) await ram.ops(boss.id, club.id, ops.slice(i, i + 500));
    list.push({ club, keys });
  }
  console.log(`\n${CLUBS} clubs × ${ADH} adhérents, ${MSG} messages et ${SES} séances par club${PHOTO ? ', photos de 180 Ko' : ''} : créés en ${Math.round(ms(t0))} ms`);

  const { club, keys } = list[0], user = i => `u0-${i}`;
  // ouverture de l'appli
  let t = process.hrtime.bigint(); const full = await ram.sync(user(1), club.id, 0), tFull = ms(t);
  console.log(`Ouverture de l'appli (synchro complète) : ${tFull} ms, ${ko(full)} Ko envoyés (${full.items.length} éléments)`);
  // synchronisations « rien de neuf » de tous les appareils
  t = process.hrtime.bigint();
  for (let i = 0; i < DEV; i++) await ram.sync(user(i % ADH), club.id, full.rev);
  console.log(`${DEV} synchros « rien de neuf » : ${ms(t)} ms au total, ${Math.round(ms(t) / DEV * 10) / 10} ms chacune`);
  // un message posté : réveil de tous les appareils connectés, qui se resynchronisent
  t = process.hrtime.bigint();
  await ram.ops(user(2), club.id, [{ coll: 'msg', id: 'nouveau', op: 'put', data: { by: keys[2], ref: 'c:general', x: 'Salut', at: Date.now() } }]);
  const tw = ms(t); t = process.hrtime.bigint();
  for (let i = 0; i < DEV; i++) await ram.sync(user(i % ADH), club.id, full.rev);
  console.log(`Un message posté : écriture ${tw} ms, puis ${DEV} appareils réveillés en ${ms(t)} ms au total`);
  const m = process.memoryUsage();
  console.log(`Mémoire du serveur : ${Math.round(m.rss / 1048576)} Mo (${ram.loaded()} clubs chargés)\n`);
})().catch(e => { console.error(e); process.exit(1); });
