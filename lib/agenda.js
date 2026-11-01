/* =========================================================================
   /RAM Réservation — relier l'agenda de l'enseignant (Google Agenda, Outlook, iCloud), sans compte à connecter
   - toIcs : ses cours confirmés, en un lien privé qu'il ajoute à son agenda (« Ajouter depuis une URL ») ;
   - parseIcs : l'adresse iCal secrète de son agenda ; ce qui y est posé (un rendez-vous pris sur Google par
     exemple) n'est plus réservable dans l'appli. Seules les heures sont lues, jamais le titre des événements.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const SECRET = process.env.SESSION_SECRET || 'padelja-local-' + require('os').hostname();
const REGLES = require('../club/regles.js');
const { parisMs } = require('./ramclub');

const HOTES = /^(calendar\.google\.com|outlook\.office365\.com|outlook\.live\.com|p\d+-caldav\.icloud\.com)$/;
const CACHE_MS = 10 * 60000, DELAI_MS = 5000, MAX_OCTETS = 5e6;
const pad = n => String(n).padStart(2, '0');
const hMin = h => { const m = String(h || '').match(/(\d+) h(?: (\d+))?/); return m ? +m[1] * 60 + (+m[2] || 0) : 0; };

/* seuls les grands agendas : le serveur ne va jamais lire une adresse quelconque donnée par un compte */
function okIcal(u) {
  try { const x = new URL(String(u).trim().replace(/^webcal:/i, 'https:')); return x.protocol === 'https:' && HOTES.test(x.hostname) ? x.href : null; } catch (e) { return null; }
}
/* le lien privé de l'agenda d'un enseignant */
const signe = uid => crypto.createHmac('sha256', SECRET).update('agenda:' + uid).digest('base64url').slice(0, 24);
const lienIcs = uid => `/agenda/${uid}-${signe(uid)}.ics`;
function lireLien(nom) {
  const m = String(nom).match(/^([\w]+)-([\w-]{24})\.ics$/);
  if (!m) return null;
  const a = Buffer.from(signe(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

/* ---------- vers l'agenda : les cours confirmés seulement (ni collectif en attente, ni cours annulé) ---------- */
const utc = t => { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`; };
const txt = s => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
function toIcs(seances, now = Date.now()) {
  const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RAM Rise And Move//RAM Coach//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:/RAM Coach', 'X-WR-TIMEZONE:Europe/Paris'];
  seances.filter(s => !s.annule && s.heure).forEach(s => {
    const de = parisMs(s.date, 0) + hMin(s.heure) * 60000;
    l.push('BEGIN:VEVENT', `UID:${s.club}-${s.groupe}-${s.date}@riseandmove.fr`, `DTSTAMP:${utc(now)}`, `DTSTART:${utc(de)}`, `DTEND:${utc(de + (+s.minutes || 60) * 60000)}`, `SUMMARY:${txt(s.nom)}`, 'END:VEVENT');
  });
  l.push('END:VCALENDAR');
  return l.join('\r\n') + '\r\n';
}

/* ---------- depuis l'agenda : les heures prises, jour par jour, à l'heure de Paris ---------- */
function versParis(v, zoneUtc) {
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`, min = +m[4] * 60 + +m[5];
  if (!zoneUtc) return { d, min };   // heure locale : les clubs sont en France
  const s = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
  return { d: s.slice(0, 10), min: +s.slice(11, 13) * 60 + +s.slice(14, 16) };
}
const JOURS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseIcs(text, from, to) {
  const lignes = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/), out = [];
  let ev = null;
  for (const li of lignes) {
    if (li === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (li === 'END:VEVENT') {
      if (ev) ajoute(ev, from, to, out);
      ev = null;
      continue;
    }
    if (!ev) continue;
    const i = li.indexOf(':'); if (i < 0) continue;
    const nom = li.slice(0, i).split(';')[0].toUpperCase(), val = li.slice(i + 1);
    if (nom === 'EXDATE') (ev.ex = ev.ex || []).push(...val.split(',').map(v => (versParis(v, /Z$/.test(v)) || {}).d));
    else ev[nom] = val;
  }
  return out;
}
function ajoute(ev, from, to, out) {
  if (/CANCELLED/i.test(ev.STATUS || '') || /TRANSPARENT/i.test(ev.TRANSP || '')) return;
  const a = versParis(ev.DTSTART || '', /Z$/.test(ev.DTSTART || '')), b = versParis(ev.DTEND || '', /Z$/.test(ev.DTEND || ''));
  if (!a || !b) return;   // journée entière : ne bloque rien (un anniversaire n'empêche pas un cours)
  const au = b.d === a.d ? b.min : 24 * 60;
  const r = Object.fromEntries(String(ev.RRULE || '').split(';').filter(Boolean).map(x => x.split('=')));
  const pose = d => { if (d >= from && d <= to && !(ev.ex || []).includes(d)) out.push({ d, du: a.min, au }); };
  if (!r.FREQ) return pose(a.d);
  if (r.FREQ !== 'WEEKLY' && r.FREQ !== 'DAILY') return;
  const pas = Math.max(1, +r.INTERVAL || 1), fin = r.UNTIL ? (versParis(r.UNTIL, /Z$/.test(r.UNTIL)) || { d: r.UNTIL.slice(0, 4) + '-' + r.UNTIL.slice(4, 6) + '-' + r.UNTIL.slice(6, 8) }).d : null;
  const jours = r.BYDAY ? r.BYDAY.split(',').map(x => JOURS[x.slice(-2)]) : [REGLES.dowOf(a.d)];
  let n = 0;
  for (let d = a.d, i = 0; d <= to && (!fin || d <= fin) && (!r.COUNT || n < +r.COUNT) && i < 4000; d = REGLES.addDays(d, 1), i++) {
    const ecart = Math.round((Date.parse(d) - Date.parse(a.d)) / 864e5);
    const bon = r.FREQ === 'DAILY' ? ecart % pas === 0 : Math.floor(ecart / 7) % pas === 0 && jours.includes(REGLES.dowOf(d));
    if (bon) { n++; pose(d); }
  }
}

/* lecture (avec une mémoire de 10 minutes) ; un agenda injoignable ne bloque pas la réservation */
function createAgenda({ fetchFn = (...a) => fetch(...a), log = () => {} } = {}) {
  const memo = new Map();
  async function lire(url) {
    const m = memo.get(url);
    if (m && Date.now() - m.at < CACHE_MS) return m.txt;
    try {
      const r = await fetchFn(url, { signal: AbortSignal.timeout(DELAI_MS), redirect: 'error' });
      if (!r.ok) throw new Error('réponse ' + r.status);
      const t = await r.text();
      if (t.length > MAX_OCTETS) throw new Error('agenda trop volumineux');
      memo.set(url, { at: Date.now(), txt: t });
      return t;
    } catch (e) {
      log('Agenda injoignable : ' + e.message);   // jamais l'adresse : elle est secrète
      return m ? m.txt : '';
    }
  }
  return {
    async occupe(urls, from, to) {
      const l = await Promise.all((urls || []).map(lire));
      return l.flatMap(t => parseIcs(t, from, to));
    }
  };
}
module.exports = { okIcal, lienIcs, lireLien, toIcs, parseIcs, createAgenda };
