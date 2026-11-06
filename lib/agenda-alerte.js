/* =========================================================================
   /RAM Coach — alerte quand un agenda relié devient illisible
   Un agenda iCal relié (Google, Outlook, iCloud) qui ne se lit plus ne bloque plus aucun créneau :
   l'enseignant doit le savoir sans avoir à ouvrir la carte « Mes outils de réservation ».
   - Lecture régulière de chaque agenda relié (agenda.verifier : privee, format ou injoignable).
   - Alerte dans la cloche (et sur le téléphone) au bout de SEUIL échecs de suite : une panne passagère
     de Google ne prévient personne.
   - Une seule alerte par agenda tant qu'il reste illisible ; dès qu'il se relit (ou qu'il est retiré),
     l'alerte quitte la cloche.
   - L'adresse est secrète : seule son empreinte est gardée (réglage « agenda-suivi-<compte> »).
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const SEUIL = 3;   // lectures en échec de suite avant d'alerter (toutes les 2 h : environ 4 à 6 h de panne)
const empreinte = url => crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 12);
const tagDe = h => 'agenda-illisible-' + h;
const cle = uid => 'agenda-suivi-' + uid;

/* même explication que la carte de /RAM Coach (club/coach/6-groupes.js, coCalRaison) */
function explication(raison) {
  if (raison === 'privee') return 'Google refuse son adresse : reprends l’« Adresse secrète au format iCal » de ton agenda, pas l’adresse publique.';
  if (raison === 'format') return 'Son adresse ne donne plus un agenda : prends celle qui finit par .ics.';
  return 'Il ne répond plus depuis plusieurs heures.';
}
const message = (i, raison, h) => ({
  title: '/RAM Coach',
  body: `Ton agenda ${i + 1} est illisible : il ne bloque plus aucun créneau. ${explication(raison)}`,
  url: '#/me', tag: tagDe(h), app: 'coach'
});

function createAgendaAlerte({ store, agenda, push, Formules, seuil = SEUIL, log = () => {} }) {
  const files = new Map();   // un compte à la fois : la lecture régulière et l'ouverture de la carte ne se croisent pas
  const enFile = (uid, fn) => { const p = (files.get(uid) || Promise.resolve()).then(fn); files.set(uid, p.catch(() => {})); return p; };

  /* résultats de lecture d'un compte : `urls` = tous ses agendas reliés, `res[i]` = agenda.verifier(urls[i]) ;
     `compter` : un échec compte pour l'alerte (lecture régulière) ou non (carte ouverte : on n'y efface que les alertes) */
  function noter(uid, urls, res, compter) {
    return enFile(uid, async () => {
      const avant = (await store.getSetting(cle(uid)).catch(() => null)) || {}, apres = {}, envois = [], retraits = [];
      for (let i = 0; i < urls.length; i++) {
        const h = empreinte(urls[i]), e = Object.assign({ n: 0 }, avant[h]), r = res[i] || {};
        if (r.ok) {   // de nouveau lisible : plus d'alerte
          if (e.alerte) retraits.push(h);
          continue;
        }
        if (compter) { e.n++; e.raison = r.raison || 'injoignable'; }
        if (e.n >= seuil && !e.alerte) { envois.push(message(i, e.raison, h)); e.alerte = Date.now(); }
        if (e.n) apres[h] = e;
      }
      // agenda retiré par l'enseignant : son alerte part avec lui
      for (const h of Object.keys(avant)) if (!urls.some(u => empreinte(u) === h) && avant[h].alerte) retraits.push(h);
      // le suivi d'abord : s'il ne s'enregistre pas, rien n'est envoyé (jamais la même alerte à chaque lecture)
      if (JSON.stringify(avant) !== JSON.stringify(apres)) await store.saveSetting(cle(uid), apres);
      for (const h of retraits) await push.retirer(uid, tagDe(h));
      for (const m of envois) await push.sendMany([uid], m);
      return apres;
    });
  }

  const api = {
    noter,
    /* relit tous les agendas d'un compte et compte les échecs */
    async compte(uid) {
      const urls = ((await Formules.get(store, uid)) || {}).icals || [];
      const res = [];
      for (const u of urls) res.push(await agenda.verifier(u));   // l'un après l'autre : on reste discret chez Google
      return noter(uid, urls, res, true);
    },
    /* lecture régulière : chaque enseignant qui a des formules (ses agendas reliés y sont rangés) */
    async tous() {
      const owners = await store.listCoachOwners('offers');
      for (const uid of owners) await api.compte(uid).catch(e => log('Agenda relié : ' + e.message));
    }
  };
  return api;
}
module.exports = { createAgendaAlerte, empreinte, SEUIL };
