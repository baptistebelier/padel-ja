/* Pont /RAM JA ↔ /RAM Club : tournoi publié sur le mur du club, inscription depuis l'appli, résultats en retour */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('tournoi et animation /RAM JA publiés sur /RAM Club, inscriptions depuis le club, résultats', async () => {
  const PORT = 39500 + Math.floor(Math.random() * 90), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jaclub-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await wait(100); } }
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const bur = await signup('b@exemple.test', 'Bea', 'TC Test'), mem = await signup('m@exemple.test', 'Max', ''), ja = await signup('j@exemple.test', 'Jean', 'TC Test');
    const space = await bur('/api/ram/clubs', { name: 'TC Test', short: 'TCT' });
    const j = await mem('/api/ram/join', { code: space.code });
    const s0 = await bur(`/api/ram/c/${space.id}/sync?since=0`), season = s0.items.find(i => i.coll === 'conf').data.season;
    await bur(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }] });

    // le juge-arbitre crée un tournoi au club : il est publié sur le mur
    const { id: tid } = await ja('/api/tournaments', { name: 'Open d’automne' });
    await ja(`/api/t/${tid}/action`, { type: 'tournament/update', payload: { club: 'TC Test', dateStart: '2030-11-15', category: 'P100' } });
    await wait(2600);
    const post = async () => (await mem(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.coll === 'post' && i.id === 'ja-' + tid);
    let p = await post();
    assert.ok(p, 'tournoi publié sur le mur du club');
    assert.equal(p.data.kind, 'jatour'); assert.equal(p.data.ja.status, 'open'); assert.equal(p.data.ja.open, true);

    // inscription depuis le club avec un partenaire extérieur ; une seconde fois : refusée
    assert.equal((await mem('/api/ja/inscription', { tid, partner: { last: 'Dupont', first: 'Paul' } })).ok, true);
    assert.match((await mem('/api/ja/inscription', { tid, partner: { last: 'Martin' } })).error, /déjà inscrit/);
    // un non-adhérent ne peut pas s'inscrire par l'appli
    const autre = await signup('x@exemple.test', 'Xavier', '');
    assert.equal((await autre('/api/ja/inscription', { tid, partner: { last: 'Y' } })).status, 400);
    await wait(2600);
    p = await post();
    assert.equal(p.data.ja.count, 1);
    assert.equal(p.data.ja.list[0].k1, j.key, 'l’adhérent est reconnu dans la liste');
    assert.equal(p.data.ja.list[0].n2, 'Paul DUPONT');
    // un parent inscrit son enfant (sans compte) en plus de lui-même ; personne d'autre ne peut l'inscrire
    const kid = 'k' + Date.now();
    await mem(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: kid, op: 'put', data: { n: 'Léo Test', parent: j.key, role: 'Jeune' } }] });
    const kr = await mem('/api/ja/inscription', { tid, kid, partner: { last: 'Petit', first: 'Tom' } });
    assert.equal(kr.ok, true, JSON.stringify(kr));
    assert.match((await mem('/api/ja/inscription', { tid, kid, partner: { last: 'Roux' } })).error, /Léo est déjà inscrit/);
    assert.match((await bur('/api/ja/inscription', { tid, kid, partner: { last: 'Roux' } })).error, /que tes enfants/);
    await wait(2600);
    p = await post();
    assert.equal(p.data.ja.count, 2);
    assert.ok(p.data.ja.list.some(x => x.k1 === kid && x.n1 === 'Léo TEST'), 'l’enfant est reconnu dans la liste');
    assert.equal((await mem('/api/ja/desinscription', { tid, kid })).ok, true);
    // désinscription avant le tirage
    assert.equal((await mem('/api/ja/desinscription', { tid })).ok, true);
    // inscriptions ailleurs : plus de bouton dans l'appli
    await ja(`/api/t/${tid}/action`, { type: 'tournament/update', payload: { regMode: 'ext', regWhere: 'Ten’Up' } });
    assert.match((await mem('/api/ja/inscription', { tid, partner: { last: 'Z' } })).error, /pas dans l’appli/);
    await wait(2600);
    p = await post();
    assert.equal(p.data.ja.reg, 'ext'); assert.equal(p.data.ja.where, 'Ten’Up'); assert.equal(p.data.ja.count, 0);
    // ne plus publier : la publication disparaît du mur
    await ja(`/api/t/${tid}/action`, { type: 'tournament/update', payload: { regMode: 'none' } });
    await wait(2600);
    const gone = await post();
    assert.ok(!gone || gone.del, 'publication retirée');

    // animation (créée par le bureau, aussi juge-arbitre) : inscription individuelle, puis résultats publiés à la fin
    const { id: aid } = await bur('/api/tournaments', { kind: 'animation', format: 'americano', name: 'Americano du vendredi' });
    const ins = await mem('/api/ja/inscription', { tid: aid });
    assert.equal(ins.ok, true, JSON.stringify(ins));
    for (const n of ['A1', 'A2', 'A3']) await bur(`/api/t/${aid}/action`, { type: 'ani/player/add', payload: { name: n } });
    await wait(2600);
    let pa = (await mem(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.id === 'ja-' + aid);
    assert.ok(pa && pa.data.ja.ani && pa.data.ja.status === 'open', 'animation publiée');
    assert.equal(pa.data.ja.list.filter(x => x.k1 === j.key).length, 1, 'l’adhérent inscrit par l’appli est reconnu');
    // une manche jouée, puis l'animation terminée : résultats sur le mur
    await bur(`/api/t/${aid}/action`, { type: 'ani/round/next' });
    const state = await bur(`/api/t/${aid}/export`);
    for (const m of state.ani.rounds[0].matches) await bur(`/api/t/${aid}/action`, { type: 'ani/score', payload: { round: 1, match: m.id, sa: 14, sb: 10 } });
    assert.equal((await bur(`/api/t/${aid}/action`, { type: 'ani/finish' })).ok, true);
    await wait(2600);
    pa = (await mem(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.id === 'ja-' + aid);
    assert.equal(pa.data.ja.status, 'done');
    assert.equal(pa.data.ja.results.length, 4);
    assert.ok(pa.data.ja.results.some(r => r.k.includes(j.key)), 'la place de l’adhérent est reconnue');
    // et compte pour son palmarès (trophée)
    assert.ok(((await mem(`/api/ram/c/${space.id}/sync?since=0`)).counts[j.key] || {}).palm >= 1);
    // sa place entre dans l'historique de sa fiche joueur /RAM JA
    const fiche = await mem('/api/me/player');
    const h = (fiche.linked && fiche.linked.history || []).find(x => x.tournament === 'Americano du vendredi');
    assert.ok(h, 'animation dans l’historique : ' + JSON.stringify(fiche.linked));
    assert.match(h.category, /^Animation · /);
    assert.ok(h.place >= 1 && h.place <= 4);
    // rouverte, elle en ressort
    await bur(`/api/t/${aid}/action`, { type: 'ani/reopen' });
    await wait(1500);
    assert.ok(!((await mem('/api/me/player')).linked.history || []).some(x => x.tournament === 'Americano du vendredi'));
  } finally { srv.kill(); }
});

test('horaire du prochain match publié pour les paires du club après le tirage', async () => {
  const PORT = 39600 + Math.floor(Math.random() * 90), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jaclub2-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await wait(100); } }
    const signup = async (email, first, club) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test', club }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const bur = await signup('b@exemple.test', 'Bea', 'TC Test');
    const space = await bur('/api/ram/clubs', { name: 'TC Test', short: 'TCT' });
    const { id: tid } = await bur('/api/tournaments', { name: 'Open' });
    await bur(`/api/t/${tid}/action`, { type: 'tournament/update', payload: { club: 'TC Test', dateStart: '2030-11-15', startTime: '09:00' } });
    await wait(2000);
    assert.equal((await bur('/api/ja/inscription', { tid, partner: { last: 'Dupont', first: 'Paul' } })).ok, true);
    for (const n of ['A', 'B', 'C']) await bur(`/api/t/${tid}/action`, { type: 'pair/add', payload: { p1: { last: n + '1', first: 'X' }, p2: { last: n + '2', first: 'Y' } } });
    assert.equal((await bur(`/api/t/${tid}/action`, { type: 'draw/create', payload: {} })).ok, true);
    await wait(2600);
    const p = (await bur(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.id === 'ja-' + tid);
    assert.equal(p.data.ja.status, 'drawn');
    const mine = p.data.ja.list.find(x => x.k1 === space.key);
    assert.ok(mine && mine.next && mine.next.at > 0, 'prochain match de la paire du club');
    assert.ok(mine.next.court, 'terrain du match');
    assert.match(mine.next.vs, /\//);
    assert.equal(p.data.ja.list.filter(x => x.next).length, 1, 'seulement pour les paires du club');
    // le direct pour tous : matchs à venir avec horaire, terrain et paires ; lien vers le grand écran en lecture seule
    const d = p.data.ja.direct;
    assert.ok(d && d.up.length >= 1, 'matchs à venir');
    assert.ok(d.up[0].at > 0 && d.up[0].c && /\//.test(d.up[0].a));
    assert.match(p.data.ja.tv, new RegExp('^/t/' + tid + '/tv\\?k=\\w+'));
    assert.equal((await fetch(B + p.data.ja.tv)).status, 200);
  } finally { srv.kill(); }
});
