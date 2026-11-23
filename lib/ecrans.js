/* /Pista — appairage d'un écran TV par QR code, comme YouTube.
   1. La TV ouvre /ecran : elle reçoit un code de 4 lettres et un secret, et affiche le code et son QR code.
   2. Le juge-arbitre, connecté sur son téléphone, scanne le QR code (ou tape le code) et choisit le tournoi.
   3. La TV, qui demande l'état toutes les deux secondes avec son secret, reçoit l'adresse en lecture seule
      du tournoi (/t/<id>/tv?k=<clé>) et l'ouvre. Le code est alors effacé.
   Tout reste en mémoire : un code non utilisé disparaît au bout de 15 minutes, et la TV en redemande un. */
const crypto = require('crypto');

const LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sans I ni O, qu'on confond avec 1 et 0
const MAX = 5000;
const norm = c => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

function createEcrans({ now = () => Date.now(), ttl = 15 * 60000 } = {}) {
  const codes = new Map();
  const purge = () => { const t = now(); for (const [c, e] of codes) if (t - e.at > ttl) codes.delete(c); };

  function nouveau() {
    purge();
    if (codes.size >= MAX) throw new Error('Trop d’écrans en attente : réessayez dans quelques minutes.');
    let code;
    do code = Array.from({ length: 4 }, () => LETTRES[crypto.randomInt(LETTRES.length)]).join(''); while (codes.has(code));
    const s = crypto.randomBytes(16).toString('hex');
    codes.set(code, { s, at: now(), url: null, nom: '' });
    return { code, s, ttl };
  }

  /* la TV demande où elle en est ; null : code inconnu ou expiré (elle en redemande un) */
  function etat(c, s) {
    purge();
    const k = norm(c), e = codes.get(k);
    if (!e || !s || e.s !== String(s)) return null;
    if (!e.url) return { attente: true, reste: Math.max(0, ttl - (now() - e.at)) };
    codes.delete(k);   // adresse remise une seule fois
    return { url: e.url, nom: e.nom };
  }

  /* le téléphone relie le code à un tournoi ; false : code inconnu, expiré ou déjà utilisé */
  function lier(c, url, nom) {
    purge();
    const e = codes.get(norm(c));
    if (!e || e.url) return false;
    Object.assign(e, { url, nom: String(nom || '').slice(0, 80), at: now() });
    return true;
  }

  return { nouveau, etat, lier, norm, taille: () => codes.size };
}

module.exports = { createEcrans, LETTRES, norm };
