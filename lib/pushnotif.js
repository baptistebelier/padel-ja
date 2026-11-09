/* =========================================================================
   /RAM Club — notifications sur le téléphone (appli fermée)
   Le serveur regarde chaque changement d'un espace et prévient les adhérents concernés :
   publication du club, message dans un groupe, commentaire, convocation, partie, tournoi /RAM JA,
   séance validée, réservation au bar, demande d'adhésion.
   - Chacun garde la main : réglages « Mes notifications » (club, groupes, équipe, parties, mes publications)
     et groupes en sourdine.
   - L'auteur du changement n'est jamais prévenu de sa propre action ; un enfant sans compte, par son parent.
   - Seulement les événements utiles : pas de like ni de réaction (ils restent dans l'appli).
   ========================================================================= */
'use strict';
const REGLES = require('../club/regles.js');
const { nvValidated, nvValidatedOn } = require('./ram-score');

const first = d => String((d && d.n) || '').split(' ')[0] || "Quelqu'un";
const short = (s, n = 90) => { s = String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const added = (a, b) => (Array.isArray(b) ? b : []).filter(k => !(Array.isArray(a) ? a : []).includes(k));
const hm = at => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(at)).replace(':', ' h ');
const place = r => (+r.place === 1 ? '1re place' : r.lo && r.lo !== r.place ? `${r.place}e-${r.lo}e place` : `${r.place}e place`);
const day = iso => { const d = new Date(String(iso) + 'T12:00:00Z'); return isNaN(d) ? String(iso || '') : new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(d); };

const auj = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
/* élèves annoncés absents d'une date */
const absents = (g, d) => new Set([...Object.keys(((g && g.resp) || {})[d] || {}).filter(k => g.resp[d][k] === 'no'), ...(((g && g.abs) || {})[d] || [])]);
const nouveaux = (a, b) => (b || []).filter(x => !(a || []).includes(x));
/* début d'un cours (date + « 10 h 30 », heure de Paris) → instant ; urgence : il commence dans les 2 h (ou a commencé il y a moins d'1 h),
   le message passe alors même pendant les heures calmes (lib/webpush.js) */
function debutParis(d, h) {
  const x = String(h || '').match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
  if (!d || !x) return NaN;
  const g = Date.parse(`${d}T${String(x[1]).padStart(2, '0')}:${x[2] || '00'}:00Z`);
  if (isNaN(g)) return NaN;
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(g));
  return g - (Date.parse(p.replace(' ', 'T') + ':00Z') - g);
}
const bientot = (d, h, now = Date.now()) => { const t = debutParis(d, h) - now; return t <= 2 * 3600e3 && t > -3600e3; };
const urg = (...l) => (l.some(([d, h]) => bientot(d, h)) ? { urgent: true } : null);

/* qui est visé par le ciblage d'une publication (mêmes règles que l'appli : ruleOk) ; l'équipe voit tout */
function vise(au, k, rule) {
  if (!rule || au.role[k] === 'bureau' || au.role[k] === 'coach') return true;
  const v = au.get('member', k) || {}, naiss = v.bd ? new Date(v.bd) : null, ans = naiss && !isNaN(naiss) ? (Date.now() - naiss) / (365.25 * 864e5) : 30, rg = x => REGLES.RANKS.indexOf(x);
  if (rule.pub === 'Bureau uniquement' || rule.pub === 'Équipe pédagogique') return false;
  if (rule.pub === 'Parents' && !au.keys.some(x => au.parent[x] === k)) return false;
  if ((rule.gen === 'Hommes' && v.g !== 'H') || (rule.gen === 'Femmes' && v.g !== 'F')) return false;
  if ((rule.age === 'Jeunes' && ans >= 18) || (rule.age === 'Adultes' && ans < 18)) return false;
  if ((rule.prat === 'Compétiteurs' && v.r === 'NC') || (rule.prat === 'Loisir' && v.r !== 'NC')) return false;
  if (rule.tn || rule.pd) {
    const t = rule.tn && rg(v.r) >= rule.tn[0] && rg(v.r) <= rule.tn[1], p = rule.pd && v.pl != null && v.pl >= rule.pd[0] && v.pl <= rule.pd[1];
    if (!t && !p) return false;
  }
  return true;
}
/* ce niveau entre-t-il dans cette fourchette ? padel : niveaux 1 à 10 ; tennis : classements */
function dansNiveau(v, sport, lo, hi) {
  if (sport === 'Padel') return v.pl != null && v.pl >= +lo && v.pl <= +hi;
  const i = REGLES.RANKS.indexOf(v.r), x = REGLES.RANKS.indexOf(lo), y = REGLES.RANKS.indexOf(hi);
  return i >= 0 && i >= Math.min(x, y) && i <= Math.max(x, y);
}
const inscritsEv = p => Object.keys(p.myBy || {}).filter(k => ['yes', 'wait', 'maybe'].includes(p.myBy[k]));
const nbOui = p => Object.values(p.myBy || {}).filter(v => v === 'yes').length;

function createNotifier({ ram, push, formules, log = () => {} }) {
  /* destinataires : clés d'adhérents → comptes (un enfant sans compte → son parent), réglages respectés */
  function accounts(au, keys, type, opts = {}) {
    const out = new Map();
    for (const k of new Set(keys)) {
      if (!k || k === 'club') continue;
      const owner = au.user[k] ? k : au.parent[k];
      const uid = au.user[owner];
      if (!uid || (opts.skip && opts.skip.has(uid))) continue;
      if (!opts.any && !au.valid[k] && !au.valid[owner]) continue;
      const p = au.prefs(owner);
      if (type && p.nset && p.nset[type] === false) continue;
      if (opts.chan && Array.isArray(p.mute) && p.mute.includes(opts.chan)) continue;
      if (!out.has(uid)) out.set(uid, owner);
    }
    return [...out.keys()];
  }

  async function handle(clubId, actor, changes) {
    const au = await ram.audience(clubId); if (!au) return;
    const skip = new Set(actor && actor.user ? [actor.user] : []);
    const nm = k => (k === 'club' ? au.name : first(au.get('member', k)));
    const title = au.name || '/RAM Club';
    const out = [];   // [comptes, message]
    const send = (uids, body, url, tag, app, plus) => { if (uids.length) out.push([uids, Object.assign({ title, body, url: url + '?club=' + clubId, tag: clubId + '-' + tag }, app ? { app } : {}, plus || {})]); };
    const all = type => accounts(au, au.keys, type, { skip });

    for (const { coll, id, before: a, after: b } of changes) {
      // événement supprimé : ceux qui s'y étaient positionnés
      if (!b) {
        if (coll === 'post' && a && a.kind === 'event')
          send(accounts(au, inscritsEv(a), 'club', { skip }), `Annulé : ${short(a.title, 50)}${a.date ? ', ' + short(a.date, 40) : ''}`, '#/agenda', 'evx-' + id);
        continue;
      }
      // nouvelle réponse à un formulaire : son auteur, une seule notification par formulaire qui se met à jour
      if (coll === 'rep' && !a && b && b.f) {
        const f = au.get('form', b.f);
        if (f && f.by) send(accounts(au, [f.by], 'club', { skip }), `Nouvelle réponse à « ${short(f.title, 50)} »`, '#/formres/' + b.f, 'formrep-' + b.f);
        continue;
      }
      if (coll === 'post') {
        const url = '#/post/' + id;
        // nouvelle publication du club (annonce, événement, stage…) : tout le monde
        // (un événement encore hors du mur : au moment où il y est promu)
        const promu = a && a.mur === false && b.mur === true;
        if (promu || (!a && b.by === 'club' && b.mur !== false && !['jatour', 'ad', 'result', 'match', 'teamfinal'].includes(b.kind)))
          send(accounts(au, au.keys.filter(k => vise(au, k, b.rule)), 'club', { skip }), 'Nouvelle publication : ' + short(b.title || b.q || b.x || 'à découvrir'), url, 'post-' + id);
        // résultat d'un adhérent adulte : ses abonnés
        if (!a && (b.kind === 'perf' || b.kind === 'padel') && !au.parent[b.by]) {
          const r = b.res, pr = b.pres, txt = b.kind === 'perf' && r ? `${r.w ? 'gagne' : 'perd'} contre ${short(r.opp, 30)} : ${r.sc}${r.perf ? ' · perf !' : ''}` : pr ? `termine ${pr.place} en ${pr.cat}` : 'publie un résultat';
          send(accounts(au, abonnes(au, b.by), 'follow', { skip }), `${nm(b.by)} ${txt}`, url, 'res-' + id);
        }
        // recherche de partie : les adhérents de la fourchette
        if (!a && b.kind === 'play' && b.play) {
          const y = b.play, l = au.keys.filter(k => k !== b.by && dansNiveau(au.get('member', k) || {}, y.sport, y.lo, y.hi));
          send(accounts(au, l, 'play', { skip }), `${nm(b.by)} cherche des joueurs : ${String(y.sport).toLowerCase()}, ${y.date} à ${y.time}`, url, 'playnew-' + id);
        }
        // nouveau collectif ou partie dirigée : les adhérents d'une de ses fourchettes (une demande d'élève a déjà son message)
        if (!a && b.kind === 'niveaux' && b.nv && !b.nv.demande) {
          const nv = b.nv, l = au.keys.filter(k => k !== b.by && (nv.tiers || []).some(t => dansNiveau(au.get('member', k) || {}, nv.sport, t.lo, t.hi)));
          send(accounts(au, l, 'play', { skip }), `${nv.mode === 'cours' ? 'Nouvelle séance collective' : 'Nouvelle partie dirigée'}${nv.theme ? ' : ' + short(nv.theme, 40) : ''}, ${day((nv.dates || [])[0])} à ${nv.time}`, url, 'nvnew-' + id);
        }
        // ma partie : désistement, liste d'attente, place libérée, créneau déplacé
        if (a && b.play && a.play && b.by !== 'club') {
          const y = b.play, or = accounts(au, [b.by], 'play', { skip });
          nouveaux(y.in, a.play.in).filter(k => k !== b.by).forEach(k => send(or, `${nm(k)} se désiste de ta partie du ${y.date} à ${y.time}`, url, 'play-' + id));
          nouveaux(a.play.wait, y.wait).filter(k => k !== b.by).forEach(k => send(or, `${nm(k)} se met en attente pour ta partie du ${y.date}`, url, 'play-' + id));
          if ((a.play.in || []).length >= a.play.places && (y.in || []).length < y.places && (y.wait || []).length)
            send(accounts(au, [y.wait[0]], 'play', { skip }), `Une place s'est libérée : partie du ${y.date} à ${y.time}`, url, 'playlib-' + id);
          if (a.play.d !== y.d || a.play.time !== y.time)
            send(accounts(au, [...(y.in || []), ...(y.wait || [])], 'play', { skip }), `${nm(b.by)} déplace sa partie au ${y.date} à ${y.time}`, url, 'playmv-' + id);
        }
        // événement, stage : l'organisateur voit qui s'inscrit, et le premier en attente qu'une place se libère
        if (a && (b.kind === 'event' || b.kind === 'comm')) {
          const ma = a.myBy || {}, mb = b.myBy || {}, org = accounts(au, b.by === 'club' ? au.bureau : [b.by], 'club', { skip, any: true }), app = b.stage && au.role[b.by] === 'coach' ? 'coach' : undefined, tit = short(b.title, 40);
          [...new Set([...Object.keys(ma), ...Object.keys(mb)])].filter(k => ma[k] !== mb[k]).forEach(k => {
            const t = mb[k] === 'yes' ? "s'inscrit à" : mb[k] === 'wait' ? 'se met en attente pour' : mb[k] === 'maybe' ? 'est intéressé par' : ma[k] === 'yes' ? 'se désinscrit de' : '';
            if (t) send(org, `${nm(k)} ${t} « ${tit} »`, url, 'rsvp-' + id + k, app);
          });
          nouveaux(a.vol, b.vol).forEach(k => send(org, `${nm(k)} se propose comme bénévole : « ${tit} »`, url, 'vol-' + id + k, app));
          const att = Object.keys(mb).filter(k => mb[k] === 'wait');
          if (b.cap && nbOui(a) >= b.cap && nbOui(b) < b.cap && att.length)
            send(accounts(au, [att[0]], 'club', { skip }), `Une place s'est libérée : « ${tit} »`, url, 'evlib-' + id);
        }
        // ma partie : qui la rejoint
        if (a && b.play && a.play && b.by !== 'club')
          added(a.play.in, b.play.in).filter(k => k !== b.by).forEach(k =>
            send(accounts(au, [b.by], 'play', { skip }), `${nm(k)} rejoint ta partie du ${b.play.date} à ${b.play.time}`, url, 'play-' + id));
        // tournoi /RAM JA ou animation publiés par le serveur
        if (b.kind === 'jatour' && b.ja) jatour(au, id, a, b, send, skip);
        // événement modifié : ses inscrits, en attente et intéressés ; collectif modifié : ses inscrits
        if (a && b.kind === 'event' && ['d', 'd2', 'h1', 'h2', 'place'].some(k => (a[k] || '') !== (b[k] || '')))
          send(accounts(au, Object.keys(b.myBy || {}).filter(k => ['yes', 'wait', 'maybe'].includes(b.myBy[k])), 'club', { skip }), `Modifié : ${short(b.title, 40)}, ${short(b.date, 40)}${b.place ? ' · ' + short(b.place, 30) : ''}`, url, 'evmod-' + id);
        if (a && b.kind === 'niveaux' && b.nv && a.nv && ['time', 'dur', 'place'].concat('dates').some(k => JSON.stringify(a.nv[k]) !== JSON.stringify(b.nv[k]))) {
          const quoi = short(b.nv.theme || (b.nv.mode === 'cours' ? 'Séance collective' : 'Partie dirigée'), 40), d0 = (b.nv.dates || [])[0];
          send(accounts(au, Object.values(b.nv.ins || {}).flat(), 'play', { skip }), `Modifié : ${quoi}, ${day(d0)} à ${b.nv.time}`, url, 'nvmod-' + id);
        }
        // collectif ou partie dirigée de l'enseignant : il voit arriver et partir les inscrits, même avant le minimum
        if (b.kind === 'niveaux' && b.nv && a && a.nv && b.by !== 'club') {
          const quoi = short(b.nv.theme || (b.nv.mode === 'cours' ? 'Séance collective' : 'Partie dirigée'), 40), ia = a.nv.ins || {}, ib = b.nv.ins || {};
          [...new Set([...Object.keys(ia), ...Object.keys(ib)])].forEach(q => {
            const d = q.split('|')[0], to = accounts(au, [b.by], 'resa', { skip, any: true });
            nouveaux(ia[q], ib[q]).forEach(k => send(to, `${nm(k)} s'inscrit : ${quoi}, ${day(d)}`, url, 'nvin-' + id + k, 'coach'));
            nouveaux(ib[q], ia[q]).forEach(k => send(to, `${nm(k)} se désinscrit : ${quoi}, ${day(d)}`, url, 'nvin-' + id + k, 'coach'));
          });
        }
        // parties dirigées et séances : chacun est prévenu quand sa date est validée
        if (b.kind === 'niveaux' && b.nv && a && a.nv) {
          const was = new Set(nvValidated(a.nv)), now = nvValidated(b.nv).filter(k => !was.has(k));
          if (now.length) send(accounts(au, now, 'play', { skip }), `${b.nv.mode === 'cours' ? 'Ta séance' : 'Ta partie dirigée'} est validée : tu y es inscrit`, url, 'nv-' + id);
          // une fourchette vient d'atteindre son minimum : les inscrits des autres passent en liste d'attente
          (b.nv.dates || []).forEach(d => {
            const win = nvValidatedOn(b.nv, d);
            if (!win.length || nvValidatedOn(a.nv, d).length) return;
            const att = Object.keys(b.nv.ins || {}).filter(q => q.startsWith(d + '|')).flatMap(q => b.nv.ins[q]).filter(k => !win.includes(k));
            send(accounts(au, att, 'play', { skip }), `Une autre fourchette est complète pour le ${day(d)} : tu passes en liste d'attente`, url, 'nvw-' + id);
          });
        }
      }
      if (coll === 'msg' && !a && b.ref) {
        const ref = String(b.ref);
        if (ref.startsWith('c:')) {
          const cid = ref.slice(2), ch = au.get('chan', cid); if (!ch) continue;
          const g = au.get('group', cid);
          const keys = REGLES.chanRegle(ch) ? au.keys.filter(k => REGLES.chanOuvert(ch, g, [k])) : g ? [...(g.mem || []), g.cap].filter(Boolean) : au.keys, txt = `${nm(b.by)} dans ${short(ch.name, 40)} : ${b.img && !b.x ? 'Photo' : short(b.x, 80)}`;
          // une discussion, un fil : plusieurs messages rapprochés se remplacent sur le téléphone (« 5 nouveaux messages dans Équipe 1 », club/fil-notif.js)
          const fil = { fil: short(ch.name, 40) };
          send(accounts(au, keys.filter(k => k !== b.by && !(g && k === g.coach)), 'chan', { skip, chan: cid }), txt, '#/chan/' + cid, 'chan-' + cid, undefined, fil);
          // l'enseignant du groupe : dans /RAM Coach
          if (g && g.coach && g.coach !== b.by) send(accounts(au, [g.coach], 'chan', { skip, chan: cid, any: true }), txt, '#/chan/' + cid, 'chan-' + cid, 'coach', fil);
        } else if (ref.startsWith('p:')) {
          const pid = ref.slice(2), p = au.get('post', pid); if (!p) continue;
          const to = p.by !== b.by && p.by !== 'club' ? [p.by] : [];
          if (b.rep && b.rep.by && b.rep.by !== b.by && b.rep.by !== p.by) to.push(b.rep.by);
          send(accounts(au, to, 'mine', { skip }), `${nm(b.by)} a commenté : « ${short(b.x || 'Photo', 70)} »`, '#/post/' + pid, 'com-' + pid);
        }
      }
      // convocation d'une rencontre par équipe
      if (coll === 'rec' && a) {
        const la = a.lineup || {}, lb = b.lineup || {};
        const g = au.get('group', b.tid);
        // réponses à la convocation : le capitaine ; fin de la rencontre : l'équipe
        if (g && g.cap) Object.keys(b.conv || {}).filter(k => (a.conv || {})[k] !== b.conv[k] && ['ok', 'no'].includes(b.conv[k])).forEach(k =>
          send(accounts(au, [g.cap], 'team', { skip }), `${nm(k)} ${b.conv[k] === 'ok' ? 'est dispo' : "n'est pas dispo"} contre ${short(b.opp, 40)}`, '#/rec/' + id, 'conv-' + id + k));
        if (a.st === 'live' && b.st === 'done' && g)
          send(accounts(au, g.mem || [], 'team', { skip }), `${short(b.opp, 40)} : fin de la rencontre`, '#/rec/' + id, 'live-' + id);
        Object.keys(lb).filter(k => lb[k] && la[k] !== lb[k]).forEach(k =>
          send(accounts(au, [k], 'team', { skip, any: true }), `${au.user[k] ? 'Tu es convoqué' : first(au.get('member', k)) + ' est convoqué'} comme ${lb[k] === 'T' ? 'titulaire' : 'remplaçant'} : ${short(g ? g.name : 'rencontre', 40)} – ${short(b.opp, 40)}${b.when ? ', ' + b.when : ''}`, '#/rec/' + id, 'conv-' + id));
        if (a.st !== 'live' && b.st === 'live' && g)
          send(accounts(au, g.mem || [], 'team', { skip }), `${short(b.opp, 40)} : la rencontre commence en direct`, '#/rec/' + id, 'live-' + id);
      }
      // ajouté à un groupe d'entraînement ou une équipe (une équipe créée avec ses joueurs aussi) ; même si l'adhésion
      // de la saison n'est pas encore validée : être mis dans une équipe, c'est déjà être accepté
      if ((coll === 'group' || coll === 'cours') && !b.nv && (a || b.type === 'team'))   // collectif : déjà prévenu par sa publication
        send(accounts(au, added(a ? a.mem : [], b.mem), 'team', { skip, any: true }), `Tu es ajouté à ${short(b.name || 'un groupe', 50)}`, b.type === 'team' ? '#/club' : '#/chans', 'grp-' + id);
      if ((coll === 'group' || coll === 'cours') && a) seance(au, id, a, b, send, skip);
      if (coll === 'group' && b.cap && (!a || a.cap !== b.cap))
        send(accounts(au, [b.cap], 'team', { skip, any: true }), `Tu es capitaine : ${short(b.name || 'équipe', 40)}`, '#/club', 'cap-' + id);
      // appel : un paiement arrive, un pack se termine
      if (coll === 'seance' && b.pres) await paiements(au, b, a, send);
      // séance : nouveau thème, remplaçant, élève ajouté ou retiré de cette séance (élèves avec compte)
      if (coll === 'seance') seanceEleves(au, id, a, b, send, skip);
      // cycle d'un groupe : nouvel enseignant, nouveau thème
      if (coll === 'group' && a && !b.once) cyclesEleves(au, id, a, b, send, skip);
      // abonné, classement, adhésion validée
      if (coll === 'member' && a) {
        nouveaux(a.fo, b.fo).forEach(k => send(accounts(au, [k], 'mine', { skip }), `${first(b)} te suit désormais`, '#/club', 'fo-' + id));
        if (b.valid && a.valid !== b.valid) send(accounts(au, [id], 'club', { skip, any: true }), `Ton adhésion est validée pour la saison ${b.valid}`, '#/club', 'valid-' + id);
        // trois choses distinctes : chacune son message
        const abo = () => accounts(au, abonnes(au, id), 'follow', { skip });
        if (a.r !== b.r) send(abo(), `Nouveau classement de tennis pour ${first(b)} : ${b.r}`, '#/club', 'rank-t-' + id);
        if ((a.pad || '') !== (b.pad || '')) send(abo(), `Nouveau classement de padel pour ${first(b)}${b.pad ? ' : n° ' + b.pad : ''}`, '#/club', 'rank-p-' + id);
        if ((a.pl || 0) !== (b.pl || 0)) send(abo(), `Nouveau niveau de padel pour ${first(b)}${b.pl ? ' : ' + b.pl : ''}`, '#/club', 'rank-n-' + id);
        // niveau certifié par un enseignant : l'adhérent (ou son parent) est prévenu
        for (const f of ['pl', 'tn']) {
          const c = b.cert && b.cert[f];
          if (!c || (a.cert && a.cert[f] && a.cert[f].at === c.at)) continue;
          const v = f === 'pl' ? 'niveau ' + b.pl : 'niveau ' + ((b.tn && b.tn.n) || '') + (b.tn && b.tn.t ? ' (' + short(b.tn.t, 30) + ')' : '');
          send(accounts(au, [id], 'club', { skip, any: true }), `Ton ${f === 'pl' ? 'niveau de padel' : 'niveau de tennis'} est désormais : ${v}, certifié par ${nm(c.by)}`, '#/me', 'cert-' + f + '-' + id);
        }
      }
      // commissions : la demande pour le responsable et le bureau, la réponse pour le demandeur
      if (coll === 'comm' && a) {
        const nomc = short(b.name || 'commission', 40).toLowerCase();
        nouveaux(a.req, b.req).forEach(k => send(accounts(au, [...new Set([b.resp, ...au.bureau])].filter(Boolean), 'club', { skip, any: true }), `${nm(k)} souhaite rejoindre : ${nomc}`, '#/club', 'creq-' + id + k));
        nouveaux(a.mem, b.mem).forEach(k => send(accounts(au, [k], 'club', { skip }), `Tu rejoins : ${nomc}`, '#/club', 'creq-' + id + k));
        nouveaux(b.req, a.req).filter(k => !(b.mem || []).includes(k)).forEach(k => send(accounts(au, [k], 'club', { skip }), `Ta demande n'est pas retenue : ${nomc}`, '#/club', 'creq-' + id + k));
      }
      // trophée décerné par le club
      if (coll === 'stats' && a) nouveaux(a.k, b.k).filter(x => /^award:/.test(x)).forEach(() => send(accounts(au, [id], 'mine', { skip, any: true }), 'Le club te décerne un trophée', '#/club', 'award-' + id));
      // bar annulé, signalement : le bureau
      if (coll === 'order' && a && a.st !== 'annule' && b.st === 'annule') send(accounts(au, au.bureau, 'club', { skip }), `${nm(b.by)} annule : ${b.qty} × ${short(b.name, 40)} · ${day(b.date)}`, '#/club', 'bar');
      if (coll === 'report' && !a) send(accounts(au, au.bureau, 'club', { skip, any: true }), `Signalement de ${nm(b.by)} : ${short(b.excerpt || 'à regarder', 70)}`, '#/club', 'report-' + id);
      // un cours ponctuel posé par l'enseignant pour un élève
      if (coll === 'cours' && !a && b.once && !b.cal && !b.nv)
        send(accounts(au, b.mem || [], 'resa', { skip }), `Nouveau cours : ${short(b.name, 30)}, ${day(b.once)} à ${b.h || ''}`, '#/agenda', 'cours-' + id);
      // bar : le bureau voit arriver réservations et bons d'échange
      if (coll === 'order' && !a && b.st !== 'annule')
        send(accounts(au, au.bureau, 'club', { skip }), `${nm(b.by)} réserve ${b.qty} × ${short(b.name, 40)} · ${day(b.date)}`, '#/club', 'bar');
      if (coll === 'redeem' && !a && b.st === 'ok')
        send(accounts(au, au.bureau, 'club', { skip }), `${nm(b.by)} prend ${short(b.name, 40)} avec ${b.pts} points`, '#/club', 'bar');
      // /RAM Coach : l'élève (ou son parent) reçoit ce que l'enseignant lui envoie ; l'enseignant, les réponses
      if (coll === 'suivi' && !a && b.to) {
        const what = { msg: 'Message', bilan: 'Bilan de séance', video: b.re ? 'Analyse vidéo' : 'Vidéo', contenu: 'Contenu' }[b.k] || 'Message';
        if (b.by !== b.to && au.get('member', b.to) && au.get('member', b.to).parent !== b.by)
          send(accounts(au, [b.to], 'suivi', { skip }), `${what} de ${nm(b.by)} : ${short(b.txt || 'à découvrir', 80)}`, '#/dm/' + b.to, 'suivi-' + b.to);
        else {
          const coaches = new Set();
          au.list('suivi').forEach(x => { if (x && x.to === b.to && x.by !== b.to && x.by !== b.by) coaches.add(x.by); });
          send(accounts(au, [...coaches], 'suivi', { skip, any: true }), `${what} de ${nm(b.by)} : ${short(b.txt || 'à regarder', 80)}`, '#/dm/' + b.to, 'suivi-' + b.to, 'coach');
        }
      }
      // /RAM Coach : une réservation (Calendly…) arrive dans le planning de l'enseignant, ou s'annule ;
      // posée par le serveur au nom de l'enseignant : il est prévenu quand même
      if ((coll === 'group' || coll === 'cours') && b.cal && b.coach) {
        const who = l => [...((l && l.mem) || []), ...((l && l.ext) || [])], names = l => l.map(k => first(au.get('member', k) || au.get('eleve', k))).join(', ');
        const when = `${day(b.once)} à ${b.h || ''}`, to = accounts(au, [b.coach], 'resa', { any: true, skip: actor && actor.client ? skip : null }), url = '#/seance/' + id + '.' + b.once;
        const plus = who(b).filter(k => !who(a).includes(k)), moins = a ? who(a).filter(k => !who(b).includes(k)) : [], cx = (b.cancel || []).length > ((a && a.cancel) || []).length;
        if (!a) send(to, `${b.nv ? 'Collectif confirmé' : 'Nouvelle réservation'} : ${short(b.name, 30)} ${when}${who(b).length ? ' avec ' + names(who(b)) : ''}${b.goal && !b.nv ? ' · Objectif : ' + short(b.goal, 90) : ''}`, url, 'resa-' + id, 'coach');
        else if (cx && !b.nv) send(to, `${b.annulePar ? names([b.annulePar]) + ' annule' : 'Séance annulée'} : ${short(b.name, 30)} ${when}`, url, 'resa-' + id, 'coach', urg([b.once, b.h]));
        else if (cx) send(to, `Collectif sous le minimum, il n'a pas lieu : ${short(b.name, 30)} ${when}`, url, 'resa-' + id, 'coach', urg([b.once, b.h]));
        // collectif : ses inscrits sont annoncés depuis sa publication
        else if (plus.length && !b.nv) send(to, `${names(plus)} s'inscrit : ${short(b.name, 30)} ${when}`, url, 'resa-' + id, 'coach');
        else if (moins.length && !b.nv) send(to, `${names(moins)} se retire : ${short(b.name, 30)} ${when}`, url, 'resa-' + id, 'coach');
      }
      // demande d'adhésion : le bureau
      if (coll === 'member' && b.req && !(a && a.req))
        send(accounts(au, au.bureau, 'club', { skip }), `${first(b)} demande à rejoindre le club`, '#/club', 'join');
    }
    // un message, une seule tâche, quel que soit le nombre de destinataires
    for (const [uids, msg] of out) (push.sendMany ? push.sendMany([...uids], msg) : Promise.all([...uids].map(uid => push.send(uid, msg)))).catch(e => log('Notification : ' + e.message));
  }

  /* une séance change (collection seance, « groupe.AAAA-MM-JJ ») : ses élèves avec compte apprennent son nouveau thème
     ou son remplaçant ; un élève ajouté (plus) ou retiré (out) de cette seule séance est prévenu. Rien pour le passé. */
  function seanceEleves(au, id, a, b, send, skip) {
    const d = b.d, g = au.get('group', b.g) || au.get('cours', b.g);
    if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) || d < auj() || (g.cancel || []).includes(d)) return;
    const A = a || {}, nom = short(g.name || 'Cours', 30), quand = `${day(d)}${g.h ? ' à ' + g.h : ''}`, url = '#/agenda';
    const inscrits = [...new Set([...(g.mem || []), ...(g.ext || []), ...(b.plus || [])])].filter(k => !(b.out || []).includes(k));
    const to = accounts(au, inscrits, 'resa', { skip });
    if ((b.theme || '') !== (A.theme || '') && b.theme) send(to, `${nom}, ${quand} : thème « ${short(b.theme, 50)} »`, url, 'th-' + id);
    if ((b.coach || '') !== (A.coach || '')) {
      const qui = REGLES.coachDe(g, d, b);
      send(to, b.coach ? `${nom}, ${quand} : ${first(au.get('member', qui))} remplace ton enseignant` : `${nom}, ${quand} : avec ${first(au.get('member', qui))}, ton enseignant habituel`, url, 'co-' + id);
    }
    nouveaux(A.plus, b.plus).forEach(k => send(accounts(au, [k], 'resa', { skip }), `Tu es ajouté à la séance ${nom}, ${quand}`, url, 'plus-' + id + k));
    nouveaux(b.plus, A.plus).filter(k => !(g.mem || []).includes(k)).forEach(k => send(accounts(au, [k], 'resa', { skip }), `Tu n'es plus inscrit à la séance ${nom}, ${quand}`, url, 'plus-' + id + k));
    nouveaux(A.out, b.out).forEach(k => send(accounts(au, [k], 'resa', { skip }), `Tu es retiré de la séance ${nom}, ${quand}`, url, 'out-' + id + k));
    nouveaux(b.out, A.out).forEach(k => send(accounts(au, [k], 'resa', { skip }), `Tu es de nouveau inscrit à la séance ${nom}, ${quand}`, url, 'out-' + id + k));
  }
  /* les cycles d'un groupe : un nouvel enseignant ou un nouveau thème de cycle, pour les élèves du groupe (s'il reste
     des séances à venir dans ce cycle, ou des séances à planifier) */
  function cyclesEleves(au, id, a, b, send, skip) {
    const t = auj(), avant = new Map((a.cycles || []).map(c => [c.id, c])), nom = short(b.name || 'Groupe', 30);
    const to = () => accounts(au, [...(b.mem || []), ...(b.ext || [])], 'resa', { skip });
    (b.cycles || []).forEach(c => {
      const o = avant.get(c.id);
      if (!o) return;
      const vivant = (c.dates || []).some(d => d >= t) || REGLES.aPlanifier(b, c).length;
      if (!vivant) return;
      if ((c.coach || '') !== (o.coach || '')) send(to(), `${nom} : ${first(au.get('member', c.coach || b.coach))} enseigne désormais le cycle « ${short(c.nom || 'en cours', 40)} »`, '#/agenda', 'cyco-' + id + c.id);
      if ((c.theme || '') !== (o.theme || '') && c.theme) send(to(), `${nom} : thème du cycle « ${short(c.theme, 50)} »`, '#/agenda', 'cyth-' + id + c.id);
      if ((c.bilan || '') !== (o.bilan || '') && c.bilan) send(to(), `${nom} : bilan de fin de cycle « ${short(c.nom || 'cycle', 40)} »`, '#/ecole', 'cybi-' + id + c.id);
    });
  }
  const abonnes = (au, id) => au.keys.filter(k => k !== id && ((au.get('member', k) || {}).fo || []).includes(id));
  /* après l'appel : ce que l'enseignant doit savoir sur les achats de l'élève (jamais envoyé à l'élève) */
  async function paiements(au, b, a, send) {
    const g = au.get('group', b.g) || au.get('cours', b.g);
    if (!g || !g.coach) return;
    const to = accounts(au, [g.coach], 'resa', { any: true }), nm = k => first(au.get('member', k) || au.get('eleve', k)), id = b.g + '.' + b.d;
    const venus = Object.keys(b.pres).filter(k => b.pres[k] === 'P' && ((a && a.pres) || {})[k] !== 'P');
    if (!venus.length || !to.length) return;
    const offres = formules ? await formules(au.user[g.coach]).catch(() => ({})) : {}, seances = au.list('seance'), t = auj();
    for (const k of venus) {
      const e = au.get('eleve', k);
      if (!e || !(e.achats || []).length) continue;
      const venues = seances.filter(s => s.d <= t && s.pres && s.pres[k] === 'P').map(s => [s, au.get('group', s.g) || au.get('cours', s.g)]).filter(x => x[1] && !(x[1].cancel || []).includes(x[0].d))
        .map(([s, x]) => ({ d: s.d, min: REGLES.durMin(x.dur), n: (x.mem || []).length + (x.ext || []).length, sport: x.sport, gid: s.g, cy: (REGLES.cycleDe(x, s.d) || {}).id }));
      REGLES.couverture(e.achats, venues, offres).achats.forEach(h => {
        const [gid, cid] = String(h.cycle || '').split(':'), cg = cid && au.get('group', gid), cy = cg && (cg.cycles || []).find(x => x.id === cid);
        const faites = cy ? cy.dates.filter(d => !(cg.cancel || []).includes(d) && (!h.du || d >= h.du) && (!h.sortie || d <= h.sortie) && REGLES.presDe(seances.find(s => s.g === gid && s.d === d), cg, d)[k] === 'P').length : h.used || 0;
        const nom = short(h.nom || 'achat', 40);
        if (h.pay && !h.pay.off) (h.pay.ech || []).filter(x => !x.ok && +x.s >= 1 && +x.s === faites).forEach(x =>
          send(to, `${nm(k)} : paiement attendu de ${+x.m || 0} €, ${nom}`, '#/seance/' + id, 'pay-' + h.id + x.s, 'coach'));
        if (h.t === 'pack' && !h.cycle && +h.n > 0 && faites === +h.n) send(to, `${nm(k)} a utilisé toutes ses séances : ${nom}`, '#/seance/' + id, 'pk-' + h.id, 'coach');
      });
    }
  }
  /* chaque soir : le rappel des cours de groupe du lendemain aux élèves, et son résumé à chaque enseignant */
  async function veille(jour) {
    const t = jour || auj(), d = REGLES.addDays(t, 1);
    for (const sp of await ram.spaces()) {
      const au = await ram.audience(sp.id); if (!au) continue;
      const out = [], grp = (await ram.itemsOf(sp.id, 'group')).concat(await ram.itemsOf(sp.id, 'cours')).filter(x => x.data.type === 'train' && !x.data.old);
      const coachs = {}, de = c => (coachs[c] = coachs[c] || { n: 0, h: null, bilans: 0 });
      const brouillons = new Set(au.list('brouillon').map(x => x.id)), seances = au.list('seance');
      grp.forEach(({ id, data: g }) => {
        // l'enseignant effectif de chaque séance : remplaçant, enseignant du cycle, puis du groupe (regles.js coachDe)
        const sT = seances.find(x => x.g === id && x.d === t), sD = seances.find(x => x.g === id && x.d === d);
        const kT = REGLES.coachDe(g, t, sT), kD = REGLES.coachDe(g, d, sD);
        if (kT && REGLES.trainOn(g, t) && !(g.cancel || []).includes(t)) {
          if (!(sT && (sT.recap || sT.noRecap)) && !brouillons.has(id + '.' + t)) de(kT).bilans++;
        }
        if (!REGLES.trainOn(g, d) || (g.cancel || []).includes(d)) return;
        if (kD) {
          const c = de(kD), x = String(g.h || '').match(/(d+) h(?: (d+))?/), m = x ? +x[1] * 60 + (+x[2] || 0) : 0;
          c.n++;
          if (c.h === null || m < c.m) { c.h = g.h; c.m = m; }
        }
        // un cours réservé a ses propres rappels (lib/reservation.js)
        if (g.once) return;
        const abs = absents(g, d), qui = first(au.get('member', kD));
        out.push([accounts(au, (g.mem || []).filter(k => !abs.has(k)), 'resa'), { title: au.name || '/RAM Club', body: `Rappel : ${short(g.name, 40)} avec ${qui}, demain à ${g.h}`, url: '#/agenda?club=' + sp.id, tag: sp.id + '-rappel-' + id }]);
      });
      Object.entries(coachs).forEach(([c, x]) => {
        if (!x.n && !x.bilans) return;
        const parts = [x.n ? `Demain : ${x.n} séance${x.n > 1 ? 's' : ''}, la première à ${x.h}` : '', x.bilans ? `${x.bilans} bilan${x.bilans > 1 ? 's' : ''} à écrire aujourd'hui` : ''].filter(Boolean);
        out.push([accounts(au, [c], 'resa', { any: true }), { title: au.name || '/RAM Club', body: parts.join(' · '), url: '#/today?club=' + sp.id, tag: sp.id + '-veille-' + c, app: 'coach' }]);
      });
      for (const [uids, msg] of out) if (uids.length) await (push.sendMany ? push.sendMany(uids, msg) : Promise.all(uids.map(u => push.send(u, msg))));
    }
  }

  /* un cours ou un groupe change : l'enseignant apprend les absences, les élèves (et leurs parents)
     les annulations, les déplacements et le changement de lieu ; rien pour les dates passées */
  function seance(au, id, a, b, send, skip) {
    const t = auj(), nom = short(b.name || 'Cours', 30), nm = k => first(au.get('member', k) || au.get('eleve', k)), h = b.h ? ' à ' + b.h : '';
    if (b.coach) {
      const ra = a.resp || {}, rb = b.resp || {}, xa = a.abs || {}, xb = b.abs || {}, to = accounts(au, [b.coach], 'resa', { skip, any: true });
      [...new Set([...Object.keys(ra), ...Object.keys(rb), ...Object.keys(xa), ...Object.keys(xb)])].filter(d => d >= t).forEach(d => {
        const av = absents(a, d), ap = absents(b, d), url = '#/seance/' + id + '.' + d;
        [...ap].filter(k => !av.has(k)).forEach(k => send(to, `${nm(k)} sera absent : ${nom}, ${day(d)}${h}`, url, 'abs-' + id + d + k, 'coach'));
        [...av].filter(k => !ap.has(k)).forEach(k => send(to, `${nm(k)} sera finalement là : ${nom}, ${day(d)}${h}`, url, 'abs-' + id + d + k, 'coach'));
        Object.keys(rb[d] || {}).filter(k => rb[d][k] === 'ok' && (ra[d] || {})[k] !== 'ok' && !av.has(k)).forEach(k => send(to, `${nm(k)} sera présent : ${nom}, ${day(d)}${h}`, url, 'abs-' + id + d + k, 'coach'));
      });
    }
    if (b.nv) return;   // collectif : ses inscrits sont prévenus depuis sa publication (lib/reservation.js)
    const eleves = (b.mem || []).filter(k => k !== b.annulePar), to = accounts(au, eleves, 'resa', { skip });
    // annulé, déplacé ou changé de lieu alors qu'il commence dans les 2 h : urgent, passe même pendant les heures calmes
    nouveaux(a.cancel, b.cancel).filter(d => d >= t).forEach(d => send(to, `Cours annulé : ${nom}, ${day(d)}${h}`, '#/agenda', 'cx-' + id + d, undefined, urg([d, b.h])));
    nouveaux(b.cancel, a.cancel).filter(d => d >= t).forEach(d => send(to, `Cours rétabli : ${nom}, ${day(d)}${h}`, '#/agenda', 'cx-' + id + d));
    if (b.once && a.once && (a.once !== b.once || a.h !== b.h) && b.once >= t) send(to, `Cours déplacé : ${nom}, ${day(b.once)}${h}`, '#/agenda', 'mv-' + id, undefined, urg([a.once, a.h], [b.once, b.h]));
    if (!b.once) {
      const off = nouveaux(a.skip, b.skip).concat(nouveaux(b.extra, a.extra)).filter(d => d >= t), on = nouveaux(a.extra, b.extra).concat(nouveaux(b.skip, a.skip)).filter(d => d >= t);
      const u = urg(...off.map(d => [d, b.h]));
      if (off.length === 1 && on.length === 1) send(to, `${nom} : la séance du ${day(off[0])} passe au ${day(on[0])}`, '#/agenda', 'mv-' + id, undefined, u);
      else if (off.length + on.length > 1) send(to, `${nom} : le calendrier des séances change`, '#/agenda', 'mv-' + id, undefined, u);
      else if (off.length) send(to, `${nom} : pas de séance le ${day(off[0])}`, '#/agenda', 'mv-' + id, undefined, u);
      else if (on.length) send(to, `${nom} : séance ajoutée le ${day(on[0])}`, '#/agenda', 'mv-' + id);
    }
    const la = a.loc || {}, lb = b.loc || {};
    Object.keys(lb).filter(d => lb[d] !== la[d] && d >= t).forEach(d => send(to, `${nom}, ${day(d)} : le cours aura lieu ${lb[d] === 'En salle' ? 'en salle' : 'en extérieur'}`, '#/agenda', 'loc-' + id + d, undefined, urg([d, b.h])));
  }

  /* tournoi /RAM JA : inscription, horaire du prochain match, tirage, résultat */
  function jatour(au, id, a, b, send, skip) {
    const url = '#/post/' + id, list = b.ja.list || [], before = (a && a.ja && a.ja.list) || [];
    const name = short(b.title, 50);
    const entryOf = (l, k) => l.find(x => x.k1 === k || x.k2 === k);
    const keysIn = new Set(list.flatMap(x => [x.k1, x.k2]).filter(Boolean));
    keysIn.forEach(k => {
      const was = entryOf(before, k), now = entryOf(list, k);
      if (a && !was) send(accounts(au, [k], 'mine', { skip, any: true }), `Inscrit au tournoi « ${name} »${b.d ? ' · ' + day(b.d) : ''}`, url, 'jain-' + id);
      const na = was && was.next, nb = now.next;
      if (nb && !nb.live && nb.at && (!na || Math.abs(nb.at - na.at) >= 15 * 60000 || nb.court !== na.court))
        send(accounts(au, [k], 'team', { skip, any: true }), `Ton match : ${hm(nb.at)}${nb.court ? ' · ' + nb.court : ''} (${name})`, url, 'janext-' + id);
    });
    if (!a || !a.ja) return;
    if (a.ja.status === 'open' && b.ja.status === 'drawn')
      send(accounts(au, [...keysIn], 'mine', { skip, any: true }), `Le tirage du tournoi « ${name} » est fait`, url, 'jadraw-' + id);
    if (a.ja.status !== 'done' && b.ja.status === 'done')
      (b.ja.results || []).forEach(r => {
        const ks = (r.k || []).filter(k => keysIn.has(k));
        if (ks.length) send(accounts(au, ks, 'mine', { skip, any: true }), `Tournoi « ${name} » terminé : ${place(r)}`, url, 'jares-' + id);
      });
  }

  // après la réponse à l'appareil : une notification ne retarde jamais un enregistrement
  let enCours = Promise.resolve();
  ram.onOps((clubId, actor, changes) => {
    const fait = new Promise(r => setImmediate(() => handle(clubId, actor, changes).catch(e => log('Notifications : ' + e.message)).then(r)));
    enCours = Promise.all([enCours, fait]);
  });
  // quand tout ce qui a été déclenché jusqu'ici est parti
  const calme = async () => { let p; do { p = enCours; await p; } while (p !== enCours); };
  return { handle, veille, calme };
}

/* pour le bureau : combien d'adhérents validés reçoivent les notifications sur le téléphone (/RAM Club),
   un enfant sans compte par l'appareil de son parent ; sans compte : ni appli ni notification possible */
async function suiviNotifs(au, push) {
  const adh = au.keys.filter(k => au.valid[k]), compte = k => au.user[k] || au.user[au.parent[k]];
  const ok = await push.abonnes(adh.map(compte).filter(Boolean));
  return { n: adh.filter(k => ok.has(compte(k))).length, m: adh.length, sansCompte: adh.filter(k => !compte(k)).length };
}

module.exports = { createNotifier, debutParis, bientot, suiviNotifs };
