/* Aperçu des e-mails : un fichier HTML (et le texte joint) par e-mail, avec des données d'exemple, dans apercus-emails/ (ignoré par git).
   Aucun envoi : rien ne part, aucune adresse réelle. Usage : node tools/apercu-emails.js, puis ouvrir apercus-emails/index.html. */
'use strict';
const fs = require('fs'), path = require('path');
const { exemples } = require('../lib/mail-exemples.js');

const DIR = path.join(__dirname, '..', 'apercus-emails');
fs.mkdirSync(DIR, { recursive: true });
const l = exemples();
l.forEach(e => {
  fs.writeFileSync(path.join(DIR, e.id + '.html'), e.mail.html);
  fs.writeFileSync(path.join(DIR, e.id + '.txt'), `Objet : ${e.mail.subject}\n\n${e.mail.text}\n`);
});
fs.writeFileSync(path.join(DIR, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Aperçu des e-mails</title><body style="font-family:Arial;max-width:760px;margin:24px auto"><h1>Aperçu des e-mails</h1><table cellpadding="8" border="1" style="border-collapse:collapse"><tr><th>E-mail</th><th>Destinataire</th><th>Quand</th><th>Objet</th></tr>${l.map(e => `<tr><td><a href="${e.id}.html">${e.id}</a> · <a href="${e.id}.txt">texte</a></td><td>${e.qui}</td><td>${e.quand}</td><td>${e.mail.subject.replace(/</g, '&lt;')}</td></tr>`).join('')}</table></body>`);
console.log(`${l.length} aperçus écrits dans ${DIR}`);
