/* /RAM Club — app/18-stage.js : tarif des événements, enseignant et déroulé des stages.
   - tarif : « Gratuit » ou un montant, toujours affiché (mur, agenda)
   - stage : enseignant du club, ou une autre personne (nom écrit à la main)
   - déroulé (facultatif) : des étapes avec leur heure (« 9 h · Sur le terrain », « 12 h – 13 h 30 · Déjeuner au club-house »),
     dépliées ou repliées sur la carte de l'événement, en frise verticale */
const DL_MAX = 12;
const prixTxt = p => {
  if (!p || p.prix == null) return '';
  if (p.prix === '' || p.prix === 0 || p.prix === '0') return 'Gratuit';
  const s = String(p.prix).trim();
  return /^\d+([.,]\d{1,2})?$/.test(s) ? s.replace('.', ',') + ' €' : s;
};
/* choix du tarif « Gratuit / Payant » d'un formulaire (séance collective, partie dirigée…) : le montant dans le champ id */
const prixFmt = s => (/^\d+([.,]\d{1,2})?$/.test(s) ? s.replace('.', ',') + ' €' : s);
function prixChoix(id, v, ph) {
  const pay = !!v && v !== 'Gratuit';
  return `<div class="fld"><span class="lb">Tarif</span><div class="radio"><label for="${id}-g"><input type="radio" name="${id}-mode" value="g" id="${id}-g" ${pay ? '' : 'checked'}>Gratuit</label><label for="${id}-p"><input type="radio" name="${id}-mode" value="p" id="${id}-p" ${pay ? 'checked' : ''}>Payant</label></div><div id="${id}-w" ${pay ? '' : 'hidden'}><input id="${id}" inputmode="decimal" maxlength="40" placeholder="${ph || '10 € par personne'}" value="${pay ? esc(String(v)) : ''}" aria-label="Montant" autocomplete="off"></div></div>`;
}
/* le tarif choisi : « Gratuit » ou le montant (« 15 » devient « 15 € ») */
const prixLu = id => ($(id + '-p') && $(id + '-p').checked ? prixFmt((($(id) || {}).value || '').trim()) : 'Gratuit');
const prixSet = (id, v) => {
  const pay = !!v && v !== 'Gratuit';
  if ($(id + '-p')) $(id + (pay ? '-p' : '-g')).checked = true;
  if ($(id + '-w')) $(id + '-w').hidden = !pay;
  if ($(id)) $(id).value = pay ? v : '';
};
const prixOk = id =>
  !($(id + '-p') && $(id + '-p').checked && !(($(id) || {}).value || '').trim()) ||
  (toast('Indique le tarif, ou choisis Gratuit'), false);
const ensTxt = p => (p && p.ens && M[p.ens] ? M[p.ens].n : (p && p.ensNom) || '');
/* enseignants du club ; celui qui crée le stage (enseignant ou bureau qui enseigne) est toujours proposé */
const clubCoaches = () => {
  const l = Object.keys(M).filter(x => x !== 'club' && /^Enseignant/.test(M[x].role || '') && !isMinor(x));
  if (M[ME()] && !l.includes(ME()) && (S.role === 'coach' || isAdmin())) l.unshift(ME());
  return l;
};
/* une ligne du déroulé dans le formulaire */
const dlRow = (x = {}) =>
  `<div class="dl-row"><select class="dl-h1" aria-label="Heure de début">${HOURS.map(h => `<option ${h === (x.h1 || '9 h') ? 'selected' : ''}>${h}</option>`).join('')}</select><select class="dl-h2" aria-label="Heure de fin (facultative)"><option value="">—</option>${HOURS.map(h => `<option ${h === x.h2 ? 'selected' : ''}>${h}</option>`).join('')}</select><input class="dl-t" maxlength="80" placeholder="Sur le terrain, déjeuner au club-house…" value="${
    x.t
      ? esc(
          String(x.t)
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
        )
      : ''
  }" aria-label="Étape" autocomplete="off"><button type="button" class="ib dl-x" data-a="dlDel" aria-label="Retirer cette étape">${ic('x')}</button></div>`;
/* les champs ajoutés au formulaire d'un événement (k : event, stage, anim), préremplis depuis p */
function evExtra(p = {}, k = 'event') {
  const pay = p.prix != null && p.prix !== '' && p.prix !== '0',
    coaches = clubCoaches(),
    autre = !!p.ensNom || (!p.ens && !coaches.length),
    choisi = p.ens || (coaches.includes(ME()) ? ME() : coaches[0]),
    stage = k === 'stage';
  return `<!--ev-x--><div class="fld"><span class="lb">Tarif</span><div class="radio"><label for="ev-prix-g"><input type="radio" name="ev-prix" value="g" id="ev-prix-g" ${pay ? '' : 'checked'}>Gratuit</label><label for="ev-prix-p"><input type="radio" name="ev-prix" value="p" id="ev-prix-p" ${pay ? 'checked' : ''}>Payant</label></div><div id="ev-prix-w" ${pay ? '' : 'hidden'}><input id="ev-prix-m" inputmode="decimal" placeholder="25 € par personne" maxlength="40" value="${pay ? esc(String(p.prix)) : ''}" aria-label="Montant" autocomplete="off"></div></div>${
    stage
      ? `<div class="fld"><label for="ev-ens">Enseignant du stage</label><select id="ev-ens">${coaches.map(x => `<option value="${x}" ${!autre && choisi === x ? 'selected' : ''}>${esc(M[x].n)}</option>`).join('')}<option value="autre" ${autre ? 'selected' : ''}>Autre personne (préciser)</option></select><input id="ev-ens-nom" ${autre ? '' : 'hidden'} placeholder="Prénom et nom de l'intervenant" maxlength="60" value="${p.ensNom ? esc(p.ensNom) : ''}" autocomplete="off" style="margin-top:8px"></div>`
      : ''
  }<div class="fld"><span class="lb">Déroulé${stage ? ' du stage' : ''} (facultatif)</span><div id="dl-list">${(p.dl || []).map(dlRow).join('')}</div><button type="button" class="btn sm ghost" data-a="dlAdd">${ic('plus')}Ajouter une étape</button><span class="muted small">Une heure de début, une heure de fin si besoin, et ce qui se passe.</span></div><!--/ev-x-->`;
}
/* lire ces champs : { prix, ens, ensNom, dl } (textes protégés comme le reste du formulaire) */
function evExtraRead(k = 'event') {
  if (!$('ev-prix-g')) return {};
  const pay = $('ev-prix-p').checked,
    m = (($('ev-prix-m') || {}).value || '').trim(),
    out = { prix: pay && m ? esc(m) : '' };
  if (k === 'stage' && $('ev-ens')) {
    const v = $('ev-ens').value,
      nom = (($('ev-ens-nom') || {}).value || '').trim();
    out.ens = v !== 'autre' ? v : '';
    out.ensNom = v === 'autre' ? esc(nom) : '';
  }
  out.dl = [...document.querySelectorAll('#dl-list .dl-row')]
    .map(r => ({
      h1: r.querySelector('.dl-h1').value,
      h2: r.querySelector('.dl-h2').value,
      t: esc(r.querySelector('.dl-t').value.trim())
    }))
    .filter(x => x.t)
    .sort((a, b) => hMin(a.h1) - hMin(b.h1))
    .slice(0, DL_MAX);
  return out;
}
/* vérifie le formulaire : un montant si payant, un nom si « autre personne », des heures de fin après le début */
function evExtraOk(k = 'event') {
  if (!$('ev-prix-g')) return true;
  if ($('ev-prix-p').checked && !(($('ev-prix-m') || {}).value || '').trim())
    return (toast('Indique le tarif, ou choisis Gratuit'), false);
  if (k === 'stage' && $('ev-ens') && $('ev-ens').value === 'autre' && !(($('ev-ens-nom') || {}).value || '').trim())
    return (toast("Indique le prénom et le nom de l'intervenant"), false);
  const bad = [...document.querySelectorAll('#dl-list .dl-row')].some(
    r =>
      r.querySelector('.dl-h2').value && hMin(r.querySelector('.dl-h2').value) <= hMin(r.querySelector('.dl-h1').value)
  );
  if (bad) return (toast("Dans le déroulé, l'heure de fin doit être après l'heure de début"), false);
  return true;
}
Object.assign(A, {
  dlAdd() {
    const l = $('dl-list');
    if (!l) return;
    if (l.children.length >= DL_MAX) return toast(DL_MAX + ' étapes au plus');
    const last = [...l.querySelectorAll('.dl-h1')].pop(),
      h = last ? HOURS[Math.min(HOURS.length - 1, HOURS.indexOf(last.value) + 2)] : '9 h';
    l.insertAdjacentHTML('beforeend', dlRow({ h1: h }));
    l.lastElementChild.querySelector('.dl-t').focus();
  },
  dlDel(d, el) {
    const r = el && el.closest('.dl-row');
    if (r) r.remove();
  },
  /* déplier ou replier le déroulé sur la carte d'un événement (mur, agenda) */
  dlTog(d) {
    S.dlOpen = S.dlOpen || [];
    const i = S.dlOpen.indexOf(d.id);
    if (i >= 0) S.dlOpen.splice(i, 1);
    else S.dlOpen.push(d.id);
    document.querySelectorAll(`.dlb[data-id="${CSS.escape(d.id)}"]`).forEach(b => {
      const on = i < 0;
      b.classList.toggle('on', on);
      const t = b.querySelector('.dl-tog');
      t.setAttribute('aria-expanded', String(on));
      t.querySelector('.dl-pm').innerHTML = ic(on ? 'minus' : 'plus');
      b.querySelector('.dl-f').hidden = !on;
    });
  }
});
/* tarif payant : le montant ; autre personne : son nom */
document.addEventListener('change', e => {
  const t = e.target;
  // tout choix « Gratuit / Payant » (prixChoix) : le montant n'apparaît que si c'est payant
  if (t.name && t.name.endsWith('-mode') && t.name !== 'ev-prix') {
    const id = t.name.slice(0, -5);
    if ($(id + '-w')) {
      $(id + '-w').hidden = !$(id + '-p').checked;
      if ($(id + '-p').checked) $(id).focus();
    }
  }
  if (t.name === 'ev-prix' && $('ev-prix-w')) {
    $('ev-prix-w').hidden = !$('ev-prix-p').checked;
    if ($('ev-prix-p').checked) $('ev-prix-m').focus();
  }
  if (t.id === 'ev-ens' && $('ev-ens-nom')) {
    $('ev-ens-nom').hidden = t.value !== 'autre';
    if (t.value === 'autre') $('ev-ens-nom').focus();
  }
});
if (!I.minus) I.minus = '<path d="M5 12h14"/>';
/* infos ajoutées sur la carte du mur : tarif, enseignant */
function evMetaPlus(p) {
  const pr = prixTxt(p),
    en = ensTxt(p);
  return `${pr ? `<span class="ev-prix${pr === 'Gratuit' ? ' free' : ''}">${ic('euro')}${pr}</span>` : ''}${en ? `<span>${ic('user')}Avec ${en}</span>` : ''}`;
}
/* le déroulé : un bouton plus / moins, et la frise verticale (heures à gauche, étapes à droite) */
function dlBlock(p) {
  if (!p || !Array.isArray(p.dl) || !p.dl.length) return '';
  const on = (S.dlOpen || []).includes(p.id);
  return `<div class="dlb${on ? ' on' : ''}" data-id="${esc(p.id)}"><button type="button" class="dl-tog" data-a="dlTog" data-id="${esc(p.id)}" aria-expanded="${on}"><span class="dl-pm" aria-hidden="true">${ic(on ? 'minus' : 'plus')}</span><span class="grow">Déroulé${p.stage ? ' du stage' : ''}</span><span class="muted small">${p.dl.length} étape${p.dl.length > 1 ? 's' : ''}</span></button><ol class="dl-f" ${on ? '' : 'hidden'}>${p.dl.map(x => `<li><span class="dl-h">${x.h1}${x.h2 ? `<small>${x.h2}</small>` : ''}</span><span class="dl-pt" aria-hidden="true"></span><span class="dl-tx">${x.t}</span></li>`).join('')}</ol></div>`;
}
