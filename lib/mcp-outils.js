/* =========================================================================
   Connecteur MCP /RAM — les outils d'écriture ajoutés à ceux de lib/mcp.js :
   - /RAM Coach : déplacer ou supprimer une séance, publier un bilan, message à un groupe, collectifs,
     page publique et agendas, vacances d'un club, relier une fiche à un compte, fusionner des doublons ;
   - /RAM Club : mur, discussions, adhésions, bar ;
   - /RAM JA : créer un tournoi, inscrire, lire les matchs, saisir les scores.
   Toutes les écritures du Club passent par ram.ops (mêmes droits que l'appli) ; celles de /RAM JA ne
   concernent que les tournois du compte et passent par le même moteur que le logiciel.
   ========================================================================= */
'use strict';
const Formules = require('./formules');
const REGLES = require('../club/regles.js');
const { lienIcs } = require('./agenda');

const isoOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const needIso = d => { if (!isoOk(d)) throw new Error('Date au format AAAA-MM-JJ : ' + d); };
const copy = o => JSON.parse(JSON.stringify(o));
const escH = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fr = d => d.split('-').reverse().join('/');

function createOutils({ S, clubArg, JOURS, rid, hour, today, trainOn, teach, pickClub, content, write, eleveDe, grpOf, store, ram, Engine, Ani, getRoom, newTournament, applyServerAction, accessFor }) {
  const parLots = async (u, c, ops) => { for (let i = 0; i < ops.length; i += 100) await write(u, c, ops.slice(i, i + 100)); };
  const eleveDuClub = (K, s) => { const k = eleveDe(K, s); if (!k) throw new Error('Élève introuvable : ' + s); return k; };
  const seanceDe = (K, gid, d) => { const g = grpOf(K, gid); needIso(d); if (!trainOn(g, d)) throw new Error('Pas de séance de ce groupe à cette date.'); return g; };
  /* une date du groupe disparaît, une autre apparaît : comme coDateOff et coDateOn de /RAM Coach */
  const dateOff = (g, d) => {
    (g.cycles || []).forEach(c => (c.dates = (c.dates || []).filter(x => x !== d)));
    if ((g.extra || []).includes(d)) g.extra = g.extra.filter(x => x !== d);
    if (trainOn(g, d)) g.skip = (g.skip || []).concat(d);
  };
  const dateOn = (g, d) => {
    g.skip = (g.skip || []).filter(x => x !== d);
    if (!trainOn(g, d)) g.extra = (g.extra || []).concat(d).sort();
  };
  const datesPatch = g => ['skip', 'extra', 'cycles', 'from', 'to'].filter(k => g[k] !== undefined).map(k => ({ p: [k], t: 'set', v: g[k] }));

  /* tout ce qui porte la clé d'un élève passe sur une autre : groupes, séances, suivi, publications par niveaux */
  function changeCle(K, de, vers) {
    const ops = [], lui = K.get('member')[vers] ? 'mem' : 'ext';
    Object.entries(K.get('group')).forEach(([id, g]) => {
      if ((g.ext || []).includes(de) || (g.mem || []).includes(de)) ops.push({ coll: 'group', id, op: 'patch', patch: [{ p: ['ext'], t: 'rm', v: de }, { p: ['mem'], t: 'rm', v: de }, { p: [lui], t: 'add', v: vers }] });
    });
    Object.entries(K.get('seance')).forEach(([id, s]) => {
      if (!(s.pres && s.pres[de]) && !(s.plus || []).includes(de)) return;
      const n = copy(s);
      if (n.pres && n.pres[de]) { n.pres[vers] = n.pres[vers] || n.pres[de]; delete n.pres[de]; }
      if (n.plus) n.plus = [...new Set(n.plus.map(x => (x === de ? vers : x)))];
      ops.push({ coll: 'seance', id, op: 'put', data: n });
    });
    Object.entries(K.get('suivi')).forEach(([id, x]) => { if (x.to === de) ops.push({ coll: 'suivi', id, op: 'patch', patch: [{ p: ['to'], t: 'set', v: vers }] }); });
    return ops;
  }
  /* fiche gardée, complétée par l'autre : rien ne se perd (achats, niveaux, notes) */
  function ficheFusionnee(garde, autre, nom) {
    const out = Object.assign({}, autre, garde, { n: nom || garde.n || autre.n });
    const achats = (garde.achats || []).slice();
    (autre.achats || []).forEach(h => { if (!achats.some(x => x.id === h.id || (x.ref === h.ref && x.d === h.d))) achats.push(h); });
    if (achats.length) out.achats = achats;
    if (garde.note && autre.note && garde.note !== autre.note) out.note = (garde.note + '\n' + autre.note).slice(0, 1000);
    if (garde.tech || autre.tech) out.tech = Object.assign({}, autre.tech, garde.tech);
    if (garde.lvlH || autre.lvlH) out.lvlH = [...(autre.lvlH || []), ...(garde.lvlH || [])].sort((a, b) => String(a.d).localeCompare(String(b.d)));
    return out;
  }

  /* un tournoi du compte, ouvert aux modifications */
  async function roomDe(u, id) {
    const room = await getRoom(String(id || ''));
    if (!room || room.row.owner !== u.id) throw new Error('Tournoi introuvable pour ce compte.');
    if ((room.row.state.tournament || {}).closed) throw new Error('Ce tournoi est clôturé : le rouvrir dans /RAM JA pour le modifier.');
    return room;
  }
  const appliquer = (room, type, payload) => { if (!applyServerAction) throw new Error('Indisponible.'); applyServerAction(room, { type, payload }); };
  const joueur = j => ({ first: String(j.prenom || '').trim().slice(0, 60), last: String(j.nom || '').trim().toUpperCase().slice(0, 60), licence: String(j.licence || '').replace(/\s+/g, '').toUpperCase().slice(0, 20), rank: String(j.classement || '').slice(0, 12), club: String(j.club || '').slice(0, 80) });
  const joueurSchema = { type: 'object', properties: { prenom: { type: 'string' }, nom: { type: 'string' }, licence: { type: 'string' }, classement: { type: 'string' }, club: { type: 'string' } }, required: ['nom'] };

  const ECRITURE = [
    { name: 'coach_deplacer_seance', title: 'Déplacer une séance', description: "/RAM Coach : change la date d'une seule séance (et son heure pour un cours ponctuel), avec son thème, son appel et sa place dans le cycle. Les autres séances du groupe ne bougent pas.",
      inputSchema: S(Object.assign({ groupe_id: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ : la séance à déplacer.' }, nouvelle_date: { type: 'string', description: 'AAAA-MM-JJ' }, heure: { type: 'string', description: 'Nouvelle heure, pour un cours ponctuel seulement.' } }, clubArg), ['groupe_id', 'date', 'nouvelle_date']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = copy(seanceDe(K, a.groupe_id, a.date)), de = a.date, vers = a.nouvelle_date;
        needIso(vers);
        if (a.heure && !g.once) throw new Error('Dans un groupe chaque semaine, seule la date d’une séance se change.');
        if (vers !== de && !g.once && trainOn(g, vers)) throw new Error('Le groupe a déjà une séance ce jour-là.');
        const ops = [], ancienne = K.get('seance')[a.groupe_id + '.' + de];
        if (ancienne && vers !== de) ops.push({ coll: 'seance', id: a.groupe_id + '.' + vers, op: 'put', data: Object.assign({}, ancienne, { g: a.groupe_id, d: vers }) }, { coll: 'seance', id: a.groupe_id + '.' + de, op: 'del' });
        let patch;
        if (g.once) {
          const h = a.heure ? hour(a.heure) : g.h;
          if (!h) throw new Error('Heure illisible : écrire par exemple 18 h 30.');
          const jour = new Date(vers + 'T12:00:00Z').getUTCDay();
          patch = [{ p: ['once'], t: 'set', v: vers }, { p: ['day'], t: 'set', v: jour }, { p: ['h'], t: 'set', v: h }, { p: ['sub'], t: 'set', v: `${fr(vers)} ${h} · ${g.dur}` }];
        } else {
          (g.cycles || []).forEach(x => (x.dates = [...new Set((x.dates || []).map(d => (d === de ? vers : d)))].sort()));
          const cycles = g.cycles;
          g.cycles = undefined;
          dateOff(g, de);
          dateOn(g, vers);
          if (g.to && vers > g.to) g.to = vers;
          if (g.from && vers < g.from) g.from = vers;
          g.cycles = cycles;
          patch = datesPatch(g);
        }
        ops.push({ coll: 'group', id: a.groupe_id, op: 'patch', patch });
        await write(u, c, ops);
        return { seance: g.name, de, vers, heure: g.once ? patch[2].v : g.h };
      } },
    { name: 'coach_supprimer_seance', destructive: true, title: 'Supprimer une séance', description: "/RAM Coach : supprime une séance : elle disparaît du planning, de l'historique et du cycle. Pour la garder visible et prévenir les élèves, préférer coach_annuler_seance. Une séance avec un appel n'est supprimée qu'avec meme_avec_appel.",
      inputSchema: S(Object.assign({ groupe_id: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ' }, meme_avec_appel: { type: 'boolean' } }, clubArg), ['groupe_id', 'date']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = copy(seanceDe(K, a.groupe_id, a.date)), id = a.groupe_id + '.' + a.date, s = K.get('seance')[id];
        if (s && Object.values(s.pres || {}).includes('P') && !a.meme_avec_appel) throw new Error('Cette séance a un appel : la supprimer effacerait des présences. Redemander avec meme_avec_appel.');
        const ops = s ? [{ coll: 'seance', id, op: 'del' }] : [];
        if (g.once) ops.push({ coll: 'group', id: a.groupe_id, op: 'del' });
        else {
          dateOff(g, a.date);
          ops.push({ coll: 'group', id: a.groupe_id, op: 'patch', patch: datesPatch(g).concat((g.cancel || []).includes(a.date) ? [{ p: ['cancel'], t: 'rm', v: a.date }] : []) });
        }
        await write(u, c, ops);
        return { supprimee: true, seance: g.name, date: a.date };
      } },
    { name: 'coach_publier_bilan', title: 'Publier un bilan de séance', description: "/RAM Coach : publie le bilan d'une séance aux élèves : le texte pour tout le groupe et les commentaires personnels (ils reçoivent une notification). Sans texte, publie le brouillon préparé pour cette séance (coach_bilan_brouillon).",
      inputSchema: S(Object.assign({ groupe_id: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ' }, bilan_groupe: { type: 'string' }, personnels: { type: 'object', additionalProperties: { type: 'string' }, description: '{ eleve_id: commentaire }' } }, clubArg), ['groupe_id', 'date']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = seanceDe(K, a.groupe_id, a.date), id = a.groupe_id + '.' + a.date, br = K.get('brouillon')[id];
        const recap = String(a.bilan_groupe != null ? a.bilan_groupe : (br && br.recap) || '').slice(0, 4000), perso = Object.assign({}, br && br.perso, a.personnels);
        if (!recap && !Object.keys(perso).length) throw new Error('Rien à publier : donner le texte du bilan, ou préparer un brouillon.');
        const ops = [{ coll: 'seance', id, op: 'put', data: Object.assign({ g: a.groupe_id, d: a.date }, K.get('seance')[id], { recap }) }], envoyes = [];
        for (const [k0, v] of Object.entries(perso)) {
          const k = eleveDuClub(K, k0), txt = String(v || '').trim().slice(0, 2000), old = Object.entries(K.get('suivi')).find(([, x]) => x.k === 'bilan' && x.ses === id && x.to === k);
          if (old) ops.push(txt ? { coll: 'suivi', id: old[0], op: 'patch', patch: [{ p: ['txt'], t: 'set', v: txt }] } : { coll: 'suivi', id: old[0], op: 'del' });
          else if (txt) ops.push({ coll: 'suivi', id: rid('sv'), op: 'put', data: { to: k, by: K.me.key, k: 'bilan', ses: id, txt, at: Date.now() } });
          if (txt) envoyes.push(K.nm(k));
        }
        if (br) ops.push({ coll: 'brouillon', id, op: 'del' });
        await write(u, c, ops);
        return { publie: true, seance: g.name, date: a.date, commentaires_personnels: envoyes };
      } },
    { name: 'coach_message_groupe', title: 'Envoyer un message à un groupe', description: "/RAM Coach : envoie le même message privé à tous les élèves d'un groupe (ils le reçoivent dans /RAM Club avec une notification, leurs parents aussi pour un jeune). Une fiche sans compte le retrouvera en créant son compte.",
      inputSchema: S(Object.assign({ groupe_id: { type: 'string' }, texte: { type: 'string' } }, clubArg), ['groupe_id', 'texte']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), g = grpOf(K, a.groupe_id), l = [...new Set([...(g.mem || []), ...(g.ext || [])])];
        if (!l.length) throw new Error('Ce groupe n’a pas d’élève.');
        await parLots(u, c, l.map(k => ({ coll: 'suivi', id: rid('sv') + k.slice(-3), op: 'put', data: { to: k, by: K.me.key, k: 'msg', txt: String(a.texte).slice(0, 4000), at: Date.now() } })));
        return { envoye: true, groupe: g.name, a: l.map(K.nm), sans_compte: l.filter(k => !K.get('member')[k]).map(K.nm) };
      } },
    { name: 'coach_inscrire_collectif', title: 'Inscrire ou retirer d’un collectif', description: "/RAM Coach : inscrit un élève à un groupe de niveau d'un collectif ou d'une demande d'élève ouverte (coach_collectifs), ou l'en retire.",
      inputSchema: S(Object.assign({ publication: { type: 'string' }, date: { type: 'string', description: 'AAAA-MM-JJ' }, groupe: { type: 'string', description: 'Identifiant du groupe de niveau (coach_collectifs).' }, eleve: { type: 'string' }, retirer: { type: 'boolean' } }, clubArg), ['publication', 'date', 'groupe', 'eleve']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), p = K.get('post')[a.publication], k = eleveDuClub(K, a.eleve);
        if (!p || p.kind !== 'niveaux') throw new Error('Collectif introuvable : voir coach_collectifs.');
        if (!(p.nv.dates || []).includes(a.date)) throw new Error('Ce collectif n’a pas lieu à cette date.');
        if (!(p.nv.tiers || []).some(t => t.id === a.groupe)) throw new Error('Groupe de niveau inconnu : voir coach_collectifs.');
        const cle = a.date + '|' + a.groupe;
        const patch = a.retirer
          ? [{ p: ['nv', 'ins', cle], t: 'rm', v: k }, { p: ['nv', 'at', k, a.date], t: 'unset' }]
          : [{ p: ['nv', 'ins', cle], t: 'add', v: k }, { p: ['nv', 'at', k, a.date], t: 'set', v: Date.now() }];
        await write(u, c, [{ coll: 'post', id: a.publication, op: 'patch', patch }]);
        return { eleve: K.nm(k), inscrit: !a.retirer, date: a.date, groupe: a.groupe };
      } },
    { name: 'coach_page_reservation', title: 'Ma page publique et mes agendas', description: "/RAM Coach : ouvre ou ferme ma page publique de réservation dans un club, et remplace les adresses iCal secrètes de mes agendas (Google, Outlook, iCloud : ce qui y est posé n'est plus réservable). Sans argument : l'état actuel, avec le lien de la page et le lien privé à ajouter à mon agenda. Calendly n'est jamais touché.",
      inputSchema: S(Object.assign({ ouvrir: { type: 'boolean' }, adresses_ical: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, clubArg)),
      run: async (u, a) => {
        const c = await teach(u, a.club), o = await Formules.get(store, u.id);
        if (a.ouvrir === true) o.page = c.id;
        if (a.ouvrir === false && o.page === c.id) delete o.page;
        if (a.adresses_ical) o.icals = a.adresses_ical;
        const r = a.ouvrir != null || a.adresses_ical ? await Formules.save(store, u.id, o) : o;
        if (a.adresses_ical && (r.icals || []).length < new Set(a.adresses_ical).size) throw new Error('Seules les adresses de Google Agenda, Outlook et iCloud sont acceptées.');
        return { page_ouverte: r.page === c.id, lien_page: r.page === c.id ? `/r/${c.id}/${c.cle}` : null, agendas_relies: (r.icals || []).length, lien_prive_de_mes_cours: lienIcs(u.id) };
      } },
    { name: 'coach_vacances_club', title: 'Vacances d’un club', description: "/RAM Coach : remplace les périodes de vacances d'un de mes clubs, telles que je les utilise (sans argument : les renvoie). Pour un groupe précis : coach_modifier_groupe, periodes_sans_cours.",
      inputSchema: S(Object.assign({ periodes: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, du: { type: 'string' }, au: { type: 'string' } }, required: ['du', 'au'] } } }, clubArg)),
      run: async (u, a) => {
        const c = await teach(u, a.club), o = await Formules.get(store, u.id);
        if (!a.periodes) return { club: c.nom, periodes: (o.vacClubs || {})[c.id] || [] };
        (a.periodes).forEach(x => { needIso(x.du); needIso(x.au); if (x.au < x.du) throw new Error('La fin doit suivre le début.'); });
        const r = await Formules.save(store, u.id, Object.assign(o, { vacClubs: Object.assign({}, o.vacClubs, { [c.id]: a.periodes }) }));
        return { club: c.nom, periodes: (r.vacClubs || {})[c.id] || [] };
      } },
    { name: 'coach_recaler_paiements', destructive: true, title: 'Recaler les paiements sur les formules', description: "/RAM Coach : applique le calendrier de paiement de mes packs (séances et montants, coach_formules) aux achats déjà notés de mes élèves. Ce qui est réglé ne bouge pas. Sans « appliquer » : montre seulement ce qui changerait.",
      inputSchema: S(Object.assign({ appliquer: { type: 'boolean' } }, clubArg)),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), o = await Formules.get(store, u.id), ops = [], changes = [];
        Object.entries(K.get('eleve')).forEach(([k, e]) => {
          let touche = false;
          const achats = (e.achats || []).map(h => {
            const pk = h.t === 'pack' ? o.packs.find(p => p.id === h.ref) : null, ech = REGLES.replanAchat(h, pk);
            if (!ech) return h;
            touche = true;
            changes.push({ eleve: K.nm(k), achat: h.nom, avant: h.pay.ech.map(x => ({ seance: x.s, montant: x.m, regle: !!x.ok })), apres: ech.map(x => ({ seance: x.s, montant: x.m, regle: !!x.ok })) });
            return Object.assign({}, h, { pay: Object.assign({}, h.pay, { ech }) });
          });
          if (touche) ops.push({ coll: 'eleve', id: k, op: 'put', data: Object.assign({}, e, { achats }) });
        });
        if (a.appliquer && ops.length) await parLots(u, c, ops);
        return { club: c.nom, applique: !!a.appliquer, achats: changes.length, changes: changes.slice(0, 60) };
      } },
    { name: 'coach_relier_fiche', title: 'Relier une fiche à un compte', description: "/RAM Coach : relie une fiche « sans compte » au compte /RAM Club de l'élève : sa fiche, ses achats, ses groupes, ses séances, ses bilans et ses messages passent sur son compte.",
      inputSchema: S(Object.assign({ eleve_id: { type: 'string', description: 'La fiche sans compte (coach_eleves).' }, compte: { type: 'string', description: 'Identifiant, e-mail ou nom de l’adhérent.' } }, clubArg), ['eleve_id', 'compte']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), f = K.get('eleve')[a.eleve_id], k = eleveDuClub(K, a.compte), m = K.get('member')[k];
        if (!f || K.get('member')[a.eleve_id]) throw new Error('Cette fiche n’existe pas ou est déjà reliée.');
        if (!m) throw new Error('Cet élève n’a pas de compte dans le club : il doit d’abord rejoindre le club.');
        await parLots(u, c, [{ coll: 'eleve', id: k, op: 'put', data: ficheFusionnee(K.get('eleve')[k] || {}, f, m.n) }, ...changeCle(K, a.eleve_id, k), { coll: 'eleve', id: a.eleve_id, op: 'del' }]);
        return { relie: true, eleve: m.n, eleve_id: k };
      } },
    { name: 'coach_fusionner_eleves', destructive: true, title: 'Fusionner deux fiches', description: "/RAM Coach : fusionne deux fiches du même élève (un doublon) : achats, niveaux, notes, groupes, séances, bilans et messages passent sur la fiche gardée, le doublon disparaît.",
      inputSchema: S(Object.assign({ garder: { type: 'string', description: 'Identifiant de la fiche gardée.' }, doublon: { type: 'string', description: 'Identifiant de la fiche qui disparaît.' } }, clubArg), ['garder', 'doublon']),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), F = K.get('eleve'), M = K.get('member');
        if (a.garder === a.doublon) throw new Error('Ce sont les mêmes fiches.');
        if (!F[a.doublon] || (!F[a.garder] && !M[a.garder])) throw new Error('Fiche introuvable : voir coach_eleves.');
        if (M[a.doublon]) throw new Error('Le doublon a un compte : le garder, et fusionner l’autre fiche dedans.');
        await parLots(u, c, [{ coll: 'eleve', id: a.garder, op: 'put', data: ficheFusionnee(F[a.garder] || {}, F[a.doublon], M[a.garder] && M[a.garder].n) }, ...changeCle(K, a.doublon, a.garder), { coll: 'eleve', id: a.doublon, op: 'del' }]);
        return { fusionne: true, eleve: K.nm(a.garder), eleve_id: a.garder };
      } },
    { name: 'club_publier', title: 'Publier sur le mur du club', description: "/RAM Club : publie une annonce sur le mur d'un club, visible de tous les adhérents, avec une notification.",
      inputSchema: S(Object.assign({ titre: { type: 'string' }, texte: { type: 'string' }, sport: { type: 'string', enum: ['Padel', 'Tennis'] } }, clubArg), ['titre', 'texte']),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), id = rid('p');
        await write(u, c, [{ coll: 'post', id, op: 'put', data: { by: K.me.key, t: 'À l’instant', at: Date.now(), kind: 'annonce', sport: a.sport || 'Padel', title: escH(String(a.titre).slice(0, 120)), body: escH(String(a.texte).slice(0, 4000)), likes: 0, com: [] } }]);
        return { publie: true, publication: id, club: c.nom };
      } },
    { name: 'club_ecrire_discussion', title: 'Écrire dans une discussion', description: "/RAM Club : écrit un message dans une discussion du club (club_discussions). Tout le monde dans cette discussion le voit.",
      inputSchema: S(Object.assign({ discussion_id: { type: 'string' }, texte: { type: 'string' } }, clubArg), ['discussion_id', 'texte']),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), ch = K.get('chan')[a.discussion_id];
        if (!ch) throw new Error('Discussion introuvable : voir club_discussions.');
        await write(u, c, [{ coll: 'msg', id: rid('m'), op: 'put', data: { ref: 'c:' + a.discussion_id, by: K.me.key, at: Date.now(), x: String(a.texte).slice(0, 4000) } }]);
        return { envoye: true, discussion: ch.name };
      } },
    { name: 'club_valider_adhesion', title: 'Valider une adhésion', description: "/RAM Club : valide l'adhésion d'un adhérent pour la saison en cours (club_adhesions) : toute l'appli lui est ouverte. Réservé au bureau du club et à l'équipe pédagogique.",
      inputSchema: S(Object.assign({ adherent: { type: 'string', description: 'Identifiant, e-mail ou nom.' } }, clubArg), ['adherent']),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), k = eleveDe(K, a.adherent), m = k && K.get('member')[k], saison = ((K.get('conf').main) || {}).season;
        if (!m) throw new Error('Adhérent introuvable : voir club_adhesions.');
        if (!saison) throw new Error('Ce club n’a pas de saison en cours.');
        await write(u, c, [{ coll: 'member', id: k, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: saison }] }]);
        return { valide: true, adherent: m.n, saison };
      } },
    { name: 'club_bar_servir', title: 'Bar : commande servie', description: "/RAM Club : marque une réservation du bar servie, ou non servie avec servie: false (club_bar). Réservé au bureau.",
      inputSchema: S(Object.assign({ commande_id: { type: 'string' }, servie: { type: 'boolean' } }, clubArg), ['commande_id']),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), o = K.get('order')[a.commande_id];
        if (!o) throw new Error('Commande introuvable : voir club_bar.');
        const st = a.servie === false ? 'ok' : 'servi';
        await write(u, c, [{ coll: 'order', id: a.commande_id, op: 'patch', patch: [{ p: ['st'], t: 'set', v: st }] }]);
        return { commande: o.name, adherent: K.nm(o.by), servie: st === 'servi' };
      } },
    { name: 'ja_creer_tournoi', title: 'Créer un tournoi ou une animation', description: "/RAM JA : crée un tournoi ou une animation (americano, mexicano, par équipes, montée-descente) sur mon compte, dans la limite de mon offre. Les réglages et le tirage d'un tournoi se font ensuite dans le logiciel.",
      inputSchema: S({ nom: { type: 'string' }, type: { type: 'string', enum: ['tournoi', 'animation'], description: 'Tournoi par défaut.' }, format: { type: 'string', enum: ['americano', 'mexicano', 'equipes', 'montee'], description: 'Pour une animation.' } }, ['nom']),
      run: async (u, a) => {
        if (!newTournament || !accessFor) throw new Error('Indisponible.');
        const acc = await accessFor(u);
        if (!acc.canCreate) throw new Error('Votre offre /RAM JA ne permet pas de créer un autre tournoi.');
        const nom = String(a.nom).slice(0, 80), profil = await store.getProfile(u.id).catch(() => null);
        const row = await newTournament(u.id, a.type === 'animation' ? { animation: { format: a.format, name: nom, club: (profil && profil.club) || '' } } : { name: nom, profile: profil });
        return { cree: true, id: row.id, nom, type: a.type || 'tournoi' };
      } },
    { name: 'ja_inscrire', title: 'Inscrire une paire ou un joueur', description: "/RAM JA : inscrit une paire à un de mes tournois (joueur1 et joueur2), ou un joueur à une de mes animations (joueur1).",
      inputSchema: S({ id: { type: 'string', description: 'Identifiant du tournoi (ja_tournois).' }, joueur1: joueurSchema, joueur2: joueurSchema }, ['id', 'joueur1']),
      run: async (u, a) => {
        const room = await roomDe(u, a.id), T = room.row.state;
        if (Ani.isAnimation(T)) {
          const nom = [a.joueur1.prenom, a.joueur1.nom].filter(Boolean).join(' ');
          appliquer(room, 'ani/player/add', { name: nom });
          return { inscrit: nom, joueurs: room.row.state.ani.players.length };
        }
        if (!a.joueur2) throw new Error('Une paire : donner joueur1 et joueur2.');
        if (T.draw && T.draw.built) throw new Error('Le tirage est fait : ajouter cette paire dans /RAM JA.');
        appliquer(room, 'pair/add', { p1: joueur(a.joueur1), p2: joueur(a.joueur2) });
        return { inscrits: `${a.joueur1.nom} / ${a.joueur2.nom}`, paires: room.row.state.pairs.filter(p => !p.withdrawn).length };
      } },
    { name: 'ja_retirer', destructive: true, title: 'Retirer une paire ou un joueur', description: "/RAM JA : retire une paire d'un de mes tournois avant le tirage, ou un joueur d'une de mes animations. Après le tirage, le remplacement se fait dans le logiciel. Les identifiants viennent de ja_inscrits.",
      inputSchema: S({ id: { type: 'string' }, inscrit_id: { type: 'string' } }, ['id', 'inscrit_id']),
      run: async (u, a) => {
        const room = await roomDe(u, a.id), T = room.row.state;
        appliquer(room, Ani.isAnimation(T) ? 'ani/player/remove' : 'pair/remove', { id: a.inscrit_id });
        return { retire: true };
      } },
    { name: 'ja_saisir_score', title: 'Saisir un score', description: "/RAM JA : saisit le score d'un match (identifiants : ja_matchs). Tournoi : sets [[6,4],[3,6],[10,7]] du point de vue de l'équipe A. Animation : score_a et score_b.",
      inputSchema: S({ id: { type: 'string' }, match_id: { type: 'string' }, sets: { type: 'array', items: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 2, maxItems: 2 } }, manche: { type: 'integer', minimum: 1, description: 'Animation : la manche (la dernière par défaut).' }, score_a: { type: 'integer', minimum: 0 }, score_b: { type: 'integer', minimum: 0 } }, ['id', 'match_id']),
      run: async (u, a) => {
        const room = await roomDe(u, a.id), T = room.row.state;
        if (Ani.isAnimation(T)) {
          if (a.score_a == null || a.score_b == null) throw new Error('Donner score_a et score_b.');
          appliquer(room, 'ani/score', { round: a.manche, match: a.match_id, sa: a.score_a, sb: a.score_b });
          return { note: true, score: `${a.score_a}-${a.score_b}` };
        }
        if (!(a.sets || []).length) throw new Error('Donner les sets, par exemple [[6,4],[6,3]].');
        appliquer(room, 'match/manual', { id: a.match_id, sets: a.sets });
        return { note: true, vainqueur: room.row.state.matches.find(m => m.id === a.match_id).manual.winner };
      } },
    { name: 'ja_manche_suivante', title: 'Lancer la manche suivante', description: "/RAM JA : lance la manche suivante d'une de mes animations et renvoie ses matchs.",
      inputSchema: S({ id: { type: 'string' } }, ['id']),
      run: async (u, a) => {
        const room = await roomDe(u, a.id);
        if (!Ani.isAnimation(room.row.state)) throw new Error('Réservé aux animations.');
        appliquer(room, 'ani/round/next', {});
        const A = room.row.state.ani, r = A.rounds[A.rounds.length - 1], nm = id => (A.players.find(p => p.id === id) || {}).name || id;
        return { manche: r.n, matchs: r.matches.map(m => ({ match_id: m.id, a: m.a.map(nm), b: m.b.map(nm) })) };
      } }
  ];

  const LECTURE = [
    { name: 'coach_collectifs', title: 'Collectifs et demandes ouverts', description: "/RAM Coach : les collectifs, parties dirigées et demandes d'élèves à venir dans un de mes clubs, avec leurs groupes de niveau et leurs inscrits, et les listes d'attente de mes créneaux.",
      inputSchema: S(clubArg),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), t = today(), noms = l => (l || []).map(K.nm);
        const collectifs = Object.entries(K.get('post')).filter(([, p]) => p.kind === 'niveaux' && p.nv && !p.arch && (p.nv.dates || []).some(d => d >= t)).map(([id, p]) => ({
          publication: id, type: p.nv.demande ? 'demande d’élève' : p.nv.mode === 'partie' ? 'partie dirigée' : 'collectif', par: K.nm(p.by), sport: p.nv.sport, theme: p.nv.theme || '', heure: p.nv.time, duree: p.nv.dur,
          dates: (p.nv.dates || []).filter(d => d >= t).map(d => ({ date: d, groupes: (p.nv.tiers || []).map(x => ({ groupe: x.id, nom: x.nom || '', de: x.lo, a: x.hi, minimum: x.places, maximum: x.max || null, inscrits: noms((p.nv.ins || {})[d + '|' + x.id]) })) })) }));
        const attente = (await ram.itemsOf(c.id, 'attente')).filter(x => x.data.coach === K.me.key && x.data.d >= t).map(x => ({ date: x.data.d, de: x.data.du, a: x.data.au, eleve: K.nm(x.data.k) }));
        return { club: c.nom, collectifs, listes_d_attente: attente };
      } },
    { name: 'club_discussions', title: 'Discussions du club', description: "/RAM Club : les discussions d'un club que je peux lire, avec leur identifiant et leurs derniers messages.",
      inputSchema: S(Object.assign({ discussion_id: { type: 'string', description: 'Pour lire les messages d’une seule discussion.' }, nombre: { type: 'integer', minimum: 1, maximum: 50 } }, clubArg)),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), msgs = Object.values(K.get('msg'));
        const de = id => msgs.filter(m => m.ref === 'c:' + id).sort((x, y) => (y.at || 0) - (x.at || 0));
        return { club: c.nom, discussions: Object.entries(K.get('chan')).filter(([id]) => !a.discussion_id || id === a.discussion_id).map(([id, ch]) => ({ discussion_id: id, nom: ch.name, messages: de(id).length,
          derniers: de(id).slice(0, a.discussion_id ? a.nombre || 20 : 1).map(m => ({ de: K.nm(m.by), le: m.at ? new Date(m.at).toISOString().slice(0, 10) : '', texte: String(m.x || '').slice(0, 500) })) })) };
      } },
    { name: 'club_adhesions', title: 'Adhésions à valider', description: "/RAM Club : les adhérents d'un club dont l'adhésion n'est pas validée pour la saison en cours. Réservé au bureau et à l'équipe pédagogique.",
      inputSchema: S(clubArg),
      run: async (u, a) => {
        const c = await teach(u, a.club), K = await content(u, c), saison = ((K.get('conf').main) || {}).season;
        return { club: c.nom, saison: saison || null, a_valider: Object.entries(K.get('member')).filter(([k, m]) => k !== 'club' && !m.parent && m.valid !== saison).map(([k, m]) => ({ adherent_id: k, nom: m.n, derniere_saison: m.valid || null })) };
      } },
    { name: 'club_bar', title: 'Bar du club', description: "/RAM Club : la carte du bar d'un club et les réservations d'un jour (aujourd'hui par défaut).",
      inputSchema: S(Object.assign({ date: { type: 'string', description: 'AAAA-MM-JJ' } }, clubArg)),
      run: async (u, a) => {
        const c = await pickClub(u, a.club), K = await content(u, c), d = a.date || today();
        return { club: c.nom, date: d, carte: Object.values(K.get('bar')).filter(x => x.on !== false).map(x => ({ nom: x.name, prix: x.price, reservable: !!x.resa, points: x.pts || undefined })),
          reservations: Object.entries(K.get('order')).filter(([, o]) => o.date === d && o.st !== 'annule').map(([id, o]) => ({ commande_id: id, adherent: K.nm(o.by), article: o.name, moment: o.moment, etat: o.st, note: o.note || undefined })) };
      } },
    { name: 'ja_inscrits', title: 'Inscrits d’un tournoi', description: "/RAM JA : les paires d'un de mes tournois, ou les joueurs d'une de mes animations, avec leur identifiant.",
      inputSchema: S({ id: { type: 'string' } }, ['id']),
      run: async (u, a) => {
        const room = await getRoom(String(a.id || ''));
        if (!room || room.row.owner !== u.id) throw new Error('Tournoi introuvable pour ce compte.');
        const T = room.row.state;
        if (Ani.isAnimation(T)) return { joueurs: T.ani.players.map(p => ({ inscrit_id: p.id, nom: p.name })) };
        return { paires: (T.pairs || []).filter(p => !p.withdrawn).map(p => ({ inscrit_id: p.id, paire: `${p.p1.first || ''} ${p.p1.last || ''} / ${p.p2.first || ''} ${p.p2.last || ''}`.replace(/\s+/g, ' ').trim() })) };
      } },
    { name: 'ja_matchs', title: 'Matchs d’un tournoi', description: "/RAM JA : les matchs d'un de mes tournois ou de la dernière manche d'une de mes animations, avec leur identifiant, pour saisir les scores.",
      inputSchema: S({ id: { type: 'string' } }, ['id']),
      run: async (u, a) => {
        const room = await getRoom(String(a.id || ''));
        if (!room || room.row.owner !== u.id) throw new Error('Tournoi introuvable pour ce compte.');
        const T = room.row.state;
        if (Ani.isAnimation(T)) {
          const A = T.ani, r = A.rounds[A.rounds.length - 1], nm = id => (A.players.find(p => p.id === id) || {}).name || id;
          return { manche: r ? r.n : 0, matchs: r ? r.matches.map(m => ({ match_id: m.id, a: m.a.map(nm), b: m.b.map(nm), score: m.done ? `${m.sa}-${m.sb}` : null })) : [] };
        }
        if (!T.draw || !T.draw.built) return { matchs: [], note: 'Le tirage n’est pas fait : il se fait dans /RAM JA.' };
        const R = Engine.resolve(T), pn = id => { const p = (T.pairs || []).find(x => x.id === id); return p ? `${p.p1.last || ''} / ${p.p2.last || ''}` : id || null; };
        return { matchs: T.matches.filter(m => !R[m.id].staticBye).map(m => ({ match_id: m.id, tour: Engine.matchLabel(m), equipe_a: pn(R[m.id].A), equipe_b: pn(R[m.id].B), etat: R[m.id].state, score: R[m.id].state === 'done' ? Engine.scoreText(R[m.id]) : null })) };
      } }
  ];
  return { ECRITURE, LECTURE };
}
module.exports = { createOutils };
