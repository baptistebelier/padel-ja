/* =========================================================================
   Vacances scolaires françaises (zones A, B, C), lues dans les données ouvertes de l'Éducation nationale
   (data.education.gouv.fr, jeu « fr-en-calendrier-scolaire »), pour l'année scolaire en cours et la suivante.
   Gardées un jour en mémoire. Les dates de l'API sont des minuits de Paris écrits en UTC : le début est le
   premier jour de vacances, la fin le jour de la reprise (on garde la veille).
   ========================================================================= */
'use strict';
const URL_API = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
const DAY = 864e5, cache = new Map();
const jourParis = s => new Date(s).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ
const veille = d => new Date(Date.parse(d + 'T12:00:00Z') - DAY).toISOString().slice(0, 10);
/* les années scolaires utiles : celle en cours (de septembre à août) et la suivante */
function annees(now = Date.now()) {
  const d = new Date(now), y = d.getUTCFullYear() - (d.getUTCMonth() < 8 ? 1 : 0);
  return [`${y}-${y + 1}`, `${y + 1}-${y + 2}`];
}
/* lignes de l'API → périodes { nom, du, au } sans doublon (une ligne par académie), triées ; les ponts d'un jour sont laissés */
function lire(rows) {
  const vus = new Map();
  (rows || []).forEach(r => {
    if (!r || !r.start_date || !r.end_date || !/^Vacances/i.test(r.description || '')) return;
    const du = jourParis(r.start_date), fin = jourParis(r.end_date), au = fin > du ? veille(fin) : du;
    const nom = String(r.description).trim().slice(0, 60);
    if (!vus.has(nom + du)) vus.set(nom + du, { nom, du, au });
  });
  return [...vus.values()].sort((a, b) => a.du.localeCompare(b.du));
}
async function periodes(zone, now = Date.now(), get = fetch) {
  const k = zone + '|' + annees(now)[0], c = cache.get(k);
  if (c && now - c.t < DAY) return c.l;
  const where = `zones="Zone ${zone}" and (${annees(now).map(a => `annee_scolaire="${a}"`).join(' or ')})`;
  const r = await get(URL_API + '?select=description,start_date,end_date&limit=100&where=' + encodeURIComponent(where));
  if (!r.ok) throw new Error('calendrier scolaire : ' + r.status);
  const l = lire((await r.json()).results).filter(o => o.au >= new Date(now).toISOString().slice(0, 10));
  cache.set(k, { t: now, l });
  return l;
}
module.exports = { periodes, lire, annees };
