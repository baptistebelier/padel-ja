/* =========================================================================
   « Déjà élève ? Se connecter » sur la page publique de réservation : l'élève donne son e-mail et reçoit un lien.
   - un compte /RAM existe à cette adresse (avec ou sans mot de passe) : lien à usage unique, valable 1 h, qui ouvre la
     création (ou le changement) du mot de passe, puis ramène sur la page de réservation, connecté ;
   - une fiche élève de cet enseignant existe à cette adresse, sans compte : le compte est créé sans mot de passe (même
     compte /RAM que /Buvette, /Dojo et /Pista, sans aucun droit en plus), puis le même lien part ;
   - adresse inconnue : rien ne part, rien ne se crée.
   Le lien ne part qu'à l'adresse elle-même : personne ne peut créer le mot de passe d'un compte sur la seule saisie d'un e-mail.
   La réponse faite à la page est la même dans tous les cas (voir server.js), pour ne révéler ni compte ni élève.
   ========================================================================= */
'use strict';
const { splitName } = require('./names');

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/, CLE = /^[\w.-]{1,64}$/;

async function demanderAcces({ store, reservation, Auth, Mail, base, c, k, email }) {
  email = String(email || '').trim().toLowerCase();
  c = String(c || ''); k = String(k || '');
  if (!EMAIL.test(email) || !CLE.test(c) || !CLE.test(k)) return { envoye: false };
  let u = await store.getUserByEmail(email);
  const fiche = await reservation.pubConnu(c, k, email);
  if (!u && fiche) {
    const sp = splitName({ name: fiche });
    u = { id: 'u' + Auth.randomId(12), email, name: fiche, club: '', pass_hash: null, plan: 'essai', guest: false, created_at: Date.now() };
    await store.saveUser(u);
    await store.saveIdentity(u.id, { first: sp.first, last: sp.last });
    await store.saveBilling(u.id, { noTrial: true });
  }
  if (!u || u.guest) return { envoye: false };
  let coach = 'ton enseignant';
  try { coach = (await reservation.pubCreneaux(c, k, new Date().toISOString().slice(0, 10), 1)).coach || coach; } catch (e) { /* page fermée : le nom reste neutre */ }
  const link = base + '/reinitialiser?t=' + encodeURIComponent(Auth.makeResetToken(u)) + '&retour=' + encodeURIComponent('/r/' + c + '/' + k);
  const id = await store.getIdentity(u.id).catch(() => null);
  await Mail.send(Object.assign({ to: u.email }, Mail.accesResaMail({ first: (id && id.first) || splitName(u).first, coach, link })));
  return { envoye: true };
}

module.exports = { demanderAcces };
