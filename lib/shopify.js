/* =========================================================================
   /Pista — ventes Shopify
   Shopify prévient /Pista à chaque commande payée (webhook « Paiement de
   commande », y compris chaque renouvellement d'abonnement) : la signature est
   vérifiée, puis l'accès du compte lié à l'e-mail de la commande est prolongé.
   Les produits sont reconnus par leur SKU (référence de la variante Shopify).
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const DAY = 864e5;

const PRODUCTS = {
  // offres des applis (lib/offres.js) : /Pista (anciennes références PJA- gardées), /Dojo Pro, /Buvette Club et Club +
  'PJA-CLUB-MOIS': { label: '/Pista Pro — mensuel', months: 1 },
  'PJA-CLUB-AN': { label: '/Pista Pro — annuel', months: 12 },
  'PJA-PASS': { label: '/Pista — Pass tournoi', pass: true, days: 30, tournaments: 1 },
  'RAM-PISTA-PRO-MOIS': { label: '/Pista Pro — mensuel', months: 1 },
  'RAM-PISTA-PRO-AN': { label: '/Pista Pro — annuel', months: 12 },
  'RAM-PISTA-PASS': { label: '/Pista — Pass tournoi', pass: true, days: 30, tournaments: 1 },
  'RAM-DOJO-PRO-MOIS': { label: '/Dojo Pro — mensuel', app: 'dojo', months: 1 },
  'RAM-DOJO-PRO-AN': { label: '/Dojo Pro — annuel', app: 'dojo', months: 12 },
  'RAM-BUVETTE-CLUB-MOIS': { label: '/Buvette Club — mensuel', app: 'buvette', niveau: 'club', months: 1 },
  'RAM-BUVETTE-CLUB-AN': { label: '/Buvette Club — annuel', app: 'buvette', niveau: 'club', months: 12 },
  'RAM-BUVETTE-CLUBPLUS-MOIS': { label: '/Buvette Club + — mensuel', app: 'buvette', niveau: 'clubplus', months: 1 },
  'RAM-BUVETTE-CLUBPLUS-AN': { label: '/Buvette Club + — annuel', app: 'buvette', niveau: 'clubplus', months: 12 }
};

// signature Shopify : HMAC-SHA256 du corps brut, en base64, avec la clé du webhook
function verify(raw, header, secret) {
  if (!secret || !header) return false;
  const want = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  const a = Buffer.from(want), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function addMonths(t, n) { const d = new Date(t); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); return d.getTime(); }

const orderEmail = o => String(o.email || o.contact_email || (o.customer && o.customer.email) || '').trim().toLowerCase();

/* applique une commande payée à l'abonnement d'un compte (sans effet de bord : facile à tester).
   Une même commande n'est jamais comptée deux fois (Shopify peut renvoyer le même webhook). */
function applyOrder(billing, order, now = Date.now()) {
  const b = Object.assign({ orders: [] }, billing || {});
  b.orders = (b.orders || []).slice(-50);
  const id = String(order.id || '');
  const items = (order.line_items || []).map(li => ({ li, p: PRODUCTS[String(li.sku || '').trim().toUpperCase()] })).filter(x => x.p);
  if (!items.length) return { billing: billing || null, changed: false, reason: 'aucune offre des applis' };
  if (id && b.orders.includes(id)) return { billing, changed: false, reason: 'commande déjà traitée' };
  const buvette = [];
  for (const { li, p } of items) {
    const qty = Math.max(1, +li.quantity || 1);
    if (p.app === 'dojo') {
      // /Dojo Pro : prolongé à partir de sa fin actuelle (ou d'aujourd'hui)
      b.dojo = { until: addMonths(Math.max(now, +(b.dojo || {}).until || 0), p.months * qty) };
    } else if (p.app === 'buvette') {
      // /Buvette : l'offre d'un club, appliquée par le serveur au club dont l'acheteur est au bureau
      buvette.push({ niveau: p.niveau, months: p.months * qty, label: p.label });
    } else if (p.months) {
      // abonnement : on prolonge à partir de la fin actuelle (ou d'aujourd'hui si elle est passée) ; un pass en cours est remplacé
      const from = Math.max(now, b.pass ? now : (+b.until || 0));
      b.until = addMonths(from, p.months * qty);
      b.pass = null;
    } else if (p.pass) {
      // pass tournoi : 30 jours et 1 tournoi par pass ; sans effet sur un abonnement plus long déjà en cours
      if (b.until && !b.pass && +b.until > now + p.days * DAY) continue;
      // un 2e pass pendant le premier : 1 tournoi et 30 jours de plus ; sinon un nouveau pass démarre aujourd'hui
      const cur = b.pass && +b.until > now ? b.pass : null;
      b.pass = { start: cur ? cur.start : now, tournaments: (cur ? cur.tournaments : 0) + p.tournaments * qty };
      b.until = (cur ? +b.until : now) + p.days * DAY * qty;
    }
  }
  if (id) b.orders.push(id);
  b.source = 'shopify'; b.at = now;
  return { billing: b, changed: true, items: items.map(x => x.p.label), buvette, until: Math.max(+b.until || 0, +(b.dojo || {}).until || 0) };
}

module.exports = { PRODUCTS, verify, applyOrder, orderEmail, addMonths };
