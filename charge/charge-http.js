/* =========================================================================
   /RAM — test de charge du vrai serveur, par HTTP (hors des tests de Render : `node charge/charge-http.js`)
   Fabrique des clubs dans un dossier jetable, lance server.js, ouvre des connexions en direct (une par téléphone),
   puis mesure l'ouverture, les synchros et le réveil des téléphones quand quelqu'un écrit dans un club actif.
   Réglages : CLUBS=200 ADHERENTS=150 MESSAGES=500 TELEPHONES=2000 ECRITURES=2 (par seconde) DUREE=30 (secondes)
   Limite : stockage en fichiers et tout sur la même machine. Ni latence de Supabase, ni réseau, ni téléphones réels.
   ========================================================================= */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const N = (k, d) => +process.env[k] || d;
const CLUBS = N('CLUBS', 200), ADH = N('ADHERENTS', 150), MSG = N('MESSAGES', 500), TEL = N('TELEPHONES', 2000), ECR = N('ECRITURES', 2), DUREE = N('DUREE', 30), PORT = N('PORT', 3899);
const SECRET = 'charge-' + Date.now();
process.env.SESSION_SECRET = SECRET;
const Auth = require('../lib/auth.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-charge-')), R = path.join(dir, 'ramclub'), U = path.join(dir, 'users');
fs.mkdirSync(R); fs.mkdirSync(U);
const clubs = [], members = [], tokens = [], season = (d => (d.getMonth() >= 8 ? `${d.getFullYear()}-${d.getFullYear() + 1}` : `${d.getFullYear() - 1}-${d.getFullYear()}`))(new Date());
let rev = Date.now() * 1000;
for (let c = 0; c < CLUBS; c++) {
  const id = 'club' + c, items = [{ coll: 'conf', id: 'main', rev: ++rev, deleted: false, data: { id: 'main', name: 'Club ' + c, season, info: { mods: {} }, form: [] } }, { coll: 'chan', id: 'general', rev: ++rev, deleted: false, data: { id: 'general', g: 'club', name: 'Général' } }];
  clubs.push({ id, code: 'C' + c, name: 'Club ' + c, created_at: 1 });
  for (let a = 0; a < ADH; a++) {
    const uid = `u${c}x${a}`, key = 'k' + a;
    members.push({ club_id: id, user_id: uid, key, role: a === 0 ? 'bureau' : 'mem', created_at: 1 });
    items.push({ coll: 'member', id: key, rev: ++rev, deleted: false, data: { id: key, n: 'Adhérent ' + a, valid: season, res: [] } });
    if (a < 3) {   // 3 comptes par club : les téléphones les partagent (fabriquer des milliers de comptes en fichiers prendrait des heures au démarrage)
      fs.writeFileSync(path.join(U, uid + '.json'), JSON.stringify({ id: uid, email: uid + '@exemple.test', name: 'A', pass_hash: 'h', plan: 'actif', guest: false, created_at: 1 }));
      tokens.push({ club: id, tok: Auth.makeToken(uid, 1, 'h'), key });
    }
  }
  for (let m = 0; m < MSG; m++) items.push({ coll: 'msg', id: 'm' + m, rev: ++rev, deleted: false, data: { id: 'm' + m, by: 'k1', ref: 'c:general', x: 'Message numéro ' + m + ' avec un peu de texte.', at: 1000 + m } });
  fs.writeFileSync(path.join(R, `items-${id}.json`), JSON.stringify(items));
}
fs.writeFileSync(path.join(R, 'clubs.json'), JSON.stringify(clubs));
fs.writeFileSync(path.join(dir, 'serveur.json'), JSON.stringify({ reconciliation: { at: Date.now() }, medias: { v: 1 }, migrations: { 'cours-hors-des-groupes': Date.now() } }));   // déjà faites : un démarrage normal
fs.writeFileSync(path.join(R, 'members.json'), JSON.stringify(members));

const pct = (l, p) => { const s = l.slice().sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : 0; };
const agent = new http.Agent({ keepAlive: true, maxSockets: 200 });
function call(method, url, tok, body) {
  return new Promise((ok, ko) => {
    const t0 = Date.now(), data = body ? JSON.stringify(body) : null;
    const q = http.request({ port: PORT, path: url, method, agent, headers: Object.assign({ Cookie: 'pja_session=' + tok }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, r => {
      let n = 0, s = ''; r.on('data', d => { n += d.length; if (n < 1e6) s += d; }); r.on('end', () => ok({ ms: Date.now() - t0, status: r.statusCode, bytes: n, text: s }));
    });
    q.on('error', ko); if (data) q.write(data); q.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['--max-old-space-size=' + N('TAS', 1536), path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dir, SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', BREVO_API_KEY: '', RESEND_API_KEY: '' }), stdio: 'ignore' });
  const stop = code => { try { srv.kill(); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} process.exit(code); };
  try {
    for (let i = 0; i < 100; i++) { try { await call('GET', '/', ''); break; } catch (e) { await wait(200); } }
    const u = tokens[0];
    let t = await call('GET', `/api/ram/c/${u.club}/sync?since=0`, u.tok);
    if (t.status !== 200) throw new Error('synchro ' + t.status + ' ' + t.text.slice(0, 200));
    console.log(`\n${CLUBS} clubs × ${ADH} adhérents et ${MSG} messages ; ${TEL} téléphones en direct ; ${ECR} écritures par seconde ; ${DUREE} s`);
    console.log(`Première ouverture d'un club (club à charger) : ${t.ms} ms, ${Math.round(t.bytes / 1024)} Ko`);
    // tous les téléphones se connectent en direct (un seul flux, tous clubs)
    const conns = []; let wakes = 0, lost = 0;
    const t1 = Date.now();
    const list = Array.from({ length: TEL }, (_, i) => tokens[i % tokens.length]);
    for (let i = 0; i < list.length; i += 100) {
      await Promise.all(list.slice(i, i + 100).map(x => new Promise(ok => {
        const q = http.get({ port: PORT, path: '/api/ram/events', agent: false, headers: { Cookie: 'pja_session=' + x.tok } }, r => { ok(); r.on('data', d => { if (String(d).includes('"rev"')) wakes++; }); r.on('error', () => { lost++; }); });
        q.on('error', () => { lost++; ok(); }); conns.push(q);
      })));
    }
    console.log(`${conns.length} connexions en direct ouvertes en ${Date.now() - t1} ms`);
    const syncs = [], opens = [], writes = []; let errors = 0, go = true;
    const revs = {};
    // chaque téléphone vérifie toutes les 30 s (filet de sécurité), soit TEL/30 synchros par seconde ; 1 % d'ouvertures complètes
    const perSec = Math.ceil(TEL / 30);
    const loadT = setInterval(() => { for (let i = 0; i < perSec; i++) { const x = list[Math.floor(Math.random() * list.length)], full = Math.random() < 0.01;
      call('GET', `/api/ram/c/${x.club}/sync?since=${full ? 0 : revs[x.club] || rev}`, x.tok).then(r => { (full ? opens : syncs).push(r.ms); if (r.status !== 200) errors++; }, () => { errors++; }); } }, 1000);
    const writeT = setInterval(() => { for (let i = 0; i < ECR; i++) { const x = list[Math.floor(Math.random() * list.length)];
      call('POST', `/api/ram/c/${x.club}/ops`, x.tok, { ops: [{ coll: 'msg', id: 'w' + Date.now() + i, op: 'put', data: { by: x.key, ref: 'c:general', x: 'Bonjour', at: Date.now() } }] }).then(r => { writes.push(r.ms); if (r.status !== 200) errors++; }, () => { errors++; }); } }, 1000);
    // boucle d'événements du serveur : mesurée par le temps de réponse d'une petite requête
    const ping = []; const pingT = setInterval(() => { call('GET', '/api/ram/clubs', u.tok).then(r => ping.push(r.ms), () => { errors++; }); }, 500);
    await wait(DUREE * 1000); go = false;
    [loadT, writeT, pingT].forEach(clearInterval);
    await wait(2000);
    console.log(`Synchro « depuis » : médiane ${pct(syncs, 0.5)} ms, 95 % sous ${pct(syncs, 0.95)} ms, 99 % sous ${pct(syncs, 0.99)} ms (${syncs.length})`);
    console.log(`Ouverture complète : médiane ${pct(opens, 0.5)} ms, 95 % sous ${pct(opens, 0.95)} ms (${opens.length})`);
    console.log(`Écriture d'un message : médiane ${pct(writes, 0.5)} ms, 95 % sous ${pct(writes, 0.95)} ms (${writes.length})`);
    console.log(`Petite requête pendant la charge : médiane ${pct(ping, 0.5)} ms, 95 % sous ${pct(ping, 0.95)} ms`);
    console.log(`Réveils reçus par les téléphones : ${wakes} ; connexions perdues : ${lost} ; erreurs : ${errors}`);
    let rss = '?';
    try { const out = require('child_process').execSync(process.platform === 'win32' ? `tasklist /FI "PID eq ${srv.pid}" /FO CSV /NH` : `ps -o rss= -p ${srv.pid}`).toString(); rss = process.platform === 'win32' ? out.split('","')[4] : Math.round(+out / 1024) + ' Mo'; } catch (e) {}
    console.log(`Mémoire du serveur : ${rss}\n`);
    conns.forEach(q => q.destroy());
    stop(0);
  } catch (e) { console.error(e); stop(1); }
})();
