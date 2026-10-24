/* /RAM Club — app/4-formulaires.js : Formulaires : champs, visibilité, fenêtres de saisie.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* ---------- formulaires ---------- */
const F = (id, l, ph, v) =>
    `<div class="fld"><label for="${id}">${l}</label><input id="${id}" required placeholder="${ph || ''}" value="${v ? esc(v) : ''}" autocomplete="off"></div>`,
  O = (id, l, ph, v) =>
    `<div class="fld"><label for="${id}">${l}</label><input id="${id}" placeholder="${ph || ''}" value="${v ? esc(v) : ''}" autocomplete="off"></div>`,
  T = (id, l, ph, v) =>
    `<div class="fld"><label for="${id}">${l}</label><textarea id="${id}" required placeholder="${ph || ''}">${v ? esc(v) : ''}</textarea></div>`,
  Sel = (id, l, opts, sel) =>
    `<div class="fld"><label for="${id}">${l}</label><select id="${id}">${opts.map(o => `<option ${o === sel ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`,
  Dt = (id, l, req, v) =>
    `<div class="fld"><label for="${id}">${l}</label><input type="date" id="${id}" ${req ? 'required' : ''} value="${v || isoIn(7)}"></div>`,
  Who = (id, l, ids) =>
    `<div class="fld"><label for="${id}">${l}</label><select id="${id}">${ids.map(k => `<option value="${k}">${M[k].n}</option>`).join('')}</select></div>`,
  IMG = `<div class="fld"><label for="a-img">Photo de couverture (facultative)</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" hidden></div><span class="muted small">Si des jeunes apparaissent sur la photo, vérifie leur autorisation photo (indiquée par leurs parents).</span></div>`;
const adults = () => Object.keys(M).filter(k => k !== 'club' && M[k].role !== 'Jeune');
const toUrl = u => (u ? (/^https?:\/\//i.test(u) ? u : 'https://' + u) : '');
function visBlock() {
  return `<details class="more"><summary>Sport et visibilité</summary><div class="in">${Sel('v-sport', 'Sport concerné', ['Tennis et padel', 'Tennis', 'Padel'])}${Sel('v-pub', 'Visible par', ['Tous les adhérents', 'Bureau uniquement', 'Équipe pédagogique', 'Parents'])}
 <div class="two">${Sel('v-gen', 'Genre', ['Hommes et femmes', 'Hommes', 'Femmes'])}${Sel('v-age', 'Âge', ['Jeunes et adultes', 'Jeunes', 'Adultes'])}</div>${Sel('v-prat', 'Pratique', ['Compétiteurs et loisir', 'Compétiteurs (classés 40 et plus)', 'Loisir (non classés)'])}
 <div class="fld"><label class="chk" for="v-all"><input type="checkbox" id="v-all" checked data-hide="v-range">Tous classements et niveaux</label></div>
 <div id="v-range" class="stack" hidden><div class="two" id="v-rk">${Sel('v-lo', 'Tennis, de', RANKS, '30/1')}${Sel('v-hi', 'à', RANKS, '15/1')}</div><div class="two" id="v-nv">${Sel('n-lo', 'Padel, de', LV, 'Niveau 3')}${Sel('n-hi', 'à', LV, 'Niveau 7')}</div></div></div></details>`;
}
function readVis() {
  const x = id => $(id).value,
    vis = [],
    rule = {},
    sp = x('v-sport');
  if (x('v-pub') !== 'Tous les adhérents') {
    vis.push(x('v-pub'));
    rule.pub = x('v-pub');
  }
  if (x('v-gen') !== 'Hommes et femmes') {
    vis.push(x('v-gen'));
    rule.gen = x('v-gen');
  }
  if (x('v-age') !== 'Jeunes et adultes') {
    vis.push(x('v-age'));
    rule.age = x('v-age');
  }
  if (x('v-prat') !== 'Compétiteurs et loisir') {
    const p = x('v-prat').split(' (')[0];
    vis.push(p);
    rule.prat = p;
  }
  if (!$('v-all').checked) {
    if (sp !== 'Padel') {
      const a = rIdx(x('v-lo')),
        b = rIdx(x('v-hi'));
      rule.tn = [Math.min(a, b), Math.max(a, b)];
      vis.push(RANKS[rule.tn[0]] + ' à ' + RANKS[rule.tn[1]]);
    }
    if (sp !== 'Tennis') {
      const a = LV.indexOf(x('n-lo')) + 1,
        b = LV.indexOf(x('n-hi')) + 1;
      rule.pd = [Math.min(a, b), Math.max(a, b)];
      vis.push('Niveau ' + rule.pd[0] + ' à ' + rule.pd[1]);
    }
  }
  return {
    vis,
    rule: Object.keys(rule).length ? rule : null,
    sport: sp === 'Tennis et padel' ? '' : sp,
    both: sp === 'Tennis et padel'
  };
}
function forms(k, cid) {
  if (k === 'stage') {
    const e = forms('event', cid);
    return ['Nouveau stage', e[1], 'Publier le stage'];
  }
  const cm = COMMS.find(c => c.id === cid);
  const coaches = Object.keys(M).filter(x => (M[x].role || '').startsWith('Enseignant'));
  return {
    annonce: [
      'Nouvelle annonce',
      F('a-title', 'Titre', 'Court 3 fermé jeudi') +
        T('a-body', 'Message', 'Ce que les adhérents doivent savoir') +
        IMG +
        visBlock(),
      'Publier sur le mur'
    ],
    event: [
      'Nouvel événement',
      F('a-title', 'Titre', 'Soirée des bénévoles') +
        IMG +
        Dt('a-d1', 'Date de début', 1) +
        `<div class="fld"><label for="a-d2">Date de fin</label><input type="date" id="a-d2" value="${isoIn(7)}" hidden><label class="chk" for="a-same"><input type="checkbox" id="a-same" checked data-hide="a-d2">Même jour</label></div><div class="two">${Sel('a-h1', 'Heure de début', HOURS, '14 h')}${Sel('a-h2', 'Heure de fin', HOURS, '18 h')}</div>` +
        F('a-place', 'Lieu', 'Club-house') +
        T('a-body', 'Description', 'Le programme en deux phrases') +
        `<div class="fld"><span class="lb">Inscription</span><div class="radio"><label for="a-reg-int"><input type="radio" name="a-reg" value="int" id="a-reg-int" checked>Dans l'appli</label><label for="a-reg-ext"><input type="radio" name="a-reg" value="ext" id="a-reg-ext">Sur Ten'Up</label></div></div><div id="ev-int">${Sel('ev-cap', "Places (au-delà : liste d'attente)", ['Sans limite', '10', '20', '30', '40', '50', '80', '100'])}</div><div id="ev-ext" hidden>${O('a-ten', "Lien Ten'Up de l'événement", 'https://tenup.fft.fr/…')}</div>` +
        O('a-pay', 'Lien de paiement (HelloAsso…, facultatif)', 'https://www.helloasso.com/…') +
        visBlock(),
      "Publier l'événement"
    ],
    comm: [
      'Créer une commission',
      F('a-title', 'Nom', 'Commission bénévoles') +
        T('a-body', 'Description', 'Son rôle en deux phrases') +
        Who('a-cap', 'Responsable', adults()),
      'Créer la commission'
    ],
    chan: [
      'Créer un groupe de discussion',
      F('a-title', 'Nom', 'Covoiturage') +
        F('a-body', 'Description', 'Organiser les trajets des matchs') +
        Sel('c-g', 'Rubrique', ['Club', 'Entraînements', 'Équipes']) +
        `<div class="fld"><label class="chk" for="c-ro"><input type="checkbox" id="c-ro">Seul le bureau peut écrire (groupe d'annonces)</label></div>`,
      'Créer le groupe'
    ],
    commpromo: [
      'Promouvoir la commission',
      F('a-title', 'Titre', '', cm ? 'Rejoins la ' + cm.name.toLowerCase() : '') +
        T('a-body', 'Description', '', cm ? cm.desc : '') +
        IMG +
        `<p class="muted small">Les adhérents répondent « Ça m'intéresse » ou « Peut-être », et le responsable est prévenu.</p>`,
      'Publier sur le mur'
    ],
    partner: [
      'Ajouter un partenaire',
      F('a-title', "Nom de l'entreprise", 'Garage des Tilleuls') +
        `<div class="fld"><label for="a-body">Description (facultative)</label><textarea id="a-body" placeholder="Activité, lien avec le club…"></textarea></div><div class="fld"><label for="a-img">Logo</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" hidden></div></div>`,
      'Ajouter le partenaire'
    ],
    ad: [
      'Mettre en avant nos partenaires',
      F('a-title', 'Titre du bandeau', '', 'Nos partenaires') +
        Sel('ad-col', 'Couleur du bandeau', ['Jaune', 'Rouge']) +
        `<div class="fld"><span class="lb">Partenaires à mettre en avant</span>${PARTNERS.map(x => `<label class="chk"><input type="checkbox" name="ad-p" value="${x.id}" checked>${x.name}</label>`).join('') || '<p class="muted small">Ajoute d\'abord un partenaire.</p>'}</div><p class="muted small">Le bandeau défile sur le mur, sur fond plein, pour se démarquer des publications.</p>`,
      'Publier le bandeau'
    ],
    tournoi: [
      'Nouveau tournoi',
      F('a-title', 'Nom du tournoi', "Open d'hiver") +
        IMG +
        `<div class="two">${Sel('tr-sport', 'Sport', ['Tennis', 'Padel'])}${Sel('tr-gen', 'Tableau', ['Hommes', 'Femmes', 'Mixte'])}</div>` +
        `<div class="two">${Sel('tr-pub', 'Public', ['Adultes', 'Jeunes', 'Seniors +'])}<div id="tr-vet" hidden>${Sel('tr-vet-s', 'Catégorie', ['+35 ans', '+45 ans', '+55 ans', '+65 ans', '+75 ans'], '+45 ans')}</div></div>` +
        `<div class="two" id="tr-jeunes" hidden>${Sel(
          'tr-a1',
          'Âge de',
          Array.from({ length: 12 }, (_, i) => i + 7 + ' ans'),
          '11 ans'
        )}${Sel(
          'tr-a2',
          'à',
          Array.from({ length: 12 }, (_, i) => i + 7 + ' ans'),
          '12 ans'
        )}</div>` +
        `<div id="tr-tennis" class="stack">${Sel('tr-fmt', 'Format', ['Traditionnel', 'TMC (multi-chances)'])}<div class="fld"><label class="chk" for="tr-open"><input type="checkbox" id="tr-open" checked data-hide="tr-range">Open : tous classements</label></div><div class="two" id="tr-range" hidden>${Sel('tr-lo', 'Classement de', RANKS, '30/2')}${Sel('tr-hi', 'à', RANKS, '15/1')}</div></div>` +
        `<div id="tr-padel" hidden>${Sel('tr-cat', 'Catégorie de tournoi', ['P25', 'P50', 'P100', 'P250', 'P500', 'P1000'], 'P100')}</div>` +
        Sel('tr-max', 'Nombre de participants maximum', [
          'Sans limite',
          '8',
          '12',
          '16',
          '24',
          '32',
          '48',
          '64',
          '96',
          '128'
        ]) +
        Dt('a-d1', 'Date de début', 1) +
        `<div class="fld"><label for="a-d2">Date de fin</label><input type="date" id="a-d2" value="${isoIn(8)}" hidden><label class="chk" for="a-same"><input type="checkbox" id="a-same" checked data-hide="a-d2">Sur une seule journée</label></div>` +
        `<div class="two">${Sel('a-h1', 'Début des matchs', HOURS, '9 h')}${Dt('tr-dl', 'Fin des inscriptions', 1, isoIn(4))}</div>` +
        F('a-place', 'Lieu', 'Au club') +
        `<div class="fld"><label for="a-body">Description (facultative)</label><textarea id="a-body" placeholder="Dotation, balles, restauration…"></textarea></div>` +
        O('tr-url', "Lien Ten'Up du tournoi", 'https://tenup.fft.fr/…') +
        `<div class="note">Les joueurs s'inscrivent sur Ten'Up : la publication affiche un bouton qui ouvre ce lien.</div>`,
      'Publier le tournoi'
    ],
    cta: [
      'Nouvelle publication avec lien',
      F('a-title', 'Titre', 'Revivez la finale en vidéo') +
        T('a-body', 'Description', 'Ce que les adhérents trouveront derrière le bouton') +
        F('a-label', 'Texte du bouton', 'Voir la vidéo') +
        `<div class="fld"><label for="a-url">Lien</label><input id="a-url" required inputmode="url" placeholder="https://www.youtube.com/…" autocomplete="off"></div>` +
        IMG +
        visBlock(),
      'Publier sur le mur'
    ],
    poll: [
      'Nouveau sondage',
      F('a-title', 'Question', 'Quel jour pour la fête du club ?') +
        F('a-o1', 'Réponse 1', 'Samedi') +
        F('a-o2', 'Réponse 2', 'Dimanche') +
        [3, 4, 5, 6].map(n => O('a-o' + n, `Réponse ${n} (facultative)`, '')).join('') +
        `<div class="fld"><label for="a-close">Clôture du sondage (facultative)</label><input type="date" id="a-close"></div>` +
        visBlock(),
      'Publier le sondage'
    ],
    article: [
      'Nouvelle actu',
      Sel('a-cat', 'Rubrique', ['Vie du club', 'Compétition', 'Jeunes', 'Padel', 'Portrait']) +
        F('a-title', 'Titre', "L'équipe 1 monte en Régional 1") +
        F('a-lead', 'Chapeau', "L'essentiel en une phrase") +
        T('a-body', 'Texte', 'Un paragraphe par ligne') +
        IMG +
        Sel('v-sport', 'Sport concerné', ['Tennis et padel', 'Tennis', 'Padel']),
      'Publier dans les actus'
    ],
    champ: [
      'Créer un championnat',
      F('a-title', 'Nom', 'Interclubs de printemps') +
        `<div class="two">${Sel('a-sport', 'Sport', ['Tennis', 'Padel'])}${Sel('a-age', 'Catégorie', ['Adultes', 'Jeunes'])}</div>` +
        O('a-season', 'Saison', 'Printemps 2027'),
      'Créer le championnat'
    ],
    team: [
      'Ajouter une équipe',
      F('a-title', 'Nom', 'Équipe 3') +
        `<div class="two">${F('a-sub', 'Division', 'Départemental 2')}${Sel('a-gen', 'Genre', ['Hommes', 'Femmes', 'Mixte'])}</div>` +
        Who('a-cap', 'Capitaine', adults()),
      "Créer l'équipe"
    ],
    train: [
      'Créer un groupe',
      F('a-title', 'Nom', 'Adultes loisir') +
        `<div class="two">${Sel('t-sport', 'Sport', ['Tennis', 'Padel'])}${Sel('t-day', 'Jour', ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'], 'Jeudi')}</div><div class="two">${Sel('a-h1', 'Heure de début', HOURS, '19 h')}${Sel('t-dur', 'Durée du cours', ['1 h', '1 h 30'], '1 h 30')}</div><div class="two">${Who('t-coach', 'Enseignant', coaches)}${Sel('a-gen', 'Public', ['Mixte', 'Hommes', 'Femmes'])}</div>${Sel('t-loc', 'Lieu habituel', ['Extérieur', 'En salle'])}<div class="two">${Sel('v-lo', 'Classement de', RANKS, 'NC')}${Sel('v-hi', 'à', RANKS, '15')}</div><p class="muted small">Le groupe est créé vide. Sa page te propose ensuite les adhérents qui correspondent à ces critères.</p>`,
      'Créer le groupe'
    ],
    fixture: [
      'Ajouter une rencontre',
      F('a-opp', 'Adversaire', 'TC Égletons') +
        Dt('a-d1', 'Date', 1) +
        `<div class="two">${Sel('a-h1', 'Heure', HOURS, '14 h')}${Sel('a-loc', 'Lieu', ['À domicile', "À l'extérieur"])}</div>` +
        O('a-comp', 'Journée', 'Journée 5'),
      'Ajouter au calendrier'
    ],
    play: [
      'Chercher une partie',
      Sel('p-sport', 'Sport', ['Tennis', 'Padel']) +
        Dt('a-d1', 'Date', 1) +
        `<div class="two">${Sel('a-h1', 'Heure', HOURS, '18 h')}${Sel('a-dur', 'Durée du créneau', ['1 h', '1 h 30', '2 h'], '1 h 30')}</div><div class="two">${Sel('a-fmt', 'Format', ['Simple', 'Double'])}${Sel('a-pl', 'Places (en double)', ['1', '2', '3'], '3')}</div><div class="two" id="p-rk">${Sel('v-lo', 'Classement de', RANKS, '30/1')}${Sel('v-hi', 'à', RANKS, '15/1')}</div><div class="two" id="p-lv" hidden>${Sel('l-lo', 'Niveau de', LV, 'Niveau 4')}${Sel('l-hi', 'à', LV, 'Niveau 6')}</div><p class="muted small">Seuls les adhérents de cette fourchette voient ta recherche et sont notifiés. En simple, une seule place. Le padel se joue toujours en double.</p><p class="muted small">${LVHELP}</p>`,
      'Publier ma recherche'
    ]
  }[k];
}
