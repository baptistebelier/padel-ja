/* Noms de domaine des trois applis (club/noms.js, server.js) : anciens et nouveaux noms ouvrent la bonne appli,
   les adresses officielles ne changent qu'avec NOMS_OFFICIELS=nouveaux, certaines routes ne sont jamais redirigées */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const Noms = require('../club/noms.js');

const HOTES = { ja: ['ja', 'pista'], club: ['club', 'buvette'], coach: ['coach', 'dojo'] };

test('table des noms : appli et famille de chacun des six noms, liens dans la même famille, hôte inconnu inchangé', () => {
  Object.entries(HOTES).forEach(([app, [ancien, nouveau]]) => {
    assert.equal(Noms.appOf(ancien + '.riseandmove.fr'), app);
    assert.equal(Noms.appOf(nouveau + '.riseandmove.fr:3000'), app);
    assert.equal(Noms.famille(ancien + '.riseandmove.fr'), 'anciens');
    assert.equal(Noms.famille(nouveau + '.riseandmove.fr'), 'nouveaux');
    assert.deepEqual(Noms.hotes(app), [ancien + '.riseandmove.fr', nouveau + '.riseandmove.fr']);
  });
  // depuis dojo., on va vers pista. et buvette. ; depuis coach., vers ja. et club.
  assert.equal(Noms.urlDepuis('ja', 'dojo.riseandmove.fr'), 'https://pista.riseandmove.fr');
  assert.equal(Noms.urlDepuis('club', 'dojo.riseandmove.fr'), 'https://buvette.riseandmove.fr');
  assert.equal(Noms.urlDepuis('ja', 'coach.riseandmove.fr'), 'https://ja.riseandmove.fr');
  assert.equal(Noms.urlDepuis('club', 'coach.riseandmove.fr'), 'https://club.riseandmove.fr');
  // hôtes inconnus : comportement actuel (anciens noms)
  ['localhost', '127.0.0.1', 'www.riseandmove.fr', 'riseandmove.fr', 'exemple.test', ''].forEach(h => {
    assert.equal(Noms.appOf(h), '', h);
    assert.equal(Noms.famille(h), 'anciens', h);
    assert.equal(Noms.versFamille(h, 'nouveaux'), '', h);
    assert.equal(Noms.urlDepuis('ja', h), 'https://ja.riseandmove.fr', h);
  });
  assert.equal(Noms.versFamille('club.riseandmove.fr', 'nouveaux'), 'buvette.riseandmove.fr');
  assert.equal(Noms.officiel({}), 'anciens');
  assert.equal(Noms.officiel({ NOMS_OFFICIELS: 'nouveaux' }), 'nouveaux');
  assert.equal(Noms.officiel({ NOMS_OFFICIELS: 'autre' }), 'anciens');
});

test('réécriture des pages : liens dans la famille, lignes officielles gardées tant que les anciens noms sont officiels', () => {
  const page = '<link rel="canonical" href="https://ja.riseandmove.fr/">\n<a href="https://club.riseandmove.fr/">club</a>\n<pre>claude mcp add https://ja.riseandmove.fr/mcp</pre>\n<a href="https://coach.riseandmove.fr">coach</a>';
  assert.equal(Noms.reecrire(page, 'anciens', true), page, 'famille des anciens : rien ne change');
  const garde = Noms.reecrire(page, 'nouveaux', true);
  assert.match(garde, /canonical" href="https:\/\/ja\.riseandmove\.fr\//);
  assert.match(garde, /mcp add https:\/\/ja\.riseandmove\.fr\/mcp/);
  assert.match(garde, /buvette\.riseandmove\.fr/);
  assert.match(garde, /dojo\.riseandmove\.fr/);
  const tout = Noms.reecrire(page, 'nouveaux', false);
  assert.ok(!/(ja|club|coach)\.riseandmove\.fr/.test(tout), 'noms officiels nouveaux : tout est réécrit');
});

async function serveur(extra) {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'noms-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA }, extra || {});
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].concat(extra && extra.NOMS_OFFICIELS ? [] : ['NOMS_OFFICIELS']).forEach(k => { if (!(extra && k in extra)) delete env[k]; });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const B = `http://127.0.0.1:${PORT}`;
  await serverReady(B);
  const get = (p, host, opt) => fetch(B + p, Object.assign({ redirect: 'manual', headers: { 'x-forwarded-host': host, 'x-forwarded-proto': 'https' } }, opt || {}));
  return { srv, B, get };
}
const TOUS = [].concat(...Object.values(HOTES)).map(h => h + '.riseandmove.fr');

test('sans NOMS_OFFICIELS : les six noms ouvrent la bonne appli, aucune redirection, adresses officielles inchangées', async () => {
  const { srv, get } = await serveur();
  try {
    for (const h of TOUS) {
      const r = await get('/', h), t = await r.text();
      assert.equal(r.status, 200, h + ' : ouvre une page, sans redirection');
      const app = Noms.appOf(h);
      if (app === 'coach') assert.match(t, /Coach/, h + ' : présentation de /RAM Coach');
      if (app === 'club') assert.ok(!/<title>[^<]*Coach/.test(t), h + ' : /RAM Club');
      const p = await get('/presentation', h);
      assert.notEqual(p.status, 302, h + ' : /presentation sans redirection');
    }
    // adresses officielles : les anciennes, même vues depuis un nouveau nom
    const coach = await (await get('/', 'dojo.riseandmove.fr')).text();
    assert.ok(coach.includes('dojo.riseandmove.fr') || !coach.includes('coach.riseandmove.fr') || /canonical|og:|ld\+json/.test(coach), 'liens dans la famille dojo.');
    const anc = await (await get('/', 'coach.riseandmove.fr')).text();
    assert.ok(!anc.includes('dojo.riseandmove.fr'), 'ancien nom : pas de nouveaux noms dans la page');
  } finally { srv.kill(); }
});

test('avec NOMS_OFFICIELS=nouveaux : les pages des anciens noms redirigent avec chemin et paramètres, jamais l’API, les webhooks, le connecteur, les fichiers', async () => {
  const { srv, get, B } = await serveur({ NOMS_OFFICIELS: 'nouveaux' });
  try {
    for (const [app, [ancien, nouveau]] of Object.entries(HOTES)) {
      const r = await get('/presentation?x=1&y=2', ancien + '.riseandmove.fr');
      assert.equal(r.status, 302, ancien + ' : redirigé');
      assert.equal(r.headers.get('location'), `https://${nouveau}.riseandmove.fr/presentation?x=1&y=2`, 'chemin et paramètres gardés');
      const racine = await get('/', ancien + '.riseandmove.fr');
      assert.equal(racine.headers.get('location'), `https://${nouveau}.riseandmove.fr/`);
      const n = await get('/', nouveau + '.riseandmove.fr');
      assert.equal(n.status, 200, nouveau + ' : ouvre l’appli');
      assert.ok(!/(^|[^a-z])(ja|club|coach)\.riseandmove\.fr/.test(await n.text()), nouveau + ' : adresses officielles nouvelles');
    }
    // jamais de redirection
    const JAMAIS = ['/api/me', '/api/ram/clubs', '/api/calendly/webhook', '/mcp', '/oauth/authorize', '/.well-known/oauth-authorization-server', '/agenda/xyz', '/medias/x.png', '/sw.js', '/manifest.webmanifest', '/coach-v2-icon-192.png', '/club/sw.js', '/r/abc/def', '/css/ram.css', '/js/rail.js', '/img/favicon.png'];
    for (const h of TOUS.filter(x => /^(ja|club|coach)\./.test(x))) for (const p of JAMAIS) {
      const r = await get(p, h);
      assert.notEqual(r.status, 302, `${h}${p} : jamais redirigé (${r.status})`);
    }
    // POST : jamais redirigé
    const post = await get('/api/auth/login', 'club.riseandmove.fr', { method: 'POST', headers: { 'x-forwarded-host': 'club.riseandmove.fr', 'Content-Type': 'application/json' }, body: '{}' });
    assert.notEqual(post.status, 302);
    // hôte inconnu (localhost) : aucune redirection
    const loc = await fetch(B + '/presentation', { redirect: 'manual' });
    assert.notEqual(loc.status, 302);
  } finally { srv.kill(); }
});

test('connexion partagée : le cookie de session vaut pour tout riseandmove.fr, depuis les anciens comme les nouveaux noms', async () => {
  const { srv, get, B } = await serveur();
  try {
    for (const h of TOUS) {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-host': h, 'x-forwarded-proto': 'https' }, body: JSON.stringify({ email: `n-${h.split('.')[0]}@exemple.test`, password: 'motdepasse1', first: 'Nom', last: 'Test' }) });
      const c = [].concat(r.headers.getSetCookie()).join(' ');
      assert.match(c, /Domain=\.riseandmove\.fr/, h + ' : cookie partagé');
    }
  } finally { srv.kill(); }
});

test('pages publiques de réservation : chaque script qu’elles chargent répond sur les six noms (pas de 404 sur /Dojo ni /Buvette)', async () => {
  const { srv, get } = await serveur();
  try {
    const srcs = new Set();
    for (const f of ['reserver.html', 'inscrire.html']) for (const m of fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8').matchAll(/src="(\/[^"?]+\.js)/g)) srcs.add(m[1]);
    assert.ok(srcs.size, 'les pages chargent au moins un script');
    for (const h of TOUS) for (const s of srcs) {
      const r = await get(s, h);
      assert.equal(r.status, 200, h + s);
      assert.match(r.headers.get('content-type') || '', /javascript/, h + s + ' : type JavaScript');
    }
  } finally { srv.kill(); }
});
