/* E-mails : un gabarit commun, chaque e-mail se génère, contient ses liens et rien d'une autre personne ;
   un échec du service d'envoi (Brevo) ne bloque jamais une réservation */
const test = require('node:test');
const assert = require('node:assert/strict');
const Mail = require('../lib/mail.js');
const { exemples } = require('../lib/mail-exemples.js');
const { createResaMails } = require('../lib/resa-mails.js');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

test('chaque e-mail se génère : objet, version texte, en-tête de l’appli, 600 px, mode sombre, liens, aucune valeur vide ni emoji', () => {
  const l = exemples();
  assert.ok(l.length >= 18, 'tous les e-mails de l’inventaire');
  for (const { id, mail } of l) {
    assert.ok(mail.subject && mail.subject.length > 5, id + ' : objet');
    assert.ok(mail.text && mail.text.length > 40, id + ' : version texte');
    assert.match(mail.html, /width="600"/, id + ' : 600 px');
    assert.match(mail.html, /prefers-color-scheme: dark/, id + ' : mode sombre');
    assert.match(mail.html, /name="viewport"/, id + ' : lisible sur téléphone');
    assert.match(mail.html, /\/(Pista|Dojo|Buvette)/, id + ' : au nom de l’appli');
    assert.ok(!/undefined|null|NaN/.test(mail.html + mail.text + mail.subject), id + ' : aucune valeur vide');
    assert.ok(!EMOJI.test(mail.html + mail.text + mail.subject), id + ' : pas d’emoji');
    assert.ok(!/<script/i.test(mail.html), id + ' : aucun script');
    // chaque lien du HTML figure aussi dans la version texte
    for (const m of mail.html.matchAll(/href="(https?:[^"]+)"/g)) assert.ok(mail.text.includes(m[1].replace(/&amp;/g, '&')), id + ' : lien absent du texte : ' + m[1]);
  }
});

test('liens des e-mails : ceux de la réservation et de l’inscription portent leur adresse, l’enseignant a le lien de son appli', () => {
  const par = id => exemples().find(e => e.id === id).mail;
  assert.match(par('resa-eleve').html, /r\/annuler\?c=club1&amp;id=r1&amp;t=signature/);
  assert.match(par('resa-eleve').html, /riseandmove\.fr\/r\/club1\/cle1/, 'ma page de réservation');
  assert.match(par('inscription-ok').html, /\/i\/annuler\?c=club1/);
  assert.match(par('mot-de-passe').text, /reinitialiser\?t=jeton-exemple/);
  assert.match(par('resa-coach').html, /dojo\.riseandmove\.fr/);
  assert.match(par('acces').html, /Pass tournoi/);
});

test('données d’une autre personne : le prénom saisi est échappé, un élève ne voit jamais les coordonnées d’un autre', () => {
  const m = Mail.resetMail({ first: '<img src=x onerror=alert(1)>', link: 'https://x.test/a?b=1&c=2' });
  assert.ok(!m.html.includes('<img src=x'), 'prénom échappé');
  assert.match(m.html, /href="https:\/\/x\.test\/a\?b=1&amp;c=2"/, 'lien échappé');
  const l = exemples();
  // les e-mails d'un élève ne contiennent ni le contact ni le nom de famille d'un autre ; seul l'enseignant reçoit l'élève et son contact
  for (const e of l.filter(x => /^(resa-eleve|annulation-eleve|cours-|inscription-ok|inscription-attente|desinscription-eleve|place-libre)/.test(x.id))) {
    assert.ok(!/lea@exemple\.test|06 12 34 56 78|Martin/.test(e.mail.html + e.mail.text), e.id + ' : rien d’une autre personne');
  }
  assert.match(l.find(x => x.id === 'resa-coach').mail.html, /Léa Martin/);
});

test('envoi : Brevo en échec → erreur claire, repli sur Resend si la clé existe, sendSafe ne lève jamais', async () => {
  const env = { ...process.env }, fetch0 = global.fetch, appels = [];
  try {
    process.env.BREVO_API_KEY = 'cle-brevo-essai'; delete process.env.RESEND_API_KEY;
    global.fetch = async url => { appels.push(String(url)); return { ok: false, status: 500, text: async () => 'panne', json: async () => ({}) }; };
    const m = { to: 'a@exemple.test', subject: 'Essai', html: '<p>x</p>', text: 'x' };
    await assert.rejects(Mail.send(m), /Brevo 500/);
    const s = await Mail.sendSafe(m);
    assert.equal(s.sent, false, 'sendSafe : pas d’exception');
    // repli sur Resend
    process.env.RESEND_API_KEY = 'cle-resend-essai'; appels.length = 0;
    global.fetch = async url => { appels.push(String(url)); return /brevo/.test(String(url)) ? { ok: false, status: 503, text: async () => 'panne', json: async () => ({}) } : { ok: true, status: 200, text: async () => '', json: async () => ({}) }; };
    assert.deepEqual(await Mail.send(m), { sent: true });
    assert.deepEqual(appels.map(u => /brevo/.test(u) ? 'brevo' : 'resend'), ['brevo', 'resend']);
  } finally { global.fetch = fetch0; for (const k of ['BREVO_API_KEY', 'RESEND_API_KEY']) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; } }
});

test('une réservation n’est jamais bloquée par le courrier : file de tâches en panne, annulation et inscription passent', async () => {
  const journal = [];
  const ram = {
    memberByKey: async () => ({ user_id: 'u1', data: { n: 'Sarah Benali' } }),
    audience: async () => ({ user: { k1: 'u1' }, get: (coll, id) => (coll === 'post' ? { by: 'k1', nv: { mode: 'cours', theme: 'Séance', time: '19 h', tiers: [], ins: {} } } : { n: 'Sarah Benali' }) }),
    itemsOf: async (club, coll) => (coll === 'eleve' ? [{ id: 'e1', data: { n: 'Léa Martin', mail: 'lea@exemple.test', tel: '0612345678' } }] : [{ id: 'r1', data: { name: 'Cours', once: '2026-12-01', h: '18 h', coach: 'k1', ext: ['e1'], cancel: [] } }])
  };
  const store = { getUser: async () => ({ email: 'sarah@exemple.test', name: 'Sarah' }) };
  const enPanne = { enqueue: () => { throw new Error('base indisponible'); } };
  const R = createResaMails({ ram, store, taches: enPanne, Mail, nvEtat: () => ({ status: {} }), log: m => journal.push(m) });
  const r = { mail: 'lea@exemple.test', nom: 'Cours', d: '2026-12-01', h: '18 h', dur: '1 h', prix: 40, couvert: '', titre: 'Séance', statut: 'ok' };
  await R.reservation({ clubId: 'c1', key: 'k1', r, eleve: 'Léa Martin', tel: '0612345678', lieu: 'En salle', lienPlanning: 'https://x.test/' });
  await R.inscription({ clubId: 'c1', postId: 'p1', r, eleve: 'Léa Martin', tel: '', lienCoach: 'https://x.test/' });
  const ctx = await R.avantAnnulation('c1', 'r1');
  assert.equal(ctx.fiche.mail, 'lea@exemple.test');
  await R.annulation(ctx, 'https://x.test/');
  assert.ok(journal.length >= 3, 'les erreurs sont notées, jamais levées : ' + journal.length);
  // courrier bien parti vers les bonnes personnes quand la file marche
  const envoyes = [], R2 = createResaMails({ ram, store, taches: { enqueue: (k, m) => envoyes.push(m) }, Mail, nvEtat: () => ({ status: {} }), log: () => {} });
  await R2.reservation({ clubId: 'c1', key: 'k1', r, eleve: 'Léa Martin', tel: '0612345678', lieu: 'En salle', lienPlanning: 'https://x.test/' });
  await R2.annulation(ctx, 'https://x.test/');
  assert.deepEqual(envoyes.map(m => m.to).sort(), ['lea@exemple.test', 'sarah@exemple.test', 'sarah@exemple.test']);
  assert.ok(envoyes.filter(m => m.to === 'lea@exemple.test').every(m => !/sarah@exemple/.test(m.html)), 'l’élève ne reçoit pas l’adresse de l’enseignant');
});
