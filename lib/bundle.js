/* =========================================================================
   /RAM Club et /RAM Coach : un seul fichier au lieu d'une quarantaine
   Les pages citent leurs scripts un par un (ce qui reste vrai pour la démo sur GitHub Pages) ; le serveur
   réunit chaque suite de scripts locaux en un fichier, exécutés dans le même ordre, chacun comme un script à part.
   Aucun outil à la mise en ligne, aucune dépendance.
   L'adresse porte l'empreinte du contenu : gardé un an par l'appareil, jamais périmé.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCAL = /^<script src="([\w./-]+\.js)"><\/script>$/;

function createBundler(root) {
  const bundles = new Map(), pages = new Map();   // adresse → texte du fichier réuni ; page → { mtime, html }
  function page(rel, html) {
    const file = path.join(root, rel);
    const lines = html.split(/\r?\n/), out = [];
    let run = [], changed = false;
    const end = () => {
      if (run.length < 2) { run.forEach(r => out.push(r.line)); run = []; return; }
      // chaque fichier reste un script à part (un seul téléchargement) : collés en un bloc, les « typeof x » qui visent une
      // variable déclarée plus loin planteraient, alors qu'ils fonctionnent d'un script à l'autre
      const parts = run.map(r => fs.readFileSync(path.join(root, r.src), 'utf8') + '\n//# sourceURL=' + r.src);
      const body = '(function(){var p=' + JSON.stringify(parts) + ';for(var i=0;i<p.length;i++){var s=document.createElement("script");s.text=p[i];document.head.appendChild(s);s.remove();}})();', name ='b-' + crypto.createHash('sha256').update(body).digest('hex').slice(0, 16) + '.js';
      bundles.set('/' + name, body);
      out.push(`<script src="${name}"></script>`);
      changed = true; run = [];
    };
    for (const line of lines) {
      const m = line.trim().match(LOCAL);
      if (m && fs.existsSync(path.join(root, m[1]))) run.push({ line, src: m[1] });
      else if (run.length && !line.trim()) continue;   // une ligne vide ne coupe pas la suite
      else { end(); out.push(line); }
    }
    end();
    return changed ? out.join('\n') : html;
  }
  return {
    /* la page, ses scripts réunis */
    page(rel, data) {
      // la page et les dates de ses scripts : en développement, un fichier modifié refait le fichier réuni
      const text = data.toString('utf8'), dates = [...text.matchAll(/src="([\w./-]+\.js)"/g)].map(m => { try { return fs.statSync(path.join(root, m[1])).mtimeMs; } catch (e) { return 0; } });
      const key = rel + ':' + crypto.createHash('md5').update(data).update(dates.join()).digest('hex');
      if (!pages.has(key)) pages.set(key, page(rel, data.toString('utf8')));
      return Buffer.from(pages.get(key));
    },
    file: rel => (bundles.has(rel) ? Buffer.from(bundles.get(rel)) : null)
  };
}

module.exports = { createBundler };
