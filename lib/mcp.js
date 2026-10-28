/* =========================================================================
   Connecteur MCP /RAM — Claude (claude.ai, Claude Code, Claude Desktop) lit les données d'un compte /RAM
   - Serveur MCP « distant » sur /mcp (JSON-RPC 2.0, transport HTTP « streamable » en réponses JSON simples).
   - Connexion OAuth 2.1 avec le compte /RAM : découverte (.well-known), inscription automatique du client,
     page d'autorisation (connexion /RAM puis « Autoriser »), code à usage unique avec PKCE (S256), jetons.
   - Lecture seule : chaque outil ne renvoie que ce que le compte voit déjà dans /RAM JA, /RAM Club
     et /RAM Coach (mêmes droits : la synchronisation du Club filtre ce que chacun peut lire).
   - Sans stockage : client, code et jetons sont des données signées (HMAC, même secret que les sessions).
     Changer son mot de passe coupe l'accès : le jeton de renouvellement porte une empreinte du mot de passe.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'padelja-local-' + require('os').hostname();
const SCOPE = 'ram.lecture', WSCOPE = 'ram.ecriture';   // lecture : tout ; écriture : /RAM Coach
const Echelles = require('./echelles');
const Formules = require('./formules');
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ACCESS_TTL = 3600e3, REFRESH_TTL = 30 * 86400e3, CODE_TTL = 5 * 60e3, TX_TTL = 15 * 60e3;

const b64 = s => Buffer.from(s).toString('base64url');
const hmac = v => crypto.createHmac('sha256', SECRET).update('mcp:' + v).digest('base64url');
/* donnée signée : « type.contenu.signature » ; illisible et infalsifiable sans le secret du serveur */
function seal(kind, data) {
  const v = kind + '.' + b64(JSON.stringify(data));
  return v + '.' + hmac(v);
}
function open(kind, tok) {
  const p = String(tok || '').split('.');
  if (p.length !== 3 || p[0] !== kind) return null;
  const v = p[0] + '.' + p[1], s = hmac(v);
  if (s.length !== p[2].length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(p[2]))) return null;
  try {
    const d = JSON.parse(Buffer.from(p[1], 'base64url').toString());
    return d.exp && d.exp < Date.now() ? null : d;
  } catch (e) { return null; }
}
const passPrint = hash => crypto.createHash('sha256').update(String(hash || 'aucun')).digest('base64url').slice(0, 12);
const okRedirect = u => { try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname)); } catch (e) { return false; } };
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };
const dowOf = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const durMin = d => { const m = String(d || '').match(/(\d+) h(?: (\d+))?|(\d+) min/); return m ? (m[3] ? +m[3] : +m[1] * 60 + (+m[2] || 0)) : 60; };
// même règle que club/data.js : séance ponctuelle (once), ou chaque semaine dans un cycle (from, to) avec ses séances déplacées ;
// un groupe sans date de début commence le jour de sa création (at)
const trainOn = (g, d) => g.once ? g.once === d : (g.extra || []).includes(d) || (!(g.skip || []).includes(d) && !(g.off || []).some(o => d >= o.du && d <= o.au) && !(g.from && d < g.from) && !(!g.from && g.at && d < isoOf(new Date(g.at))) && !(g.to && d > g.to) && dowOf(d) === g.day && (!(g.every > 1 && g.from) || Math.round((Date.parse(d) - Date.parse(g.from)) / 6048e5) % g.every === 0));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function createMcp({ store, ram, Engine, Ani, getRoom, mainClubOf, currentUser, readBody, json, redirect, isAdmin = () => false }) {
  const log = msg => console.log('MCP /RAM : ' + msg);   // journal du connecteur (jamais de jeton ni de donnée personnelle)
  const used = new Map();   // codes déjà échangés (usage unique), oubliés après expiration
  const base = req => `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id' };
  const send = (res, code, obj, extra) => json(res, code, obj, Object.assign({}, cors, { 'Cache-Control': 'no-store' }, extra || {}));
  const client = id => { const d = open('cli', id); return d && Array.isArray(d.r) ? d : null; };
  const page = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(title)} — /RAM</title><link rel="icon" href="/img/favicon.png"><link rel="stylesheet" href="/css/ram.css"><link rel="stylesheet" href="/css/site.css"><style>.auth-box{max-width:460px}.auth-box ul{margin:14px 0;padding-left:20px;line-height:1.6}.auth-box .row2{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.auth-box .row2 .btn{flex:1 1 160px}</style></head><body class="auth-page"><header class="nav"><a href="/" class="logo"><img src="/img/ja-ram-rouge-blanc.png" alt="/RAM"></a></header><main class="auth"><div class="auth-box">${body}</div></main></body></html>`;
  const html = (res, code, title, body) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' }); res.end(page(title, body)); };
  const readForm = async req => {
    const raw = await new Promise(r => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e5) req.destroy(); }); req.on('end', () => r(s)); });
    if (/json/.test(req.headers['content-type'] || '')) { try { return JSON.parse(raw || '{}'); } catch (e) { return {}; } }
    return Object.fromEntries(new URLSearchParams(raw));
  };

  /* ---------- OAuth : métadonnées de découverte ---------- */
  const resourceMeta = req => ({ resource: base(req) + '/mcp', authorization_servers: [base(req)], scopes_supported: [SCOPE, WSCOPE], bearer_methods_supported: ['header'], resource_name: '/RAM', resource_documentation: base(req) + '/connecteur' });
  const asMeta = req => {
    const b = base(req);
    return { issuer: b, authorization_endpoint: b + '/oauth/authorize', token_endpoint: b + '/oauth/token', registration_endpoint: b + '/oauth/register',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], scopes_supported: [SCOPE, WSCOPE], service_documentation: b + '/connecteur' };
  };
  /* jetons d'accès (1 h) et de renouvellement (30 jours) */
  // sc : droits accordés sur la page d'autorisation (un ancien accès, sans sc, reste en lecture seule)
  function tokens(u, cid, sc) {
    const now = Date.now(), s = sc || SCOPE;
    return { access_token: seal('acc', { u: u.id, c: cid, s, exp: now + ACCESS_TTL }), token_type: 'Bearer', expires_in: ACCESS_TTL / 1000,
      refresh_token: seal('ref', { u: u.id, c: cid, s, pw: passPrint(u.pass_hash), exp: now + REFRESH_TTL }), scope: s };
  }
  async function bearerUser(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const d = m && open('acc', m[1].trim());
    // accès donné avant l'arrivée de l'écriture (sans droits notés) : refusé, pour que Claude redemande
    // l'autorisation (page « Autoriser » : lecture seule ou lecture et écriture, au choix de l'utilisateur)
    if (!d || !d.s) return null;
    const u = await store.getUser(d.u).catch(() => null);
    if (u) u._scopes = String(d.s).split(' ');
    return u && !u.guest ? u : null;
  }
  const canWrite = u => (u._scopes || []).includes(WSCOPE);

  /* ---------- données : clubs du compte et contenu lisible de chacun ---------- */
  async function clubsOf(u) {
    const l = await ram.myClubs(u.id), main = await mainClubOf(u.id).catch(() => null), sps = await ram.spaces();
    // l'administrateur de l'appli (ADMIN_EMAILS) : « administrateur », jamais « bureau »
    return l.map(c => ({ id: c.id, nom: c.name, role: isAdmin(u) ? 'administrateur' : c.role === 'bureau' ? 'bureau' : c.role === 'coach' ? 'enseignant' : 'adhérent', cle: c.key,
      principal: !!main && (sps.find(s => s.id === c.id) || {}).club_id === main }));
  }
  async function pickClub(u, id) {
    const l = await clubsOf(u);
    if (!l.length) throw new Error("Ce compte n'appartient à aucun club /RAM Club.");
    const c = id ? l.find(x => x.id === id || x.nom.toLowerCase() === String(id).toLowerCase()) : l.find(x => x.principal) || l[0];
    if (!c) throw new Error('Club inconnu pour ce compte. Clubs : ' + l.map(x => `${x.nom} (${x.id})`).join(', '));
    return c;
  }
  async function content(u, c) {
    const d = await ram.sync(u.id, c.id, 0);
    if (!d) throw new Error('Club inaccessible.');
    const by = {};
    d.items.forEach(it => { if (!it.del) (by[it.coll] = by[it.coll] || {})[it.id] = it.data; });
    const get = coll => by[coll] || {};
    const nm = k => (k === 'club' ? c.nom : (get('member')[k] || {}).n || (get('eleve')[k] || {}).n || k);
    return { me: d.me, get, nm };
  }
  const teaching = c => ['enseignant', 'bureau', 'administrateur'].includes(c.role);
  /* séances de mes groupes (dans un club) entre deux dates */
  function sessions(K, key, from, to, mine) {
    const out = [];
    Object.entries(K.get('group')).forEach(([gid, g]) => {
      if (g.type !== 'train' || g.old || (mine && g.coach !== key)) return;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (!trainOn(g, d)) continue;
        const s = K.get('seance')[gid + '.' + d] || {}, pres = s.pres || {}, att = ((g.att || {})[d]) || {};
        const P = Object.values(pres).filter(v => v === 'P').length || Object.values(att).filter(Boolean).length;
        const t = g.tarif || {};
        out.push({ g, gid, d, s, presents: P, appel: Object.keys(pres).length || Object.keys(att).length, annule: (g.cancel || []).includes(d),
          eur: t.mode === 'heure' ? ((+t.prix || 0) * durMin(g.dur)) / 60 : t.mode === 'eleve' ? (+t.prix || 0) * P : +t.prix || 0 });
      }
    });
    return out.sort((a, b) => a.d.localeCompare(b.d) || String(a.g.h).localeCompare(String(b.g.h)));
  }
  const today = () => isoOf(new Date());

  /* ---------- outils (lecture seule) ---------- */
  const S = (props, req) => ({ type: 'object', properties: props || {}, required: req || [], additionalProperties: false });
  const clubArg = { club: { type: 'string', description: "Identifiant ou nom exact du club (par défaut : le club principal du compte). Voir ram_mon_compte." } };
  const TOOLS = [
    { name: 'ram_mon_compte', title: 'Mon compte /RAM', description: "Le compte /RAM connecté : nom, e-mail, offre /RAM JA, et ses clubs /RAM Club avec son rôle dans chacun (adhérent, enseignant, bureau) et le club principal. À appeler en premier pour connaître les identifiants des clubs.", inputSchema: S(),
      run: async u => ({ nom: [u.first, u.last].filter(Boolean).join(' ') || u.name, email: u.email, offre_ram_ja: isAdmin(u) ? 'administrateur (accès complet)' : u.plan || 'essai', clubs: (await clubsOf(u)).map(({ cle, ...c }) => c) }) },
    { name: 'ja_tournois', title: 'Mes tournois /RAM JA', description: "Les tournois et animations (americano, mexicano, montée-descente…) gérés par le compte dans /RAM JA, le logiciel du juge-arbitre : nom, dates, club, catégorie, paires, matchs joués, état (inscriptions, en cours, clôturé).",
      inputSchema: S({ etat: { type: 'string', enum: ['tous', 'en_cours', 'clotures'], description: 'Filtrer par état (tous par défaut).' } }),
      run: async (u, a) => (await store.listTournaments(u.id)).filter(t => !t.example).filter(t => !a.etat || a.etat === 'tous' || (a.etat === 'clotures' ? t.closed : !t.closed)).slice(0, 100).map(t => ({
        id: t.id, nom: t.name, type: t.kind === 'animation' ? 'animation ' + (t.format || '') : 'tournoi', club: t.club || '', categorie: [t.category, t.gender].filter(Boolean).join(' '),
        debut: t.dateStart || '', fin: t.dateEnd || '', paires: t.pairs, joueurs: t.players, matchs: t.matches, joues: t.done, tirage_fait: !!t.drawn, cloture: !!t.closed })) },
    { name: 'ja_tournoi', title: 'Détail d’un tournoi /RAM JA', description: "Le détail d'un tournoi ou d'une animation du compte : réglages, paires inscrites (joueurs, classements), avancement, classement final ou provisoire. L'id vient de ja_tournois.",
      inputSchema: S({ id: { type: 'string', description: 'Identifiant du tournoi (ja_tournois).' } }, ['id']),
      run: async (u, a) => {
        const room = await getRoom(String(a.id || ''));
        if (!room || room.row.owner !== u.id) throw new Error('Tournoi introuvable pour ce compte.');
        const T = room.row.state, t = T.tournament || {};
        if (Ani.isAnimation(T)) {
          const st = Ani.standings(T), pn = id => ((T.ani.players || []).find(p => p.id === id) || {}).name || id;
          return { nom: t.name, type: 'animation', format: T.ani.format, club: t.club || '', date: t.dateStart || '', joueurs: (T.ani.players || []).map(p => p.name), manches: (T.ani.rounds || []).length,
            classement: st.rows.slice(0, 50).map((r, i) => ({ place: i + 1, qui: r.ids.map(pn).join(' / '), points: r.pf, joues: r.played, gagnes: r.won })), cloture: !!t.closed };
        }
        const pairs = (T.pairs || []).filter(p => !p.withdrawn), pname = id => { const p = pairs.find(x => x.id === id); return p ? `${p.p1.first || ''} ${p.p1.last || ''} / ${p.p2.first || ''} ${p.p2.last || ''}`.replace(/\s+/g, ' ').trim() : id; };
        let classement = [];
        try { if (T.draw && T.draw.built) classement = Engine.finalResults(T, Engine.resolve(T)).slice(0, 64).map(r => ({ place: r.exact ? r.place : `${r.placeLo}-${r.placeHi}`, paire: pname(r.pair), points_fft: r.points })); } catch (e) {}
        const ms = T.matches || [];
        return { nom: t.name, club: t.club || '', categorie: [t.category, t.gender].filter(Boolean).join(' '), debut: t.dateStart || '', fin: t.dateEnd || '', juge_arbitre: t.ja || t.referee || '',
          paires: pairs.map(p => ({ paire: pname(p.id), classements: [p.p1.rank, p.p2.rank].filter(Boolean).join(' + ') })), matchs: ms.length, joues: ms.filter(m => m.status === 'done').length,
          tirage_fait: !!(T.draw && T.draw.built), cloture: !!t.closed, classement };
      } },
    { name: 'club_mur', title: 'Mur du club', description: "Les dernières publications du mur d'un club /RAM Club (annonces, événements, résultats, sondages), les plus récentes d'abord.",
      inputSchema: S(Object.assign({ nombre: { type: 'integer', minimum: 1, maximum: 50, description: 'Nombre de publications (20 par défaut).' } }, clubArg)),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c);
        return { club: c.nom, publications: Object.entries(K.get('post')).filter(([, p]) => !p.arch && p.kind !== 'ad').sort((x, y) => (y[1].at || 0) - (x[1].at || 0)).slice(0, a.nombre || 20).map(([id, p]) => ({
          id, type: p.kind || 'publication', auteur: K.nm(p.by), titre: strip(p.title || p.q || ''), texte: strip(p.body || p.x || '').slice(0, 600), date_evenement: p.date || undefined,
          publie_le: p.at ? new Date(p.at).toISOString().slice(0, 10) : undefined })) };
      } },
    { name: 'club_agenda', title: 'Agenda du club', description: "Ce qui arrive dans un club /RAM Club : événements et stages datés, et séances des groupes d'entraînement (avec cours annulés), sur les prochains jours.",
      inputSchema: S(Object.assign({ jours: { type: 'integer', minimum: 1, maximum: 90, description: 'Nombre de jours à venir (14 par défaut).' } }, clubArg)),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), from = today(), to = addDays(from, (a.jours || 14) - 1);
        const ev = Object.values(K.get('post')).filter(p => p.date && p.date >= from && p.date <= to && !p.arch).map(p => ({ date: p.date, heure: p.time || '', quoi: strip(p.title || p.q || 'Événement'), type: p.stage ? 'stage' : p.kind || 'événement' }));
        const cours = sessions(K, K.me.key, from, to, false).map(x => ({ date: x.d, heure: x.g.h, quoi: x.g.name, type: 'cours', enseignant: x.g.coach ? K.nm(x.g.coach) : '', lieu: ((x.g.loc || {})[x.d]) || x.g.defLoc || '', annule: x.annule || undefined, theme: x.s.theme || undefined }));
        return { club: c.nom, du: from, au: to, agenda: ev.concat(cours).sort((x, y) => x.date.localeCompare(y.date) || String(x.heure).localeCompare(String(y.heure))) };
      } },
    { name: 'club_groupes', title: 'Groupes du club', description: "Les groupes d'un club /RAM Club : groupes d'entraînement (jour, heure, enseignant, nombre d'élèves) et équipes.",
      inputSchema: S(clubArg),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c);
        return { club: c.nom, groupes: Object.entries(K.get('group')).filter(([, g]) => !g.old).map(([id, g]) => ({ id, nom: g.type === 'team' ? g.name || 'Équipe' : g.name, type: g.type === 'train' ? 'entraînement' : 'équipe',
          sport: g.sport || undefined, creneau: g.type === 'train' ? `${DAYS[g.day] || ''} ${g.h || ''} (${g.dur || ''})` : undefined, enseignant: g.coach ? K.nm(g.coach) : undefined, capitaine: g.cap ? K.nm(g.cap) : undefined, membres: (g.mem || []).length })) };
      } },
    { name: 'coach_planning', title: 'Mon planning d’enseignant', description: "/RAM Coach : les séances de mes groupes d'entraînement dans tous les clubs où j'enseigne (ou un seul), avec thème, appel et cours annulés.",
      inputSchema: S(Object.assign({ du: { type: 'string', description: 'Date de début AAAA-MM-JJ (aujourd’hui par défaut).' }, au: { type: 'string', description: 'Date de fin AAAA-MM-JJ (7 jours plus tard par défaut).' } }, clubArg)),
      run: async (u, a) => {
        const from = a.du || today(), to = a.au || addDays(from, 6), out = [];
        const cl = a.club ? [await pickClub(u, a.club)] : (await clubsOf(u)).filter(teaching);
        for (const c of cl) {
          const K = await content(u, c);
          sessions(K, K.me.key, from, to, true).forEach(x => out.push({ date: x.d, jour: DAYS[dowOf(x.d)], heure: x.g.h, duree: x.g.dur, groupe: x.g.name, club: c.nom, sport: x.g.sport, theme: x.s.theme || '', eleves: (x.g.mem || []).length + (x.g.ext || []).length,
            presents: x.appel ? x.presents : undefined, annule: x.annule || undefined, bilan: x.s.recap ? strip(x.s.recap).slice(0, 300) : undefined }));
        }
        return { du: from, au: to, seances: out.sort((x, y) => x.date.localeCompare(y.date) || String(x.heure).localeCompare(String(y.heure))) };
      } },
    { name: 'coach_eleves', title: 'Mes élèves', description: "/RAM Coach : mes élèves (ceux de mes groupes et les fiches suivies) dans tous mes clubs, avec club, groupes, sport et niveau.",
      inputSchema: S(Object.assign({ recherche: { type: 'string', description: 'Partie du nom (facultatif).' } }, clubArg)),
      run: async (u, a) => {
        const cl = a.club ? [await pickClub(u, a.club)] : (await clubsOf(u)).filter(teaching), out = [], q = String(a.recherche || '').toLowerCase();
        for (const c of cl) {
          const K = await content(u, c), gs = Object.values(K.get('group')).filter(g => g.type === 'train' && !g.old && g.coach === K.me.key), ids = new Set();
          gs.forEach(g => (g.mem || []).concat(g.ext || []).forEach(k => ids.add(k)));
          Object.keys(K.get('eleve')).forEach(k => ids.add(k));
          ids.forEach(k => {
            const e = K.get('eleve')[k] || {}, n = K.nm(k);
            if (q && !n.toLowerCase().includes(q)) return;
            out.push({ id: k, nom: n, club: c.nom, club_id: c.id, groupes: gs.filter(g => (g.mem || []).concat(g.ext || []).includes(k)).map(g => g.name), sport: e.sport || undefined, niveau: e.lvl || undefined, sans_compte: !K.get('member')[k] || undefined });
          });
        }
        return { eleves: out.sort((x, y) => x.nom.localeCompare(y.nom)) };
      } },
    { name: 'coach_eleve', title: 'Fiche d’un élève', description: "/RAM Coach : la fiche d'un élève (niveau, main, objectifs, note privée, parents, grille technique), son historique de séances et son suivi (bilans, messages, analyses vidéo). Ids depuis coach_eleves.",
      inputSchema: S({ eleve_id: { type: 'string', description: 'Identifiant de l’élève (coach_eleves).' }, club: { type: 'string', description: 'Identifiant du club de l’élève (club_id de coach_eleves).' } }, ['eleve_id', 'club']),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), k = String(a.eleve_id);
        if (!teaching(c)) throw new Error('Réservé aux enseignants et au bureau du club.');
        const e = K.get('eleve')[k] || {}, hist = Object.entries(K.get('seance')).filter(([, s]) => s.pres && s.pres[k]).sort((x, y) => y[1].d.localeCompare(x[1].d));
        const suivi = Object.values(K.get('suivi')).filter(x => x.to === k).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 30);
        return { nom: K.nm(k), club: c.nom, sport: e.sport, niveau: e.lvl, main: e.hand === 'G' ? 'gaucher' : e.hand === 'D' ? 'droitier' : undefined, cote: e.side || undefined, objectifs: e.goals || undefined, note_privee: e.note || undefined,
          parents: (e.parents || []).map(p => ({ nom: p.n, tel: p.tel, mail: p.mail })), grille_technique: e.tech || undefined, evolution_niveau: e.lvlH || undefined,
          historique: hist.slice(0, 40).map(([, s]) => ({ date: s.d, groupe: (K.get('group')[s.g] || {}).name, theme: s.theme || '', presence: { P: 'présent', E: 'excusé', A: 'absent' }[s.pres[k]] })),
          suivi: suivi.map(x => ({ date: x.at ? new Date(x.at).toISOString().slice(0, 10) : '', de: K.nm(x.by), type: { msg: 'message', bilan: 'bilan de séance', video: x.re ? 'analyse vidéo' : 'vidéo', contenu: 'contenu' }[x.k] || x.k, texte: strip(x.txt).slice(0, 500), lien: x.url || undefined })) };
      } },
    { name: 'coach_statistiques', title: 'Mes statistiques d’enseignant', description: "/RAM Coach : heures données, séances, chiffre d'affaires (selon le tarif de chaque groupe), présence, par club et par groupe, sur une période.",
      inputSchema: S(Object.assign({ du: { type: 'string', description: 'Date de début AAAA-MM-JJ (début de la saison par défaut).' }, au: { type: 'string', description: 'Date de fin AAAA-MM-JJ (aujourd’hui par défaut).' } }, clubArg)),
      run: async (u, a) => {
        const t = today(), from = a.du || (+t.slice(5, 7) >= 9 ? t.slice(0, 4) : +t.slice(0, 4) - 1) + '-09-01', to = a.au || t;
        const cl = a.club ? [await pickClub(u, a.club)] : (await clubsOf(u)).filter(teaching), rows = [];
        for (const c of cl) { const K = await content(u, c); sessions(K, K.me.key, from, to, true).filter(x => !x.annule).forEach(x => rows.push(Object.assign(x, { club: c.nom }))); }
        const fig = l => { const called = l.filter(x => x.appel); const att = called.reduce((s, x) => s + x.appel, 0), p = called.reduce((s, x) => s + x.presents, 0);
          return { seances: l.length, heures: Math.round(l.reduce((s, x) => s + durMin(x.g.dur), 0) / 6) / 10, chiffre_affaires_eur: Math.round(l.reduce((s, x) => s + x.eur, 0)), presence_pct: att ? Math.round((p * 100) / att) : null }; };
        const by = key => Object.entries(rows.reduce((o, x) => ((o[key(x)] = o[key(x)] || []).push(x), o), {})).map(([k, l]) => Object.assign({ nom: k }, fig(l)));
        return { du: from, au: to, total: fig(rows), par_club: by(x => x.club), par_groupe: by(x => x.g.name + ' · ' + x.club) };
      } }
  ];

  /* ---------- outils d'écriture /RAM Coach (jeton « ram.ecriture » ; Claude demande confirmation) ----------
     Toutes les écritures passent par ram.ops : les droits du club s'appliquent (enseignant ou bureau). */
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const rid = p => p + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  const hour = h => { const m = String(h || '').match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i); return m ? `${+m[1]} h${m[2] && m[2] !== '00' ? ' ' + m[2] : ''}` : ''; };
  const dur = d => { const n = durMin(d) || 60; return n % 60 ? (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60}` : `${n} min`) : `${n / 60} h`; };
  async function teach(u, club) {
    const c = await pickClub(u, club);
    if (!teaching(c)) throw new Error(`Dans ${c.nom}, ce compte n'est ni enseignant ni au bureau : demander le rôle d'enseignant au bureau du club.`);
    return c;
  }
  async function write(u, c, ops) {
    const r = await ram.ops(u.id, c.id, ops);
    if (r && r.rejected && r.rejected.length) throw new Error('Refusé par le club : ' + r.rejected.map(x => x.error).join(' ; '));
    return r;
  }
  const findMember = (K, nom, email) => {
    const n = String(nom || '').trim().toLowerCase(), e = String(email || '').trim().toLowerCase();
    return Object.entries(K.get('member')).find(([, m]) => (n && String(m.n || '').trim().toLowerCase() === n) || (e && String(m.mail || '').toLowerCase() === e));
  };
  async function scaleOf(u, sport) { const sc = await Echelles.get(store, u.id); return sc[sport === 'Tennis' ? 'Tennis' : 'Padel']; }
  const grpOf = (K, id) => { const g = K.get('group')[id]; if (!g || g.type !== 'train') throw new Error('Groupe introuvable (identifiant donné par club_groupes ou coach_planning).'); return g; };
  const WRITE = [
    { name: 'coach_creer_groupe', title: 'Créer un groupe ou une séance', description: "/RAM Coach : crée un groupe d'entraînement chaque semaine (jour + heure) ou une séance ponctuelle (date + heure, par exemple un cours individuel réservé sur Calendly) dans un de mes clubs, avec moi comme enseignant. La discussion du groupe est créée dans /RAM Club.",
      inputSchema: S(Object.assign({ nom: { type: 'string' }, sport: { type: 'string', enum: ['Padel', 'Tennis'] }, jour: { type: 'string', enum: JOURS, description: 'Pour un groupe chaque semaine.' }, date: { type: 'string', description: 'AAAA-MM-JJ, pour une séance ponctuelle.' },
        heure: { type: 'string', description: 'Par exemple 18 h 30 ou 18:30.' }, duree: { type: 'string', description: 'Par exemple 1 h 30 ou 90 min (1 h par défaut).' }, lieu: { type: 'string', enum: ['Extérieur', 'En salle'] }, places: { type: 'integer', minimum: 1, maximum: 60 },
        tarif_mode: { type: 'string', enum: ['seance', 'heure', 'eleve'], description: 'Par séance, à l’heure ou par élève présent.' }, tarif_prix: { type: 'number', minimum: 0 }, eleves: { type: 'array', items: { type: 'string' }, description: 'Identifiants d’élèves à inscrire (coach_eleves).' },
        debut: { type: 'string', description: 'AAAA-MM-JJ : première séance d’un groupe chaque semaine (par défaut : la prochaine date de ce jour).' }, fin: { type: 'string', description: 'AAAA-MM-JJ : dernière séance (un cycle) ; sans fin par défaut.' } }, clubArg), ['nom', 'sport', 'heure']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), id = rid('g'), h = hour(a.heure);
        if (!h) throw new Error('Heure illisible : écrire par exemple 18 h 30.');
        if (!a.date && !a.jour) throw new Error('Donner le jour (groupe chaque semaine) ou la date (séance ponctuelle).');
        if (a.date && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error('Date au format AAAA-MM-JJ.');
        const day = a.date ? dowOf(a.date) : JOURS.indexOf(a.jour), mem = [], ext = [];
        (a.eleves || []).forEach(k => (K.get('member')[k] ? mem : ext).push(k));
        const g = { type: 'train', name: String(a.nom).slice(0, 60), sport: a.sport, day, h, dur: dur(a.duree || '1 h'), defLoc: a.lieu || 'Extérieur', coach: K.me.key, mem, ext,
          sub: `${a.date ? a.date.split('-').reverse().join('/') : JOURS[day]} ${h} · ${dur(a.duree || '1 h')}`, tarif: { mode: a.tarif_mode || 'seance', prix: +a.tarif_prix || 0 }, at: Date.now() };
        if (a.date) g.once = a.date;
        else {
          // un groupe commence à sa première séance : jamais d'historique de séances qui n'ont pas eu lieu
          for (const k of ['debut', 'fin']) if (a[k] && !/^\d{4}-\d{2}-\d{2}$/.test(a[k])) throw new Error('Date au format AAAA-MM-JJ.');
          let d0 = a.debut || today();
          if (!a.debut) while (dowOf(d0) !== day) d0 = addDays(d0, 1);
          g.from = d0;
          if (a.fin) g.to = a.fin;
        }
        if (a.places) g.max = a.places;
        // un groupe a sa discussion dans /RAM Club ; une séance ponctuelle (cours individuel) n'en a pas
        await write(u, c, [{ coll: 'group', id, op: 'put', data: g }].concat(a.date ? [] : [{ coll: 'chan', id, op: 'put', data: { g: 'train', sport: a.sport, name: g.name, desc: g.sub, kid: 0, at: Date.now() } }]));
        return { cree: true, groupe_id: id, club: c.nom, nom: g.name, creneau: g.sub, eleves: mem.length + ext.length };
      } },
    { name: 'coach_ajouter_eleve', title: 'Ajouter un élève', description: "/RAM Coach : ajoute un élève dans un de mes clubs. S'il est déjà adhérent du club dans /RAM Club (même nom ou même e-mail), sa fiche élève est reliée à son compte ; sinon il est créé « sans compte » (il retrouvera tout en créant son compte). Peut l'inscrire tout de suite dans un groupe.",
      inputSchema: S(Object.assign({ prenom: { type: 'string' }, nom: { type: 'string' }, email: { type: 'string' }, telephone: { type: 'string' }, naissance: { type: 'string', description: 'AAAA-MM-JJ' }, sport: { type: 'string', enum: ['Padel', 'Tennis'] },
        niveau: { type: 'integer', minimum: 1, description: 'Rang dans mon échelle de ce sport (coach_echelles).' }, groupe_id: { type: 'string' }, parent_nom: { type: 'string' }, parent_telephone: { type: 'string' }, parent_email: { type: 'string' }, objectifs: { type: 'string' } }, clubArg), ['prenom', 'nom']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), full = `${String(a.prenom).trim()} ${String(a.nom).trim()}`.trim(), hit = findMember(K, full, a.email);
        const id = hit ? hit[0] : rid('e'), old = K.get('eleve')[id] || {};
        const e = Object.assign({}, old, { n: hit ? hit[1].n : full, sport: a.sport || old.sport || 'Padel' });
        if (a.email) e.mail = String(a.email).trim();
        if (a.telephone) e.tel = String(a.telephone).trim();
        if (a.naissance) e.bd = String(a.naissance).trim();
        if (a.objectifs) e.goals = String(a.objectifs).slice(0, 400);
        if (a.parent_nom || a.parent_telephone || a.parent_email) e.parents = [{ n: a.parent_nom || '', tel: a.parent_telephone || '', mail: a.parent_email || '' }];
        if (a.niveau) { e.lvl = a.niveau; e.lvlH = (e.lvlH || []).concat({ d: today(), lvl: a.niveau }); }
        const ops = [{ coll: 'eleve', id, op: 'put', data: e }];
        if (a.groupe_id) {
          const g = grpOf(K, a.groupe_id);
          ops.push({ coll: 'group', id: a.groupe_id, op: 'patch', patch: [{ p: [hit ? 'mem' : 'ext'], t: 'add', v: id }] });
          if (!g) throw new Error('Groupe introuvable.');
        }
        await write(u, c, ops);
        return { eleve_id: id, club: c.nom, nom: e.n, compte_ram_club: !!hit, inscrit_au_groupe: a.groupe_id || undefined };
      } },
    { name: 'coach_importer_eleves', title: 'Importer une liste d’élèves', description: "/RAM Coach : ajoute d'un coup une liste d'élèves dans un de mes clubs (par exemple les clients d'une boutique, d'un fichier, d'un agenda). Une seule confirmation pour toute la liste. Un élève déjà adhérent du club dans /RAM Club (même nom ou même e-mail) est relié à son compte ; un élève déjà présent dans mes fiches (même e-mail ou même nom) est complété, pas créé deux fois ; les autres sont créés « sans compte ».",
      inputSchema: S(Object.assign({ eleves: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'object', properties: { prenom: { type: 'string' }, nom: { type: 'string' }, email: { type: 'string' }, telephone: { type: 'string' }, naissance: { type: 'string', description: 'AAAA-MM-JJ' }, sport: { type: 'string', enum: ['Padel', 'Tennis'] }, note: { type: 'string', description: 'Note privée, par exemple les cours achetés.' } }, required: ['prenom', 'nom'] } },
        groupe_id: { type: 'string', description: 'Inscrire aussi tous ces élèves dans ce groupe (facultatif).' } }, clubArg), ['eleves']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), ops = [], out = { cree: 0, relie_au_compte: 0, complete: 0 }, fiches = K.get('eleve');
        if (a.groupe_id) grpOf(K, a.groupe_id);
        const low = s => String(s || '').trim().toLowerCase(), seen = new Set(), inList = new Map();   // doublons dans la liste elle-même
        for (const x of a.eleves) {
          const full = `${String(x.prenom).trim()} ${String(x.nom).trim()}`.trim(), mail = low(x.email);
          const hit = findMember(K, full, x.email),
            known = !hit && Object.entries(fiches).find(([, e]) => (mail && low(e.mail) === mail) || low(e.n) === low(full));
          const id = hit ? hit[0] : known ? known[0] : inList.get(low(full)) || (mail && inList.get(mail)) || rid('e');
          inList.set(low(full), id);
          if (mail) inList.set(mail, id);
          if (seen.has(id)) continue;
          seen.add(id);
          const e = Object.assign({ sport: 'Padel', parents: [] }, fiches[id] || {}, { n: hit ? hit[1].n : (fiches[id] && fiches[id].n) || full });
          if (x.sport) e.sport = x.sport;
          if (x.email && !e.mail) e.mail = String(x.email).trim();
          if (x.telephone && !e.tel) e.tel = String(x.telephone).trim();
          if (x.naissance && !e.bd) e.bd = String(x.naissance).trim();
          if (x.note) e.note = e.note && !e.note.includes(x.note) ? e.note + '\n' + String(x.note).slice(0, 400) : String(x.note).slice(0, 400);
          ops.push({ coll: 'eleve', id, op: 'put', data: e });
          if (a.groupe_id) ops.push({ coll: 'group', id: a.groupe_id, op: 'patch', patch: [{ p: [hit ? 'mem' : 'ext'], t: 'add', v: id }] });
          out[hit ? 'relie_au_compte' : known ? 'complete' : 'cree']++;
        }
        for (let i = 0; i < ops.length; i += 100) await write(u, c, ops.slice(i, i + 100));
        return Object.assign({ club: c.nom, eleves: seen.size }, out);
      } },
    { name: 'coach_importer_seances', title: 'Importer un historique de séances', description: "/RAM Coach : enregistre d'un coup des séances passées (par exemple les cours d'un agenda ou d'une boutique) dans un de mes clubs, avec les élèves présents : elles remplissent l'historique de chaque élève, le planning et les statistiques. Une séance sans groupe_id devient une séance ponctuelle (cours individuel, duo…) ; avec groupe_id, elle est notée à cette date dans ce groupe chaque semaine. Une séance déjà importée (même date, même heure, même nom) n'est pas recréée. Une seule confirmation pour toute la liste.",
      inputSchema: S(Object.assign({ seances: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'object', properties: {
        date: { type: 'string', description: 'AAAA-MM-JJ' }, heure: { type: 'string', description: 'Par exemple 18 h 30 ou 18:30.' }, duree: { type: 'string', description: 'Par exemple 1 h 30 ou 90 min (1 h par défaut).' },
        nom: { type: 'string', description: 'Pour une séance ponctuelle, par exemple « Cours individuel » ou « Cours duo ».' }, groupe_id: { type: 'string', description: 'Groupe chaque semaine dans lequel noter la séance (facultatif).' },
        eleves: { type: 'array', items: { type: 'string' }, description: 'Élèves présents : identifiant (coach_eleves), e-mail ou « Prénom Nom ».' }, theme: { type: 'string' }, tarif_prix: { type: 'number', minimum: 0, description: 'Prix de la séance en euros, pour les statistiques.' } }, required: ['date', 'eleves'] } },
        sport: { type: 'string', enum: ['Padel', 'Tennis'] } }, clubArg), ['seances']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), fiches = K.get('eleve'), groups = K.get('group'), ops = [], out = { creees: 0, notees_dans_un_groupe: 0, deja_la: 0, eleves_introuvables: [] };
        const low = s => String(s || '').trim().toLowerCase();
        const who = s => {   // identifiant, e-mail ou nom → clé d'élève
          if (fiches[s] || K.get('member')[s]) return s;
          const hit = findMember(K, s, s);
          if (hit) return hit[0];
          const f = Object.entries(fiches).find(([, e]) => low(e.mail) === low(s) || low(e.n) === low(s));
          return f ? f[0] : null;
        };
        for (const x of a.seances) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) throw new Error(`Date au format AAAA-MM-JJ : « ${x.date} ».`);
          const keys = [];
          for (const s of x.eleves || []) { const k = who(String(s).trim()); if (k) keys.includes(k) || keys.push(k); else out.eleves_introuvables.includes(s) || out.eleves_introuvables.push(s); }
          if (!keys.length) continue;
          const pres = Object.fromEntries(keys.map(k => [k, 'P'])), extra = { pres };
          if (x.theme) extra.theme = String(x.theme).slice(0, 120);
          let gid = x.groupe_id;
          if (gid) { grpOf(K, gid); out.notees_dans_un_groupe++; }
          else {
            const h = hour(x.heure), name = String(x.nom || (keys.length > 1 ? 'Cours collectif' : 'Cours individuel')).slice(0, 60);
            if (!h) throw new Error(`Heure illisible le ${x.date} : écrire par exemple 18 h 30.`);
            const same = Object.entries(groups).find(([, g]) => g.once === x.date && g.h === h && g.name === name);
            if (same) { out.deja_la++; continue; }
            gid = rid('g');
            const mem = keys.filter(k => K.get('member')[k]), ext = keys.filter(k => !K.get('member')[k]);
            const g = { type: 'train', name, sport: a.sport || 'Padel', day: dowOf(x.date), h, dur: dur(x.duree || '1 h'), defLoc: 'Extérieur', coach: K.me.key, mem, ext, once: x.date,
              sub: `${x.date.split('-').reverse().join('/')} ${h} · ${dur(x.duree || '1 h')}`, tarif: { mode: 'seance', prix: +x.tarif_prix || 0 }, at: Date.now() };
            groups[gid] = g;
            ops.push({ coll: 'group', id: gid, op: 'put', data: g });
            out.creees++;
          }
          ops.push({ coll: 'seance', id: gid + '.' + x.date, op: 'put', data: Object.assign({}, K.get('seance')[gid + '.' + x.date] || {}, { g: gid, d: x.date }, extra) });
        }
        for (let i = 0; i < ops.length; i += 100) await write(u, c, ops.slice(i, i + 100));
        if (!out.eleves_introuvables.length) delete out.eleves_introuvables;
        return Object.assign({ club: c.nom }, out);
      } },
    { name: 'coach_regrouper_seances', title: 'Regrouper des séances en un groupe', description: "/RAM Coach : rassemble des séances ponctuelles qui portent le même nom (par exemple les 10 séances importées d'un cycle) en un seul groupe chaque semaine, avec sa discussion dans /RAM Club. Le groupe garde l'historique et les présences de chaque séance ; le jour, l'heure et la durée sont ceux de la majorité des séances, les séances déplacées restent à leur date. Un cycle fini devient un « cycle terminé » ; en_cours garde le groupe ouvert pour la suite.",
      inputSchema: S(Object.assign({ nom_des_seances: { type: 'string', description: 'Nom exact des séances à rassembler (coach_planning).' }, nom_du_groupe: { type: 'string', description: 'Par défaut, le même nom.' },
        du: { type: 'string', description: 'AAAA-MM-JJ (facultatif).' }, au: { type: 'string', description: 'AAAA-MM-JJ (facultatif).' },
        eleves: { type: 'array', items: { type: 'string' }, description: 'Les élèves du groupe : identifiant, e-mail ou « Prénom Nom ». Par défaut : ceux présents à au moins la moitié des séances (les autres restent dans l’historique des séances où ils sont venus).' },
        avec: { type: 'string', description: 'Seulement les séances où cet élève était (identifiant, e-mail ou « Prénom Nom ») : pour un duo parmi d’autres cours duo.' },
        en_cours: { type: 'boolean', description: 'Le groupe continue après la dernière séance.' } }, clubArg), ['nom_des_seances']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), groups = K.get('group'), ses = K.get('seance'), fiches = K.get('eleve'), low = s => String(s || '').trim().toLowerCase();
        const keyOf = s => { s = String(s).trim(); if (fiches[s] || K.get('member')[s]) return s; const hit = findMember(K, s, s); if (hit) return hit[0]; const f = Object.entries(fiches).find(([, e]) => low(e.mail) === low(s) || low(e.n) === low(s)); return f ? f[0] : null; };
        const avec = a.avec ? keyOf(a.avec) : null;
        if (a.avec && !avec) throw new Error('Élève introuvable : ' + a.avec);
        const l = Object.entries(groups).filter(([gid, g]) => g.type === 'train' && g.once && g.name === a.nom_des_seances && g.coach === K.me.key && (!a.du || g.once >= a.du) && (!a.au || g.once <= a.au)
            && (!avec || [...(g.mem || []), ...(g.ext || [])].includes(avec) || ((ses[gid + '.' + g.once] || {}).pres || {})[avec]))
          .sort((x, y) => x[1].once.localeCompare(y[1].once));
        if (!l.length) throw new Error(`Aucune séance ponctuelle nommée « ${a.nom_des_seances} » dans ${c.nom}.`);
        const top = f => { const n = {}; l.forEach(([, g]) => (n[f(g)] = (n[f(g)] || 0) + 1)); return Object.keys(n).sort((x, y) => n[y] - n[x])[0]; };
        const day = +top(g => g.day), h = top(g => g.h), du = top(g => g.dur), dates = l.map(([, g]) => g.once), from = dates[0], to = dates[dates.length - 1];
        const presOf = ([gid, g]) => { const p = (ses[gid + '.' + g.once] || {}).pres; return p ? Object.keys(p).filter(k => p[k] === 'P') : [...(g.mem || []), ...(g.ext || [])]; };
        let keys;
        if (a.eleves && a.eleves.length) {
          keys = a.eleves.map(keyOf);
          if (keys.includes(null)) throw new Error('Élève introuvable : ' + a.eleves.filter((s, i) => !keys[i]).join(', '));
        } else {
          const n = {};
          l.forEach(x => presOf(x).forEach(k => (n[k] = (n[k] || 0) + 1)));
          keys = Object.keys(n).filter(k => n[k] * 2 >= l.length);
        }
        // une semaine sur deux : toutes les séances du jour habituel sont espacées de 2 semaines
        const onDay = dates.filter(d => dowOf(d) === day), every = onDay.length > 1 && onDay.every((d, i) => !i || Math.round((Date.parse(d) - Date.parse(onDay[i - 1])) / 6048e5) % 2 === 0) ? 2 : 1;
        const extra = dates.filter(d => dowOf(d) !== day), skip = [];
        for (let d = from; d <= to; d = addDays(d, 1)) if (dowOf(d) === day && !dates.includes(d) && Math.round((Date.parse(d) - Date.parse(from)) / 6048e5) % every === 0) skip.push(d);
        const gid = rid('g'), name = String(a.nom_du_groupe || a.nom_des_seances).slice(0, 60), g0 = l[0][1];
        const g = { type: 'train', name, sport: g0.sport || 'Padel', day, h, dur: du, defLoc: g0.defLoc || 'Extérieur', coach: K.me.key, mem: keys.filter(k => K.get('member')[k]), ext: keys.filter(k => !K.get('member')[k]),
          from, extra, skip, sub: `${JOURS[day]}${every > 1 ? ' (une semaine sur deux)' : ''} ${h} · ${du}`, tarif: g0.tarif || { mode: 'seance', prix: 0 }, at: Date.now() };
        if (!a.en_cours) g.to = to;
        if (every > 1) g.every = every;
        const ops = [{ coll: 'group', id: gid, op: 'put', data: g }, { coll: 'chan', id: gid, op: 'put', data: { g: 'train', sport: g.sport, name, desc: g.sub, kid: 0, at: Date.now() } }];
        for (const [oid, og] of l) {
          const old = ses[oid + '.' + og.once];
          ops.push({ coll: 'seance', id: gid + '.' + og.once, op: 'put', data: Object.assign({}, old || { pres: Object.fromEntries(presOf([oid, og]).map(k => [k, 'P'])) }, { g: gid, d: og.once }) });
          if (old) ops.push({ coll: 'seance', id: oid + '.' + og.once, op: 'del' });
          ops.push({ coll: 'group', id: oid, op: 'del' });
        }
        for (let i = 0; i < ops.length; i += 100) await write(u, c, ops.slice(i, i + 100));
        return { club: c.nom, groupe_id: gid, nom: name, seances: l.length, du: from, au: a.en_cours ? 'en cours' : to, creneau: g.sub, une_semaine_sur_deux: every > 1, eleves: keys.map(k => K.nm(k)), seances_deplacees: extra.length, semaines_sans_seance: skip.length };
      } },
    { name: 'coach_noter_achats', title: 'Noter des achats d’élèves', description: "/RAM Coach : note dans la fiche de mes élèves ce qu'ils ont acheté (par exemple les commandes d'une boutique) : une séance d'une formule, un pack de séances ou un abonnement (coach_formules). Les séances d'un pack se décomptent ensuite toutes seules dans /RAM Coach. Un achat déjà noté (même élève, même produit, même date) n'est pas noté deux fois. Une seule confirmation pour toute la liste.",
      inputSchema: S(Object.assign({ achats: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'object', properties: {
        eleve: { type: 'string', description: 'Identifiant (coach_eleves), e-mail ou « Prénom Nom ».' }, produit: { type: 'string', description: 'Identifiant ou nom exact d’une formule, d’un pack ou d’un abonnement (coach_formules).' },
        date: { type: 'string', description: 'AAAA-MM-JJ' }, prix: { type: 'number', minimum: 0, description: 'Prix payé (par défaut : celui du produit).' }, note: { type: 'string' } }, required: ['eleve', 'produit', 'date'] } } }, clubArg), ['achats']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), fiches = K.get('eleve'), O = await Formules.get(store, u.id), low = s => String(s || '').trim().toLowerCase();
        const who = s => { s = String(s).trim(); if (fiches[s] || K.get('member')[s]) return s; const hit = findMember(K, s, s); if (hit) return hit[0]; const f = Object.entries(fiches).find(([, e]) => low(e.mail) === low(s) || low(e.n) === low(s)); return f ? f[0] : null; };
        const prod = p => {
          const x = low(p), pk = O.packs.find(v => low(v.id) === x || low(v.nom) === x), ab = !pk && O.abos.find(v => low(v.id) === x || low(v.nom) === x), fo = !pk && !ab && O.formules.find(v => low(v.id) === x || low(v.nom) === x);
          return pk ? { t: 'pack', o: pk, n: pk.seances, prix: pk.prix, nom: pk.nom || 'Pack ' + pk.seances + ' séances' } : ab ? { t: 'abo', o: ab, prix: ab.prix, nom: ab.nom } : fo ? { t: 'seance', o: fo, prix: fo.prix, nom: fo.nom } : null;
        };
        const touched = {}, out = { notes: 0, deja_notes: 0, eleves_introuvables: [], produits_inconnus: [] };
        for (const x of a.achats) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) throw new Error(`Date au format AAAA-MM-JJ : « ${x.date} ».`);
          const k = who(x.eleve), p = prod(x.produit);
          if (!k) { out.eleves_introuvables.includes(x.eleve) || out.eleves_introuvables.push(x.eleve); continue; }
          if (!p) { out.produits_inconnus.includes(x.produit) || out.produits_inconnus.push(x.produit); continue; }
          const e = touched[k] || (touched[k] = Object.assign({ n: K.nm(k), sport: 'Padel', parents: [] }, fiches[k] || {}));
          e.achats = e.achats || [];
          if (e.achats.some(h => h.ref === p.o.id && h.d === x.date)) { out.deja_notes++; continue; }
          const h = { id: rid('h'), t: p.t, ref: p.o.id, d: x.date, nom: p.nom, prix: x.prix != null ? +x.prix : p.prix };
          if (p.t === 'pack') h.n = p.n;
          if (p.t === 'abo') { const m = { mois: 1, trimestre: 3, '6 mois': 6, an: 12 }[p.o.periode] * (p.o.duree || 1), [y, mo, d] = x.date.split('-').map(Number); h.fin = new Date(Date.UTC(y, mo - 1 + m, d - 1)).toISOString().slice(0, 10); }
          if (x.note) h.note = String(x.note).slice(0, 120);
          e.achats.push(h);
          out.notes++;
        }
        const ops = Object.entries(touched).map(([k, e]) => ({ coll: 'eleve', id: k, op: 'put', data: e }));
        for (let i = 0; i < ops.length; i += 100) await write(u, c, ops.slice(i, i + 100));
        ['eleves_introuvables', 'produits_inconnus'].forEach(k => out[k].length || delete out[k]);
        return Object.assign({ club: c.nom, eleves: ops.length }, out);
      } },
    { name: 'coach_modifier_groupe', title: 'Modifier un groupe', description: "/RAM Coach : modifie un de mes groupes chaque semaine : nom, places, première et dernière séance (un cycle), séances ajoutées hors du créneau, séances retirées (date déplacée), périodes sans cours (vacances scolaires). Les séances retirées ou d'avant la première date disparaissent du planning, de l'Agenda et de l'historique.",
      inputSchema: S(Object.assign({ groupe_id: { type: 'string' }, nom: { type: 'string' }, places: { type: 'integer', minimum: 1, maximum: 60 }, debut: { type: 'string', description: 'AAAA-MM-JJ : première séance.' },
        fin: { type: 'string', description: 'AAAA-MM-JJ : dernière séance (cycle).' }, sans_fin: { type: 'boolean', description: 'Le groupe continue chaque semaine (retire la dernière séance).' },
        ajouter_dates: { type: 'array', items: { type: 'string' }, description: 'AAAA-MM-JJ : séances en plus.' }, retirer_dates: { type: 'array', items: { type: 'string' }, description: 'AAAA-MM-JJ : séances retirées.' },
        periodes_sans_cours: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, du: { type: 'string' }, au: { type: 'string' } }, required: ['du', 'au'] }, description: 'Vacances scolaires, fermeture du club : pas de séance du … au … (inclus).' } }, clubArg), ['groupe_id']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = grpOf(K, a.groupe_id), set = [], iso = /^\d{4}-\d{2}-\d{2}$/;
        if (g.once) throw new Error('Une séance ponctuelle n’a pas de dates à régler.');
        for (const d of [a.debut, a.fin].concat(a.ajouter_dates || [], a.retirer_dates || [], ...(a.periodes_sans_cours || []).map(o => [o.du, o.au]))) if (d && !iso.test(d)) throw new Error('Date au format AAAA-MM-JJ : ' + d);
        if ((a.periodes_sans_cours || []).some(o => !o.du || !o.au || o.au < o.du)) throw new Error('Une période sans cours va du … au … (fin après le début).');
        if (a.nom) set.push({ p: ['name'], t: 'set', v: String(a.nom).slice(0, 60) });
        if (a.places) set.push({ p: ['max'], t: 'set', v: a.places });
        if (a.debut) set.push({ p: ['from'], t: 'set', v: a.debut });
        if (a.fin) set.push({ p: ['to'], t: 'set', v: a.fin });
        else if (a.sans_fin && g.to) set.push({ p: ['to'], t: 'unset' });
        const extra = g.extra || [], skip = g.skip || [];
        (a.ajouter_dates || []).forEach(d => { if (skip.includes(d)) set.push({ p: ['skip'], t: 'rm', v: d }); if (!extra.includes(d)) set.push({ p: ['extra'], t: 'add', v: d }); });
        (a.retirer_dates || []).forEach(d => { if (extra.includes(d)) set.push({ p: ['extra'], t: 'rm', v: d }); if (!skip.includes(d)) set.push({ p: ['skip'], t: 'add', v: d }); });
        if ((a.periodes_sans_cours || []).length) {
          const off = (g.off || []).filter(o => !a.periodes_sans_cours.some(n => n.du === o.du && n.au === o.au));
          set.push({ p: ['off'], t: 'set', v: off.concat(a.periodes_sans_cours.map(o => ({ nom: String(o.nom || '').slice(0, 60), du: o.du, au: o.au }))) });
        }
        if (!set.length) throw new Error('Rien à modifier.');
        await write(u, c, [{ coll: 'group', id: a.groupe_id, op: 'patch', patch: set }]);
        const after = Object.assign({}, g);
        set.forEach(o => { const k = o.p[0]; if (o.t === 'set') after[k] = o.v; else if (o.t === 'unset') delete after[k]; else if (o.t === 'add') after[k] = (after[k] || []).concat(o.v); else after[k] = (after[k] || []).filter(x => x !== o.v); });
        const from = after.from || today(), up = [];
        for (let d = today(); d <= (after.to || addDays(today(), 120)) && up.length < 60; d = addDays(d, 1)) if (trainOn(after, d)) up.push(d);
        return { groupe: after.name, club: c.nom, debut: after.from || null, fin: after.to || 'sans fin', prochaines_seances: up.slice(0, 12), seances_a_venir: up.length, premiere_seance: from };
      } },
    { name: 'coach_ajouter_au_groupe', title: 'Inscrire un élève dans un groupe', description: '/RAM Coach : inscrit un élève (adhérent ou fiche sans compte) dans un de mes groupes.',
      inputSchema: S(Object.assign({ eleve_id: { type: 'string' }, groupe_id: { type: 'string' } }, clubArg), ['eleve_id', 'groupe_id']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = grpOf(K, a.groupe_id), member = !!K.get('member')[a.eleve_id];
        if (!member && !K.get('eleve')[a.eleve_id]) throw new Error('Élève introuvable dans ce club.');
        await write(u, c, [{ coll: 'group', id: a.groupe_id, op: 'patch', patch: [{ p: [member ? 'mem' : 'ext'], t: 'add', v: a.eleve_id }] }]);
        return { inscrit: true, eleve: K.nm(a.eleve_id), groupe: g.name };
      } },
    { name: 'coach_envoyer_message', title: 'Envoyer un message à un élève', description: "/RAM Coach : envoie un message privé à un élève de la part de l'enseignant ; il le reçoit dans /RAM Club (École, Mon espace) avec une notification, et ses parents aussi pour un jeune.",
      inputSchema: S(Object.assign({ eleve_id: { type: 'string' }, texte: { type: 'string' } }, clubArg), ['eleve_id', 'texte']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c);
        if (!K.get('member')[a.eleve_id] && !K.get('eleve')[a.eleve_id]) throw new Error('Élève introuvable dans ce club.');
        await write(u, c, [{ coll: 'suivi', id: rid('sv'), op: 'put', data: { to: a.eleve_id, by: K.me.key, k: 'msg', txt: String(a.texte).slice(0, 4000), at: Date.now() } }]);
        return { envoye: true, a: K.nm(a.eleve_id), compte_ram_club: !!K.get('member')[a.eleve_id] };
      } },
    { name: 'coach_bilan_brouillon', title: 'Préparer un bilan de séance (brouillon)', description: "/RAM Coach : prépare le bilan d'une séance en BROUILLON : le texte pour tout le groupe et, si besoin, un commentaire personnel par élève. Rien n'est envoyé aux élèves : l'enseignant le relit et le publie lui-même dans /RAM Coach.",
      inputSchema: S(Object.assign({ groupe_id: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ de la séance.' }, bilan_groupe: { type: 'string' }, personnels: { type: 'object', additionalProperties: { type: 'string' }, description: '{ eleve_id: commentaire }' } }, clubArg), ['groupe_id', 'date', 'bilan_groupe']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = grpOf(K, a.groupe_id);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error('Date au format AAAA-MM-JJ.');
        const perso = {};
        Object.entries(a.personnels || {}).forEach(([k, v]) => { if (v) perso[k] = String(v).slice(0, 2000); });
        await write(u, c, [{ coll: 'brouillon', id: a.groupe_id + '.' + a.date, op: 'put', data: { g: a.groupe_id, d: a.date, recap: String(a.bilan_groupe).slice(0, 4000), perso, by: K.me.key, src: 'claude', at: Date.now() } }]);
        return { brouillon: true, groupe: g.name, date: a.date, a_publier: "Ouvrir la séance dans /RAM Coach, relire, puis « Publier le bilan aux élèves »." };
      } },
    { name: 'coach_niveau', title: 'Donner un niveau à un élève', description: "/RAM Coach : donne à un élève un niveau de mon échelle (padel ou tennis, voir coach_echelles). Le niveau est recopié dans sa fiche /RAM Club.",
      inputSchema: S(Object.assign({ eleve_id: { type: 'string' }, niveau: { type: 'integer', minimum: 1 }, sport: { type: 'string', enum: ['Padel', 'Tennis'], description: 'Par défaut le sport de sa fiche.' } }, clubArg), ['eleve_id', 'niveau']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), m = K.get('member')[a.eleve_id], e = Object.assign({}, K.get('eleve')[a.eleve_id] || { n: K.nm(a.eleve_id) });
        if (!m && !K.get('eleve')[a.eleve_id]) throw new Error('Élève introuvable dans ce club.');
        const sp = a.sport || e.sport || 'Padel', sc = await scaleOf(u, sp), l = sc.levels[a.niveau - 1];
        if (!l) throw new Error(`Mon échelle ${sp.toLowerCase()} a ${sc.levels.length} niveaux.`);
        Object.assign(e, { sport: sp, lvl: a.niveau, lvlH: (e.lvlH || []).filter(x => x.d !== today()).concat({ d: today(), lvl: a.niveau }) });
        const ops = [{ coll: 'eleve', id: a.eleve_id, op: 'put', data: e }];
        if (m) ops.push({ coll: 'member', id: a.eleve_id, op: 'patch', patch: [sp === 'Padel' ? { p: ['pl'], t: 'set', v: a.niveau } : { p: ['tn'], t: 'set', v: { n: a.niveau, t: l.t } }] });
        await write(u, c, ops);
        return { eleve: e.n, sport: sp, niveau: a.niveau, nom_du_niveau: l.t, fiche_ram_club: !!m };
      } },
    { name: 'coach_grille_technique', title: 'Évaluer la technique d’un élève', description: "/RAM Coach : met à jour la grille technique d'un élève (coup droit, revers, volée, bandeja…) : 1 à découvrir, 2 en cours, 3 acquis, 4 maîtrisé.",
      inputSchema: S(Object.assign({ eleve_id: { type: 'string' }, notes: { type: 'object', additionalProperties: { type: 'integer', minimum: 0, maximum: 4 }, description: '{ "Coup droit": 3, "Revers": 2 }' } }, clubArg), ['eleve_id', 'notes']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), e = Object.assign({}, K.get('eleve')[a.eleve_id] || { n: K.nm(a.eleve_id) });
        if (!K.get('member')[a.eleve_id] && !K.get('eleve')[a.eleve_id]) throw new Error('Élève introuvable dans ce club.');
        e.tech = Object.assign({}, e.tech || {});
        Object.entries(a.notes || {}).forEach(([k, v]) => { const n = Math.max(0, Math.min(4, Math.round(+v || 0))); if (n) e.tech[String(k).slice(0, 40)] = n; else delete e.tech[k]; });
        await write(u, c, [{ coll: 'eleve', id: a.eleve_id, op: 'put', data: e }]);
        return { eleve: e.n, grille: e.tech };
      } },
    { name: 'coach_fiche_eleve', title: 'Modifier la fiche d’un élève', description: "/RAM Coach : modifie la fiche d'un élève (sport, main, côté au padel, objectifs, note privée, coordonnées, parents). Seuls les champs donnés changent.",
      inputSchema: S(Object.assign({ eleve_id: { type: 'string' }, sport: { type: 'string', enum: ['Padel', 'Tennis'] }, main: { type: 'string', enum: ['droitier', 'gaucher'] }, cote: { type: 'string', enum: ['droite', 'gauche', 'les deux'] }, objectifs: { type: 'string' }, note_privee: { type: 'string' },
        email: { type: 'string' }, telephone: { type: 'string' }, naissance: { type: 'string' }, parent_nom: { type: 'string' }, parent_telephone: { type: 'string' }, parent_email: { type: 'string' } }, clubArg), ['eleve_id']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), e = Object.assign({}, K.get('eleve')[a.eleve_id] || { n: K.nm(a.eleve_id) });
        if (!K.get('member')[a.eleve_id] && !K.get('eleve')[a.eleve_id]) throw new Error('Élève introuvable dans ce club.');
        if (a.sport) e.sport = a.sport;
        if (a.main) e.hand = a.main === 'gaucher' ? 'G' : 'D';
        if (a.cote) e.side = { droite: 'D', gauche: 'G', 'les deux': '2' }[a.cote];
        if (a.objectifs != null) e.goals = String(a.objectifs).slice(0, 400);
        if (a.note_privee != null) e.note = String(a.note_privee).slice(0, 1000);
        if (a.email) e.mail = a.email;
        if (a.telephone) e.tel = a.telephone;
        if (a.naissance) e.bd = a.naissance;
        if (a.parent_nom || a.parent_telephone || a.parent_email) e.parents = [{ n: a.parent_nom || '', tel: a.parent_telephone || '', mail: a.parent_email || '' }];
        await write(u, c, [{ coll: 'eleve', id: a.eleve_id, op: 'put', data: e }]);
        return { eleve: e.n, fiche_mise_a_jour: true };
      } },
    { name: 'coach_modifier_formules', title: 'Modifier mes formules et tarifs', description: "/RAM Coach : remplace toutes mes formules, mes packs de séances et mes abonnements (lire d'abord coach_formules pour garder ce qui existe). Une formule : nom, joueurs, durée en minutes, prix à la séance ou par personne. Un pack : sa formule (id), nombre de séances, prix. Un abonnement : nom, formule (facultatif), prix par période, engagement (nombre de périodes), séances par semaine.",
      inputSchema: S({ formules: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nom: { type: 'string' }, sport: { type: 'string', enum: ['Padel', 'Tennis'] }, joueurs: { type: 'integer', minimum: 1 }, duree: { type: 'integer', description: 'En minutes.' }, prix: { type: 'number' }, par: { type: 'string', enum: ['seance', 'personne'] } }, required: ['nom', 'joueurs', 'duree', 'prix'] } },
        packs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, formule: { type: 'string' }, nom: { type: 'string' }, seances: { type: 'integer', minimum: 2 }, prix: { type: 'number' } }, required: ['formule', 'seances', 'prix'] } },
        abos: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nom: { type: 'string' }, formule: { type: 'string' }, periode: { type: 'string', enum: ['mois', 'trimestre', '6 mois', 'an'] }, duree: { type: 'integer', minimum: 1 }, prix: { type: 'number' }, parSemaine: { type: 'integer', minimum: 0 } }, required: ['nom', 'prix'] } } }, ['formules']),
      run: async (u, a) => {
        const o = await Formules.save(store, u.id, { formules: a.formules, packs: a.packs || [], abos: a.abos || [] });
        return { formules: o.formules.length, packs: o.packs.length, abonnements: o.abos.length };
      } },
    { name: 'coach_modifier_echelle', title: 'Modifier mon échelle de niveaux', description: "/RAM Coach : remplace mon échelle de niveaux d'un sport (padel ou tennis), du niveau 1 au dernier, avec pour chacun son nom, ses prérequis et ses attendus. Les niveaux déjà donnés gardent leur numéro.",
      inputSchema: S({ sport: { type: 'string', enum: ['Padel', 'Tennis'] }, nom: { type: 'string', description: 'Nom de l’échelle (facultatif).' },
        niveaux: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', properties: { nom: { type: 'string' }, prerequis: { type: 'array', items: { type: 'string' } }, attendus: { type: 'array', items: { type: 'string' } } }, required: ['nom'] } } }, ['sport', 'niveaux']),
      run: async (u, a) => {
        const sc = await Echelles.get(store, u.id);
        sc[a.sport] = { name: a.nom || sc[a.sport].name, levels: a.niveaux.map(l => ({ t: l.nom, pre: l.prerequis || [], att: l.attendus || [] })) };
        const out = await Echelles.save(store, u.id, sc);
        return { sport: a.sport, nom: out[a.sport].name, niveaux: out[a.sport].levels.map(l => `${l.n}. ${l.t}`) };
      } }
  ];
  WRITE.forEach(t => (t.write = true));
  TOOLS.push(
    { name: 'coach_echelles', title: 'Mes échelles de niveaux', description: "/RAM Coach : mes échelles de niveaux (padel et tennis) : numéro, nom, prérequis et attendus de chaque niveau.", inputSchema: S(),
      run: async u => await Echelles.get(store, u.id) },
    { name: 'coach_formules', title: 'Mes formules et tarifs', description: "/RAM Coach : mes formules (joueurs, durée, prix à la séance ou par personne), mes packs de séances (nombre de séances, prix, prix de la séance) et mes abonnements, avec leurs identifiants.", inputSchema: S(),
      run: async u => {
        const o = await Formules.get(store, u.id);
        return Object.assign({}, o, { packs: o.packs.map(p => Object.assign({ prix_de_la_seance: Math.round((p.prix / p.seances) * 100) / 100 }, p)) });
      } },
    ...WRITE
  );

  /* ---------- JSON-RPC ---------- */
  const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  async function rpc(u, m) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(m && m.id != null ? m.id : null, -32600, 'Requête invalide');
    if (m.id === undefined || m.id === null) return null;   // notification (initialized, cancelled…) : pas de réponse
    const p = m.params || {};
    if (m.method === 'initialize')
      return { jsonrpc: '2.0', id: m.id, result: { protocolVersion: PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0], capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ram', title: '/RAM', version: '1.0.0' },
        instructions: canWrite(u)
          ? "Connecteur /RAM : lecture de /RAM JA (tournois et animations du juge-arbitre), /RAM Club (mur, agenda, groupes) et /RAM Coach (planning, élèves, suivi, statistiques), et modification de /RAM Coach (groupes et séances, élèves et import de listes, messages, bilans en brouillon, niveaux, grilles, fiches, échelles). Commencer par ram_mon_compte pour connaître les clubs du compte. Répondre en français."
          : "Connecteur /RAM en lecture seule (accès accordé sans modification) : /RAM JA, /RAM Club et /RAM Coach. Pour modifier /RAM Coach, reconnecter le connecteur et autoriser les modifications. Commencer par ram_mon_compte. Répondre en français." } };
    if (m.method === 'ping') return { jsonrpc: '2.0', id: m.id, result: {} };
    if (m.method === 'tools/list') log(`liste des outils · ${canWrite(u) ? 'lecture et écriture' : 'lecture seule'} · compte ${u.id}`);
    if (m.method === 'tools/call') log(`outil ${p.name} · ${canWrite(u) ? 'lecture et écriture' : 'lecture seule'} · compte ${u.id}`);
    if (m.method === 'tools/list')
      return { jsonrpc: '2.0', id: m.id, result: { tools: TOOLS.filter(t => !t.write || canWrite(u)).map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
        annotations: t.write ? { title: t.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } : { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) } };
    if (m.method === 'tools/call') {
      const t = TOOLS.find(x => x.name === p.name);
      if (!t) return err(m.id, -32602, 'Outil inconnu : ' + p.name);
      if (t.write && !canWrite(u)) return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: "Accès en lecture seule : reconnecter le connecteur /RAM dans Claude pour autoriser les modifications de /RAM Coach." }], isError: true } };
      try {
        const out = await t.run(u, p.arguments || {});
        return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { resultats: out } : out } };
      } catch (e) {
        return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: e.message || 'Erreur' }], isError: true } };
      }
    }
    if (['resources/list', 'prompts/list'].includes(m.method)) return { jsonrpc: '2.0', id: m.id, result: m.method === 'resources/list' ? { resources: [] } : { prompts: [] } };
    return err(m.id, -32601, 'Méthode inconnue : ' + m.method);
  }

  /* ---------- réservations Calendly (lib/calendly.js) → séances de /RAM Coach ----------
     b : { cal (adresse de l'événement), date: AAAA-MM-JJ, heure: HH:MM (heure de Paris), min, titre, nom, email, tel, nb, objectif, participants: [noms] } */
  const TARIF = { '1-60': 35, '1-90': 50, '2-60': 60, '2-90': 70, '3-90': 84, '4-90': 100 };
  const calendly = {
    async book(u, b) {
      const c = await teach(u), K = await content(u, c), fiches = K.get('eleve'), groups = K.get('group'), ops = [];
      const low = s => String(s || '').trim().toLowerCase();
      const known = (nom, mail) => { const hit = findMember(K, nom, mail); if (hit) return hit[0]; const f = Object.entries(fiches).find(([, e]) => (mail && low(e.mail) === low(mail)) || (nom && low(e.n) === low(nom))); return f ? f[0] : null; };
      let key = known(b.nom, b.email);
      if (!key) {   // nouvel élève : fiche « sans compte » créée depuis la réservation
        key = rid('e');
        fiches[key] = { n: String(b.nom || b.email).slice(0, 80), sport: 'Padel', parents: [], mail: b.email || '', tel: b.tel || '', note: 'Arrivé par Calendly' };
        ops.push({ coll: 'eleve', id: key, op: 'put', data: fiches[key] });
      }
      const keys = [key].concat((b.participants || []).map(n => known(n)).filter(Boolean)).filter((k, i, a) => a.indexOf(k) === i);
      const add = (gid, k) => ops.push({ coll: 'group', id: gid, op: 'patch', patch: [{ p: [K.get('member')[k] ? 'mem' : 'ext'], t: 'add', v: k }] });
      const same = Object.entries(groups).find(([, g]) => g.cal === b.cal);
      if (same) keys.forEach(k => add(same[0], k));   // événement de groupe (collectif, partie dirigée) : un inscrit de plus
      else {
        const d = b.date, h = hour(b.heure), n = Math.max(keys.length, +b.nb || 1);
        const name = /dirig/i.test(b.titre) ? 'Partie dirigée' : /collectif/i.test(b.titre) ? 'Cours collectif' : /abonn|academy/i.test(b.titre) ? 'Cours Academy' : n === 1 ? 'Cours individuel' : n === 2 ? 'Cours duo' : 'Cours collectif';
        const gid = rid('g'), g = { type: 'train', name, sport: 'Padel', day: dowOf(d), h, dur: dur(b.min + ' min'), defLoc: 'Extérieur', coach: K.me.key, once: d, cal: b.cal,
          mem: keys.filter(k => K.get('member')[k]), ext: keys.filter(k => !K.get('member')[k]), sub: `${d.split('-').reverse().join('/')} ${h} · ${dur(b.min + ' min')}`,
          tarif: { mode: 'seance', prix: /Cours (individuel|duo|collectif)/.test(name) ? TARIF[n + '-' + b.min] || 0 : 0 }, at: Date.now() };
        if (b.objectif) g.goal = String(b.objectif).slice(0, 300);
        ops.push({ coll: 'group', id: gid, op: 'put', data: g });
      }
      await write(u, c, ops);
      return { club: c.nom, eleve: key, nouveau_groupe: !same };
    },
    async cancel(u, b) {
      const c = await teach(u), K = await content(u, c), hit = Object.entries(K.get('group')).find(([, g]) => g.cal === b.cal);
      if (!hit) return { introuvable: true };
      const [gid, g] = hit, low = s => String(s || '').trim().toLowerCase();
      const k = (Object.entries(K.get('eleve')).find(([, e]) => b.email && low(e.mail) === low(b.email)) || findMember(K, b.nom, b.email) || [])[0];
      const left = [...(g.mem || []), ...(g.ext || [])].filter(x => x !== k), ops = [];
      if (k) ops.push({ coll: 'group', id: gid, op: 'patch', patch: [{ p: ['mem'], t: 'rm', v: k }, { p: ['ext'], t: 'rm', v: k }] });
      if (!left.length || b.tout) ops.push({ coll: 'group', id: gid, op: 'patch', patch: [{ p: ['cancel'], t: 'add', v: g.once }] });   // plus personne : séance annulée
      if (ops.length) await write(u, c, ops);
      return { club: c.nom, annulee: !left.length || !!b.tout };
    }
  };

  /* ---------- routes ---------- */
  const handle = async function handle(req, res, url) {
    const p = url.pathname;
    if (!(p === '/mcp' || p.startsWith('/oauth/') || p.startsWith('/.well-known/oauth-'))) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    if (p.startsWith('/.well-known/oauth-protected-resource')) return send(res, 200, resourceMeta(req)), true;
    if (p.startsWith('/.well-known/oauth-authorization-server')) return send(res, 200, asMeta(req)), true;

    // inscription automatique du client (Claude) : l'identifiant porte ses adresses de retour, signées
    if (p === '/oauth/register' && req.method === 'POST') {
      const b = await readForm(req), uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String).slice(0, 10) : [];
      if (!uris.length || !uris.every(okRedirect)) return send(res, 400, { error: 'invalid_redirect_uri', error_description: 'Adresses de retour en https (ou localhost) obligatoires.' }), true;
      const name = String(b.client_name || 'Application').slice(0, 80);
      return send(res, 201, { client_id: seal('cli', { r: uris, n: name }), client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris,
        token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: SCOPE }), true;
    }

    // autorisation : connexion /RAM, puis l'utilisateur autorise (ou refuse) l'accès en lecture
    if (p === '/oauth/authorize') {
      const q = req.method === 'POST' ? await readForm(req) : Object.fromEntries(url.searchParams);
      if (req.method === 'POST') {
        const tx = open('tx', q.tx), u = await currentUser(req);
        if (!tx || !u || u.id !== tx.u) return html(res, 400, 'Autorisation', '<h1>Lien <span class="band lime">expiré</span></h1><p>Recommencez la connexion depuis Claude.</p>'), true;
        const back = new URL(tx.r);
        if (q.decision !== 'ok') { back.searchParams.set('error', 'access_denied'); if (tx.st) back.searchParams.set('state', tx.st); return redirect(res, back.href), true; }
        back.searchParams.set('code', seal('code', { u: u.id, c: tx.c, r: tx.r, ch: tx.ch, s: q.ecriture === 'non' ? SCOPE : SCOPE + ' ' + WSCOPE, n: crypto.randomBytes(9).toString('base64url'), exp: Date.now() + CODE_TTL }));
        if (tx.st) back.searchParams.set('state', tx.st);
        return redirect(res, back.href), true;
      }
      const cl = client(q.client_id);
      if (!cl || !cl.r.includes(q.redirect_uri)) return html(res, 400, 'Autorisation', '<h1>Application <span class="band lime">inconnue</span></h1><p>Cette demande de connexion n’est pas valable. Recommencez depuis Claude.</p>'), true;
      const fail = e => { const b = new URL(q.redirect_uri); b.searchParams.set('error', e); if (q.state) b.searchParams.set('state', q.state); return redirect(res, b.href), true; };
      if (q.response_type !== 'code') return fail('unsupported_response_type');
      if (!q.code_challenge || q.code_challenge_method !== 'S256') return fail('invalid_request');
      const u = await currentUser(req);
      if (!u || u.guest) return redirect(res, '/connexion?retour=' + encodeURIComponent(p + url.search)), true;
      const tx = seal('tx', { u: u.id, c: q.client_id, r: q.redirect_uri, ch: q.code_challenge, st: q.state || '', exp: Date.now() + TX_TTL });
      const who = escH([u.first, u.last].filter(Boolean).join(' ') || u.email);
      return html(res, 200, 'Autoriser ' + cl.n, `<span class="eyebrow">Connecteur /RAM</span><h1>Autoriser <span class="band lime">${escH(cl.n)}</span></h1>
<p>${escH(cl.n)} demande à <b>consulter</b> les données de votre compte /RAM (${who}) :</p>
<ul><li>/RAM JA : vos tournois et animations</li><li>/RAM Club : le mur, l'agenda et les groupes de vos clubs</li><li>/RAM Coach : votre planning, vos élèves, leur suivi et vos statistiques</li></ul>
<p>et à <b>modifier /RAM Coach</b> :</p>
<ul><li>créer des groupes et des séances, ajouter et inscrire des élèves</li><li>envoyer des messages à vos élèves</li><li>préparer des bilans de séance en <b>brouillon</b> (vous les publiez vous-même)</li><li>modifier niveaux, grilles techniques, fiches et échelles de niveaux</li></ul>
<label class="row2" style="align-items:center;gap:10px"><input type="checkbox" name="ecriture" value="non" style="width:20px;height:20px"> <span>Lecture seule (aucune modification)</span></label>
<p class="muted small">Claude vous demande de confirmer chaque modification. Seulement ce que votre compte peut déjà voir et faire dans les applis. Pour couper l'accès, changez votre mot de passe.</p>
<form method="post" action="/oauth/authorize" class="row2"><input type="hidden" name="tx" value="${escH(tx)}"><button class="btn primary" name="decision" value="ok">Autoriser</button><button class="btn ghost" name="decision" value="non">Refuser</button></form>`), true;
    }

    // jetons : échange du code (avec PKCE), puis renouvellement
    if (p === '/oauth/token' && req.method === 'POST') {
      const b = await readForm(req), bad = (e, d) => (send(res, 400, { error: e, error_description: d }), true);
      if (b.grant_type === 'authorization_code') {
        const c = open('code', b.code);
        if (!c || used.has(c.n)) return bad('invalid_grant', 'Code invalide ou déjà utilisé.');
        if (c.c !== b.client_id || c.r !== b.redirect_uri) return bad('invalid_grant', 'Client ou adresse de retour différents.');
        if (!b.code_verifier || crypto.createHash('sha256').update(String(b.code_verifier)).digest('base64url') !== c.ch) return bad('invalid_grant', 'Vérification PKCE échouée.');
        used.set(c.n, c.exp);
        for (const [k, e] of used) if (e < Date.now()) used.delete(k);
        const u = await store.getUser(c.u).catch(() => null);
        if (!u) return bad('invalid_grant', 'Compte introuvable.');
        log(`jeton délivré · ${c.s} · compte ${u.id}`);
        return send(res, 200, tokens(u, c.c, c.s)), true;
      }
      if (b.grant_type === 'refresh_token') {
        const r = open('ref', b.refresh_token), u = r && (await store.getUser(r.u).catch(() => null));
        if (!r || !u || r.pw !== passPrint(u.pass_hash) || (b.client_id && b.client_id !== r.c)) return bad('invalid_grant', 'Jeton de renouvellement invalide.');
        if (!r.s) return log('ancien accès refusé : nouvelle autorisation demandée · compte ' + u.id), bad('invalid_grant', 'Accès à renouveler : reconnecter le connecteur /RAM.');
        log(`jeton renouvelé · ${r.s} · compte ${u.id}`);
        return send(res, 200, tokens(u, r.c, r.s)), true;
      }
      return bad('unsupported_grant_type', 'Type de demande non pris en charge.');
    }

    // le serveur MCP lui-même
    if (p === '/mcp') {
      const u = await bearerUser(req);
      if (!u) return send(res, 401, { error: 'invalid_token', error_description: 'Connexion /RAM requise.' }, { 'WWW-Authenticate': `Bearer resource_metadata="${base(req)}/.well-known/oauth-protected-resource", scope="${SCOPE}"` }), true;
      if (req.method !== 'POST') { res.writeHead(405, Object.assign({ Allow: 'POST' }, cors)); res.end(); return true; }
      let body;
      try { body = await readBody(req); } catch (e) { return send(res, 400, err(null, -32700, 'JSON invalide')), true; }
      const list = Array.isArray(body) ? body : [body];
      const out = (await Promise.all(list.map(m => rpc(u, m)))).filter(Boolean);
      if (!out.length) { res.writeHead(202, cors); res.end(); return true; }
      return send(res, 200, Array.isArray(body) ? out : out[0]), true;
    }
    return false;
  };
  handle.calendly = calendly;
  return handle;
}

module.exports = { createMcp, seal, open };
