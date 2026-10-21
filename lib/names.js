/* Prénom / nom d'un compte et initiales de l'avatar (partagé serveur + tests) */
// prénom / nom : champs séparés, sinon déduits de l'ancien champ « nom et prénom »
function splitName(u) {
  if (u.first != null || u.last != null) return { first: u.first || '', last: u.last || '' };
  const w = String(u.name || '').trim().split(/\s+/).filter(Boolean);
  return { first: w[0] || '', last: w.slice(1).join(' ') };
}
// initiales : première lettre du prénom + première lettre du nom (« Baptiste Belier » → BB)
function initials(first, last, email) {
  return ((((first || '').trim()[0] || '') + ((last || '').trim()[0] || '')) || (email || 'JA').slice(0, 2)).toUpperCase();
}
module.exports = { splitName, initials };
