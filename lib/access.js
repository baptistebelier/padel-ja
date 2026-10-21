/* =========================================================================
   PADEL JA — droits d'accès selon l'offre
   - Essai : 14 jours après l'inscription, 1 tournoi en plus du tournoi d'exemple
   - Abonné : jusqu'à la date de fin payée (+ 7 jours de grâce si le paiement suivant tarde)
   - Accès offert / administrateur : illimité
   - Sinon : lecture seule (tout reste visible et exportable, l'écran TV continue d'afficher)
   ========================================================================= */
'use strict';
const DAY = 864e5;
const TRIAL_DAYS = 14, TRIAL_TOURNAMENTS = 1, GRACE_DAYS = 7;
const SHOP_URL = process.env.SHOP_URL || 'https://riseandmove.fr/pages/padel-ja';

// le tournoi créé automatiquement à l'inscription ne compte pas dans la limite de l'essai
const isExample = t => !!(t && (t.example || t.name === 'Tournoi d\'exemple'));

/* user : compte (plan, created_at, guest) · billing : { until } rangé avec les données du compte
   · tournaments : la liste du tableau de bord · free : accès offert ou administrateur */
function accessOf(user, billing, tournaments, free, now = Date.now()) {
  if (!user) return { state: 'none', canCreate: false, canEdit: false };
  if (user.guest) return { state: 'demo', canCreate: true, canEdit: true };
  if (free) return { state: 'free', canCreate: true, canEdit: true };
  const until = billing && +billing.until || 0;
  if (until && now < until + GRACE_DAYS * DAY) {
    return { state: 'paid', until, grace: now >= until, canCreate: true, canEdit: true, shop: SHOP_URL };
  }
  const trialEnd = (user.created_at || now) + TRIAL_DAYS * DAY;
  const own = (tournaments || []).filter(t => !isExample(t)).length;
  if (!until && now < trialEnd) {
    return { state: 'trial', until: trialEnd, daysLeft: Math.max(1, Math.ceil((trialEnd - now) / DAY)), tournamentsLeft: Math.max(0, TRIAL_TOURNAMENTS - own),
      canCreate: own < TRIAL_TOURNAMENTS, canEdit: true, shop: SHOP_URL };
  }
  return { state: 'expired', until: until || trialEnd, canCreate: false, canEdit: false, shop: SHOP_URL };
}

// actions encore permises en lecture seule : afficher, rien modifier
const READONLY_OK = new Set(['noop', 'display/set']);

const message = a => a.state === 'expired'
  ? 'Votre accès Padel JA est terminé : vos tournois restent consultables en lecture seule. Abonnez-vous pour les modifier ou en créer.'
  : a.state === 'trial' && !a.canCreate ? `L'essai gratuit comprend ${TRIAL_TOURNAMENTS} tournoi (en plus du tournoi d'exemple). Abonnez-vous pour en créer d'autres.` : '';

module.exports = { accessOf, isExample, READONLY_OK, message, TRIAL_DAYS, TRIAL_TOURNAMENTS, GRACE_DAYS, SHOP_URL };
