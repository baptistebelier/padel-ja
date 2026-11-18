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

/* chemins sur lesquels le lien ramène : la page de réservation, par son adresse /r/ ou /reservation/ (jamais une adresse libre) */
const RETOUR = /^\/(r\/[\w.-]{1,64}\/[\w.-]{1,64}|reservation\/[a-z0-9-]{1,40}(\/[\w.-]{1,64})?)$/;
async function demanderAcces({ store, reservation, Auth, Mail, base, c, k, email, retour }) {
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
  const link = base + '/reinitialiser?t=' + encodeURIComponent(Auth.makeResetToken(u)) + '&retour=' + encodeURIComponent(RETOUR.test(String(retour || '')) ? retour : '/r/' + c + '/' + k);
  const id = await store.getIdentity(u.id).catch(() => null);
  await Mail.send(Object.assign({ to: u.email }, Mail.accesResaMail({ first: (id && id.first) || splitName(u).first, coach, link })));
  return { envoye: true };
}

/* ---------- preuve de l'adresse e-mail ----------
   Être connecté ne prouve pas qu'on possède l'adresse du compte : /api/auth/signup ne vérifie rien. Les fiches, téléphones, achats,
   le rattachement et le décompte d'un pack ne s'ouvrent donc qu'avec une adresse PROUVÉE par un lien reçu dans sa boîte e-mail.
   La preuve est rangée dans l'identité du compte (identity.emailVerifie), avec l'adresse exacte : un changement d'adresse l'annule. */
const mailDe = u => String((u && u.email) || '').trim().toLowerCase();
async function adresseVerifiee(store, u) {
  if (!u || !u.email) return false;
  const id = await store.getIdentity(u.id).catch(() => null);
  return !!id && String(id.emailVerifie || '').toLowerCase() === mailDe(u);
}
/* lecture sans filet : une lecture ratée fait échouer l'opération au lieu de réécrire une identité vide */
async function marquerVerifiee(store, u) {
  const id = Object.assign({}, await store.getIdentity(u.id), { emailVerifie: mailDe(u) });
  await store.saveIdentity(u.id, id);
}
/* le lien de confirmation part à l'adresse du compte connecté, jamais à une adresse saisie ; il ne change pas le mot de passe */
async function demanderConfirmation({ store, reservation, Auth, Mail, base, user, c, k, retour }) {
  if (!user || user.guest || !user.email || !CLE.test(String(c || '')) || !CLE.test(String(k || '')) || (await adresseVerifiee(store, user))) return { envoye: false };
  let coach = 'ton enseignant';
  try { coach = (await reservation.pubCreneaux(c, k, new Date().toISOString().slice(0, 10), 1)).coach || coach; } catch (e) { /* page fermée */ }
  const chemin = RETOUR.test(String(retour || '')) ? retour : '/r/' + c + '/' + k, link = base + chemin + '?v=' + encodeURIComponent(Auth.makeVerifToken(user));
  const id = await store.getIdentity(user.id).catch(() => null);
  await Mail.send(Object.assign({ to: user.email }, Mail.confirmationMail({ first: (id && id.first) || splitName(user).first, coach, link })));
  return { envoye: true };
}
/* l'ouverture du lien : l'adresse n'est confirmée que par quelqu'un qui détient le compte (session ouverte, ou mot de passe actuel)
   ou qui choisit un nouveau mot de passe (les autres appareils sont alors déconnectés). Sinon, la page demande laquelle de ces preuves. */
async function confirmer({ store, Auth, token, password, nouveau, sessionUser }) {
  const t = Auth.readVerifToken(token), u = t ? await store.getUser(t.userId) : null;
  if (!u || !Auth.verifMatches(u, t) || (await adresseVerifiee(store, u))) throw new Error('Lien expiré ou déjà utilisé : refais une demande.');
  let nouvelleSession = false;
  if (sessionUser && sessionUser.id === u.id) { /* il est déjà connecté à ce compte */ }
  else if (password && u.pass_hash && (await Auth.checkPasswordAsync(password, u.pass_hash))) nouvelleSession = true;
  else if (nouveau) {
    if (String(nouveau).length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
    u.pass_hash = await Auth.hashPasswordAsync(nouveau);   // le mot de passe change : toutes les sessions antérieures tombent
    await store.saveUser(u);
    nouvelleSession = true;
  } else return { besoin: true, faux: !!password };
  await marquerVerifiee(store, u);
  return { ok: true, user: u, nouvelleSession };
}

module.exports = { demanderAcces, demanderConfirmation, confirmer, adresseVerifiee, marquerVerifiee };
