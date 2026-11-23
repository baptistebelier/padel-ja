/* =========================================================================
   /RAM Réservation — réserver un cours avec un enseignant depuis /Buvette
   Le serveur calcule ce qui est libre et crée le cours : un adhérent ne peut pas écrire un cours lui-même.
   - creneaux : ses disponibilités, moins ses cours (tous clubs) et ses vacances ; les cours pris, sans aucun nom ;
   - reserver : un adhérent validé prend une plage libre, pour lui ou pour son enfant ; confirmé tout de suite,
     l'enseignant est notifié (lib/pushnotif.js) et le cours arrive à son planning. Deux demandes en même temps passent
     l'une après l'autre ;
   - annuler : l'élève annule lui-même jusqu'à 24 h avant ; la plage redevient libre ;
   - attendre : liste d'attente sur une plage prise, alerte dès qu'elle se libère (quelle que soit la cause) ;
   - collectifs (publications par niveaux, ui/10-niveaux.js) : rien ne bloque tant qu'aucune fourchette n'atteint
     son minimum ; ensuite le cours arrive au planning, et suit les inscriptions et les désistements ;
   - rappels : la veille à 18 h et 2 h avant, par la file de tâches ; rien ne part si le cours a changé ;
   - demander : un élève propose un collectif ou une partie dirigée sur une plage libre ; les élèves de son niveau sont
     prévenus, et la demande entre au planning quand le groupe atteint son minimum (comme un collectif du coach) ;
   - achatShopify : une commande payée d'un produit de l'enseignant (son SKU) est notée dans la fiche de l'élève ;
   - pub… : la page publique, sans compte : questionnaire, cours confirmé, annulation par le lien reçu par e-mail ;
   - enseignants : ceux dont l'adhérent suit un groupe, ou chez qui il a un cours ou une formule (Mon espace).
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const REGLES = require('../club/regles.js');
const { nvValidatedOn } = require('./ram-score');
const { parisMs } = require('./ramclub');

const SECRET = process.env.SESSION_SECRET || 'padelja-local-' + require('os').hostname();
const MAX_DEMANDES = 3;           // demandes ouvertes par élève
const DAYS = 7, DELAI_MIN = 60;   // on réserve au moins une heure à l'avance
const ANNUL_MIN = 24 * 60;        // l'élève annule lui-même jusqu'à 24 h avant
const VEILLE_H = 18;              // rappel de la veille, à 18 h
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const hMin = h => { const m = String(h || '').match(/(\d+) h(?: (\d+))?/); return m ? +m[1] * 60 + (+m[2] || 0) : 0; };
const hTxt = n => Math.floor(n / 60) + ' h' + (n % 60 ? ' ' + String(n % 60).padStart(2, '0') : '');
const durTxt = n => (n < 60 ? n + ' min' : hTxt(n));
const first = d => String((d && d.n) || '').split(' ')[0] || 'ton enseignant';
const dayTxt = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
/* maintenant, à l'heure du club */
function paris(now) {
  const s = (now || new Date()).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
  return { d: s.slice(0, 10), m: +s.slice(11, 13) * 60 + +s.slice(14, 16) };
}
/* minutes entre maintenant et un moment du calendrier du club */
const avant = (t, d, debut) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(t.d + 'T00:00:00Z')) / 60000) + debut - t.m;
class Refus extends Error {}
/* publications par niveaux : le même calcul que l'appli (club/ui/10-niveaux.js nvState) — maximum d'une fourchette, première complète validée */
const nvCap = t => Math.max(+t.places || 0, +t.max || 0);
function nvEtat(nv, iso) {
  const at = (k, i) => (nv.at && nv.at[k] && nv.at[k][iso]) || 1e15 + i, lists = {};
  let win = null, best = Infinity;
  (nv.tiers || []).forEach(t => {
    const sorted = ((nv.ins && nv.ins[iso + '|' + t.id]) || []).map((k, i) => [k, at(k, i)]).sort((a, b) => a[1] - b[1]);
    lists[t.id] = sorted.map(x => x[0]);
    if (sorted.length >= t.places && sorted[t.places - 1][1] < best) { best = sorted[t.places - 1][1]; win = t.id; }
  });
  const status = {};
  (nv.tiers || []).forEach(t => lists[t.id].forEach((k, i) => { status[t.id + '|' + k] = i >= nvCap(t) ? 'wait' : win ? (t.id === win ? 'ok' : 'wait') : 'in'; }));
  return { win, lists, status };
}
/* la fourchette d'un niveau donné (padel : 1 à 10 ; tennis : un classement) */
function nvTierOf(nv, niveau) {
  const padel = nv.sport === 'Padel', v = padel ? Math.round(+niveau) : REGLES.RANKS.indexOf(String(niveau));
  if (padel ? !(v >= 1 && v <= 10) : v < 0) return null;
  const b = x => (padel ? +x : REGLES.RANKS.indexOf(x));
  return (nv.tiers || []).find(t => v >= Math.min(b(t.lo), b(t.hi)) && v <= Math.max(b(t.lo), b(t.hi))) || null;
}
/* ---------- liste des inscrits d'une séance, sur le lien d'inscription ----------
   Choix de Baptiste : chacun voit avec qui il joue, prénom et nom (le lien est public mais partagé en privé).
   Tous les inscrits, liste d'attente comprise, sans case de consentement ni filtre.
   Jamais d'e-mail, de téléphone ni de niveau détaillé. La photo vient du seul compte /RAM de la personne, sinon des initiales. */
const nomPublicDe = (au, k) => { const x = au.get('member', k) || au.get('eleve', k); return x ? String(x.n || '').replace(/\s+/g, ' ').trim().slice(0, 60) : ''; };
const opaqueDe = (postId, k) => crypto.createHmac('sha256', SECRET).update('nvav:' + postId + ':' + k).digest('base64url').slice(0, 16);
/* le jeton du lien : celui de la publication, comparé sans fuite de temps */
const nvJetonOk = (nv, t) => { const a = Buffer.from(String((nv && nv.lien && nv.lien.t) || '')), b = Buffer.from(String(t || '')); return a.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b); };

function createReservation({ ram, store, coachTables, Formules, push, taches, agenda, Mail, now, dojoPro = async () => true, log = () => {} }) {
  const locks = new Map();
  const serial = (id, fn) => { const p = (locks.get(id) || Promise.resolve()).then(fn, fn); locks.set(id, p.catch(() => {})); return p; };
  const today = () => paris(now && now());
  const nbJours = n => Math.max(1, Math.min(42, Math.round(+n) || DAYS));   // une semaine, ou un mois pour le calendrier

  /* l'enseignant d'une clé dans un club, avec ses formules : null s'il n'enseigne pas ici */
  async function coachOf(clubId, key) {
    const m = await ram.memberByKey(clubId, key).catch(() => null);
    if (!m || !m.user_id) return null;
    const row = (await ram.myClubs(m.user_id)).find(c => c.id === clubId);
    if (!row || (row.role !== 'coach' && row.role !== 'bureau')) return null;
    const offres = await Formules.get(store, m.user_id), pro = await dojoPro(m.user_id);
    // la réservation en ligne (page publique et réservation dans /Buvette) fait partie de /Dojo Pro (lib/offres.js)
    if (!pro) { delete offres.page; delete offres.dispos; }
    return { user: m.user_id, key, offres, pro };
  }
  /* jour par jour : ce qui est libre et ce qui est pris */
  async function jours(coach, de, n) {
    const fin = REGLES.addDays(de, n - 1), { seances } = await coachTables.planning(coach.user, de, fin), t = today(), out = [];
    const dehors = agenda ? await agenda.occupe(coach.offres.icals, de, fin) : [];   // ce qui est posé dans son agenda (Google…)
    for (let i = 0; i < n; i++) {
      const d = REGLES.addDays(de, i),
        pris = seances.filter(s => s.date === d && !s.annule).map(s => [hMin(s.heure), hMin(s.heure) + (+s.minutes || 60)]).concat(dehors.filter(x => x.d === d).map(x => [x.du, x.au])).sort((a, b) => a[0] - b[0]);
      let libres = d < t.d ? [] : REGLES.plagesLibres(coach.offres.dispos, d, pris, coach.offres.conges, 0);
      if (d === t.d) libres = libres.map(p => Object.assign({}, p, { du: Math.max(p.du, Math.ceil((t.m + DELAI_MIN) / 30) * 30) })).filter(p => p.au > p.du);
      out.push({ d, libres, pris: pris.map(([du, au]) => ({ du, au })) });
    }
    return out;
  }
  /* les fiches élève d'un club à une adresse donnée (comparée en minuscules) */
  const fichesDe = async (clubId, email) => { const m = String(email || '').trim().toLowerCase(); return m ? (await ram.itemsOf(clubId, 'eleve')).filter(x => String(x.data.mail || '').toLowerCase() === m) : []; };
  /* achats d'une fiche avec ce qui reste : mêmes règles que /Dojo (couverture : séances où l'élève était présent à l'appel) */
  async function resumeAchats(coach, clubId, fiche) {
    const t = today().d, achats = fiche.data.achats || [];
    if (!achats.length) return [];
    const { seances } = await coachTables.planning(coach.user, REGLES.addDays(t, -309), REGLES.addDays(t, 90));   // 400 jours au plus
    const siennes = seances.filter(s => !s.annule && (s.eleves || []).includes(fiche.id));
    const venues = siennes.filter(s => s.date <= t && (s.appel || {})[fiche.id] === 'P').map(s => ({ d: s.date, min: +s.minutes || 60, n: (s.eleves || []).length, gid: s.groupe }));
    /* séances à venir (déjà réservées ou prévues, pas encore pointées) : ce mois-ci pour un abonnement, toutes pour un pack */
    const aVenir = siennes.filter(s => s.date >= t && !(s.appel || {})[fiche.id]).map(s => s.date), mois = t.slice(0, 7);
    return REGLES.couverture(achats, venues, coach.offres).achats.slice().sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 12).map(a => {
      const encours = REGLES.etatAchat(a, t) === 'encours', pack = a.t === 'pack', abo = a.t === 'abo';
      const m = abo ? REGLES.moisAbo(a, t, coach.offres) : null;
      return { id: a.id, ref: String(a.ref || ''), t: a.t, nom: String(a.nom || ''), d: a.d, encours,
        ...(pack ? { restantes: Math.max(0, (+a.n || 0) - (+a.used || 0)), total: +a.n || 0, prevues: encours ? aVenir.length : 0 } : {}),
        ...(abo && a.fin ? { fin: a.fin } : {}),
        // consommation du mois civil : séances faites, séances prévues, quota (0 : sans limite)
        ...(abo ? { faitMois: m.fait, quotaMois: m.quota, prevuesMois: encours ? aVenir.filter(d => d.slice(0, 7) === mois).length : 0 } : {}) };
    });
  }
  /* la publication d'un lien : valide seulement avec son jeton ; partie « demandée » par un élève : pas de lien */
  async function nvLoad(clubId, postId, tok) {
    const au = await ram.audience(String(clubId)), p = au && au.get('post', String(postId));
    if (!p || p.kind !== 'niveaux' || !p.nv || p.nv.demande || !nvJetonOk(p.nv, tok)) throw new Refus('Ce lien d’inscription n’est pas valable.');
    return { au, p };
  }
  async function coachOfPost(clubId, p) {
    const au = await ram.audience(clubId), uid = au && au.user[p.by];
    if (!uid) throw new Refus('Cette séance n’accepte pas d’inscription par le lien.');
    return uid;
  }
  const avatarOf = async coach => { const id = store.getIdentity ? await store.getIdentity(coach.user).catch(() => null) : null; return id && typeof id.avatar === 'string' && id.avatar.startsWith('data:image/') ? id.avatar : ''; };
  const formulesOf = o => (o.formules || []).filter(f => +f.joueurs === 1).map(f => ({ id: f.id, nom: f.nom, sport: f.sport, duree: f.duree, prix: f.prix }));
  const minesOf = me => [me.key].concat(me.kids || []);
  const signeAnnul = (c, id) => crypto.createHmac('sha256', SECRET).update('annul:' + c + ':' + id).digest('base64url').slice(0, 32);
  /* niveau d'un adhérent : numéro en padel, rang du classement en tennis ; fourchette : autour de lui */
  const niveauDe = (m, sport) => { if (!m) return null; if (sport === 'Padel') return m.pl != null ? +m.pl : null; const i = REGLES.RANKS.indexOf(m.r); return i < 0 ? null : i; };
  const fourchette = (n, sport) => (sport === 'Padel' ? { lo: Math.max(1, n - 1), hi: Math.min(10, n + 1) } : { lo: REGLES.RANKS[Math.max(0, n - 2)], hi: REGLES.RANKS[Math.min(REGLES.RANKS.length - 1, n + 2)] });
  const dansFourchette = (n, t, sport) => n != null && (sport === 'Padel' ? n >= t.lo && n <= t.hi : n >= REGLES.RANKS.indexOf(t.lo) && n <= REGLES.RANKS.indexOf(t.hi));

  /* ---------- prévenir et rappeler ---------- */
  /* clés d'adhérents → comptes (un enfant sans compte : son parent) ; le réglage « Mes cours » est respecté */
  function comptes(au, keys) {
    const out = new Set();
    for (const k of new Set(keys)) {
      const owner = au.user[k] ? k : au.parent[k], uid = au.user[owner], p = owner ? au.prefs(owner) : null;
      if (uid && !(p && p.nset && p.nset.resa === false)) out.add(uid);
    }
    return [...out];
  }
  async function prevenir(clubId, au, keys, body, url, tag, plus) {
    const uids = comptes(au, keys);
    if (uids.length && push) await push.sendMany(uids, { title: au.name || '/Buvette', body, url: url + '?club=' + clubId, tag: clubId + '-' + tag, ...(plus || {}) });
  }
  async function prevenirCoach(clubId, au, uid, body, url, tag) {
    if (uid && push) await push.sendMany([uid], { title: au.name || '/Buvette', body, url: url + '?club=' + clubId, tag: clubId + '-' + tag, app: 'coach' });
  }
  function rappels(clubId, id, d, debut) {
    if (!taches) return;
    const t = (now ? now() : new Date()).getTime(), de = parisMs(d, 0) + debut * 60000;
    [['veille', parisMs(REGLES.addDays(d, -1), VEILLE_H)], ['2h', de - 2 * 3600000]].forEach(([quand, at]) => {
      if (at > t) taches.enqueue('resa-rappel', { c: clubId, id, d, h: hTxt(debut), quand }, { at, key: `rappel:${clubId}:${id}:${d}:${hTxt(debut)}:${quand}` });
    });
  }
  /* au moment du rappel : le cours tel qu'il est, pour ses inscrits du moment ; annulé ou déplacé, rien ne part */
  async function rappel({ c, id, d, h, quand }) {
    const au = await ram.audience(c); if (!au) return;
    const x = au.get('cours', id);
    if (!x || x.once !== d || x.h !== h || (x.cancel || []).includes(d)) return;
    const qui = first(au.get('member', x.coach));
    const abs = new Set([...Object.keys((x.resp || {})[d] || {}).filter(k => x.resp[d][k] === 'no'), ...((x.abs || {})[d] || [])]);
    await prevenir(c, au, (x.mem || []).filter(k => !abs.has(k)), quand === 'veille' ? `Rappel : ${x.name} avec ${qui}, demain à ${h}` : `Rappel : ${x.name} avec ${qui}, dans 2 h (${h})`, '#/agenda', 'rappel-' + id, quand === '2h' ? { urgent: true } : null);   // 2 h avant : passe même pendant les heures calmes
  }
  if (taches) taches.on('resa-rappel', rappel);

  /* ---------- liste d'attente : une plage prise se libère ---------- */
  /* les plages libérées par un changement : cours annulé, supprimé, ou déplacé */
  function libere(a, b) {
    if (!a || !a.coach || !a.h) return [];
    const zone = d => ({ coach: a.coach, d, du: hMin(a.h), au: hMin(a.h) + REGLES.durMin(a.dur) });
    if (a.once) return !(a.cancel || []).includes(a.once) && (!b || b.once !== a.once || b.h !== a.h || (b.cancel || []).includes(a.once)) ? [zone(a.once)] : [];
    return ((b && b.cancel) || []).filter(d => !(a.cancel || []).includes(d)).map(zone);
  }
  async function alerter(clubId, zones) {
    if (!zones.length) return;
    const au = await ram.audience(clubId); if (!au) return;
    const t = today().d, l = await ram.itemsOf(clubId, 'attente');
    for (const z of zones) {
      if (z.d < t) continue;
      const hits = l.filter(x => x.data.coach === z.coach && x.data.d === z.d && x.data.du < z.au && x.data.au > z.du);
      if (!hits.length) continue;
      await prevenir(clubId, au, hits.map(x => x.data.k), `Une place s'est libérée avec ${first(au.get('member', z.coach))} : ${dayTxt(z.d)} à ${hTxt(z.du)}. Premier arrivé, premier servi`, '#/resa/' + z.coach, 'attente-' + z.coach + z.d);
      if (au.user[z.coach]) await ram.ops(au.user[z.coach], clubId, hits.map(x => ({ coll: 'attente', id: x.id, op: 'del' })));
    }
  }

  /* ---------- collectifs : le cours suit les inscriptions d'une publication par niveaux ---------- */
  const coursId = (postId, d) => ('n' + postId + '-' + d).slice(0, 64);
  const inscrits = (nv, d) => Object.keys(nv.ins || {}).filter(q => q.startsWith(d + '|')).flatMap(q => nv.ins[q] || []);
  async function collectif(clubId, postId, post) {
    const au = await ram.audience(clubId); if (!au) return;
    const uid = au.user[post.by], role = au.role[post.by];
    if (!uid || (role !== 'coach' && role !== 'bureau')) return;
    const nv = post.nv, t = today().d, ops = [], nouveaux = [];
    for (const d of nv.dates || []) {
      if (d < t) continue;
      // complet dès le départ : la séance est au planning avec les élèves choisis par l'enseignant, sans inscription
      const id = coursId(postId, d), x = au.get('cours', id), w = nv.complet ? (nv.membres || []).slice() : nvValidatedOn(nv, d), annule = !!x && (x.cancel || []).includes(d);
      if (!w.length && !nv.complet) {
        if (x && !annule) {
          ops.push({ coll: 'cours', id, op: 'put', data: Object.assign({}, x, { cancel: [d] }) });
          await prevenir(clubId, au, inscrits(nv, d), `${x.name} du ${dayTxt(d)} : le minimum n'est plus atteint, le cours n'a pas lieu pour l'instant`, '#/post/' + postId, 'coll-' + id);
        }
        continue;
      }
      const nom = nv.theme || (nv.mode === 'cours' ? 'Séance collective' : 'Partie dirigée');
      // adhérents (avec un compte) dans mem, fiches d'élèves sans compte dans ext (groupe complet choisi par l'enseignant)
      const mem = nv.complet ? w.filter(k => au.get('member', k)) : w, ext = nv.complet ? w.filter(k => !au.get('member', k) && au.get('eleve', k)) : (x && x.ext) || [];
      if (x && !annule && JSON.stringify(x.mem || []) === JSON.stringify(mem) && JSON.stringify(x.ext || []) === JSON.stringify(ext) && x.h === nv.time && x.dur === nv.dur && x.name === nom) continue;
      const prix = parseFloat(String(nv.price || '').replace(',', '.'));
      ops.push({ coll: 'cours', id, op: 'put', data: x ? Object.assign({}, x, { mem, ext, cancel: [], h: nv.time, dur: nv.dur, name: nom, sub: `${d.split('-').reverse().join('/')} ${nv.time} · ${nv.dur}` }) : { type: 'train', name: nv.theme || (nv.mode === 'cours' ? 'Séance collective' : 'Partie dirigée'), sport: nv.sport, day: REGLES.dowOf(d), h: nv.time, dur: nv.dur,
        defLoc: 'En salle', coach: post.by, once: d, cal: 'ram:' + id, mem, ext, nv: postId, sub: `${d.split('-').reverse().join('/')} ${nv.time} · ${nv.dur}`, ...(prix > 0 ? { tarif: { mode: 'eleve', prix } } : {}), ...(nv.theme ? { goal: nv.theme } : {}), at: Date.now() } });
      if (!x || annule) nouveaux.push([id, d]);
    }
    // une date retirée ou déplacée : son cours ne reste pas au planning
    (await ram.itemsOf(clubId, 'cours')).filter(c => c.data.nv === postId && c.data.once >= t && !(nv.dates || []).includes(c.data.once) && !(c.data.cancel || []).includes(c.data.once))
      .forEach(c => ops.push({ coll: 'cours', id: c.id, op: 'put', data: Object.assign({}, c.data, { cancel: [c.data.once] }) }));
    if (!ops.length) return;
    const r = await ram.ops(uid, clubId, ops);
    if (r.rejected && r.rejected.length) throw new Error('Collectif refusé : ' + r.rejected[0].error);
    nouveaux.forEach(([id, d]) => rappels(clubId, id, d, hMin(nv.time)));
  }
  /* chaque changement d'un club : les collectifs à recaler, les plages libérées à annoncer */
  ram.onOps((clubId, actor, changes) => setImmediate(() => {
    // un cours déplacé, rétabli, ou posé par l'enseignant : ses rappels suivent (un cours réservé a déjà les siens)
    changes.filter(c => c.coll === 'cours' && c.after && c.after.once && c.after.h && (c.after.mem || []).length).forEach(({ id, before: a, after: b }) => {
      const change = a ? a.once !== b.once || a.h !== b.h || ((a.cancel || []).includes(a.once) && !(b.cancel || []).includes(b.once)) : !b.cal;
      if (change && !(b.cancel || []).includes(b.once)) rappels(clubId, id, b.once, hMin(b.h));
    });
    // réservé sur la page publique, sans compte : l'élève apprend par e-mail ce que l'enseignant change
    // (les élèves inscrits au cours, eux, ont l'avis par e-mail de lib/pushnotif.js, seance)
    if (Mail && taches) changes.filter(c => c.coll === 'cours' && c.before && c.after && (c.after.ext || []).length && String(c.after.cal || '').startsWith('ram:')).forEach(({ before: a, after: b }) => {
      const cx = (b.cancel || []).includes(b.once) && !(a.cancel || []).includes(a.once), mv = a.once !== b.once || a.h !== b.h;
      if (!cx && !mv) return;
      ram.audience(clubId).then(au => (b.ext || []).filter(k => k !== b.annulePar).forEach(k => {
        const e = au && au.get('eleve', k);
        if (e && e.mail) taches.enqueue('mail', Object.assign({ to: e.mail }, Mail.resaChangeMail({ first: String(e.n || '').split(' ')[0], nom: b.name, coach: first(au.get('member', b.coach)), annule: cx, jour: dayTxt(b.once), heure: b.h })));
      })).catch(er => log('E-mail de cours : ' + er.message));
    });
    alerter(clubId, changes.filter(c => c.coll === 'cours' || c.coll === 'group').flatMap(c => libere(c.before, c.after))).catch(e => log('Liste d’attente : ' + e.message));
    changes.filter(c => c.coll === 'post' && c.after && c.after.kind === 'niveaux' && c.after.nv).forEach(c =>
      serial('nv/' + clubId + '/' + c.id, () => collectif(clubId, c.id, c.after)).catch(e => log('Collectif : ' + e.message)));
  }));

  /* mes cours réservés à venir, collectifs compris (on quitte un collectif depuis sa publication) */
  async function mesCours(clubId, mine, seul) {
    const t = today();
    return (await ram.itemsOf(clubId, 'cours'))
      .filter(x => String(x.data.cal || '').startsWith('ram:') && x.data.once >= t.d && !(x.data.cancel || []).includes(x.data.once) && (x.data.mem || []).some(k => mine.includes(k)) && (!seul || x.data.coach === seul))
      .map(x => ({ id: x.id, d: x.data.once, h: x.data.h, nom: x.data.name, coach: x.data.coach, pour: (x.data.mem || []).find(k => mine.includes(k)), post: x.data.nv || null, annulable: !x.data.nv && avant(t, x.data.once, hMin(x.data.h)) >= ANNUL_MIN }))
      .sort((a, b) => a.d.localeCompare(b.d) || hMin(a.h) - hMin(b.h));
  }

  return {
    Refus, rappel,
    async creneaux(userId, clubId, key, de, n) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      if (!isDate(de)) throw new Refus('Date invalide.');
      const coach = await coachOf(clubId, key);
      if (!coach) throw new Refus('Cet enseignant n’est pas de ce club.');
      if (!(coach.offres.dispos || []).length) return { ouvert: false, formules: [], jours: [] };
      const mine = minesOf(me), attente = (await ram.itemsOf(clubId, 'attente')).filter(x => x.data.coach === key && mine.includes(x.data.k)).map(x => ({ d: x.data.d, du: x.data.du, au: x.data.au }));
      return { ouvert: true, demandes: (coach.offres.formules || []).filter(f => +f.joueurs > 1).map(f => ({ id: f.id, nom: f.nom, joueurs: f.joueurs, duree: f.duree, prix: f.prix, par: f.par })), formules: formulesOf(coach.offres), packs: !!(coach.offres.packs || []).length, jours: await jours(coach, de, nbJours(n)), attente, mes: await mesCours(clubId, mine, key) };
    },
    async reserver(userId, clubId, key, b) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      if (me.key === key) throw new Refus('Tu ne peux pas réserver un cours avec toi-même.');
      const d = String(b.d || ''), debut = Math.round(+b.t), objectif = String(b.objectif || '').trim().slice(0, 300), pour = b.pour ? String(b.pour) : me.key;
      if (!isDate(d) || !Number.isFinite(debut)) throw new Refus('Créneau invalide.');
      if (objectif.length < 3) throw new Refus('Indique l’objectif de la séance.');
      if (!minesOf(me).includes(pour)) throw new Refus('Tu ne réserves que pour toi ou ton enfant.');
      return serial(clubId + '/' + key, async () => {
        const coach = await coachOf(clubId, key);
        if (!coach) throw new Refus('Cet enseignant n’est pas de ce club.');
        const f = (coach.offres.formules || []).find(x => x.id === b.formule && +x.joueurs === 1);
        if (!f) throw new Refus('Cette formule n’est pas réservable.');
        const [jour] = await jours(coach, d, 1);
        if (!jour.libres.some(p => debut >= p.du && debut + f.duree <= p.au)) throw new Refus('Ce créneau vient d’être pris. Choisis-en un autre.');
        const id = 'r' + crypto.randomBytes(6).toString('hex'), h = hTxt(debut), dur = durTxt(f.duree);
        const data = { type: 'train', name: f.nom, sport: f.sport, day: REGLES.dowOf(d), h, dur, defLoc: 'En salle', coach: key, once: d, cal: 'ram:' + id, mem: [pour], ext: [],
          sub: `${d.split('-').reverse().join('/')} ${h} · ${dur}`, tarif: { mode: f.par === 'personne' ? 'eleve' : 'seance', prix: f.prix }, goal: objectif, at: Date.now() };
        const r = await ram.ops(coach.user, clubId, [{ coll: 'cours', id, op: 'put', data }]);
        if (r.rejected && r.rejected.length) throw new Error('Cours refusé : ' + r.rejected[0].error);
        rappels(clubId, id, d, debut);
        return { id, d, h, dur };
      });
    },
    /* un élève propose un collectif ou une partie dirigée : une publication par niveaux au nom de l'enseignant, déjà inscrit */
    async demander(userId, clubId, key, b) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      if (me.key === key) throw new Refus('Tu ne peux pas te faire une demande à toi-même.');
      const d = String(b.d || ''), debut = Math.round(+b.t), pour = b.pour ? String(b.pour) : me.key, mode = b.mode === 'cours' ? 'cours' : 'partie', theme = String(b.theme || '').trim().slice(0, 80);
      if (!isDate(d) || !Number.isFinite(debut)) throw new Refus('Créneau invalide.');
      if (!minesOf(me).includes(pour)) throw new Refus('Tu ne proposes que pour toi ou ton enfant.');
      return serial(clubId + '/' + key, async () => {
        const coach = await coachOf(clubId, key);
        if (!coach) throw new Refus('Cet enseignant n’est pas de ce club.');
        const f = (coach.offres.formules || []).find(x => x.id === b.formule && +x.joueurs > 1);
        if (!f) throw new Refus('Cette formule n’est pas proposable.');
        const [jour] = await jours(coach, d, 1), plage = jour.libres.find(p => debut >= p.du && debut + f.duree <= p.au);
        if (!plage) throw new Refus('Ce créneau vient d’être pris. Choisis-en un autre.');
        const au = await ram.audience(clubId), n = niveauDe(au.get('member', pour), f.sport);
        if (n == null) throw new Refus(f.sport === 'Padel' ? 'Indique d’abord ton niveau de padel dans ton profil.' : 'Indique d’abord ton classement dans ton profil.');
        const posts = await ram.itemsOf(clubId, 'post');
        if (posts.filter(p => p.data.nv && p.data.nv.demande && minesOf(me).includes(p.data.nv.demande.par) && !p.data.arch && (p.data.nv.dates || []).some(x => x >= today().d)).length >= MAX_DEMANDES) throw new Refus('Tu as déjà ' + MAX_DEMANDES + ' demandes en cours.');
        const id = 'pd' + crypto.randomBytes(6).toString('hex'), h = hTxt(debut), t = Object.assign({ id: 't1', places: +f.joueurs }, fourchette(n, f.sport));
        const prix = f.par === 'personne' ? f.prix : Math.round((f.prix / f.joueurs) * 100) / 100;
        const post = { by: key, t: 'À l’instant', at: Date.now(), kind: 'niveaux', mur: false, likes: 0, com: [], nv: { mode, sport: f.sport, theme, body: 'Proposé par un élève.', fmt: mode === 'partie' ? 'Double' : '', time: h, dur: durTxt(f.duree), place: plage.lieu || '', price: prix + ' € par joueur', dates: [d], tiers: [t], ins: { [d + '|t1']: [pour] }, at: { [pour]: { [d]: Date.now() } }, demande: { par: pour, formule: f.id } } };
        const r = await ram.ops(coach.user, clubId, [{ coll: 'post', id, op: 'put', data: post }]);
        if (r.rejected && r.rejected.length) throw new Error('Demande refusée : ' + r.rejected[0].error);
        const quoi = mode === 'cours' ? 'une séance collective' : 'une partie dirigée', qui = first(au.get('member', key));
        const niveau = au.keys.filter(k => k !== pour && k !== key && au.valid[k] && au.role[k] !== 'coach' && dansFourchette(niveauDe(au.get('member', k), f.sport), t, f.sport) && !comptes(au, [k]).includes(userId));
        await prevenir(clubId, au, niveau, `Quelqu'un de ton niveau cherche ${quoi} avec ${qui} : ${dayTxt(d)} à ${h}`, '#/post/' + id, 'demande-' + id);
        await prevenirCoach(clubId, au, coach.user, `Demande d'élève : ${quoi}, ${dayTxt(d)} à ${h}. Elle entre au planning quand le groupe est complet`, '#/post/' + id, 'demande-' + id);
        return { id, d, h };
      });
    },
    /* commande Shopify payée : o = { id, name, email, first, last, d, lignes: [{ sku, qty, prix }] } ; une même ligne n'est notée qu'une fois */
    async achatShopify(o) {
      const reg = (await store.getSetting('shopify-skus').catch(() => null)) || {}, out = [], low = s => String(s || '').trim().toLowerCase();
      const parCoach = {};
      (o.lignes || []).forEach(l => { const u = reg[String(l.sku || '').trim().toUpperCase()]; if (u) (parCoach[u] = parCoach[u] || []).push(l); });
      for (const [uid, lignes] of Object.entries(parCoach)) {
        const offres = await Formules.get(store, uid), clubs = (await ram.myClubs(uid)).filter(c => c.role === 'coach' || c.role === 'bureau');
        if (!clubs.length) continue;
        const client = await store.getUserByEmail?.(low(o.email)).catch(() => null), clubsClient = client ? await ram.myClubs(client.id).catch(() => []) : [];
        /* l'élève : son adhésion à un de mes clubs, sinon sa fiche (même e-mail), sinon une nouvelle fiche */
        let club = null, key = null, fiche = null;
        for (const c of clubs) {
          const m = clubsClient.find(x => x.id === c.id);
          const f = (await ram.itemsOf(c.id, 'eleve')).find(x => (m && x.id === m.key) || (o.email && low(x.data.mail) === low(o.email)));
          if (m || f) { club = c; key = m ? m.key : f.id; fiche = f ? f.data : null; break; }
        }
        if (!club) { club = clubs[0]; key = 'e' + crypto.randomBytes(6).toString('hex'); }
        const e = Object.assign({ n: [o.first, o.last].filter(Boolean).join(' ').slice(0, 80) || o.email, sport: 'Padel', parents: [], mail: o.email || '' }, fiche || {}, !fiche && !clubsClient.some(x => x.id === club.id) ? { note: 'Arrivé par la boutique' } : {});
        e.achats = e.achats || [];
        let notes = 0, noms = [];
        lignes.forEach((l, i) => {
          const sku = String(l.sku).trim().toUpperCase(), pk = offres.packs.find(x => x.sku === sku), ab = !pk && offres.abos.find(x => x.sku === sku), fo = !pk && !ab && offres.formules.find(x => x.sku === sku), p = pk || ab || fo;
          if (!p) return;
          const qty = Math.max(1, +l.qty || 1);
          for (let q = 0; q < qty; q++) {
            const ref = o.id + ':' + i + ':' + q;
            if (e.achats.some(a => a.order === ref)) continue;
            const prix = +l.prix || p.prix, nom = pk ? pk.nom || 'Pack ' + pk.seances + ' séances' : p.nom;
            const h = { id: 'h' + crypto.randomBytes(6).toString('hex'), t: pk ? 'pack' : ab ? 'abo' : 'seance', ref: p.id, d: o.d, nom, prix, order: ref, pay: { moyen: 'Shopify', ech: [{ s: 0, m: prix, ok: o.d }] } };
            if (pk) h.n = pk.seances;
            if (ab) { const mois = { mois: 1, trimestre: 3, '6 mois': 6, an: 12 }[ab.periode] * (ab.duree || 1), [y, mo, j] = o.d.split('-').map(Number); h.fin = new Date(Date.UTC(y, mo - 1 + mois, j - 1)).toISOString().slice(0, 10); }
            e.achats.push(h); notes++; noms.push(nom);
          }
        });
        if (!notes) continue;
        const r = await ram.ops(uid, club.id, [{ coll: 'eleve', id: key, op: 'put', data: e }]);
        if (r.rejected && r.rejected.length) throw new Error('Achat refusé : ' + r.rejected[0].error);
        const au = await ram.audience(club.id);
        await prevenirCoach(club.id, au, uid, `${e.n} a acheté ${noms.join(', ')} sur la boutique`, '#/eleve/' + key, 'shop-' + key);
        out.push({ club: club.id, eleve: key, notes });
      }
      return out;
    },
    /* ---------- page publique, sans compte : l'enseignant l'ouvre pour un de ses clubs ---------- */
    async pubCreneaux(clubId, key, de, n) {
      if (!isDate(de)) throw new Refus('Date invalide.');
      const coach = await coachOf(clubId, key);
      if (!coach || coach.offres.page !== clubId || !(coach.offres.dispos || []).length) throw new Refus('Cette page de réservation n’est pas ouverte.');
      const au = await ram.audience(clubId), l = await jours(coach, de, nbJours(n)), o = coach.offres;
      /* toutes ses formules réelles (individuel, duo, collectif), ses packs et ses abonnements : la durée de séance de chacun
         vient de sa formule, la page en déduit les créneaux libres */
      const fo = (o.formules || []).map(f => ({ id: f.id, nom: f.nom, sport: f.sport, joueurs: f.joueurs, duree: f.duree, prix: f.prix, par: f.par }));
      const dureeDe = id => (fo.find(f => f.id === id) || {}).duree;
      const packs = (o.packs || []).filter(p => dureeDe(p.formule)).map(p => ({ id: p.id, nom: p.nom || 'Pack ' + p.seances + ' séances', formule: p.formule, seances: p.seances, prix: p.prix, duree: dureeDe(p.formule) }));
      const abos = (o.abos || []).map(a => ({ id: a.id, nom: a.nom, formule: a.formule, periode: a.periode, engagement: a.duree, prix: a.prix, parSemaine: a.parSemaine, parMois: a.parMois, duree: dureeDe(a.formule) || (fo.find(f => +f.joueurs === 1) || {}).duree || 60 }));
      return { coach: String((au.get('member', key) || {}).n || ''), club: au.name, photo: !!(await avatarOf(coach)), formules: fo, packs, abos, jours: l.map(j => ({ d: j.d, libres: j.libres })) };
    },
    /* la photo de profil du compte /RAM de l'enseignant, pour sa page publique (seulement si la page est ouverte) */
    async pubPhoto(clubId, key) {
      const coach = await coachOf(clubId, key);
      if (!coach || coach.offres.page !== clubId) return null;
      const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(await avatarOf(coach) || '');
      return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
    },
    async pubReserver(clubId, key, b) {
      const prenom = String(b.prenom || '').trim().slice(0, 40), nom = String(b.nom || '').trim().slice(0, 40), mail = String(b.email || '').trim().toLowerCase().slice(0, 120), tel = String(b.tel || '').trim().slice(0, 30), objectif = String(b.objectif || '').trim().slice(0, 300), sexe = ['F', 'H'].includes(b.sexe) ? b.sexe : '', niveau = ['Débutant', 'Loisir', 'Compétition'].includes(b.niveau) ? b.niveau : '';
      const d = String(b.d || ''), debut = Math.round(+b.t);
      if (b.site) throw new Refus('Demande refusée.');   // champ invisible : seul un robot le remplit
      if (!prenom || !nom) throw new Refus('Indique ton prénom et ton nom.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Refus('Adresse e-mail invalide.');
      if (tel.replace(/\D/g, '').length < 6) throw new Refus('Indique ton téléphone.');
      if (objectif.length < 3) throw new Refus('Indique l’objectif de la séance.');
      if (!b.accord) throw new Refus('Il faut accepter que l’enseignant garde ces informations.');
      if (!isDate(d) || !Number.isFinite(debut)) throw new Refus('Créneau invalide.');
      return serial(clubId + '/' + key, async () => {
        const coach = await coachOf(clubId, key);
        if (!coach || coach.offres.page !== clubId) throw new Refus('Cette page de réservation n’est pas ouverte.');
        /* ce qui est choisi : une formule (type f), un pack (p) ou un abonnement (a) ; la séance dure ce que dure sa formule */
        const o = coach.offres, type = ['p', 'a'].includes(b.type) ? b.type : 'f', fs = o.formules || [];
        const choix = type === 'p' ? (o.packs || []).find(x => x.id === b.formule) : type === 'a' ? (o.abos || []).find(x => x.id === b.formule) : fs.find(x => x.id === b.formule);
        if (!choix) throw new Refus('Cette formule n’est pas réservable.');
        const f0 = type === 'f' ? choix : fs.find(x => x.id === choix.formule) || (type === 'a' ? fs.find(x => +x.joueurs === 1) || { nom: choix.nom, sport: 'Padel', duree: 60, joueurs: 1, prix: 0 } : null);
        if (!f0) throw new Refus('Cette formule n’est pas réservable.');
        const f = Object.assign({}, f0, type === 'f' ? {} : { nom: choix.nom || (type === 'p' ? 'Pack ' + choix.seances + ' séances' : 'Abonnement') });
        const [jour] = await jours(coach, d, 1);
        if (!jour.libres.some(p => debut >= p.du && debut + f.duree <= p.au)) throw new Refus('Ce créneau vient d’être pris. Choisis-en un autre.');
        /* élève connecté (adresse vérifiée par son compte, posée par le serveur) : il choisit sa fiche parmi les siennes ; sinon la fiche à cette adresse */
        /* b.verifie n'est posé par le serveur que pour un compte dont l'adresse est PROUVÉE par un lien reçu dans sa boîte e-mail ;
           sans cette preuve, rien d'une fiche ne sert à décompter un abonnement ou un pack (on ne peut pas prendre l'adresse d'un autre) */
        const sur = !!b.verifie && (!!b.fiche || mail === String(b.verifie));
        let fiche;
        if (sur && b.fiche) { fiche = (await fichesDe(clubId, b.verifie)).find(x => x.id === String(b.fiche)); if (!fiche) throw new Refus('Cette fiche n’est pas la tienne.'); }
        else fiche = (await fichesDe(clubId, mail))[0];
        const ek = fiche ? fiche.id : 'e' + crypto.randomBytes(6).toString('hex');
        /* déjà abonné, ou pack en cours : lu dans les achats de sa fiche si l'adresse est prouvée (séances restantes pour un pack), sinon ce qu'il déclare (à vérifier) */
        const aboFiche = sur && fiche && REGLES.aboEnCours(fiche.data.achats, today().d), declare = ['abo', 'pack'].includes(b.couvert) ? b.couvert : '';
        const packFiche = !aboFiche && sur && fiche ? (await resumeAchats(coach, clubId, fiche)).find(a => a.t === 'pack' && a.encours && a.restantes > 0) : null;
        const couvert = aboFiche ? 'abo' : packFiche ? 'pack' : declare, verifie = !!(aboFiche || packFiche);
        const prixSeance = couvert || type === 'a' ? 0 : type === 'p' ? Math.round((choix.prix / (choix.seances || 1)) * 100) / 100 : f.prix;
        const partenaires = +f.joueurs > 1 ? String(b.partenaires || '').trim().slice(0, 100) : '';
        const id = 'r' + crypto.randomBytes(6).toString('hex'), h = hTxt(debut), dur = durTxt(f.duree), ops = [];
        if (!fiche) ops.push({ coll: 'eleve', id: ek, op: 'put', data: { n: prenom + ' ' + nom, sport: f.sport, parents: [], mail, tel, ...(sexe ? { sexe } : {}), note: 'Arrivé par la page de réservation' + (niveau ? ' · niveau indiqué : ' + niveau.toLowerCase() : '') } });
        ops.push({ coll: 'cours', id, op: 'put', data: { type: 'train', name: f.nom, sport: f.sport, day: REGLES.dowOf(d), h, dur, defLoc: 'En salle', coach: key, once: d, cal: 'ram:' + id, mem: [], ext: [ek], sub: `${d.split('-').reverse().join('/')} ${h} · ${dur}`, tarif: { mode: f.par === 'personne' ? 'eleve' : 'seance', prix: prixSeance }, ...(couvert ? { couvert, ...(verifie ? { couvertVerifie: true } : {}) } : {}),
          goal: objectif + (niveau ? ' (niveau : ' + niveau.toLowerCase() + ')' : '') + (partenaires ? ' · avec : ' + partenaires : '') + (couvert && !verifie ? ' · se dit ' + (couvert === 'abo' ? 'abonné' : 'avec un pack en cours') + ' (à vérifier)' : '') + (type !== 'f' && !couvert ? ' · intéressé par : ' + f.nom : ''), at: Date.now() } });
        const r = await ram.ops(coach.user, clubId, ops);
        if (r.rejected && r.rejected.length) throw new Error('Cours refusé : ' + r.rejected[0].error);
        return { id, d, h, dur, nom: f.nom, prenom, mail, couvert, prix: prixSeance, coach: first((await ram.memberByKey(clubId, key)).data), annuler: `/r/annuler?c=${encodeURIComponent(clubId)}&id=${id}&t=${signeAnnul(clubId, id)}` };
      });
    },
    /* ---------- lien public d'inscription à une séance collective ou une partie dirigée (publication par niveaux) ----------
       Le lien porte un jeton propre à la publication (nv.lien.t, posé par l'appli) ; l'enseignant le coupe (nv.lien.off).
       Mêmes règles que dans l'appli (club/ui/10-niveaux.js) : la première fourchette qui atteint son minimum valide la date, les
       autres passent en liste d'attente ; au-delà du maximum d'une fourchette, liste d'attente. Une seule logique, sous le même verrou que
       le recalage du collectif : deux inscriptions en même temps passent l'une après l'autre. Aucun nom ni aucune coordonnée n'en sort. */
    async pubNv(clubId, postId, tok) {
      const { au, p } = await nvLoad(clubId, postId, tok), nv = p.nv, t = today(), coach = p.by === 'club' ? au.name : String((au.get('member', p.by) || {}).n || '');
      const titre = nv.mode === 'cours' ? nv.theme || 'Séance collective' : 'Partie dirigée avec ' + first(au.get('member', p.by));
      const base = { titre, mode: nv.mode === 'cours' ? 'cours' : 'partie', club: au.name, coach };
      if (p.arch) return Object.assign(base, { etat: 'annule' });
      if ((nv.lien && nv.lien.off) || nv.complet) return Object.assign(base, { etat: 'coupe' });   // complet dès le départ : pas d'inscription
      const padel = nv.sport === 'Padel';
      return Object.assign(base, {
        etat: 'ouvert', sport: nv.sport, fmt: nv.fmt || '', body: nv.body || '', time: nv.time, dur: nv.dur, place: nv.place || '', price: nv.price || '', niveaux: padel ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : REGLES.RANKS.slice(),
        dates: (nv.dates || []).map(d => {
          const st = nvEtat(nv, d), passe = d < t.d || (d === t.d && hMin(nv.time) <= t.m);
          return { d, etat: passe ? 'passe' : st.win ? 'valide' : 'ouvert', tiers: (nv.tiers || []).map(x => {
            const l = st.lists[x.id], cap = nvCap(x);
            return { id: x.id, nom: x.nom || '', lo: x.lo, hi: x.hi, min: +x.places || 0, cap, n: Math.min(l.length, cap), restant: Math.max(0, cap - l.length), complet: l.length >= cap, valide: st.win === x.id, attente: l.filter(k => st.status[x.id + '|' + k] === 'wait').length,
              /* les inscrits, dans l'ordre d'inscription : un nom et une photo seulement pour qui l'a accepté (jamais un mineur), les autres en « Participant » */
              inscrits: l.map(k => {
                const a = st.status[x.id + '|' + k] === 'wait', nom = nomPublicDe(au, k);
                return nom ? { a, nom, i: opaqueDe(postId, k), av: !!au.user[k] } : { a };
              }) };
          }) };
        })
      });
    },
    async pubNvInscrire(clubId, postId, tok, b) {
      const prenom = String(b.prenom || '').trim().slice(0, 40), nom = String(b.nom || '').trim().slice(0, 40), mail = String(b.email || '').trim().toLowerCase().slice(0, 120), tel = String(b.tel || '').trim().slice(0, 30), d = String(b.d || '');
      if (b.site) throw new Refus('Demande refusée.');   // champ invisible : seul un robot le remplit
      if (!prenom || !nom) throw new Refus('Indique ton prénom et ton nom.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Refus('Adresse e-mail invalide.');
      if (tel.replace(/\D/g, '').length < 6) throw new Refus('Indique ton téléphone.');
      if (!b.accord) throw new Refus('Il faut accepter que l’enseignant garde ces informations.');
      if (!isDate(d)) throw new Refus('Date invalide.');
      return serial('nv/' + clubId + '/' + postId, async () => {
        const { au, p } = await nvLoad(clubId, postId, tok), nv = p.nv, t = today();
        if (p.arch) throw new Refus('Cette séance est annulée.');
        if (nv.lien && nv.lien.off) throw new Refus('Ce lien d’inscription est coupé.');
        if (nv.complet) throw new Refus('Cette séance est complète : pas d’inscription.');
        if (!(nv.dates || []).includes(d)) throw new Refus('Cette séance n’a pas lieu à cette date.');
        if (d < t.d || (d === t.d && hMin(nv.time) <= t.m)) throw new Refus('Cette date est passée.');
        /* la fourchette : celle que la personne a touchée (b.tier), sinon celle de son niveau */
        const tier = b.tier ? (nv.tiers || []).find(x => x.id === String(b.tier)) : nvTierOf(nv, b.niveau);
        if (!tier) throw new Refus(b.tier ? 'Cette fourchette n’existe pas.' : b.niveau == null || b.niveau === '' ? 'Choisis une fourchette de niveau.' : 'Ton niveau n’entre dans aucune fourchette de cette séance.');
        /* compte connecté dont l'adresse est PROUVÉE (posé par le serveur) : il s'inscrit avec sa fiche choisie ; sinon la fiche à l'adresse saisie */
        let fiche;
        if (b.verifie && b.fiche) { fiche = (await fichesDe(clubId, b.verifie)).find(x => x.id === String(b.fiche)); if (!fiche) throw new Refus('Cette fiche n’est pas la tienne.'); }
        else fiche = (await fichesDe(clubId, mail))[0];
        const coach = await coachOfPost(clubId, p), ek = fiche ? fiche.id : 'e' + crypto.randomBytes(6).toString('hex');
        if ((nv.tiers || []).some(x => ((nv.ins || {})[d + '|' + x.id] || []).includes(ek))) throw new Refus('Tu es déjà inscrit à cette date.');
        const titre = nv.mode === 'cours' ? nv.theme || 'Séance collective' : 'Partie dirigée', ops = [];
        if (!fiche) ops.push({ coll: 'eleve', id: ek, op: 'put', data: { n: prenom + ' ' + nom, sport: nv.sport, parents: [], mail, tel, note: 'Arrivé par le lien d’inscription : ' + titre } });
        ops.push({ coll: 'post', id: postId, op: 'patch', patch: [{ p: ['nv', 'ins', d + '|' + tier.id], t: 'add', v: ek }, { p: ['nv', 'at', ek, d], t: 'set', v: Date.now() }, { p: ['nv', 'via', ek], t: 'set', v: Date.now() }] });
        const r = await ram.ops(coach, clubId, ops);
        if (r.rejected && r.rejected.length) throw new Error('Inscription refusée : ' + r.rejected[0].error);
        const apres = nvEtat((await ram.audience(clubId)).get('post', postId).nv, d), statut = apres.status[tier.id + '|' + ek];
        return { statut, d, h: nv.time, dur: nv.dur, titre, prenom, mail, coach: first(au.get('member', p.by)), annuler: `/i/annuler?c=${encodeURIComponent(clubId)}&p=${encodeURIComponent(postId)}&k=${ek}&d=${d}&t=${signeAnnul(clubId, postId + ':' + ek + ':' + d)}` };
      });
    },
    async pubNvDesinscrire(clubId, postId, ek, d, sig) {
      const a = Buffer.from(signeAnnul(String(clubId), String(postId) + ':' + String(ek) + ':' + String(d))), b = Buffer.from(String(sig || ''));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Refus('Ce lien de désinscription n’est pas valable.');
      return serial('nv/' + clubId + '/' + postId, async () => {
        const au = await ram.audience(clubId), p = au && au.get('post', String(postId));
        if (!p || p.kind !== 'niveaux' || !p.nv) throw new Refus('Cette séance n’existe plus.');
        const nv = p.nv, t = today(), l = (nv.tiers || []).filter(x => ((nv.ins || {})[d + '|' + x.id] || []).includes(ek));
        if (!l.length) return { ok: true, deja: true };
        if (d < t.d || (d === t.d && hMin(nv.time) <= t.m)) throw new Refus('La séance a déjà commencé : contacte ton enseignant.');
        const reste = Object.keys((nv.at || {})[ek] || {}).filter(x => x !== d).length;
        const patch = l.map(x => ({ p: ['nv', 'ins', d + '|' + x.id], t: 'rm', v: ek })).concat([{ p: ['nv', 'at', ek, d], t: 'unset' }], reste ? [] : [{ p: ['nv', 'via', ek], t: 'unset' }]);
        const r = await ram.ops(await coachOfPost(clubId, p), clubId, [{ coll: 'post', id: String(postId), op: 'patch', patch }]);
        if (r.rejected && r.rejected.length) throw new Error('Désinscription refusée : ' + r.rejected[0].error);
        return { ok: true };
      });
    },
    /* « Déjà élève ? » depuis un lien d'inscription : cette adresse est-elle celle d'une fiche élève du club ? (nom de la fiche, '' sinon) ; le nom de l'enseignant pour les e-mails */
    async pubConnuNv(clubId, postId, tok, email) {
      try { await nvLoad(clubId, postId, tok); } catch (e) { return ''; }
      const l = await fichesDe(clubId, email);
      return l.length ? String(l[0].data.n || 'Élève') : '';
    },
    async pubNvCoach(clubId, postId, tok) { const { au, p } = await nvLoad(clubId, postId, tok); return p.by === 'club' ? au.name : String((au.get('member', p.by) || {}).n || ''); },
    /* un compte connecté et son adresse prouvée (le serveur l'a vérifié) : ses fiches chez cet enseignant, pour préremplir l'inscription ; rien de plus */
    async pubMoiNv(clubId, postId, tok, email) {
      await nvLoad(clubId, postId, tok);
      return { fiches: (await fichesDe(clubId, email)).map(f => ({ id: f.id, nom: String(f.data.n || ''), tel: String(f.data.tel || '') })) };
    },
    /* la photo du compte /RAM d'un inscrit, d'un inscrit de la séance ; l'identifiant est opaque, propre à la séance */
    async pubNvAvatar(clubId, postId, tok, i) {
      const { au, p } = await nvLoad(clubId, postId, tok), nv = p.nv;
      const k = Object.values(nv.ins || {}).flat().find(x => opaqueDe(String(postId), x) === String(i));
      const uid = k && au.user[k];
      const id = uid && store.getIdentity ? await store.getIdentity(uid).catch(() => null) : null;
      const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec((id && id.avatar) || '');
      return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
    },
    /* ---------- « Déjà élève ? » : ce que la page de réservation sait d'un élève connecté (adresse vérifiée par son compte) ---------- */
    /* cette adresse est-elle celle d'une fiche élève de cet enseignant ? (sert à décider d'envoyer un lien, jamais à répondre à la page) */
    async pubConnu(clubId, key, email) {
      const coach = await coachOf(clubId, key), l = coach && coach.offres.page === clubId ? await fichesDe(clubId, email) : [];
      return l.length ? String(l[0].data.n || 'Élève') : '';
    },
    /* ses fiches chez cet enseignant (même adresse) : nom, téléphone, achats avec les séances restantes ; jamais rien d'une autre personne */
    async pubMoi(clubId, key, email) {
      const coach = await coachOf(clubId, key);
      if (!coach || coach.offres.page !== clubId) throw new Refus('Cette page de réservation n’est pas ouverte.');
      const l = await fichesDe(clubId, email), fiches = [];
      for (const f of l) fiches.push({ id: f.id, nom: String(f.data.n || ''), tel: String(f.data.tel || ''), achats: await resumeAchats(coach, clubId, f) });
      return { fiches };
    },
    async pubAnnuler(clubId, id, t) {
      const a = Buffer.from(signeAnnul(String(clubId), String(id))), b = Buffer.from(String(t || ''));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Refus('Ce lien d’annulation n’est pas valable.');
      const x = (await ram.itemsOf(clubId, 'cours')).find(c => c.id === String(id));
      if (!x) throw new Refus('Ce cours n’existe plus.');
      const d = x.data.once;
      if ((x.data.cancel || []).includes(d)) return { ok: true, deja: true };
      if (avant(today(), d, hMin(x.data.h)) < ANNUL_MIN) throw new Refus('Moins de 24 h avant le cours : contacte ton enseignant.');
      const coach = await coachOf(clubId, x.data.coach);
      if (!coach) throw new Refus('Cet enseignant n’est plus de ce club.');
      const r = await ram.ops(coach.user, clubId, [{ coll: 'cours', id: x.id, op: 'put', data: Object.assign({}, x.data, { cancel: [d], annulePar: (x.data.ext || [])[0] }) }]);
      if (r.rejected && r.rejected.length) throw new Error('Annulation refusée : ' + r.rejected[0].error);
      return { ok: true };
    },
    /* annuler un cours réservé, jusqu'à 24 h avant ; il reste affiché annulé au planning de l'enseignant */
    async annuler(userId, clubId, id) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      const x = (await ram.itemsOf(clubId, 'cours')).find(c => c.id === String(id));
      if (!x || !String(x.data.cal || '').startsWith('ram:') || x.data.nv || !(x.data.mem || []).some(k => minesOf(me).includes(k))) throw new Refus('Ce cours n’est pas annulable ici.');
      const d = x.data.once;
      if ((x.data.cancel || []).includes(d)) return { ok: true };
      if (avant(today(), d, hMin(x.data.h)) < ANNUL_MIN) throw new Refus('Moins de 24 h avant le cours : contacte ton enseignant.');
      const coach = await coachOf(clubId, x.data.coach);
      if (!coach) throw new Refus('Cet enseignant n’est plus de ce club.');
      const r = await ram.ops(coach.user, clubId, [{ coll: 'cours', id: x.id, op: 'put', data: Object.assign({}, x.data, { cancel: [d], annulePar: (x.data.mem || []).find(k => minesOf(me).includes(k)) }) }]);
      if (r.rejected && r.rejected.length) throw new Error('Annulation refusée : ' + r.rejected[0].error);
      return { ok: true };
    },
    /* liste d'attente d'une plage prise : s'y mettre, ou en sortir */
    async attendre(userId, clubId, key, b) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) throw new Refus('Adhésion pas encore validée.');
      const d = String(b.d || ''), du = Math.round(+b.du), au = Math.round(+b.au), pour = b.pour ? String(b.pour) : me.key;
      if (!isDate(d) || !(au > du) || d < today().d) throw new Refus('Créneau invalide.');
      if (!minesOf(me).includes(pour)) throw new Refus('Tu ne t’inscris que pour toi ou ton enfant.');
      const coach = await coachOf(clubId, key);
      if (!coach) throw new Refus('Cet enseignant n’est pas de ce club.');
      const deja = (await ram.itemsOf(clubId, 'attente')).filter(x => x.data.coach === key && x.data.d === d && x.data.du === du && minesOf(me).includes(x.data.k));
      if (deja.length) { await ram.ops(coach.user, clubId, deja.map(x => ({ coll: 'attente', id: x.id, op: 'del' }))); return { attente: false }; }
      const r = await ram.ops(coach.user, clubId, [{ coll: 'attente', id: 'w' + crypto.randomBytes(6).toString('hex'), op: 'put', data: { k: pour, coach: key, d, du, au, at: Date.now() } }]);
      if (r.rejected && r.rejected.length) throw new Error('Liste d’attente refusée : ' + r.rejected[0].error);
      return { attente: true };
    },
    async mes(userId, clubId) {
      const me = await ram.memberCtx(userId, clubId);
      return !me || !me.valid ? [] : mesCours(clubId, minesOf(me));
    },
    /* mes enseignants dans ce club : groupe, cours, ou formule achetée chez eux ; seulement ceux qui ouvrent la réservation */
    async enseignants(userId, clubId) {
      const me = await ram.memberCtx(userId, clubId);
      if (!me || !me.valid) return [];
      const mine = minesOf(me), au = await ram.audience(clubId);
      const lists = (await ram.itemsOf(clubId, 'group')).concat(await ram.itemsOf(clubId, 'cours')), eleves = await ram.itemsOf(clubId, 'eleve');
      const achats = eleves.filter(x => mine.includes(x.id)).flatMap(x => x.data.achats || []).map(a => a.ref), out = [];
      for (const k of Object.keys(au.role).filter(x => (au.role[x] === 'coach' || au.role[x] === 'bureau') && x !== me.key)) {
        const coach = await coachOf(clubId, k);
        if (!coach || !(coach.offres.dispos || []).length) continue;
        const o = coach.offres, siens = new Set([...(o.formules || []), ...(o.packs || []), ...(o.abos || [])].map(x => x.id));
        if (lists.some(x => x.data.coach === k && (x.data.mem || []).some(m => mine.includes(m))) || achats.some(r => siens.has(r))) out.push(k);
      }
      return out;
    }
  };
}
module.exports = { createReservation, paris, nvEtat };
