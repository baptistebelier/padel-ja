/* =========================================================================
   PADEL JA — ventes Shopify
   Shopify prévient Padel JA à chaque commande payée (webhook « Paiement de
   commande », y compris chaque renouvellement d'abonnement) : la signature est
   vérifiée, puis l'accès du compte lié à l'e-mail de la commande est prolongé.
   Les produits sont reconnus par leur SKU (référence de la variante Shopify).
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const DAY = 864e5;

const PRODUCTS = {
  'PJA-CLUB-MOIS': { label: 'Padel JA Club — mensuel', months: 1 },
  'PJA-CLUB-AN': { label: 'Padel JA Club — annuel', months: 12 },
  'PJA-PASS': { label: 'Padel JA — Pass tournoi', pass: true, days: 30, tournaments: 1 }
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
  if (!items.length) return { billing: billing || null, changed: false, reason: 'aucun produit Padel JA' };
  if (id && b.orders.includes(id)) return { billing, changed: false, reason: 'commande déjà traitée' };
  for (const { li, p } of items) {
    const qty = Math.max(1, +li.quantity || 1);
    if (p.months) {
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
  return { billing: b, changed: true, items: items.map(x => x.p.label) };
}

module.exports = { PRODUCTS, verify, applyOrder, orderEmail, addMonths };
