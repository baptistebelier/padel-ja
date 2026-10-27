/* =========================================================================
   /RAM Coach — réservations Calendly
   Calendly prévient /RAM à chaque réservation et à chaque annulation (webhook
   « invitee.created » / « invitee.canceled ») : la signature est vérifiée, puis
   la séance est posée dans le planning /RAM Coach de l'enseignant (son club
   principal), reliée à la fiche de l'élève (créée si besoin).
   Mise en place : CALENDLY_TOKEN (jeton personnel Calendly) dans Render ; au
   démarrage, le serveur inscrit lui-même son adresse de webhook chez Calendly.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const API = 'https://api.calendly.com';
const SECRET = process.env.SESSION_SECRET || 'padelja-local-' + require('os').hostname();
const signingKey = () => crypto.createHmac('sha256', SECRET).update('calendly-webhook').digest('base64url');

// signature Calendly : en-tête « t=horodatage,v1=HMAC-SHA256(t + '.' + corps brut) », refusée après 5 minutes
function verify(raw, header, key = signingKey(), now = Date.now()) {
  const p = Object.fromEntries(String(header || '').split(',').map(x => x.trim().split('=')));
  if (!p.t || !p.v1 || Math.abs(now / 1000 - +p.t) > 300) return false;
  const want = crypto.createHmac('sha256', key).update(p.t + '.' + raw).digest('hex');
  const a = Buffer.from(want), b = Buffer.from(String(p.v1));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// date et heure à Paris (le serveur tourne en UTC)
function paris(iso) {
  if (isNaN(new Date(iso))) return { date: '', heure: '' };
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const x = Object.fromEntries(f.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return { date: `${x.year}-${x.month}-${x.day}`, heure: `${x.hour}:${x.minute}` };
}

/* webhook Calendly → réservation lisible par /RAM Coach (sans effet de bord : facile à tester) */
function booking(body) {
  const p = body.payload || {}, ev = p.scheduled_event || {}, qa = p.questions_and_answers || [];
  const ans = re => (qa.find(q => re.test(q.question || '')) || {}).answer || '';
  const host = ((ev.event_memberships || [])[0] || {}).user_email || '';
  const when = paris(ev.start_time);
  return {
    type: body.event === 'invitee.canceled' ? 'annulation' : body.event === 'invitee.created' ? 'reservation' : null,
    hote: String(host).toLowerCase(), cal: ev.uri || '', titre: ev.name || '', date: when.date, heure: when.heure,
    min: Math.round((new Date(ev.end_time) - new Date(ev.start_time)) / 60000) || 60,
    nom: p.name || [p.first_name, p.last_name].filter(Boolean).join(' '), email: String(p.email || '').toLowerCase(),
    tel: p.text_reminder_number || ans(/t[ée]l[ée]phone/i), nb: +(ans(/nombre de participant/i).match(/\d/) || [1])[0],
    objectif: ans(/objectif/i), participants: ans(/participants/i).split(/,|&| et |\n/).map(s => s.trim()).filter(s => s.split(/\s+/).length > 1),
    reprogramme: !!p.rescheduled
  };
}

async function api(token, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Calendly ${r.status} : ${j.message || j.title || 'erreur'}`);
  return j;
}

/* inscrit l'adresse du webhook chez Calendly (une seule fois : déjà inscrite → rien) */
async function subscribe(token, url) {
  const me = (await api(token, 'GET', '/users/me')).resource;
  const q = `?organization=${encodeURIComponent(me.current_organization)}&user=${encodeURIComponent(me.uri)}&scope=user`;
  const l = (await api(token, 'GET', '/webhook_subscriptions' + q)).collection || [];
  if (l.some(w => w.callback_url === url && w.state === 'active')) return { deja: true };
  await api(token, 'POST', '/webhook_subscriptions', { url, events: ['invitee.created', 'invitee.canceled'], organization: me.current_organization, user: me.uri, scope: 'user', signing_key: signingKey() });
  return { inscrit: true };
}

module.exports = { verify, booking, subscribe, paris, signingKey };
