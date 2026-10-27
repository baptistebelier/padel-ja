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
const SCOPE = 'ram.lecture';
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
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function createMcp({ store, ram, Engine, Ani, getRoom, mainClubOf, currentUser, readBody, json, redirect }) {
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
  const resourceMeta = req => ({ resource: base(req) + '/mcp', authorization_servers: [base(req)], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: '/RAM', resource_documentation: base(req) + '/connecteur' });
  const asMeta = req => {
    const b = base(req);
    return { issuer: b, authorization_endpoint: b + '/oauth/authorize', token_endpoint: b + '/oauth/token', registration_endpoint: b + '/oauth/register',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], scopes_supported: [SCOPE], service_documentation: b + '/connecteur' };
  };
  /* jetons d'accès (1 h) et de renouvellement (30 jours) */
  function tokens(u, cid) {
    const now = Date.now();
    return { access_token: seal('acc', { u: u.id, c: cid, exp: now + ACCESS_TTL }), token_type: 'Bearer', expires_in: ACCESS_TTL / 1000,
      refresh_token: seal('ref', { u: u.id, c: cid, pw: passPrint(u.pass_hash), exp: now + REFRESH_TTL }), scope: SCOPE };
  }
  async function bearerUser(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const d = m && open('acc', m[1].trim());
    if (!d) return null;
    const u = await store.getUser(d.u).catch(() => null);
    return u && !u.guest ? u : null;
  }

  /* ---------- données : clubs du compte et contenu lisible de chacun ---------- */
  async function clubsOf(u) {
    const l = await ram.myClubs(u.id), main = await mainClubOf(u.id).catch(() => null), sps = await ram.spaces();
    return l.map(c => ({ id: c.id, nom: c.name, role: c.role === 'bureau' ? 'bureau' : c.role === 'coach' ? 'enseignant' : 'adhérent', cle: c.key,
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
  const teaching = c => c.role === 'enseignant' || c.role === 'bureau';
  /* séances de mes groupes (dans un club) entre deux dates */
  function sessions(K, key, from, to, mine) {
    const out = [];
    Object.entries(K.get('group')).forEach(([gid, g]) => {
      if (g.type !== 'train' || g.old || (mine && g.coach !== key)) return;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (dowOf(d) !== g.day) continue;
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
      run: async u => ({ nom: [u.first, u.last].filter(Boolean).join(' ') || u.name, email: u.email, offre_ram_ja: u.plan || 'essai', clubs: (await clubsOf(u)).map(({ cle, ...c }) => c) }) },
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
        if (!['enseignant', 'bureau'].includes(c.role)) throw new Error('Réservé aux enseignants et au bureau du club.');
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

  /* ---------- JSON-RPC ---------- */
  const err = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  async function rpc(u, m) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(m && m.id != null ? m.id : null, -32600, 'Requête invalide');
    if (m.id === undefined || m.id === null) return null;   // notification (initialized, cancelled…) : pas de réponse
    const p = m.params || {};
    if (m.method === 'initialize')
      return { jsonrpc: '2.0', id: m.id, result: { protocolVersion: PROTOCOLS.includes(p.protocolVersion) ? p.protocolVersion : PROTOCOLS[0], capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ram', title: '/RAM', version: '1.0.0' },
        instructions: "Connecteur /RAM (lecture seule) : /RAM JA (tournois et animations du juge-arbitre), /RAM Club (mur, agenda, groupes du club) et /RAM Coach (planning, élèves, suivi, statistiques de l'enseignant). Commencer par ram_mon_compte pour connaître les clubs du compte. Répondre en français." } };
    if (m.method === 'ping') return { jsonrpc: '2.0', id: m.id, result: {} };
    if (m.method === 'tools/list')
      return { jsonrpc: '2.0', id: m.id, result: { tools: TOOLS.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) } };
    if (m.method === 'tools/call') {
      const t = TOOLS.find(x => x.name === p.name);
      if (!t) return err(m.id, -32602, 'Outil inconnu : ' + p.name);
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

  /* ---------- routes ---------- */
  return async function handle(req, res, url) {
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
        back.searchParams.set('code', seal('code', { u: u.id, c: tx.c, r: tx.r, ch: tx.ch, n: crypto.randomBytes(9).toString('base64url'), exp: Date.now() + CODE_TTL }));
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
<p class="muted small">Lecture seule : rien n'est créé, modifié ni supprimé. Seulement ce que votre compte voit déjà dans les applis. Pour couper l'accès, changez votre mot de passe.</p>
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
        return send(res, 200, tokens(u, c.c)), true;
      }
      if (b.grant_type === 'refresh_token') {
        const r = open('ref', b.refresh_token), u = r && (await store.getUser(r.u).catch(() => null));
        if (!r || !u || r.pw !== passPrint(u.pass_hash) || (b.client_id && b.client_id !== r.c)) return bad('invalid_grant', 'Jeton de renouvellement invalide.');
        return send(res, 200, tokens(u, r.c)), true;
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
}

module.exports = { createMcp, seal, open };
