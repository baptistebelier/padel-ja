/* =========================================================================
   PADEL JA — envoi des e-mails (Brevo ou Resend, API HTTP, sans dépendance)
   Variables Render : BREVO_API_KEY ou RESEND_API_KEY, MAIL_FROM (expéditeur
   validé chez le service choisi, ex. « Padel JA <contact@riseandmove.fr> »).
   Sans clé : rien n'est envoyé, le serveur l'indique dans ses journaux.
   ========================================================================= */
'use strict';

// deux services possibles, au choix : Brevo (BREVO_API_KEY) ou Resend (RESEND_API_KEY)
const enabled = () => !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);

function sender() {
  const raw = process.env.MAIL_FROM || 'Padel JA <contact@riseandmove.fr>';
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  return m ? { name: m[1] || 'Padel JA', email: m[2] } : { name: 'Padel JA', email: raw.trim() };
}

async function send({ to, subject, html, text }) {
  if (!enabled()) { console.log(`  E-mail non envoyé (aucune clé BREVO_API_KEY ni RESEND_API_KEY) : « ${subject} » à ${to}`); return { sent: false }; }
  if (!process.env.BREVO_API_KEY) {
    const s = sender();
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${s.name} <${s.email}>`, to: [to], subject, html, text })
    });
    if (!r.ok) throw new Error(`Resend ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return { sent: true };
  }
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ sender: sender(), to: [{ email: to }], subject, htmlContent: html, textContent: text })
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return { sent: true };
}

/* Brevo désactive une clé après 90 jours sans utilisation : une lecture du compte chaque semaine
   (aucun e-mail envoyé) la garde active, et signale tôt une clé supprimée ou invalide */
async function checkKey() {
  if (!process.env.BREVO_API_KEY) return null;
  const r = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': process.env.BREVO_API_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`clé Brevo refusée (${r.status}) : vérifiez BREVO_API_KEY dans Render`);
  return true;
}
function keepAlive(log) {
  const run = () => checkKey().catch(e => log('E-mails : ' + e.message));
  setTimeout(run, 3 * 60e3).unref();
  setInterval(run, 7 * 24 * 3600e3).unref();
}

/* ---------- modèles ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// mise en page commune : fond sombre /RAM, bandeau citron, bouton
function layout(title, body, cta) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#120A0C;font-family:Arial,Helvetica,sans-serif;color:#F4EFEF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#120A0C;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1C1013;border:1px solid #3A2228">
<tr><td style="padding:22px 26px 6px"><span style="display:inline-block;background:#E0F50A;color:#120A0C;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:13px;padding:4px 10px">Padel JA</span></td></tr>
<tr><td style="padding:10px 26px 0"><h1 style="margin:0;font-size:26px;line-height:1.15;text-transform:uppercase;font-style:italic;color:#FFFFFF">${esc(title)}</h1></td></tr>
<tr><td style="padding:14px 26px 6px;font-size:15px;line-height:1.55;color:#E8DADC">${body}</td></tr>
${cta ? `<tr><td style="padding:12px 26px 6px"><a href="${esc(cta.url)}" style="display:inline-block;background:#E0F50A;color:#120A0C;text-decoration:none;font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:14px;padding:13px 22px;box-shadow:4px 4px 0 #F5104C">${esc(cta.label)}</a></td></tr>` : ''}
<tr><td style="padding:22px 26px 24px;font-size:12px;color:#A08C90">Padel JA — le logiciel du juge-arbitre de padel · /RAM Rise And Move<br>Vous recevez cet e-mail car un compte Padel JA est lié à cette adresse.</td></tr>
</table></td></tr></table></body></html>`;
}

function welcomeMail({ first, appUrl }) {
  const hi = first ? `Bonjour ${esc(first)},` : 'Bonjour,';
  return {
    subject: 'Bienvenue sur Padel JA',
    html: layout('Bienvenue sur Padel JA', `${hi}<br><br>Votre compte juge-arbitre est prêt. Un tournoi d'exemple vous attend dans votre tableau de bord pour tout essayer : inscriptions, tirage au sort, programmation, scores en direct et écran TV.<br><br>Une question ? Répondez simplement à cet e-mail.`,
      { url: appUrl + '/dashboard', label: 'Ouvrir mon tableau de bord' }),
    text: `${first ? 'Bonjour ' + first : 'Bonjour'},\n\nVotre compte Padel JA est prêt. Un tournoi d'exemple vous attend : ${appUrl}/dashboard\n\nUne question ? Répondez simplement à cet e-mail.\n\nPadel JA — /RAM Rise And Move`
  };
}

function resetMail({ first, link }) {
  const hi = first ? `Bonjour ${esc(first)},` : 'Bonjour,';
  return {
    subject: 'Padel JA : choisir un nouveau mot de passe',
    html: layout('Nouveau mot de passe', `${hi}<br><br>Pour choisir un nouveau mot de passe, utilisez le bouton ci-dessous. Le lien est valable 1 heure et ne sert qu'une fois.<br><br>Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe actuel reste valable.`,
      { url: link, label: 'Choisir mon mot de passe' }),
    text: `${first ? 'Bonjour ' + first : 'Bonjour'},\n\nPour choisir un nouveau mot de passe (lien valable 1 heure) :\n${link}\n\nVous n'avez rien demandé ? Ignorez cet e-mail.\n\nPadel JA`
  };
}

module.exports = { enabled, send, checkKey, keepAlive, welcomeMail, resetMail };
