/* =========================================================================
   /RAM Coach — écrire les séances dans Google Agenda, en temps réel
   Un seul compte de service Google pour tout /RAM (GOOGLE_AGENDA_COMPTE dans Render : le fichier JSON de sa clé).
   Chaque enseignant partage un de ses agendas avec l'adresse de ce compte, et colle l'identifiant de l'agenda
   dans /RAM Coach : ni mot de passe ni jeton à garder pour lui.
   - À chaque changement d'un groupe ou d'un cours (appli, réservation, connecteur), une tâche remet l'agenda
     d'accord avec le planning : on compare, on écrit seulement ce qui a changé. Retentée si Google ne répond pas.
   - Les réservations Calendly n'y passent pas : Calendly les pose déjà lui-même dans l'agenda (planning.pourAgenda).
   - Seuls les événements créés ici sont touchés (identifiant dérivé de la séance), jamais le reste de l'agenda.
   ========================================================================= */
'use strict';
const crypto = require('crypto');
const REGLES = require('../club/regles.js');
const { parisMs } = require('./ramclub');

const JOURS = 240, DELAI_MS = 5000, INDEX = 'gagenda-coachs';
const TOKEN = 'https://oauth2.googleapis.com/token', API = 'https://www.googleapis.com/calendar/v3/calendars/', PORTEE = 'https://www.googleapis.com/auth/calendar.events';
const b64 = x => Buffer.from(x).toString('base64url');
const hMin = h => { const m = String(h || '').match(/(\d+) h(?: (\d+))?/); return m ? +m[1] * 60 + (+m[2] || 0) : 0; };
const okCal = s => /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s) && s.length <= 200;
const cle = uid => 'gagenda-' + uid;

function lireCompte(brut) {
  try { const j = JSON.parse(brut || ''); return j.client_email && j.private_key ? j : null; } catch (e) { return null; }
}
/* identifiant d'événement Google : caractères 0-9 et a-v ; l'empreinte en hexadécimal convient */
const idDe = s => crypto.createHash('sha256').update(`${s.club}/${s.groupe}/${s.date}`).digest('hex').slice(0, 40);
function corps(s, au) {
  const de = parisMs(s.date, 0) + hMin(s.heure) * 60000, a = de + (+s.minutes || 60) * 60000;
  const noms = (s.eleves || []).map(k => ((au && (au.get('member', k) || au.get('eleve', k))) || {}).n).filter(Boolean);
  const heure = t => ({ dateTime: new Date(t).toISOString(), timeZone: 'Europe/Paris' });
  return { summary: s.cours && noms.length ? `${s.nom} · ${noms.join(', ')}` : s.nom, location: (au && au.name) || '', description: noms.length ? 'Élèves : ' + noms.join(', ') : '', start: heure(de), end: heure(a), status: 'confirmed' };
}
const empreinte = b => crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex').slice(0, 16);

function createGoogleAgenda({ ram, store, coachTables, taches, compte = lireCompte(process.env.GOOGLE_AGENDA_COMPTE), fetchFn = (...a) => fetch(...a), now = () => Date.now(), log = () => {} }) {
  let jeton = null;
  const locks = new Map();
  const serial = (id, fn) => { const p = (locks.get(id) || Promise.resolve()).then(fn, fn); locks.set(id, p.catch(() => {})); return p; };

  async function acces() {
    if (jeton && jeton.fin > now() + 60000) return jeton.v;
    const t = Math.floor(now() / 1000), corpsJwt = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: compte.client_email, scope: PORTEE, aud: TOKEN, iat: t, exp: t + 3600 }))}`;
    const signe = crypto.createSign('RSA-SHA256').update(corpsJwt).sign(compte.private_key, 'base64url');
    const r = await fetchFn(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corpsJwt}.${signe}` }).toString() });
    if (!r.ok) throw new Error('Google refuse le compte de service : ' + r.status);
    const j = await r.json();
    jeton = { v: j.access_token, fin: now() + (+j.expires_in || 3600) * 1000 };
    return jeton.v;
  }
  async function appel(method, cal, chemin, body) {
    const r = await fetchFn(API + encodeURIComponent(cal) + '/events' + chemin, { method, signal: AbortSignal.timeout(10000), headers: { Authorization: 'Bearer ' + (await acces()), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return r.status;
  }
  const ok = st => st >= 200 && st < 300;
  const panne = st => new Error('Google Agenda répond ' + st);   // jamais l'identifiant de l'agenda dans le journal
  /* poser ou corriger un événement ; supprimé à la main, ou état perdu : l'autre chemin prend le relais */
  async function ecrire(cal, id, b, connu) {
    let st = connu ? await appel('PUT', cal, '/' + id, b) : await appel('POST', cal, '', Object.assign({ id }, b));
    if (connu && st === 404) st = await appel('POST', cal, '', Object.assign({ id }, b));
    else if (!connu && st === 409) st = await appel('PUT', cal, '/' + id, b);
    if (!ok(st)) throw panne(st);
  }
  async function retirer(cal, id) {
    const st = await appel('DELETE', cal, '/' + id);
    if (!ok(st) && st !== 404 && st !== 410) throw panne(st);
  }
  const lire = async uid => (await store.getSetting(cle(uid)).catch(() => null)) || {};
  const index = async () => (await store.getSetting(INDEX).catch(() => null)) || {};
  const aujourdhui = () => new Date(now()).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 10);

  /* l'agenda d'un enseignant remis d'accord avec son planning, d'aujourd'hui à dans 240 jours */
  function synchroniser(uid) {
    return serial(uid, async () => {
      const etat = await lire(uid);
      if (!compte || !etat.cal) return { ajoutes: 0, modifies: 0, retires: 0 };
      const de = aujourdhui(), { seances } = await coachTables.pourAgenda(uid, de, REGLES.addDays(de, JOURS), { calendly: !!etat.calendly });
      const audiences = new Map(), avant = etat.ev || {}, apres = {}, voulu = new Map(), res = { ajoutes: 0, modifies: 0, retires: 0 };
      for (const s of seances.filter(x => !x.annule && x.heure)) {
        if (!audiences.has(s.club)) audiences.set(s.club, await ram.audience(s.club).catch(() => null));
        const b = corps(s, audiences.get(s.club));
        voulu.set(idDe(s), { b, d: s.date, h: empreinte(b) });
      }
      // ce qui est passé reste dans l'agenda et sort de la mémoire
      Object.entries(avant).forEach(([id, x]) => { if (x.d >= de) apres[id] = x; });
      try {
        for (const [id, v] of voulu) {
          if (apres[id] && apres[id].h === v.h) continue;
          await ecrire(etat.cal, id, v.b, !!apres[id]);
          res[apres[id] ? 'modifies' : 'ajoutes']++;
          apres[id] = { h: v.h, d: v.d };
        }
        for (const id of Object.keys(apres)) {
          if (voulu.has(id)) continue;
          await retirer(etat.cal, id);
          delete apres[id];
          res.retires++;
        }
        await store.saveSetting(cle(uid), { cal: etat.cal, ev: apres, at: now(), ...(etat.calendly ? { calendly: true } : {}) });
        return res;
      } catch (e) {
        // ce qui est déjà écrit reste noté : la tâche reprend là où elle s'est arrêtée
        await store.saveSetting(cle(uid), { cal: etat.cal, ev: apres, at: etat.at, erreur: e.message, ...(etat.calendly ? { calendly: true } : {}) }).catch(() => {});
        throw e;
      }
    });
  }
  const prevoir = uid => { const t = now(); return taches.enqueue('gagenda', { uid }, { at: t + DELAI_MS, key: `gagenda:${uid}:${Math.floor(t / DELAI_MS)}` }); };
  taches.on('gagenda', p => synchroniser(p.uid));

  /* chaque changement d'un groupe ou d'un cours : l'agenda de son enseignant, avant et après (changement d'enseignant) */
  ram.onOps((clubId, actor, changes) => setImmediate(async () => {
    try {
      const l = changes.filter(c => c.coll === 'group' || c.coll === 'cours');
      if (!l.length || !compte) return;
      const idx = await index();
      if (!Object.keys(idx).length) return;
      const au = await ram.audience(clubId); if (!au) return;
      new Set(l.flatMap(c => [c.before && c.before.coach, c.after && c.after.coach]).filter(Boolean).map(k => au.user[k]).filter(u => idx[u])).forEach(prevoir);
    } catch (e) { log('Google Agenda : ' + e.message); }
  }));

  /* retirer ses événements à venir d'un agenda ; un agenda déjà inaccessible ne bloque pas */
  async function vider(etat) {
    for (const [id, x] of Object.entries(etat.ev || {})) if (x.d >= aujourdhui()) await retirer(etat.cal, id).catch(() => {});
  }
  return {
    compte: compte ? compte.client_email : null,
    synchroniser, prevoir,
    async etat(uid) {
      const e = await lire(uid);
      return { dispo: !!compte, compte: compte ? compte.client_email : null, cal: e.cal || '', seances: Object.keys(e.ev || {}).length, at: e.at || null, erreur: e.erreur || '', calendly: !!e.calendly };
    },
    /* relier un agenda : un essai d'écriture dit tout de suite si le partage est bon */
    async relier(uid, brut) {
      const cal = String(brut || '').trim();
      if (!compte) throw new Error('L’envoi vers Google Agenda n’est pas encore activé sur /RAM.');
      if (!okCal(cal)) throw new Error('Colle l’identifiant de l’agenda (il ressemble à une adresse e-mail).');
      const essai = 'ramessai' + crypto.randomBytes(8).toString('hex'), t = parisMs(aujourdhui(), 0);
      const st = await appel('POST', cal, '', { id: essai, summary: '/RAM Coach : essai', start: { dateTime: new Date(t).toISOString(), timeZone: 'Europe/Paris' }, end: { dateTime: new Date(t + 60000).toISOString(), timeZone: 'Europe/Paris' } });
      if (!ok(st)) throw new Error('Google refuse : partage cet agenda avec ' + compte.client_email + ', droit « Apporter des modifications aux événements ».');
      await retirer(cal, essai).catch(() => {});
      await serial(uid, async () => {
        const e = await lire(uid);
        if (e.cal && e.cal !== cal) await vider(e);
        await store.saveSetting(cle(uid), { cal, ev: e.cal === cal ? e.ev || {} : {}, at: e.cal === cal ? e.at : null, ...(e.calendly ? { calendly: true } : {}) });
        await store.saveSetting(INDEX, Object.assign(await index(), { [uid]: 1 }));
      });
      await prevoir(uid);
      return this.etat(uid);
    },
    /* les cours pris sur Calendly aussi dans cet agenda, ou non (Calendly les écrit déjà dans le sien) */
    async calendly(uid, oui) {
      await serial(uid, async () => {
        const e = await lire(uid);
        if (!e.cal) throw new Error('Relie d’abord un agenda.');
        const x = Object.assign({}, e);
        if (oui) x.calendly = true;
        else delete x.calendly;
        await store.saveSetting(cle(uid), x);
      });
      await prevoir(uid);
      return this.etat(uid);
    },
    async delier(uid) {
      await serial(uid, async () => {
        const e = await lire(uid), idx = await index();
        if (e.cal) await vider(e);
        delete idx[uid];
        await store.saveSetting(cle(uid), {});
        await store.saveSetting(INDEX, idx);
      });
      return this.etat(uid);
    },
    /* de temps en temps : les nouveaux jours qui entrent dans la fenêtre, et ce qui aurait été manqué */
    async tous() {
      if (compte) await Promise.all(Object.keys(await index()).map(prevoir));
    }
  };
}
module.exports = { createGoogleAgenda, lireCompte, idDe, corps };
