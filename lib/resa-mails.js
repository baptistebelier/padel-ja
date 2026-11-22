/* =========================================================================
   E-mails des réservations et des inscriptions par lien, au-delà de la confirmation de l'élève (lib/mail.js) :
   - avis à l'enseignant : nouvelle réservation, annulation par l'élève, inscription par lien, désinscription ;
   - confirmation d'annulation et de désinscription à l'élève ;
   - place libérée : une personne de la liste d'attente passe inscrite.
   Chaque e-mail ne contient que ce que son destinataire a le droit de savoir (l'enseignant connaît ses élèves ; un élève ne voit
   jamais les coordonnées d'un autre). Tout part par la file de tâches (nouvelle tentative plus tard) et ne bloque jamais
   l'action : une erreur ici est notée dans les journaux, rien de plus.
   ========================================================================= */
'use strict';

const dayTxt = iso => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
const first = d => String((d && d.n) || '').split(' ')[0];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function createResaMails({ ram, store, taches, Mail, nvEtat, log = () => {} }) {
  const envoyer = m => { if (m && m.to && EMAIL.test(m.to)) taches.enqueue('mail', m); };
  const sans = fn => (...a) => Promise.resolve().then(() => fn(...a)).catch(e => log('E-mail de réservation : ' + e.message));
  /* l'adresse du compte d'un enseignant (par sa clé de membre dans le club, ou par le compte directement) */
  async function coachContact(clubId, key) {
    const m = await ram.memberByKey(clubId, key).catch(() => null), u = m && m.user_id ? await store.getUser(m.user_id).catch(() => null) : null;
    return u && u.email ? { mail: u.email, prenom: first(m.data) || String(u.name || '').split(' ')[0] || '' } : null;
  }
  async function coachDePost(clubId, postId) {
    const au = await ram.audience(clubId), p = au && au.get('post', String(postId)), uid = p && au.user[p.by], u = uid ? await store.getUser(uid).catch(() => null) : null;
    return { au, p, contact: u && u.email ? { mail: u.email, prenom: first(au.get('member', p.by)) } : null };
  }
  const ficheDe = async (clubId, k) => { const f = (await ram.itemsOf(clubId, 'eleve').catch(() => [])).find(x => x.id === String(k)); return f ? { nom: String(f.data.n || ''), mail: String(f.data.mail || '').toLowerCase(), tel: String(f.data.tel || '') } : null; };

  return {
    /* l'enseignant : un élève vient de réserver (données de lib/reservation.js pubReserver) */
    reservation: sans(async ({ clubId, key, r, eleve, tel, lieu, lienPlanning }) => {
      const c = await coachContact(clubId, key); if (!c) return;
      envoyer(Object.assign({ to: c.mail }, Mail.resaCoachMail({ coach: c.prenom, eleve, contact: [r.mail, tel].filter(Boolean).join(' · '), nom: r.nom, jour: dayTxt(r.d), heure: r.h, duree: r.dur, lieu, prix: r.prix, couvert: r.couvert, lien: lienPlanning })));
    }),
    /* inscription par lien : l'enseignant est prévenu (e-mail et téléphone de la personne, qu'il a déjà) */
    inscription: sans(async ({ clubId, postId, r, eleve, tel, lienCoach }) => {
      const { contact } = await coachDePost(clubId, postId); if (!contact) return;
      envoyer(Object.assign({ to: contact.mail }, Mail.inscriptionCoachMail({ coach: contact.prenom, eleve, contact: [r.mail, tel].filter(Boolean).join(' · '), titre: r.titre, jour: dayTxt(r.d), heure: r.h, statut: r.statut, lien: lienCoach })));
    }),
    /* avant l'annulation par l'élève : ce que le cours est (la suite n'est plus lisible une fois annulé) */
    avantAnnulation: async (clubId, id) => {
      const x = (await ram.itemsOf(clubId, 'cours').catch(() => [])).find(c => c.id === String(id));
      if (!x || (x.data.cancel || []).includes(x.data.once)) return null;
      const f = await ficheDe(clubId, (x.data.ext || [])[0]);
      return { clubId, nom: x.data.name, d: x.data.once, h: x.data.h, coachKey: x.data.coach, fiche: f };
    },
    annulation: sans(async (ctx, lienCoach) => {
      if (!ctx) return;
      const c = await coachContact(ctx.clubId, ctx.coachKey), coachNom = (c && c.prenom) || 'ton enseignant', eleve = (ctx.fiche && ctx.fiche.nom) || 'Un élève';
      if (ctx.fiche && ctx.fiche.mail) envoyer(Object.assign({ to: ctx.fiche.mail }, Mail.annulationMail({ first: eleve.split(' ')[0], nom: ctx.nom, coach: coachNom, jour: dayTxt(ctx.d), heure: ctx.h })));
      if (c) envoyer(Object.assign({ to: c.mail }, Mail.annulationCoachMail({ coach: c.prenom, eleve, nom: ctx.nom, jour: dayTxt(ctx.d), heure: ctx.h, lien: lienCoach })));
    }),
    /* avant la désinscription : les statuts de la date (pour repérer qui passe de la liste d'attente à inscrit) */
    avantDesinscription: async (clubId, postId, ek, d) => {
      const { au, p, contact } = await coachDePost(clubId, postId);
      if (!p || !p.nv) return null;
      return { clubId, postId, ek, d, contact, titre: p.nv.mode === 'cours' ? p.nv.theme || 'Séance collective' : 'Partie dirigée', heure: p.nv.time, coach: first(au.get('member', p.by)) || 'ton enseignant', avant: nvEtat(p.nv, d).status, fiche: await ficheDe(clubId, ek) };
    },
    desinscription: sans(async (ctx, { lienCoach }) => {
      if (!ctx) return;
      const eleve = (ctx.fiche && ctx.fiche.nom) || 'Un participant';
      if (ctx.fiche && ctx.fiche.mail) envoyer(Object.assign({ to: ctx.fiche.mail }, Mail.desinscriptionMail({ first: eleve.split(' ')[0], titre: ctx.titre, jour: dayTxt(ctx.d), heure: ctx.heure, coach: ctx.coach })));
      if (ctx.contact) envoyer(Object.assign({ to: ctx.contact.mail }, Mail.desinscriptionCoachMail({ coach: ctx.contact.prenom, eleve, titre: ctx.titre, jour: dayTxt(ctx.d), heure: ctx.heure, lien: lienCoach })));
      // ceux qui étaient en attente et sont maintenant inscrits
      const { p } = await coachDePost(ctx.clubId, ctx.postId); if (!p || !p.nv) return;
      const apres = nvEtat(p.nv, ctx.d).status;
      for (const cle of Object.keys(apres)) {
        const k = cle.split('|').slice(1).join('|');
        if (ctx.avant[cle] === 'wait' && apres[cle] !== 'wait' && k !== ctx.ek) {
          const f = await ficheDe(ctx.clubId, k);
          if (f && f.mail) envoyer(Object.assign({ to: f.mail }, Mail.placeLibreMail({ first: f.nom.split(' ')[0], titre: ctx.titre, coach: ctx.coach, jour: dayTxt(ctx.d), heure: ctx.heure })));
        }
      }
    })
  };
}
module.exports = { createResaMails };
