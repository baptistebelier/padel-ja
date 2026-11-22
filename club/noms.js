/* /RAM — noms de domaine des trois applis : UN SEUL ENDROIT.
   Lu par le serveur (require) et par le navigateur (script, variable RAM_NOMS). Baptiste confirme ces noms avant la bascule.
   - « anciens » : les noms actuels (ja., club., coach.). « nouveaux » : les noms provisoires (pista., buvette., dojo.).
   - Les deux familles ouvrent la bonne appli, avec la même connexion (cookie sur .riseandmove.fr).
   - Les adresses officielles (e-mails, liens générés, webhook, présentation) restent les anciennes tant que la variable
     d'environnement NOMS_OFFICIELS=nouveaux n'est pas posée. */
(function (root, factory) {
  const x = factory();
  if (typeof module === 'object' && module.exports) module.exports = x;
  else root.RAM_NOMS = x;
})(typeof self !== 'undefined' ? self : this, function () {
  const DOMAINE = 'riseandmove.fr';
  // appli → premier mot du nom de domaine, par famille
  const APPS = {
    ja: { anciens: 'ja', nouveaux: 'pista' }, // /Pista
    club: { anciens: 'club', nouveaux: 'buvette' }, // /Buvette
    coach: { anciens: 'coach', nouveaux: 'dojo' } // /Dojo
  };
  const FAMILLES = ['anciens', 'nouveaux'];
  const premier = h =>
    String(h || '')
      .split(':')[0]
      .toLowerCase()
      .split('.')[0];
  /* l'appli d'un nom d'hôte (« club.riseandmove.fr », « buvette.localhost »…), ou '' pour un hôte inconnu */
  function appOf(host) {
    const m = premier(host);
    return Object.keys(APPS).find(a => APPS[a].anciens === m || APPS[a].nouveaux === m) || '';
  }
  /* famille d'un nom d'hôte : « nouveaux » seulement si son premier mot est un nouveau nom ; sinon « anciens » (comportement actuel) */
  function famille(host) {
    const m = premier(host),
      a = appOf(host);
    return a && APPS[a].nouveaux === m ? 'nouveaux' : 'anciens';
  }
  const nom = (app, fam) => (APPS[app] || APPS.ja)[fam === 'nouveaux' ? 'nouveaux' : 'anciens'];
  /* adresse d'une appli dans une famille : urlApp('ja', 'nouveaux') = https://pista.riseandmove.fr */
  const urlApp = (app, fam) => 'https://' + nom(app, fam) + '.' + DOMAINE;
  /* même adresse, depuis le nom d'hôte courant : on reste dans la famille des noms où l'on est */
  const urlDepuis = (app, host) => urlApp(app, famille(host));
  /* « officiel » : les noms qu'on écrit dans les e-mails et les liens générés (variable NOMS_OFFICIELS=nouveaux) */
  const officiel = env => ((env || {}).NOMS_OFFICIELS === 'nouveaux' ? 'nouveaux' : 'anciens');
  /* le même nom d'hôte, dans l'autre famille (« club.riseandmove.fr » → « buvette.riseandmove.fr ») ; '' si hôte inconnu */
  function versFamille(host, fam) {
    const a = appOf(host);
    if (!a) return '';
    const reste = String(host).split(':')[0].split('.').slice(1).join('.'),
      port = String(host).includes(':') ? ':' + String(host).split(':')[1] : '';
    return nom(a, fam) + (reste ? '.' + reste : '') + port;
  }
  /* un texte (page de présentation, mention légale…) réécrit dans la famille demandée */
  /* garderOfficiel : tant que les anciens noms sont les noms officiels, les lignes « officielles » d'une page (adresse canonique,
     aperçus de partage, données structurées, adresse du connecteur) restent telles quelles ; seuls les liens suivent la famille */
  const OFFICIEL = /rel="canonical"|property="og:|name="twitter:|ld\+json|\/mcp\b/;
  function reecrire(texte, fam, garderOfficiel) {
    if (fam !== 'nouveaux') return texte;
    const un = l => {
      let t = l;
      Object.keys(APPS).forEach(a => {
        t = t.split(APPS[a].anciens + '.' + DOMAINE).join(APPS[a].nouveaux + '.' + DOMAINE);
      });
      return t;
    };
    return String(texte)
      .split('\n')
      .map(l => (garderOfficiel && OFFICIEL.test(l) ? l : un(l)))
      .join('\n');
  }
  /* toutes les adresses possibles d'une appli (pour une liste blanche) */
  const hotes = app => FAMILLES.map(f => nom(app, f) + '.' + DOMAINE);
  return { DOMAINE, APPS, FAMILLES, appOf, famille, nom, urlApp, urlDepuis, officiel, versFamille, reecrire, hotes };
});
