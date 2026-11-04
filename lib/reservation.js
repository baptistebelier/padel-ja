/* =========================================================================
   /RAM Réservation — réserver un cours avec un enseignant depuis /RAM Club
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

function createReservation({ ram, store, coachTables, Formules, push, taches, agenda, Mail, now, log = () => {} }) {
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
    return { user: m.user_id, key, offres: await Formules.get(store, m.user_id) };
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
  async function prevenir(clubId, au, keys, body, url, tag) {
    const uids = comptes(au, keys);
    if (uids.length && push) await push.sendMany(uids, { title: au.name || '/RAM Club', body, url: url + '?club=' + clubId, tag: clubId + '-' + tag });
  }
  async function prevenirCoach(clubId, au, uid, body, url, tag) {
    if (uid && push) await push.sendMany([uid], { title: au.name || '/RAM Club', body, url: url + '?club=' + clubId, tag: clubId + '-' + tag, app: 'coach' });
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
    await prevenir(c, au, (x.mem || []).filter(k => !abs.has(k)), quand === 'veille' ? `Rappel : ${x.name} avec ${qui}, demain à ${h}` : `Rappel : ${x.name} avec ${qui}, dans 2 h (${h})`, '#/agenda', 'rappel-' + id);
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
      const id = coursId(postId, d), x = au.get('cours', id), w = nvValidatedOn(nv, d), annule = !!x && (x.cancel || []).includes(d);
      if (!w.length) {
        if (x && !annule) {
          ops.push({ coll: 'cours', id, op: 'put', data: Object.assign({}, x, { cancel: [d] }) });
          await prevenir(clubId, au, inscrits(nv, d), `${x.name} du ${dayTxt(d)} : le minimum n'est plus atteint, le cours n'a pas lieu pour l'instant`, '#/post/' + postId, 'coll-' + id);
        }
        continue;
      }
      const nom = nv.theme || (nv.mode === 'cours' ? 'Séance collective' : 'Partie dirigée');
      if (x && !annule && JSON.stringify(x.mem || []) === JSON.stringify(w) && x.h === nv.time && x.dur === nv.dur && x.name === nom) continue;
      const prix = parseFloat(String(nv.price || '').replace(',', '.'));
      ops.push({ coll: 'cours', id, op: 'put', data: x ? Object.assign({}, x, { mem: w, cancel: [], h: nv.time, dur: nv.dur, name: nom, sub: `${d.split('-').reverse().join('/')} ${nv.time} · ${nv.dur}` }) : { type: 'train', name: nv.theme || (nv.mode === 'cours' ? 'Séance collective' : 'Partie dirigée'), sport: nv.sport, day: REGLES.dowOf(d), h: nv.time, dur: nv.dur,
        defLoc: 'En salle', coach: post.by, once: d, cal: 'ram:' + id, mem: w, ext: [], nv: postId, sub: `${d.split('-').reverse().join('/')} ${nv.time} · ${nv.dur}`, ...(prix > 0 ? { tarif: { mode: 'eleve', prix } } : {}), ...(nv.theme ? { goal: nv.theme } : {}), at: Date.now() } });
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
      const au = await ram.audience(clubId), l = await jours(coach, de, nbJours(n));
      return { coach: String((au.get('member', key) || {}).n || ''), club: au.name, formules: formulesOf(coach.offres), jours: l.map(j => ({ d: j.d, libres: j.libres })) };
    },
    async pubReserver(clubId, key, b) {
      const prenom = String(b.prenom || '').trim().slice(0, 40), nom = String(b.nom || '').trim().slice(0, 40), mail = String(b.email || '').trim().toLowerCase().slice(0, 120), tel = String(b.tel || '').trim().slice(0, 30), objectif = String(b.objectif || '').trim().slice(0, 300), sexe = ['F', 'H'].includes(b.sexe) ? b.sexe : '';
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
        const f = (coach.offres.formules || []).find(x => x.id === b.formule && +x.joueurs === 1);
        if (!f) throw new Refus('Cette formule n’est pas réservable.');
        const [jour] = await jours(coach, d, 1);
        if (!jour.libres.some(p => debut >= p.du && debut + f.duree <= p.au)) throw new Refus('Ce créneau vient d’être pris. Choisis-en un autre.');
        const fiche = (await ram.itemsOf(clubId, 'eleve')).find(x => String(x.data.mail || '').toLowerCase() === mail), ek = fiche ? fiche.id : 'e' + crypto.randomBytes(6).toString('hex');
        const id = 'r' + crypto.randomBytes(6).toString('hex'), h = hTxt(debut), dur = durTxt(f.duree), ops = [];
        if (!fiche) ops.push({ coll: 'eleve', id: ek, op: 'put', data: { n: prenom + ' ' + nom, sport: f.sport, parents: [], mail, tel, ...(sexe ? { sexe } : {}), note: 'Arrivé par la page de réservation' } });
        ops.push({ coll: 'cours', id, op: 'put', data: { type: 'train', name: f.nom, sport: f.sport, day: REGLES.dowOf(d), h, dur, defLoc: 'En salle', coach: key, once: d, cal: 'ram:' + id, mem: [], ext: [ek], sub: `${d.split('-').reverse().join('/')} ${h} · ${dur}`, tarif: { mode: f.par === 'personne' ? 'eleve' : 'seance', prix: f.prix }, goal: objectif, at: Date.now() } });
        const r = await ram.ops(coach.user, clubId, ops);
        if (r.rejected && r.rejected.length) throw new Error('Cours refusé : ' + r.rejected[0].error);
        return { id, d, h, dur, nom: f.nom, prenom, mail, coach: first((await ram.memberByKey(clubId, key)).data), annuler: `/r/annuler?c=${encodeURIComponent(clubId)}&id=${id}&t=${signeAnnul(clubId, id)}` };
      });
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
module.exports = { createReservation, paris };
