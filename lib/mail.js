/* =========================================================================
   /RAM — envoi des e-mails (Brevo ou Resend, API HTTP, sans dépendance) et gabarit commun
   Variables Render : BREVO_API_KEY ou RESEND_API_KEY, MAIL_FROM (expéditeur
   validé chez le service choisi, ex. « /Pista <contact@riseandmove.fr> »).
   Sans clé : rien n'est envoyé, le serveur l'indique dans ses journaux.
   Un envoi qui échoue ne bloque jamais l'action qui l'a demandé : les e-mails passent par la file de tâches
   (lib/taches.js, nouvelle tentative plus tard) ou par un appel dont l'erreur est notée dans les journaux.
   ========================================================================= */
'use strict';

// deux services possibles, au choix : Brevo (BREVO_API_KEY) ou Resend (RESEND_API_KEY)
const enabled = () => !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
const DELAI = 12000;   // un service qui ne répond pas ne retient pas la tâche plus longtemps

function sender() {
  const raw = process.env.MAIL_FROM || '/Pista <contact@riseandmove.fr>';
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  return m ? { name: m[1] || '/Pista', email: m[2] } : { name: '/Pista', email: raw.trim() };
}

/* pièce jointe facultative : ics = { name: 'cours.ics', content: '<texte iCalendar>' } (ajouter le cours à son agenda) */
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
async function viaResend({ to, subject, html, text, ics }) {
  const s = sender();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${s.name} <${s.email}>`, to: [to], subject, html, text, ...(ics ? { attachments: [{ filename: ics.name, content: b64(ics.content) }] } : {}) }),
    signal: AbortSignal.timeout(DELAI)
  });
  if (!r.ok) throw new Error(`Resend ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return { sent: true };
}
async function viaBrevo({ to, subject, html, text, ics }) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: sender(), to: [{ email: to }], subject, htmlContent: html, textContent: text, ...(ics ? { attachment: [{ name: ics.name, content: b64(ics.content) }] } : {}) }),
    signal: AbortSignal.timeout(DELAI)
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 200)}`);
  // trace de l'envoi (expéditeur + numéro de suivi Brevo) pour retrouver l'e-mail dans les journaux Brevo
  const d = await r.json().catch(() => ({}));
  console.log(`  E-mail accepté par Brevo : « ${subject} » de ${sender().email} (suivi ${d.messageId || '?'})`);
  return { sent: true, id: d.messageId };
}

/* Brevo d'abord ; s'il échoue et qu'une clé Resend existe, repli sur Resend ; sinon l'erreur remonte (la file de tâches réessaie) */
async function send({ to, subject, html, text, ics }) {
  if (!enabled()) { console.log(`  E-mail non envoyé (aucune clé BREVO_API_KEY ni RESEND_API_KEY) : « ${subject} » à ${to}`); return { sent: false }; }
  if (!process.env.BREVO_API_KEY) return viaResend({ to, subject, html, text, ics });
  try { return await viaBrevo({ to, subject, html, text, ics }); }
  catch (e) {
    if (!process.env.RESEND_API_KEY) throw e;
    console.warn('  E-mail : ' + e.message + ' : repli sur Resend');
    return viaResend({ to, subject, html, text, ics });
  }
}

/* ---------- ajouter un cours à son agenda ----------
   Un lien Google Agenda et un fichier .ics joint (Apple Calendrier, Outlook, Gmail le proposent à l'ouverture).
   d « 2026-11-24 », h « 18 h » ou « 18 h 30 », dur « 1 h », « 1 h 30 » ou « 45 min » ; heures de Paris, écrites en UTC. */
function parisUtc(iso, min) {
  const [y, m, d] = String(iso).split('-').map(Number), guess = Date.UTC(y, m - 1, d, 0, min);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(x => [x.type, +x.value]));
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess);
}
const minDe = h => { const m = String(h || '').match(/(\d+) h(?: ?(\d+))?/); return m ? +m[1] * 60 + (+m[2] || 0) : null; };
const dureeDe = d => { const s = String(d || ''), h = s.match(/(\d+) h(?: ?(\d+))?/), n = s.match(/^\s*(\d+) ?min/); return h ? +h[1] * 60 + (+h[2] || 0) : n ? +n[1] : 60; };
const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsTxt = s => String(s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
function agenda({ titre, d, h, dur, lieu, details, uid }) {
  const debut = minDe(h);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) || debut == null) return null;
  const de = parisUtc(d, debut), a = de + dureeDe(dur) * 60000, s = icsDate(de), e = icsDate(a);
  const google = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(titre) + '&dates=' + s + '/' + e +
    (lieu ? '&location=' + encodeURIComponent(lieu) : '') + (details ? '&details=' + encodeURIComponent(details) : '');
  const content = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RAM//Dojo//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + String(uid || s + '-' + titre).replace(/[^\w.-]/g, '') + '@riseandmove.fr', 'DTSTAMP:' + icsDate(Date.now()), 'DTSTART:' + s, 'DTEND:' + e,
    'SUMMARY:' + icsTxt(titre), ...(lieu ? ['LOCATION:' + icsTxt(lieu)] : []), ...(details ? ['DESCRIPTION:' + icsTxt(details)] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTxt(titre), 'TRIGGER:-PT2H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  return { google, ics: { name: 'cours.ics', content } };
}
/* ce que chaque e-mail de cours ajoute : le lien, la phrase sur le fichier joint, le fichier */
const avecAgenda = (ag, liens = []) => (ag ? [{ label: 'Ajouter à Google Agenda', url: ag.google }, ...liens] : liens);
const noteAgenda = ag => (ag ? 'Le fichier joint « cours.ics » ajoute aussi ce cours à Apple Calendrier ou Outlook.' : '');
/* envoi qui ne lève jamais : pour une action qui ne doit pas dépendre du courrier (la raison est notée dans les journaux) */
async function sendSafe(m) {
  try { return await send(m); } catch (e) { console.error('E-mail « ' + (m && m.subject) + ' » non envoyé : ' + e.message); return { sent: false, error: e.message }; }
}

/* Brevo désactive une clé après 90 jours sans utilisation : une lecture du compte chaque semaine
   (aucun e-mail envoyé) la garde active, et signale tôt une clé supprimée ou invalide */
async function checkKey() {
  if (!process.env.BREVO_API_KEY) return null;
  const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': process.env.BREVO_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(DELAI) });
  if (!r.ok) throw new Error(`clé Brevo refusée (${r.status}) : vérifiez BREVO_API_KEY dans Render`);
  return true;
}
function keepAlive(log) {
  const run = () => checkKey().catch(e => log('E-mails : ' + e.message));
  setTimeout(run, 3 * 60e3).unref();
  setInterval(run, 7 * 24 * 3600e3).unref();
}

/* ---------- gabarit commun ----------
   Un seul gabarit pour tous les e-mails : tableaux, styles en ligne, 600 px, une colonne sur téléphone, mode sombre
   (balises color-scheme et media query, honorées par Apple Mail et Gmail), version texte jointe. Aucun emoji, aucune image :
   l'en-tête est du texte, donc toujours affiché. */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const APPS = { ja: '/Pista', club: '/Buvette', coach: '/Dojo' };
const C = { encre: '#16191E', citron: '#E0F50A', rose: '#F5104C', bordeaux: '#7B1030', papier: '#F0EEEF', carte: '#FFFFFF', texte: '#2B2226', doux: '#6F5F64', filet: '#D9D2D4' };
/* bandeau d'en-tête aux couleurs du logo de chaque appli (validées le 22/11/2026) */
const BANDEAU = { ja: ['#74102A', '#F6DDE3'], club: ['#2467D6', '#FFFFFF'], coach: ['#E0F50A', '#4F6200'] };
const FONT = "Arial,Helvetica,sans-serif", FONT_TITRE = "'Arial Narrow',Arial,Helvetica,sans-serif";
const LIBELLES = { jour: 'Date', heure: 'Heure', duree: 'Durée', lieu: 'Lieu', coach: 'Enseignant', tarif: 'Tarif', eleve: 'Élève', contact: 'Contact', statut: 'Statut' };

function construire({ app = 'ja', precis, titre, bonjour, intro = [], recap = [], cta, liens = [], note, pourquoi }) {
  const nomApp = APPS[app] || APPS.ja, exp = sender().name, [fondB, texteB] = BANDEAU[app] || BANDEAU.ja;
  const paras = (Array.isArray(intro) ? intro : [intro]).filter(Boolean);
  const rows = recap.filter(r => r && r[1] != null && String(r[1]).trim() !== '');
  const hi = bonjour === undefined ? 'Bonjour,' : bonjour;
  const p = t => `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.texte}" class="tx">${t}</p>`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(titre)}</title>
<style>
@media (prefers-color-scheme: dark){
 .bg{background:#120A0C !important} .card{background:#1C1013 !important;border-color:#F4EFEF !important}
 .tx{color:#E8DADC !important} .h1{color:#FFFFFF !important} .rl{color:#B9A3A7 !important} .rv{color:#FFFFFF !important}
 .rec td{border-color:#3A2228 !important} .lk{color:#E0F50A !important} .ft{color:#A08C90 !important} .sep{border-color:#3A2228 !important}
}
@media only screen and (max-width:620px){
 .w{width:100% !important} .px{padding-left:20px !important;padding-right:20px !important} .h1{font-size:26px !important}
 .rl,.rv{display:block !important;width:100% !important;padding-left:0 !important;padding-right:0 !important} .rl{padding-bottom:0 !important;border-bottom:0 !important}
 .btn a{display:block !important} .pad0{padding:12px 10px !important}
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.papier}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.papier}">${esc(precis || titre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${C.papier}"><tr><td align="center" class="pad0" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="w card" style="width:600px;max-width:600px;background:${C.carte};border:2px solid ${C.encre}">
<tr><td class="px" bgcolor="${fondB}" style="background:${fondB};padding:16px 32px"><span style="font-family:${FONT_TITRE};font-weight:bold;font-size:22px;letter-spacing:1px;text-transform:uppercase;color:${texteB}">${esc(nomApp)}</span></td></tr>
<tr><td class="px" style="padding:28px 32px 6px"><h1 class="h1" style="margin:0;font-family:${FONT_TITRE};font-weight:bold;font-size:30px;line-height:1.1;text-transform:uppercase;color:${C.encre}">${esc(titre)}</h1></td></tr>
<tr><td class="px" style="padding:12px 32px 4px">${hi ? p(esc(hi)) : ''}${paras.map(p).join('')}</td></tr>
${rows.length ? `<tr><td class="px" style="padding:6px 32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="rec" style="border-top:2px solid ${C.encre}">${rows.map(([l, v]) => `<tr><td class="rl" width="36%" style="padding:10px 12px 10px 0;border-bottom:1px solid ${C.filet};font-family:${FONT};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.doux}" valign="top">${esc(LIBELLES[l] || l)}</td><td class="rv" style="padding:10px 0;border-bottom:1px solid ${C.filet};font-family:${FONT};font-size:16px;font-weight:bold;color:${C.encre}" valign="top">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : ''}
${cta ? `<tr><td class="px" style="padding:8px 32px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="width:100%"><tr><td align="center" bgcolor="${C.citron}" style="background:${C.citron};border:2px solid ${C.encre}"><a href="${esc(cta.url)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-weight:bold;font-size:15px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;color:${C.encre}">${esc(cta.label)}</a></td></tr></table></td></tr>` : ''}
${liens.length ? `<tr><td class="px" style="padding:0 32px 14px;font-family:${FONT};font-size:14px;line-height:1.8">${liens.map(l => `<a class="lk" href="${esc(l.url)}" style="color:${C.bordeaux};font-weight:bold;text-decoration:underline">${esc(l.label)}</a>`).join('<span style="color:#9A8A8E"> &nbsp;·&nbsp; </span>')}</td></tr>` : ''}
${note ? `<tr><td class="px" style="padding:0 32px 14px"><p class="tx" style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${C.doux}">${note}</p></td></tr>` : ''}
<tr><td class="px" style="padding:6px 32px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="sep ft" style="border-top:1px solid ${C.filet};padding-top:14px;font-family:${FONT};font-size:12px;line-height:1.55;color:${C.doux}">Envoyé par ${esc(exp)} · ${esc(nomApp)}<br>${esc(pourquoi || 'Vous recevez cet e-mail car votre adresse est liée à un compte ou à une demande sur les applis /RAM.')}</td></tr></table></td></tr>
</table></td></tr></table></body></html>`;
  const txt = [hi, '', ...paras.map(x => String(x).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"') + '\n'),
    ...(rows.length ? [...rows.map(([l, v]) => `${LIBELLES[l] || l} : ${v}`), ''] : []),
    ...(cta ? [`${cta.label} :`, cta.url, ''] : []), ...liens.map(l => `${l.label} : ${l.url}`), ...(liens.length ? [''] : []),
    ...(note ? [String(note).replace(/<[^>]+>/g, ''), ''] : []), `-- ${exp} · ${nomApp}`, pourquoi || 'Vous recevez cet e-mail car votre adresse est liée à un compte ou à une demande sur les applis /RAM.'].filter(x => x !== undefined && x !== null).join('\n');
  return { html, text: txt };
}
const prenomDe = first => (first ? `Bonjour ${first},` : 'Bonjour,');   // le prénom est échappé par construire

/* ---------- les e-mails : compte (/Pista), réservations et inscriptions (/Dojo) ---------- */
function welcomeMail({ first, appUrl }) {
  return Object.assign({ subject: 'Bienvenue sur /Pista' }, construire({ app: 'ja', titre: 'Bienvenue sur /Pista', bonjour: prenomDe(first),
    intro: ['Votre compte juge-arbitre est prêt. Un tournoi d’exemple vous attend dans votre tableau de bord pour tout essayer : inscriptions, tirage au sort, programmation, scores en direct et écran TV.', 'Une question ? Répondez simplement à cet e-mail.'],
    cta: { url: appUrl + '/dashboard', label: 'Ouvrir mon tableau de bord' }, pourquoi: 'Vous recevez cet e-mail car un compte /RAM a été créé avec cette adresse.' }));
}
function resetMail({ first, link }) {
  return Object.assign({ subject: '/Pista : choisir un nouveau mot de passe' }, construire({ app: 'ja', titre: 'Nouveau mot de passe', bonjour: prenomDe(first),
    intro: ['Pour choisir un nouveau mot de passe, utilisez le bouton ci-dessous. Le lien est valable 1 heure et ne sert qu’une fois.'],
    cta: { url: link, label: 'Choisir mon mot de passe' }, note: 'Vous n’avez rien demandé ? Ignorez cet e-mail : votre mot de passe actuel reste valable.' }));
}
/* juge-arbitre adjoint invité sur un tournoi */
function adjointMail({ by, tournoi, link }) {
  return Object.assign({ subject: '/Pista : vous êtes juge-arbitre adjoint de ' + tournoi }, construire({ app: 'ja', titre: 'Juge-arbitre adjoint',
    intro: [`<b>${esc(by)}</b> vous a ajouté comme juge-arbitre adjoint du tournoi <b>${esc(tournoi)}</b>.`, 'Vous pouvez gérer les inscriptions, le tirage, la programmation et les scores, comme le juge-arbitre principal. Connectez-vous avec cette adresse e-mail (ou créez votre compte avec elle) : le tournoi apparaît dans vos tournois.'],
    cta: { url: link, label: 'Ouvrir le tournoi' } }));
}
// après un achat sur la boutique : accès activé (et, pour un nouveau compte, lien pour choisir le mot de passe)
function accessMail({ first, items, until, link, appUrl }) {
  const date = new Date(until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  // l'appli de l'offre achetée (offres du 23/11/2026) : /Pista, /Dojo Pro ou l'offre /Buvette d'un club
  const [nom, app] = /^\/Dojo/.test(items[0] || '') ? ['/Dojo', 'coach'] : /^\/Buvette/.test(items[0] || '') ? ['/Buvette', 'club'] : ['/Pista', 'ja'];
  return Object.assign({ subject: `Votre offre ${nom} est activée` }, construire({ app, titre: 'Offre activée', bonjour: prenomDe(first),
    intro: [`Merci pour votre achat (${items.map(esc).join(', ')}). Votre offre ${nom} est active jusqu’au <b>${esc(date)}</b>.`].concat(link ? ['Votre compte a été créé avec cette adresse e-mail : choisissez votre mot de passe pour vous connecter (lien valable 7 jours).'] : []),
    cta: link ? { url: link, label: 'Choisir mon mot de passe' } : app === 'ja' ? { url: appUrl + '/dashboard', label: 'Ouvrir /Pista' } : undefined, pourquoi: 'Vous recevez cet e-mail car un achat a été fait avec cette adresse.' }));
}

/* tarif lisible d'une séance : un prix, ou « compris » quand un abonnement ou un pack la couvre */
const tarifTxt = (prix, couvert) => (+prix > 0 ? String(prix).replace('.', ',') + ' €' : couvert === 'abo' ? 'Compris dans ton abonnement' : couvert === 'pack' ? 'Compris dans ton pack' : '');
const ouvre = (jour, heure) => `${jour} à ${heure}`;

/* cours réservé depuis la page publique : la confirmation, le lien pour annuler et la page de réservation */
function resaMail({ first, nom, jour, heure, duree, lieu, coach, prix, couvert, lien, page, cal }) {
  const ag = cal ? agenda(cal) : null;
  return Object.assign({ subject: `Cours confirmé : ${ouvre(jour, heure)}` }, ag ? { ics: ag.ics } : {}, construire({ app: 'coach', titre: 'Cours confirmé', bonjour: prenomDe(first),
    intro: [`Ton cours est réservé : <b>${esc(nom)}</b> avec ${esc(coach)}.`],
    recap: [['jour', jour], ['heure', heure], ['duree', duree], ['lieu', lieu], ['coach', coach], ['tarif', tarifTxt(prix, couvert)]],
    cta: { url: lien, label: 'Annuler ce cours' }, liens: avecAgenda(ag, page ? [{ label: 'Ma page de réservation', url: page }] : []),
    note: ['Tu peux annuler toi-même jusqu’à 24 h avant le cours. Un rappel t’est envoyé par e-mail 24 h avant.', noteAgenda(ag)].filter(Boolean).join('<br>'), pourquoi: 'Vous recevez cet e-mail car une réservation de cours a été faite avec cette adresse.' }));
}
/* l'enseignant : un cours vient d'être réservé sur sa page */
function resaCoachMail({ coach, eleve, contact, nom, jour, heure, duree, lieu, prix, couvert, lien }) {
  return Object.assign({ subject: `Nouvelle réservation : ${eleve}, ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Nouvelle réservation', bonjour: prenomDe(coach),
    intro: [`<b>${esc(eleve)}</b> vient de réserver <b>${esc(nom)}</b> sur ta page de réservation. Le cours est ajouté à ton planning.`],
    recap: [['eleve', eleve], ['contact', contact], ['jour', jour], ['heure', heure], ['duree', duree], ['lieu', lieu], ['tarif', tarifTxt(prix, couvert)]],
    cta: { url: lien, label: 'Ouvrir mon planning' }, pourquoi: 'Vous recevez cet e-mail car un élève a réservé sur votre page de réservation.' }));
}
/* « Déjà élève ? Se connecter » sur la page de réservation : lien à usage unique (1 h) qui ouvre la création du mot de passe, puis ramène sur la page */
function accesResaMail({ first, coach, link }) {
  return Object.assign({ subject: 'Ton accès pour réserver un cours' }, construire({ app: 'coach', titre: 'Ton accès', bonjour: prenomDe(first),
    intro: [`Voici ton lien pour te connecter et choisir ton mot de passe : il sert pour toutes les applis /RAM et pour réserver avec ${esc(coach)}.`, 'Il ne marche qu’une fois et pendant une heure.'],
    cta: { url: link, label: 'Choisir mon mot de passe' }, note: 'Si tu n’as rien demandé, ignore ce message : rien ne change.' }));
}
/* confirmation de l'adresse du compte, demandée depuis la page de réservation : prouve que la boîte est la sienne, sans changer le mot de passe */
function confirmationMail({ first, coach, link }) {
  return Object.assign({ subject: 'Confirme ton adresse pour réserver' }, construire({ app: 'coach', titre: 'Confirme ton adresse', bonjour: prenomDe(first),
    intro: [`Pour retrouver tes cours et réserver avec ${esc(coach)} depuis ton compte /RAM, confirme que cette adresse est bien la tienne.`, 'Le lien ne marche qu’une fois et pendant une heure.'],
    cta: { url: link, label: 'Confirmer mon adresse' }, note: 'Si tu n’as rien demandé, ignore ce message : rien ne change.' }));
}
/* inscription à une séance collective ou une partie dirigée par le lien public : validée, en attente du minimum, ou liste d'attente */
function inscriptionMail({ first, titre, coach, jour, heure, duree, lieu, tarif, statut, lien, cal }) {
  const dit = statut === 'wait' ? 'Tu es sur la liste d’attente : tu seras prévenu si une place se libère.' : statut === 'ok' ? 'C’est validé : tu es inscrit.' : 'Tu es inscrit. C’est validé dès que le minimum de joueurs est atteint.';
  const ag = cal && statut !== 'wait' ? agenda(cal) : null;   // liste d'attente : rien à mettre à l'agenda pour l'instant
  return Object.assign({ subject: `Inscription : ${titre}, ${ouvre(jour, heure)}` }, ag ? { ics: ag.ics } : {}, construire({ app: 'coach', titre: statut === 'wait' ? 'Liste d’attente' : statut === 'ok' ? 'Inscription validée' : 'Inscription enregistrée', bonjour: prenomDe(first),
    intro: [`<b>${esc(titre)}</b> avec ${esc(coach)}.`, esc(dit)],
    recap: [['jour', jour], ['heure', heure], ['duree', duree], ['lieu', lieu], ['coach', coach], ['tarif', tarif]],
    cta: { url: lien, label: 'Me désinscrire' }, liens: avecAgenda(ag), note: ['Tu peux te désinscrire toi-même avec le bouton ci-dessus.', noteAgenda(ag)].filter(Boolean).join('<br>'), pourquoi: 'Vous recevez cet e-mail car une inscription a été faite avec cette adresse.' }));
}
/* la veille du cours (24 h avant) : chaque élève inscrit, avec de quoi l'ajouter à son agenda */
function rappelMail({ first, nom, coach, jour, heure, duree, lieu, lien, cal }) {
  const ag = cal ? agenda(cal) : null;
  return Object.assign({ subject: `Rappel : ${nom}, ${ouvre(jour, heure)}` }, ag ? { ics: ag.ics } : {}, construire({ app: 'coach', titre: 'Ton cours, demain', bonjour: prenomDe(first),
    intro: [`Petit rappel : <b>${esc(nom)}</b>${coach ? ' avec ' + esc(coach) : ''}, demain à ${esc(heure)}.`],
    recap: [['jour', jour], ['heure', heure], ['duree', duree], ['lieu', lieu], ['coach', coach]],
    cta: lien ? { url: lien, label: 'Voir mon agenda' } : undefined, liens: avecAgenda(ag),
    note: 'Un empêchement ? Préviens ton enseignant au plus vite, pour qu’il puisse proposer ta place.', pourquoi: 'Vous recevez cet e-mail car vous êtes inscrit à ce cours, ou votre enfant l’est.' }));
}
/* l'enseignant : une inscription par son lien */
function inscriptionCoachMail({ coach, eleve, contact, titre, jour, heure, statut, lien }) {
  const dit = statut === 'wait' ? 'sur la liste d’attente' : statut === 'ok' ? 'validée' : 'enregistrée (en attente du minimum)';
  return Object.assign({ subject: `Inscription : ${eleve}, ${titre}, ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Nouvelle inscription', bonjour: prenomDe(coach),
    intro: [`<b>${esc(eleve)}</b> s’est inscrit à <b>${esc(titre)}</b> par ton lien d’inscription : inscription ${esc(dit)}.`],
    recap: [['eleve', eleve], ['contact', contact], ['jour', jour], ['heure', heure], ['statut', dit]],
    cta: { url: lien, label: 'Ouvrir /Dojo' }, pourquoi: 'Vous recevez cet e-mail car quelqu’un s’est inscrit par votre lien d’inscription.' }));
}
/* l'élève s'est désinscrit (lien du mail) : confirmation à lui, avis à l'enseignant */
function desinscriptionMail({ first, titre, jour, heure, coach }) {
  return Object.assign({ subject: `Désinscription : ${titre}, ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Désinscription prise en compte', bonjour: prenomDe(first),
    intro: [`Tu n’es plus inscrit à <b>${esc(titre)}</b> avec ${esc(coach)}.`], recap: [['jour', jour], ['heure', heure]],
    pourquoi: 'Vous recevez cet e-mail car une désinscription a été faite avec votre lien.' }));
}
function desinscriptionCoachMail({ coach, eleve, titre, jour, heure, lien }) {
  return Object.assign({ subject: `Désinscription : ${eleve}, ${titre}, ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Désinscription', bonjour: prenomDe(coach),
    intro: [`<b>${esc(eleve)}</b> s’est désinscrit de <b>${esc(titre)}</b>.`], recap: [['eleve', eleve], ['jour', jour], ['heure', heure]],
    cta: { url: lien, label: 'Ouvrir /Dojo' }, pourquoi: 'Vous recevez cet e-mail car quelqu’un s’est désinscrit par votre lien d’inscription.' }));
}
/* liste d'attente : une place se libère, la personne passe en « validé » */
function placeLibreMail({ first, titre, coach, jour, heure, lien }) {
  return Object.assign({ subject: `Une place s’est libérée : ${titre}, ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Une place s’est libérée', bonjour: prenomDe(first),
    intro: [`Bonne nouvelle : tu passes de la liste d’attente à <b>inscrit</b> pour <b>${esc(titre)}</b> avec ${esc(coach)}.`], recap: [['jour', jour], ['heure', heure], ['coach', coach]],
    cta: lien ? { url: lien, label: 'Me désinscrire' } : undefined, note: 'Tu ne peux plus venir ? Désinscris-toi avec le lien de ton e-mail d’inscription, pour laisser ta place.', pourquoi: 'Vous recevez cet e-mail car vous étiez sur une liste d’attente avec cette adresse.' }));
}
/* cours réservé depuis la page publique : l'enseignant l'annule ou le déplace */
function resaChangeMail({ first, nom, coach, annule, jour, heure }) {
  const dit = annule ? `est annulé par ${coach}` : `est déplacé par ${coach}`;
  return Object.assign({ subject: annule ? `Cours annulé : ${ouvre(jour, heure)}` : `Cours déplacé : ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: annule ? 'Cours annulé' : 'Cours déplacé', bonjour: prenomDe(first),
    intro: [`Ton cours <b>${esc(nom)}</b> ${esc(dit)}.`], recap: annule ? [] : [['jour', jour], ['heure', heure], ['coach', coach]],
    pourquoi: 'Vous recevez cet e-mail car vous aviez réservé ce cours avec cette adresse.' }));
}
/* l'enseignant annule, rétablit, reporte ou change l'heure d'un cours ou d'une séance de groupe : chaque élève (ou son parent).
   lignes : les avis, ceux des notifications (« Cours annulé : Groupe ado, mardi 24 novembre à 18 h ») */
function seanceChangeMail({ first, coach, lignes, lien }) {
  const l = (lignes || []).filter(Boolean), seul = l.length === 1 ? l[0] : '', i = seul.indexOf(' : ');
  const titre = seul && /^Cours (annulé|rétabli|déplacé)$/.test(seul.slice(0, i)) ? seul.slice(0, i) : 'Changement de cours';
  return Object.assign({ subject: seul || 'Changements dans tes cours' }, construire({ app: 'coach', titre, bonjour: prenomDe(first),
    intro: [`${coach ? esc(coach) + ' a modifié' : 'Ton enseignant a modifié'} ${l.length > 1 ? 'tes cours' : 'ton cours'} :`, l.map(x => `<b>${esc(x)}</b>`).join('<br>')],
    cta: lien ? { url: lien, label: 'Voir mon agenda' } : undefined,
    pourquoi: 'Vous recevez cet e-mail car vous êtes inscrit à ce cours, ou votre enfant l’est.' }));
}
/* l'élève annule lui-même (lien du mail) : confirmation à lui, avis à l'enseignant */
function annulationMail({ first, nom, coach, jour, heure }) {
  return Object.assign({ subject: `Cours annulé : ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Annulation prise en compte', bonjour: prenomDe(first),
    intro: [`Ton cours <b>${esc(nom)}</b> avec ${esc(coach)} est annulé.`], recap: [['jour', jour], ['heure', heure]],
    pourquoi: 'Vous recevez cet e-mail car une annulation a été faite avec votre lien.' }));
}
function annulationCoachMail({ coach, eleve, nom, jour, heure, lien }) {
  return Object.assign({ subject: `Annulation : ${eleve}, ${ouvre(jour, heure)}` }, construire({ app: 'coach', titre: 'Un élève annule', bonjour: prenomDe(coach),
    intro: [`<b>${esc(eleve)}</b> a annulé <b>${esc(nom)}</b>. Le créneau est de nouveau libre.`], recap: [['eleve', eleve], ['jour', jour], ['heure', heure]],
    cta: { url: lien, label: 'Ouvrir mon planning' }, pourquoi: 'Vous recevez cet e-mail car un élève a annulé un cours réservé sur votre page.' }));
}

module.exports = { enabled, send, sendSafe, checkKey, keepAlive, construire, APPS, welcomeMail, resetMail, accessMail, resaMail, resaCoachMail, accesResaMail, confirmationMail, inscriptionMail, inscriptionCoachMail, desinscriptionMail, desinscriptionCoachMail, placeLibreMail, resaChangeMail, seanceChangeMail, rappelMail, agenda, annulationMail, annulationCoachMail, adjointMail };
