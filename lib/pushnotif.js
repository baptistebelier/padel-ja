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

function createNotifier({ ram, push, log = () => {} }) {
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
    const send = (uids, body, url, tag, app) => { if (uids.length) out.push([uids, Object.assign({ title, body, url: url + '?club=' + clubId, tag: clubId + '-' + tag }, app ? { app } : {})]); };
    const all = type => accounts(au, au.keys, type, { skip });

    for (const { coll, id, before: a, after: b } of changes) {
      if (!b) continue;
      if (coll === 'post') {
        const url = '#/post/' + id;
        // nouvelle publication du club (annonce, événement, stage…) : tout le monde
        // (un événement encore hors du mur : au moment où il y est promu)
        const promu = a && a.mur === false && b.mur === true;
        if (promu || (!a && b.by === 'club' && b.mur !== false && !['jatour', 'ad', 'result', 'match', 'teamfinal'].includes(b.kind)))
          send(all('club'), 'Nouvelle publication : ' + short(b.title || b.q || b.x || 'à découvrir'), url, 'post-' + id);
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
          send(accounts(au, keys.filter(k => k !== b.by && !(g && k === g.coach)), 'chan', { skip, chan: cid }), txt, '#/chan/' + cid, 'chan-' + cid);
          // l'enseignant du groupe : dans /RAM Coach
          if (g && g.coach && g.coach !== b.by) send(accounts(au, [g.coach], 'chan', { skip, chan: cid, any: true }), txt, '#/chan/' + cid, 'chan-' + cid, 'coach');
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
        Object.keys(lb).filter(k => lb[k] && la[k] !== lb[k]).forEach(k =>
          send(accounts(au, [k], 'team', { skip }), `${au.user[k] ? 'Tu es convoqué' : first(au.get('member', k)) + ' est convoqué'} comme ${lb[k] === 'T' ? 'titulaire' : 'remplaçant'} : ${short(g ? g.name : 'rencontre', 40)} – ${short(b.opp, 40)}${b.when ? ', ' + b.when : ''}`, '#/rec/' + id, 'conv-' + id));
        if (a.st !== 'live' && b.st === 'live' && g)
          send(accounts(au, g.mem || [], 'team', { skip }), `${short(b.opp, 40)} : la rencontre commence en direct`, '#/rec/' + id, 'live-' + id);
      }
      // ajouté à un groupe d'entraînement ou une équipe
      if ((coll === 'group' || coll === 'cours') && a && !b.nv)   // collectif : déjà prévenu par sa publication
        send(accounts(au, added(a.mem, b.mem), 'team', { skip }), `Tu es ajouté à ${short(b.name || 'un groupe', 50)}`, '#/chans', 'grp-' + id);
      if ((coll === 'group' || coll === 'cours') && a) seance(au, id, a, b, send, skip);
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
        if (!a) send(to, `${b.nv ? 'Collectif confirmé' : 'Nouvelle réservation'} : ${short(b.name, 30)} ${when}${who(b).length ? ' avec ' + names(who(b)) : ''}`, url, 'resa-' + id, 'coach');
        else if (cx && !b.nv) send(to, `${b.annulePar ? names([b.annulePar]) + ' annule' : 'Séance annulée'} : ${short(b.name, 30)} ${when}`, url, 'resa-' + id, 'coach');
        else if (cx) send(to, `Collectif sous le minimum, il n'a pas lieu : ${short(b.name, 30)} ${when}`, url, 'resa-' + id, 'coach');
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
    nouveaux(a.cancel, b.cancel).filter(d => d >= t).forEach(d => send(to, `Cours annulé : ${nom}, ${day(d)}${h}`, '#/agenda', 'cx-' + id + d));
    nouveaux(b.cancel, a.cancel).filter(d => d >= t).forEach(d => send(to, `Cours rétabli : ${nom}, ${day(d)}${h}`, '#/agenda', 'cx-' + id + d));
    if (b.once && a.once && (a.once !== b.once || a.h !== b.h) && b.once >= t) send(to, `Cours déplacé : ${nom}, ${day(b.once)}${h}`, '#/agenda', 'mv-' + id);
    if (!b.once) {
      const off = nouveaux(a.skip, b.skip).concat(nouveaux(b.extra, a.extra)).filter(d => d >= t), on = nouveaux(a.extra, b.extra).concat(nouveaux(b.skip, a.skip)).filter(d => d >= t);
      if (off.length === 1 && on.length === 1) send(to, `${nom} : la séance du ${day(off[0])} passe au ${day(on[0])}`, '#/agenda', 'mv-' + id);
      else if (off.length + on.length > 1) send(to, `${nom} : le calendrier des séances change`, '#/agenda', 'mv-' + id);
      else if (off.length) send(to, `${nom} : pas de séance le ${day(off[0])}`, '#/agenda', 'mv-' + id);
      else if (on.length) send(to, `${nom} : séance ajoutée le ${day(on[0])}`, '#/agenda', 'mv-' + id);
    }
    const la = a.loc || {}, lb = b.loc || {};
    Object.keys(lb).filter(d => lb[d] !== la[d] && d >= t).forEach(d => send(to, `${nom}, ${day(d)} : le cours aura lieu ${lb[d] === 'En salle' ? 'en salle' : 'en extérieur'}`, '#/agenda', 'loc-' + id + d));
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
  ram.onOps((clubId, actor, changes) => setImmediate(() => handle(clubId, actor, changes).catch(e => log('Notifications : ' + e.message))));
  return { handle };
}

module.exports = { createNotifier };
