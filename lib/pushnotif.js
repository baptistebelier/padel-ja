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
const { nvValidated } = require('./ram-score');

const first = d => String((d && d.n) || '').split(' ')[0] || "Quelqu'un";
const short = (s, n = 90) => { s = String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const added = (a, b) => (Array.isArray(b) ? b : []).filter(k => !(Array.isArray(a) ? a : []).includes(k));
const hm = at => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(at)).replace(':', ' h ');
const place = r => (+r.place === 1 ? '1re place' : r.lo && r.lo !== r.place ? `${r.place}e-${r.lo}e place` : `${r.place}e place`);
const day = iso => { const d = new Date(String(iso) + 'T12:00:00Z'); return isNaN(d) ? String(iso || '') : new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(d); };

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
    const send = (uids, body, url, tag) => { if (uids.length) out.push([uids, { title, body, url: url + '?club=' + clubId, tag: clubId + '-' + tag }]); };
    const all = type => accounts(au, au.keys, type, { skip });

    for (const { coll, id, before: a, after: b } of changes) {
      if (!b) continue;
      if (coll === 'post') {
        const url = '#/post/' + id;
        // nouvelle publication du club (annonce, événement, stage…) : tout le monde
        if (!a && b.by === 'club' && !['jatour', 'ad', 'result', 'match', 'teamfinal'].includes(b.kind))
          send(all('club'), 'Nouvelle publication : ' + short(b.title || b.q || b.x || 'à découvrir'), url, 'post-' + id);
        // ma partie : qui la rejoint
        if (a && b.play && a.play && b.by !== 'club')
          added(a.play.in, b.play.in).filter(k => k !== b.by).forEach(k =>
            send(accounts(au, [b.by], 'play', { skip }), `${nm(k)} rejoint ta partie du ${b.play.date} à ${b.play.time}`, url, 'play-' + id));
        // tournoi /RAM JA ou animation publiés par le serveur
        if (b.kind === 'jatour' && b.ja) jatour(au, id, a, b, send, skip);
        // parties dirigées et séances : chacun est prévenu quand sa date est validée
        if (b.kind === 'niveaux' && b.nv && a && a.nv) {
          const was = new Set(nvValidated(a.nv)), now = nvValidated(b.nv).filter(k => !was.has(k));
          if (now.length) send(accounts(au, now, 'play', { skip }), `${b.nv.mode === 'cours' ? 'Ta séance' : 'Ta partie dirigée'} est validée : tu y es inscrit`, url, 'nv-' + id);
        }
      }
      if (coll === 'msg' && !a && b.ref) {
        const ref = String(b.ref);
        if (ref.startsWith('c:')) {
          const cid = ref.slice(2), ch = au.get('chan', cid); if (!ch) continue;
          const g = au.get('group', cid);
          const keys = g ? [...(g.mem || []), g.coach, g.cap].filter(Boolean) : au.keys;
          send(accounts(au, keys.filter(k => k !== b.by), 'chan', { skip, chan: cid }),
            `${nm(b.by)} dans ${short(ch.name, 40)} : ${b.img && !b.x ? 'Photo' : short(b.x, 80)}`, '#/chan/' + cid, 'chan-' + cid);
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
      if (coll === 'group' && a)
        send(accounts(au, added(a.mem, b.mem), 'team', { skip }), `Tu es ajouté à ${short(b.name || 'un groupe', 50)}`, '#/chans', 'grp-' + id);
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
          send(accounts(au, [...coaches], 'suivi', { skip, any: true }), `${what} de ${nm(b.by)} : ${short(b.txt || 'à regarder', 80)}`, '#/dm/' + b.to, 'suivi-' + b.to);
        }
      }
      // demande d'adhésion : le bureau
      if (coll === 'member' && b.req && !(a && a.req))
        send(accounts(au, au.bureau, 'club', { skip }), `${first(b)} demande à rejoindre le club`, '#/club', 'join');
    }
    for (const [uids, msg] of out) for (const uid of uids) push.send(uid, msg).catch(e => log('Notification : ' + e.message));
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
