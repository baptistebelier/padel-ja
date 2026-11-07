/* /RAM Club — app/19-formulaires.js : formulaires du club (à la place de Google Forms).
   - créés par le bureau, les enseignants, les animateurs et les membres d'une commission
   - questions : texte court, texte long, choix unique, choix multiples, date, nombre, oui / non ; obligatoires ou non
   - date de clôture, anonyme ou nominatif, pour tout le club ou une commission
   - une réponse par adhérent, modifiable jusqu'à la clôture ; réponses lues seulement par l'auteur et le bureau (serveur)
   - page « Formulaires » dans l'onglet Club : ceux à remplir, et ceux que je gère avec leurs résultats ; promotion sur le mur */
const FQ_TYPES = [
  ['court', 'Texte court'],
  ['long', 'Texte long'],
  ['unique', 'Choix unique'],
  ['multi', 'Choix multiples'],
  ['date', 'Date'],
  ['nombre', 'Nombre'],
  ['ouinon', 'Oui / non']
];
const FQ_MAX = 40;
const fqAvecChoix = t => t === 'unique' || t === 'multi';
const enComm = k => COMMS.some(c => c.resp === k || (c.mem || []).includes(k));
const canForm = () => isAdmin() || (typeof isAnim === 'function' && isAnim()) || enComm(ME());
const formOuvert = f => !!f && !f.clos && (!f.fin || f.fin >= TODAY);
const formPourMoi = f => {
  const c = String(f.cible || '');
  if (!c.startsWith('comm:')) return true;
  const cm = COMMS.find(x => x.id === c.slice(5));
  return !!cm && (cm.resp === ME() || (cm.mem || []).includes(ME()));
};
const formGere = f => !!f && (f.by === ME() || isBureau());
const repsDe = id => QREPS.filter(r => r.f === id);
const maRep = id => QREPS.find(r => r.f === id && r.by === ME());
const fqBrut = s =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
const finTxt = f =>
  f.clos
    ? 'Clos'
    : f.fin
      ? f.fin < TODAY
        ? 'Clos le ' + fmtD(f.fin)
        : "Jusqu'au " + fmtD(f.fin)
      : 'Sans date de clôture';

/* ---------- la page « Formulaires » ---------- */
function formsView() {
  const ouverts = QFORMS.filter(f => formOuvert(f) && formPourMoi(f)).sort((a, b) => (b.at || 0) - (a.at || 0)),
    aRemplir = ouverts.filter(f => !maRep(f.id)),
    faits = ouverts.filter(f => maRep(f.id)),
    gere = QFORMS.filter(formGere).sort((a, b) => (b.at || 0) - (a.at || 0));
  const ligne = (f, extra) =>
    `<button class="item" data-a="open" data-v="form" data-id="${f.id}"><span class="tile">${ic('poll')}</span><span class="grow"><span class="nm">${f.title}</span><br><span class="muted small">${finTxt(f)}${extra || ''}</span></span>${ic('back')}</button>`;
  let h = '<div class="pad">';
  h += `<span class="kicker">À remplir</span>${aRemplir.length ? `<div class="card list">${aRemplir.map(f => ligne(f)).join('')}</div>` : '<p class="muted small">Aucun formulaire à remplir pour le moment.</p>'}`;
  if (faits.length)
    h += `<span class="kicker">Déjà répondu (modifiable jusqu'à la clôture)</span><div class="card list">${faits.map(f => ligne(f, ' · répondu')).join('')}</div>`;
  if (canForm()) {
    h += `<span class="kicker">${isBureau() ? 'Formulaires du club' : 'Mes formulaires'}</span>${
      gere.length
        ? `<div class="card list">${gere
            .map(
              f =>
                `<div class="item"><button class="grow row" data-a="open" data-v="formres" data-id="${f.id}" style="gap:10px;text-align:left"><span class="tile">${ic('chart')}</span><span class="grow"><span class="nm">${f.title}</span><br><span class="muted small">${repsDe(f.id).length} réponse${repsDe(f.id).length > 1 ? 's' : ''} · ${finTxt(f)}${f.anon ? ' · anonyme' : ''}</span></span></button><button class="ib" data-a="formMenu" data-id="${f.id}" aria-label="Options de ${esc(fqBrut(f.title))}">${ic('more')}</button></div>`
            )
            .join('')}</div>`
        : '<p class="muted small">Tu n’as pas encore créé de formulaire.</p>'
    }<button class="btn full" data-a="formNew">${ic('plus')}Créer un formulaire</button>`;
  }
  return h + '</div>';
}

/* ---------- répondre ---------- */
function fqChamp(q, v) {
  const id = 'fa-' + q.id,
    req = q.req ? ' required' : '',
    lb = `<label for="${id}">${esc(fqBrut(q.q)) || 'Question'}${q.req ? ' <span class="fq-req" aria-label="obligatoire">*</span>' : ''}</label>`;
  if (q.t === 'long')
    return `<div class="fld">${lb}<textarea id="${id}"${req} maxlength="4000">${v ? esc(v) : ''}</textarea></div>`;
  if (q.t === 'date')
    return `<div class="fld">${lb}<input type="date" id="${id}"${req} value="${v ? esc(v) : ''}"></div>`;
  if (q.t === 'nombre')
    return `<div class="fld">${lb}<input type="number" inputmode="decimal" id="${id}"${req} value="${v ? esc(v) : ''}"></div>`;
  if (q.t === 'ouinon' || q.t === 'unique') {
    const opts = q.t === 'ouinon' ? ['Oui', 'Non'] : q.o;
    return `<fieldset class="fld fq-opts"><legend>${esc(fqBrut(q.q))}${q.req ? ' <span class="fq-req" aria-label="obligatoire">*</span>' : ''}</legend>${opts.map((o, i) => `<label class="chk" for="${id}-${i}"><input type="radio" name="${id}" id="${id}-${i}" value="${esc(fqBrut(o))}" ${v === fqBrut(o) ? 'checked' : ''}${req}>${esc(fqBrut(o))}</label>`).join('')}</fieldset>`;
  }
  if (q.t === 'multi')
    return `<fieldset class="fld fq-opts" data-req="${q.req ? 1 : 0}" id="${id}"><legend>${esc(fqBrut(q.q))}${q.req ? ' <span class="fq-req" aria-label="obligatoire">*</span>' : ''}<span class="muted small"> · plusieurs choix possibles</span></legend>${q.o.map((o, i) => `<label class="chk" for="${id}-${i}"><input type="checkbox" name="${id}" id="${id}-${i}" value="${esc(fqBrut(o))}" ${(v || []).includes(fqBrut(o)) ? 'checked' : ''}>${esc(fqBrut(o))}</label>`).join('')}</fieldset>`;
  return `<div class="fld">${lb}<input id="${id}"${req} maxlength="500" value="${v ? esc(v) : ''}" autocomplete="off"></div>`;
}
function formView(id) {
  const f = QFORMS.find(x => x.id === id);
  if (!f) return `<div class="pad">${empty('poll', 'Formulaire introuvable', 'Il a peut-être été supprimé.')}</div>`;
  const r = maRep(id),
    a = (r && r.a) || {},
    ouvert = formOuvert(f),
    pour = formPourMoi(f);
  let h = `<div class="pad"><h2 class="tilt sm">${f.title}<i class="dd"></i></h2>${f.desc ? `<p>${f.desc}</p>` : ''}<p class="muted small">${finTxt(f)}${f.anon ? ' · réponses anonymes : l’organisateur ne voit pas qui a répondu' : ' · l’organisateur et le bureau voient ton nom avec ta réponse'}</p>`;
  if (formGere(f))
    h += `<button class="btn sm ghost" data-a="open" data-v="formres" data-id="${f.id}">${ic('chart')}Voir les résultats (${repsDe(f.id).length})</button>`;
  if (!pour) return h + '<div class="note">Ce formulaire est réservé aux membres d’une commission.</div></div>';
  if (!ouvert)
    return (
      h +
      `<div class="note">Ce formulaire est clos.${r ? ' Ta réponse a bien été enregistrée.' : ''}</div>${r ? `<div class="card">${f.qs.map(q => `<p><b>${esc(fqBrut(q.q))}</b><br>${esc(Array.isArray(a[q.id]) ? a[q.id].join(', ') : a[q.id] || '—')}</p>`).join('')}</div>` : ''}</div>`
    );
  return (
    h +
    `${r ? '<div class="note">Tu as déjà répondu : tu peux modifier ta réponse jusqu’à la clôture.</div>' : ''}<form class="card fq-form" id="fq-form" data-id="${f.id}">${f.qs.map(q => fqChamp(q, a[q.id])).join('')}<button class="btn full">${r ? 'Mettre à jour ma réponse' : 'Envoyer ma réponse'}</button></form></div>`
  );
}
document.addEventListener('submit', e => {
  const fm = e.target;
  if (fm.id !== 'fq-form') return;
  e.preventDefault();
  const f = QFORMS.find(x => x.id === fm.dataset.id);
  if (!f || !formOuvert(f)) return toast('Ce formulaire est clos');
  const a = {};
  for (const q of f.qs) {
    const id = 'fa-' + q.id;
    let v;
    if (q.t === 'multi') v = [...fm.querySelectorAll(`input[name="${id}"]:checked`)].map(x => x.value);
    else if (q.t === 'unique' || q.t === 'ouinon')
      v = (fm.querySelector(`input[name="${id}"]:checked`) || {}).value || '';
    else v = (($(id) || {}).value || '').trim();
    if (q.req && (Array.isArray(v) ? !v.length : !v)) return toast(`Réponds à « ${fqBrut(q.q)} »`);
    if (Array.isArray(v) ? v.length : v) a[q.id] = Array.isArray(v) ? v.map(x => esc(x)) : esc(v);
  }
  const rid = f.id + '.' + ME(),
    r = QREPS.find(x => x.id === rid);
  if (r) Object.assign(r, { a, at: Date.now() });
  else QREPS.push({ id: rid, f: f.id, by: ME(), a, at: Date.now() });
  S.stack.pop();
  render(true);
  toast(r ? 'Réponse mise à jour' : 'Réponse envoyée · merci !');
});

/* ---------- résultats ---------- */
function formResView(id) {
  const f = QFORMS.find(x => x.id === id);
  if (!f || !formGere(f))
    return `<div class="pad">${empty('poll', 'Résultats réservés', 'Seuls l’auteur du formulaire et le bureau voient les réponses.')}</div>`;
  const reps = repsDe(id).sort((a, b) => (a.at || 0) - (b.at || 0)),
    n = reps.length;
  const bloc = q => {
    const vals = reps
      .map(r => (r.a || {})[q.id])
      .filter(v => v != null && v !== '' && !(Array.isArray(v) && !v.length));
    let corps;
    if (fqAvecChoix(q.t) || q.t === 'ouinon') {
      const opts = q.t === 'ouinon' ? ['Oui', 'Non'] : q.o.map(fqBrut),
        cpt = opts.map(
          o =>
            vals.filter(v => (Array.isArray(v) ? v.includes(esc(o)) || v.includes(o) : v === esc(o) || v === o)).length
        ),
        max = Math.max(1, ...cpt);
      corps = opts
        .map(
          (o, i) =>
            `<div class="fr-bar"><span class="fr-l">${esc(o)}</span><span class="fr-g"><i style="width:${Math.round((cpt[i] / max) * 100)}%"></i></span><b>${cpt[i]}</b></div>`
        )
        .join('');
    } else if (q.t === 'nombre') {
      const nums = vals.map(Number).filter(x => !isNaN(x)),
        moy = nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0;
      corps = nums.length
        ? `<p>Moyenne <b>${String(Math.round(moy * 10) / 10).replace('.', ',')}</b> · de ${Math.min(...nums)} à ${Math.max(...nums)}</p>`
        : '';
    } else corps = '';
    const liste =
      !fqAvecChoix(q.t) && q.t !== 'ouinon' && vals.length
        ? `<ul class="fr-txt">${vals
            .slice(0, 50)
            .map(v => `<li>${v}</li>`)
            .join(
              ''
            )}${vals.length > 50 ? `<li class="muted">… et ${vals.length - 50} autres (voir l’export)</li>` : ''}</ul>`
        : '';
    return `<div class="card"><span class="nm">${esc(fqBrut(q.q))}</span><span class="muted small"> · ${vals.length} réponse${vals.length > 1 ? 's' : ''}</span>${corps}${liste}</div>`;
  };
  const qui = f.anon
    ? ''
    : `<span class="kicker">Qui a répondu</span><div class="card list">${reps.map(r => `<div class="item">${M[r.by] ? av(r.by, 'sm') : ''}<span class="grow"><span class="nm">${M[r.by] ? name(r.by) : 'Ancien membre'}</span><br><span class="muted small">${new Date(r.at || 0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span></span></div>`).join('') || '<p class="muted small">Personne pour le moment.</p>'}</div>`;
  return `<div class="pad"><h2 class="tilt sm">${f.title}<i class="dd"></i></h2><p class="muted small">${n} réponse${n > 1 ? 's' : ''} · ${finTxt(f)}${f.anon ? ' · anonyme' : ''}</p><div class="ctl"><button class="btn grow ghost" data-a="formCsv" data-id="${f.id}">${ic('folder')}Export tableur</button><button class="btn grow" data-a="formPromo" data-id="${f.id}">${ic('news')}Promouvoir sur le mur</button></div>${n ? f.qs.map(bloc).join('') : empty('poll', 'Pas encore de réponse', 'Promeus le formulaire sur le mur pour que les adhérents le voient.')}${n ? qui : ''}</div>`;
}

/* ---------- créer, modifier ---------- */
const fqRow = (q = {}) =>
  `<div class="fq-row card"><div class="row"><select class="fq-t" aria-label="Type de question">${FQ_TYPES.map(([v, l]) => `<option value="${v}" ${v === (q.t || 'court') ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="chk fq-r"><input type="checkbox" class="fq-req" ${q.req ? 'checked' : ''}>Obligatoire</label><button type="button" class="ib" data-a="fqDel" aria-label="Retirer cette question">${ic('x')}</button></div><input class="fq-q" maxlength="300" placeholder="La question" value="${q.q ? esc(fqBrut(q.q)) : ''}" aria-label="Question" autocomplete="off"><textarea class="fq-o" rows="3" placeholder="Un choix par ligne" aria-label="Choix possibles, un par ligne" ${fqAvecChoix(q.t) ? '' : 'hidden'}>${(q.o || []).map(fqBrut).map(esc).join('\n')}</textarea>${q.id ? `<input type="hidden" class="fq-id" value="${esc(q.id)}">` : ''}</div>`;
function formEditor(f) {
  const c = f || {},
    comms = COMMS.filter(x => isBureau() || x.resp === ME() || (x.mem || []).includes(ME()));
  sheet(
    f ? 'Modifier le formulaire' : 'Nouveau formulaire',
    `<form class="body" id="fq-edit" data-id="${c.id || ''}">${F('fq-title', 'Titre', 'Inscriptions au tournoi de Noël', fqBrut(c.title))}${O('fq-desc', 'Présentation (facultative)', 'À quoi sert ce formulaire', fqBrut(c.desc))}<div class="two"><div class="fld"><label for="fq-fin">Clôture (facultative)</label><input type="date" id="fq-fin" value="${c.fin || ''}" min="${TODAY}"></div><div class="fld"><label for="fq-cible">Pour qui</label><select id="fq-cible"><option value="">Tout le club</option>${comms.map(x => `<option value="comm:${x.id}" ${c.cible === 'comm:' + x.id ? 'selected' : ''}>Commission ${esc(fqBrut(x.name))}</option>`).join('')}</select></div></div><div class="fld"><label class="chk" for="fq-anon"><input type="checkbox" id="fq-anon" ${c.anon ? 'checked' : ''} ${f && repsDe(f.id).length ? 'disabled' : ''}>Réponses anonymes${f && repsDe(f.id).length ? ' (ne change plus : il y a des réponses)' : ''}</label></div><span class="kicker">Questions</span><div id="fq-list" class="stack">${(c.qs && c.qs.length ? c.qs : [{ t: 'court', req: true }]).map(fqRow).join('')}</div><button type="button" class="btn ghost full" data-a="fqAdd">${ic('plus')}Ajouter une question</button><button class="btn full">${f ? 'Enregistrer' : 'Créer le formulaire'}</button></form>`
  );
}
document.addEventListener('change', e => {
  if (!e.target.classList || !e.target.classList.contains('fq-t')) return;
  const o = e.target.closest('.fq-row').querySelector('.fq-o');
  o.hidden = !fqAvecChoix(e.target.value);
  if (!o.hidden) o.focus();
});
document.addEventListener('submit', e => {
  const fm = e.target;
  if (fm.id !== 'fq-edit') return;
  e.preventDefault();
  const titre = (($('fq-title') || {}).value || '').trim();
  if (!titre) return toast('Donne un titre au formulaire');
  const qs = [...fm.querySelectorAll('.fq-row')].map((r, i) => {
    const t = r.querySelector('.fq-t').value;
    return {
      id: (r.querySelector('.fq-id') || {}).value || 'q' + Date.now().toString(36) + i,
      t,
      q: esc(r.querySelector('.fq-q').value.trim()),
      o: fqAvecChoix(t)
        ? r
            .querySelector('.fq-o')
            .value.split('\n')
            .map(x => x.trim())
            .filter(Boolean)
            .slice(0, 20)
            .map(esc)
        : [],
      req: r.querySelector('.fq-req').checked
    };
  });
  if (!qs.length) return toast('Ajoute au moins une question');
  if (qs.some(q => !q.q)) return toast('Chaque question a besoin d’un texte');
  if (qs.some(q => fqAvecChoix(q.t) && q.o.length < 2))
    return toast('Un choix demande au moins deux réponses possibles, une par ligne');
  const id = fm.dataset.id,
    data = {
      title: esc(titre),
      desc: esc((($('fq-desc') || {}).value || '').trim()),
      fin: ($('fq-fin') || {}).value || '',
      cible: ($('fq-cible') || {}).value || '',
      qs
    };
  if (id) {
    const f = QFORMS.find(x => x.id === id);
    Object.assign(f, data, $('fq-anon').disabled ? {} : { anon: $('fq-anon').checked });
  } else
    QFORMS.unshift(
      Object.assign({ id: 'f' + Date.now().toString(36), by: ME(), at: Date.now(), anon: $('fq-anon').checked }, data)
    );
  closeSheet();
  if (!id) {
    S.stack.push({ v: 'formres', id: QFORMS[0].id });
    render();
    toast('Formulaire créé · promeus-le sur le mur pour que les adhérents le voient');
  } else {
    render(true);
    toast('Formulaire modifié');
  }
});

/* ---------- publication sur le mur ---------- */
function formPost(p) {
  const f = QFORMS.find(x => x.id === p.form);
  if (!f)
    return `<h2 class="tilt sm">${p.title}<i class="dd"></i></h2><p class="muted small">Ce formulaire a été supprimé.</p>`;
  const r = maRep(f.id),
    ouvert = formOuvert(f) && formPourMoi(f);
  return `<span class="kicker">Formulaire</span><h2 class="tilt sm">${p.title || f.title}<i class="dd"></i></h2>${p.body ? `<p>${p.body}</p>` : f.desc ? `<p>${f.desc}</p>` : ''}<div class="meta"><span>${ic('poll')}${f.qs.length} question${f.qs.length > 1 ? 's' : ''}</span><span>${ic('clock')}${finTxt(f)}</span></div><button class="btn full ${r || !ouvert ? 'ghost' : ''}" data-a="open" data-v="form" data-id="${f.id}">${!ouvert ? (r ? 'Voir ma réponse' : 'Formulaire clos') : r ? 'Modifier ma réponse' : 'Répondre'}</button>`;
}

Object.assign(A, {
  formNew() {
    if (!canForm()) return;
    formEditor(null);
  },
  fqAdd() {
    const l = $('fq-list');
    if (!l) return;
    if (l.children.length >= FQ_MAX) return toast(FQ_MAX + ' questions au plus');
    l.insertAdjacentHTML('beforeend', fqRow({ t: 'court' }));
    l.lastElementChild.querySelector('.fq-q').focus();
  },
  fqDel(d, el) {
    const r = el && el.closest('.fq-row');
    if (r && document.querySelectorAll('#fq-list .fq-row').length > 1) r.remove();
    else toast('Un formulaire garde au moins une question');
  },
  formMenu(d) {
    const f = QFORMS.find(x => x.id === d.id);
    if (!f) return;
    menuSheet(fqBrut(f.title), [
      ['chart', 'Voir les résultats', 'formGo', `data-id="${f.id}" data-v="formres"`],
      ['news', 'Promouvoir sur le mur', 'formPromo', `data-id="${f.id}"`],
      ['edit', 'Modifier', 'formEdit', `data-id="${f.id}"`],
      ['check', formOuvert(f) ? 'Clore maintenant' : 'Rouvrir', 'formClos', `data-id="${f.id}"`],
      ['eye', 'Voir comme un adhérent', 'formGo', `data-id="${f.id}" data-v="form"`],
      ['trash', 'Supprimer', 'formDel', `data-id="${f.id}"`, 1]
    ]);
  },
  formGo(d) {
    closeSheet();
    S.stack.push({ v: d.v, id: d.id });
    render();
  },
  formEdit(d) {
    closeSheet();
    formEditor(QFORMS.find(x => x.id === d.id));
  },
  formClos(d) {
    const f = QFORMS.find(x => x.id === d.id);
    closeSheet();
    if (!f) return;
    if (formOuvert(f)) f.clos = true;
    else {
      delete f.clos;
      if (f.fin && f.fin < TODAY) f.fin = '';
    }
    render(true);
    toast(f.clos ? 'Formulaire clos : plus de nouvelle réponse' : 'Formulaire rouvert');
  },
  formDel(d) {
    const i = QFORMS.findIndex(x => x.id === d.id);
    closeSheet();
    if (i < 0) return;
    const f = QFORMS.splice(i, 1)[0];
    if (view().v === 'formres' || view().v === 'form') S.stack.pop();
    render(true);
    toast('Formulaire supprimé', () => {
      QFORMS.splice(i, 0, f);
      render(true);
    });
  },
  formPromo(d) {
    const f = QFORMS.find(x => x.id === d.id);
    closeSheet();
    if (!f) return;
    if (!formOuvert(f)) return toast('Rouvre le formulaire avant de le promouvoir');
    posts.unshift({
      id: 'p' + Date.now(),
      by: 'club',
      t: "À l'instant",
      likes: 0,
      com: [],
      kind: 'formp',
      form: f.id,
      title: f.title,
      body: f.desc || ''
    });
    S.tab = 'home';
    S.stack = [];
    render();
    toast('Formulaire promu sur le mur');
  },
  /* export tableur (CSV, séparateur point-virgule pour Excel en français) */
  formCsv(d) {
    const f = QFORMS.find(x => x.id === d.id);
    if (!f) return;
    const cell = v => '"' + fqBrut(Array.isArray(v) ? v.join(', ') : v == null ? '' : v).replace(/"/g, '""') + '"',
      tete = (f.anon ? [] : ['Adhérent']).concat(['Date']).concat(f.qs.map(q => q.q)),
      lignes = repsDe(f.id).map(r =>
        (f.anon ? [] : [M[r.by] ? M[r.by].n : 'Ancien membre'])
          .concat([new Date(r.at || 0).toLocaleString('fr-FR')])
          .concat(f.qs.map(q => (r.a || {})[q.id]))
      ),
      txt =
        '﻿' +
        [tete]
          .concat(lignes)
          .map(l => l.map(cell).join(';'))
          .join('\r\n'),
      a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download =
      fqBrut(f.title)
        .replace(/[^\w\- ]+/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .slice(0, 60) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
});
V.forms = formsView;
V.form = formView;
V.formres = formResView;
