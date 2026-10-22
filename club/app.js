/* Rendu, actions, formulaires et simulation du direct */
let lastKey='',lastFoot='',slT,toastT;
function slide(c){const m=$('main');m.classList.remove('pg-r','pg-l','sg-r','sg-l');void m.offsetWidth;m.classList.add(c);clearTimeout(slT);slT=setTimeout(()=>m.classList.remove(c),320)}
const ROLE={wait:"Nouvel inscrit en attente de validation",admin:'Bureau du club',cap:'Capitaine',mem:'Adhérent et parent',coach:'Enseignante',kid:'Compte jeune'};
const TITLES={home:()=>['Accueil','Le mur du club'],chans:()=>['Groupes',club().name],agenda:()=>['Agenda','Cours, équipes et événements'],teamarch:()=>{const [id,s]=view().id.split('|');return [teamName(grp(id)),'Saison '+s]},ecole:()=>['École','Cours et stages'],club:()=>['Le club','Saison '+S.season],me:()=>['Mon profil',ROLE[S.role]],
 admin:()=>[isAdmin()?'Gérer le club':S.role==='coach'?'Mes groupes':'Mon équipe','Édition'],list:()=>['Adhérents',club().name],reports:()=>['Signalements','Modération'],legal:()=>['Mentions',club().name],post:()=>['Publication',club().name],art:()=>['Actus',club().name],partners:()=>['Partenaires',club().name],archive:()=>['Archives','Saisons précédentes'],join:()=>['Adhérents',"Faire entrer le club"]};
function render(keep){const v=view(),key=v.v+(v.id||''),main=$('main'),y=main.scrollTop,atEnd=main.scrollHeight-main.clientHeight-y<80;let t,sub;
 if(TITLES[v.v])[t,sub]=TITLES[v.v]();
 else if(v.v==='chan'){const c=chans.find(c=>c.id===v.id);t='# '+c.name;sub=c.desc}
 else if(v.v==='rec'){const r=recs.find(r=>r.id===v.id);t=teamName(grp(r.tid))+' – '+r.opp;sub=r.comp}
 else if(v.v==='grp'){const g=grp(v.id);t=g.name;sub=g.sub}
 else if(v.v==='team'){const g=grp(v.id);t=teamName(g);sub=champOf(g).name}
 else if(v.v==='champ'){t=(CHAMPS.find(c=>c.id===v.id)||OLDC.find(c=>c.id===v.id)||{name:'Championnat'}).name;sub='Championnat'}
 else if(v.v==='comm'){t=COMMS.find(c=>c.id===v.id).name;sub=club().name}
 else{t=M[v.id].n;sub='Profil'}
 if(key!==lastKey){$('top').classList.remove('hide');lastY=0;turnY=0}
 $('top').innerHTML=(S.stack.length?`<button class="ib" data-a="back" aria-label="Retour">${ic('back')}</button>`:'')+(clubLogo()?`<img class="toplogo${S.stack.length?' sub':''}" src="${clubLogo()}" alt="${esc(club().name)}">`:'')+`<h1>${t}<span class="sub">${sub}</span></h1>${v.v==='chan'?muteBtn(chans.find(c=>c.id===v.id)):''}${(isAdmin()||S.role==='cap')&&!pending()?`<button class="ib" data-a="admin" aria-label="${isAdmin()?'Gérer le club':'Gérer mon équipe'}">${ic('gear')}</button>`:''}<button class="ib" data-a="notifs" aria-label="Notifications">${ic('bell')}${!pending()&&NOTIFS.some(n=>n.n&&nVis(n))?'<span class="dot"></span>':''}</button>`;
 const strips='.seg,.chips,.stories',sx=key===lastKey?[...main.querySelectorAll(strips)].map(e=>e.scrollLeft):[];
 main.innerHTML=pending()&&!lockOk(v)?lockView(v):V[v.v](v.id);
 main.querySelectorAll(strips).forEach((e,i)=>{if(sx[i])e.scrollLeft=sx[i]});
 const foot=$('foot'),tabs=$('tabs'),liveRec=v.v==='rec'&&recs.find(r=>r.id===v.id).st==='live',fk=key+(liveRec?'L':'');
 /* menu de navigation : caché dans une discussion sur téléphone (la barre de saisie prend sa place), toujours visible avec le menu latéral (ordinateur) */
 const showTabs=!(v.v==='chan'||liveRec)||sideNav();
 if(v.v==='chan'||liveRec){foot.hidden=false;tabs.hidden=!showTabs;
  if(fk!==lastFoot){const c=v.v==='chan'?chans.find(c=>c.id===v.id):null;S.img=null;S.reply=null;
   foot.innerHTML=c&&c.ro&&!isAdmin()?'<div class="muted small" style="text-align:center;padding:8px">Seul le club publie dans ce groupe.</div>':`<div class="att" id="att" hidden></div><form class="composer" id="composer"><label class="attach" aria-label="Joindre une photo">${ic('image')}<input type="file" id="m-img" accept="image/*"></label><textarea id="msg-input" class="ta" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="${c?(c.ro?'Publier au nom du club':'Écrire dans '+esc(c.name)):"Encourager l'équipe en direct"}" aria-label="Message"></textarea><button class="send" aria-label="Envoyer">${ic('send')}</button></form>`}}
 else foot.hidden=true;
 if(showTabs){tabs.hidden=false;const un=pending()?0:chans.reduce((a,c)=>a+(c.mute||!chanOk(c)?0:c.un),0),tb=(k,i,l)=>`<button data-a="tab" data-t="${k}" ${S.tab===k?'aria-current="page"':''}>${ic(i)}${l}${k==='chans'&&un?`<span class="cnt">${un}</span>`:''}</button>`;
  tabs.innerHTML=tb('home','home','Accueil')+tb('chans','chat','Groupes')+tb('agenda','cal','Agenda')+tb('ecole','school','École')+tb('club','club','Club')+tb('me','user','Profil');tabs.insertAdjacentHTML('afterbegin','<span class="pill" id="tpill" aria-hidden="true"></span>');pillTo(tabs.querySelector('[aria-current]'),true)}
 if(pending()&&!lockOk(v))foot.hidden=true;
 $('phone').classList.toggle('notabs',tabs.hidden);$('phone').classList.toggle('hassub',!!main.querySelector(':scope > .seg'));$('phone').classList.toggle('withfoot',!foot.hidden);
 /* Bouton flottant « Ajouter du contenu » : sur le mur, seulement pour ceux qui peuvent publier */
 let fab=$('addfab');if(!fab){fab=document.createElement('button');fab.id='addfab';fab.className='addfab';fab.dataset.a='plus';fab.innerHTML=`${ic('plus')}Ajouter du contenu`;$('phone').appendChild(fab)}
 const showFab=v.v==='home'&&!S.stack.length&&canPublish()&&!pending()&&!tabs.hidden;fab.hidden=!showFab;$('phone').classList.toggle('fab',showFab);
 /* discussion : si l'on était en bas, on y reste (nouveaux messages, mise à jour) */
 main.scrollTop=keep&&key===lastKey?((v.v==='chan'||v.v==='rec')&&atEnd?main.scrollHeight:y):(v.v==='chan'?main.scrollHeight:0);
 if(S.dir){slide((key!==lastKey?'pg-':'sg-')+(S.dir>0?'r':'l'));S.dir=0}
 lastKey=key;lastFoot=fk}

/* Message de confirmation en haut ; après une suppression, il propose « Annuler » pendant 5 secondes */
let undoFn=null;
/* Toutes les fenêtres venues du haut (confirmations, notifications, direct, trophées) partagent la même pile : elles s'empilent, jamais l'une sur l'autre */
function nstack(){let st=$('nstack');if(!st){st=document.createElement('div');st.id='nstack';st.className='nstack';$('phone').appendChild(st)}return st}
/* Confirmations : courtes (2,6 s, 5 s avec « Annuler »), jamais plus de 2 à la fois, toujours sous l'éventuel bandeau de notification */
function toast(msg,undo){const st=nstack();st.querySelectorAll('.tst .undo').forEach(u=>u.remove());const d=document.createElement('div');d.className='nban tst';d.setAttribute('role','status');d.innerHTML=`<span class="grow">${esc(msg)}</span>${undo?'<button class="undo" data-a="undo">Annuler</button>':''}`;
 const ban=st.querySelector('.nban:not(.tst)');if(ban)ban.after(d);else st.prepend(d);void d.offsetWidth;d.classList.add('on');undoFn=undo||null;d._t=setTimeout(()=>{banHide(d);if(undoFn===undo)undoFn=null},undo?5000:2600);[...st.querySelectorAll('.tst.on')].slice(2).forEach(x=>banHide(x))}
function sheet(title,body,quiet){closeSheet();const d=document.createElement('div');d.className='back'+(quiet?'':' anim');d.id='sheet';d.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><span class="grab" aria-hidden="true"></span><header><span class="h3">${title}</span><button class="ib" data-a="close" aria-label="Fermer">${ic('x')}</button></header>${body}</div>`;$('layer').appendChild(d);d.firstChild.focus({preventScroll:true})}
function closeSheet(){const s=$('sheet');if(s)s.remove()}
const menuSheet=(title,items)=>sheet(title,`<div class="body"><div class="menu">${items.filter(Boolean).map(i=>`<button class="${i[4]?'danger':''}" data-a="${i[2]}" ${i[3]||''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`);
function commentsBody(p){const ref='p:'+p.id,l=p.com.map((m,i)=>msgRow(m,i,postSport(p),ref)).join('');return `<div class="body chat com" id="com-list">${l?lpHelp()+l:empty('com','Aucun commentaire','Sois le premier à réagir.')}</div><div class="foot"><form class="composer" id="com-form" data-id="${p.id}"><textarea id="com-input" class="ta" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="Ajouter un commentaire" aria-label="Commentaire"></textarea><button class="send" aria-label="Publier">${ic('send')}</button></form></div>`}

/* Couleurs : le club choisit une seule couleur ; l'appli l'ajuste pour qu'elle reste lisible sur le fond et choisit le texte noir ou blanc au meilleur contraste. Le rouge d'alerte et le bleu padel sont fixes. */
function lum(hex){const n=parseInt(hex.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const onColor=hex=>contrast(hex,'#0B0B0B')>=contrast(hex,'#FFFFFF')?'#0B0B0B':'#FFFFFF';
function mix(hex,to,t){const a=parseInt(hex.slice(1),16),b=parseInt(to.slice(1),16);return '#'+[16,8,0].map(s=>Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t).toString(16).padStart(2,'0')).join('')}
function derive(acc,bg){let c=acc,t=0;const to=lum(bg)<.2?'#FFFFFF':'#000000';while(contrast(c,bg)<4.5&&t<1){t=Math.min(1,t+.05);c=mix(acc,to,t)}return {col:c,adj:c.toLowerCase()!==acc.toLowerCase()}}
const BASE={true:{bg:'#0B0B0B',card:'#161616',card2:'#222222',line:'#2E2E2E',fg:'#F5F3EE',muted:'#A09C93'},false:{bg:'#F3F5FA',card:'#FFFFFF',card2:'#E4E9F3',line:'#D0D7E5',fg:'#0C1630',muted:'#5A647E'}};
const HOT='#E0123C',PADEL='#2459E0';
/* logo entier du club qui ressort sur son fond : logo clair sur fond sombre, logo sombre sur fond clair (l'autre en secours) */
const clubLogo=c=>(c=c||club(),c.dark?(c.logoL||c.logoD):(c.logoD||c.logoL))||'';
function setTheme(i){S.club=i;const c=CLUBS[i],r=document.documentElement.style,b=BASE[!!c.dark],acc=derive(c.accent,c.bg||b.bg).col;
 Object.keys(b).forEach(k=>r.setProperty('--'+k,c[k]||b[k]));r.setProperty('--accent',acc);
 /* Rouge d'alerte utilisé comme couleur de texte (« Perf ! », « En jeu », « Supprimer ») : ajusté pour atteindre 4,5:1 sur la surface la plus défavorable du thème */
 const sf=[c.bg||b.bg,c.card||b.card,c.card2||b.card2],to=c.dark?'#FFFFFF':'#000000';let ht=HOT,t=0;while(Math.min(...sf.map(x=>contrast(ht,x)))<4.7&&t<1){t=Math.min(1,t+.03);ht=mix(HOT,to,t)}r.setProperty('--hot-tx',ht);r.setProperty('--on-accent',onColor(acc));r.setProperty('--hot',HOT);r.setProperty('--accent2',c.accent2||HOT);const rl=clubLogo(c);r.setProperty('--rail-logo',rl?`url("${rl}")`:`url("${c.dark?'img/ram-club-blanc.png':'img/ram-club-noir.png'}")`);r.setProperty('--on-hot','#FFFFFF');r.setProperty('--padel',PADEL);r.setProperty('--stage',c.dark?'#050505':'#DDE2EC');r.colorScheme=c.dark?'dark':'light';try{localStorage.setItem('club-theme',i)}catch(e){}}
function lookPrev(){const p=$('lk-prev');if(!p)return;const dark=$('lk-bg').value==='Sombre',b=BASE[dark],acc=$('lk-acc').value,acc2=$('lk-acc2').value,dv=derive(acc,b.bg),on=onColor(dv.col),cr=contrast(dv.col,b.bg).toFixed(1),lg=dark?(S.logoL||club().logoL||S.logoD||club().logoD):(S.logoD||club().logoD||S.logoL||club().logoL);
 p.innerHTML=`${dv.adj?`<div class="lkadj"><span class="sw2" style="background:${acc}"></span><span class="arrow">→</span><span class="sw2" style="background:${dv.col}"></span><span class="grow small">Ta couleur sera légèrement ${lum(dv.col)>lum(acc)?'éclaircie':'assombrie'} pour rester lisible sur ce fond.</span></div>`:''}<div class="lkp" style="background:${b.bg};color:${b.fg}">${lg?`<img src="${lg}" alt="" style="height:34px;max-width:140px;object-fit:contain;object-position:left">`:''}<span style="font-family:var(--f-display);font-style:italic;font-size:22px;text-transform:uppercase">Doubles <span style="color:${dv.col}">et barbecue</span></span><span style="background:${dv.col};color:${on};padding:8px 14px;font-weight:700;box-shadow:4px 4px 0 ${acc2}">Je m'inscris</span><span style="color:${dv.col};font-family:var(--f-display);font-size:26px">6 · 4</span></div><p class="muted small" style="margin-top:6px">${dv.adj?`Aperçu : ta couleur est ajustée en ${dv.col} pour rester lisible sur ce fond (contraste ${cr}:1).`:`Aperçu : contraste ${cr}:1, lisible.`}</p>`}

function notify(type,by,txt,go,quiet){if(!S.nset[type]||by===ME())return;NOTIFS.unshift({by,txt,t:"À l'instant",n:1,go});if(NOTIFS.length>30)NOTIFS.pop();if(!quiet)banner(NOTIFS[0])}
/* Bandeau de notification qui descend du haut, puis remonte ; un toucher ouvre la cible, un glissé vers le haut le range */
/* Un seul bandeau visible à la fois : les suivants s'accumulent derrière avec un compteur « +N » qui ouvre la liste des notifications. Ceux du direct sont rouges */
function banner(n){if(S.blocked.has(n.by)||!nVis(n)||(pending()&&!n.mine))return;const st=nstack(),cur=st.querySelector('.nban.on:not(.tst)');
 if(cur){cur._q=(cur._q||0)+1;let c=cur.querySelector('.bq');if(!c){c=document.createElement('span');c.className='bq';c.setAttribute('role','button');c.setAttribute('tabindex','0');cur.appendChild(c)}c.textContent='+'+cur._q;c.setAttribute('aria-label',cur._q+' autre'+(cur._q>1?'s':'')+' notification'+(cur._q>1?'s':'')+' : ouvrir la liste');cur.classList.add('stk');clearTimeout(cur._t);cur._t=setTimeout(()=>banHide(cur),5000);return}
 const r=n.go&&n.go.v==='rec'&&recs.find(x=>x.id===n.go.id),live=n.live||!!r,ttl=live?'Direct'+(r?' · '+teamName(grp(r.tid)):''):name(n.by);
 const b=document.createElement('button');b.className='nban'+(live?' live':'')+(n.tier!=null?' troph':'');b._n=n;
 b.innerHTML=n.head?`<span class="lvb ${n.kind||''}${n.tier!=null?' medal t'+n.tier:''}">${ic(n.kind==='win'||n.tier!=null?'trophy':'score')}</span><span class="grow"><span class="bk">${n.kick?esc(n.kick):`Direct · ${esc(n.team)} · ${esc(n.sc)}`}</span><span class="bh">${esc(n.head)}</span><span class="bd2">${esc(n.det)}</span></span>`
  :`${live?`<span class="lvb">${ic('score')}</span>`:av(n.by,'sm')}<span class="grow"><span class="nm">${ttl}</span> ${live&&n.by!=='club'?name(n.by)+' ':''}${esc(n.txt)}</span><time>maintenant</time>`;b.setAttribute('aria-label','Notification : '+ttl+' '+n.txt);
 st.prepend(b);void b.offsetWidth;b.classList.add('on');b._t=setTimeout(()=>banHide(b),5000)}
function banHide(b){if(!b){document.querySelectorAll('.nban.on').forEach(x=>banHide(x));return}clearTimeout(b._t);let p=b.previousElementSibling;while(p&&!p.classList.contains('on'))p=p.previousElementSibling;if(p)b.classList.add('out');b.classList.remove('on');b.style.transform='';setTimeout(()=>b.remove(),450)}
/* Bandeau du direct : on voit tout de suite l'équipe, le score de la rencontre, ce qui vient de se passer et qui est concerné */
const deX=x=>/^[aeiouyhéèêâîô]/i.test(x)?"d'"+x:'de '+x;
const ours=m=>m.a?name(m.a):m.an||club().short;
const setsTxt=m=>m.sets.filter(s=>s[0]+s[1]>0).map(s=>s.join('-')).join(' ');
/* Qui reçoit quoi pendant un direct (réglage « Convocations et scores de mon équipe ») :
   - 'rec'   début et fin de rencontre : tous les adhérents qui ont gardé le réglage ;
   - 'match' détail match par match : joueurs de la compo, capitaine, bureau, parents d'un joueur, adhérents qui suivent le joueur, ou ceux qui ont activé « Détail des matchs en direct » ;
   - 'cap'   consignes de saisie : capitaine de l'équipe et bureau seulement. */
function liveFor(r,scope,m){if(!S.nset.team)return false;const g=grp(r.tid),me=ME();if(scope==='cap')return canTeam(g);if(scope!=='match')return true;
 if(S.nset.live||canTeam(g))return true;const compo=new Set([...Object.keys(r.lineup||{}),...(r.ms||[]).map(x=>x.a).filter(Boolean)]),kids=M[me].kids||[];
 return compo.has(me)||kids.some(k=>compo.has(k))||!!(m&&m.a&&(S.follow.has(m.a)||kids.includes(m.a)))}
function liveNote(r,head,det,kind,scope,m){if(!liveFor(r,scope||'rec',m))return;const team=teamName(grp(r.tid)),sc=teamScore(r).join(' - '),n={by:'club',txt:`${team} · ${head} : ${det}`,head,det,kind,team,sc,t:"À l'instant",n:1,go:{v:'rec',id:r.id},live:1};NOTIFS.unshift(n);if(NOTIFS.length>30)NOTIFS.pop();banner(n)}
const liveStart=(r,m)=>liveNote(r,`Début du ${m.l.toLowerCase()}`,`${ours(m)} contre ${m.b[0]}${m.court?' · '+m.court:''}`,'start','match',m);
/* Une notification ciblée (changement de cours) n'apparaît que chez les élèves concernés et leurs parents */
let nVis=n=>!n.to||n.to.includes(ME())||(M[ME()].kids||[]).some(k=>n.to.includes(k));
const msgList=ref=>{const [k,id]=ref.split(':');if(k==='p'){const p=posts.find(p=>p.id===id);return p?p.com:null}const o=k==='c'?chans.find(c=>c.id===id):recs.find(r=>r.id===id);return o?(k==='c'?o.msgs:o.chat):null};
/* après une action sur un commentaire, on rouvre la fenêtre des commentaires au lieu de la fermer */
const comBack=ref=>{if(!ref||!ref.startsWith('p:'))return false;const p=posts.find(p=>p.id===ref.slice(2));if(!p)return false;sheet('Commentaires',commentsBody(p),true);return true};

/* ---------- score en direct ---------- */
function addGame(r,i,side){const m=r.ms[i];if(m.st!=='live')return;const k=m.sets.length-1,st=m.sets[k];st[side]++;S.flash=[i,side,k];
 const a=st[side],b=st[1-side];
 if(r.stb&&k===2?(a>=10&&a-b>=2):((a>=6&&a-b>=2)||a===7)){const w=[0,0];m.sets.forEach(s=>w[s[0]>s[1]?0:1]++);
  if(w[side]===2){m.st='done';m.w=side;if(m.a&&side===0&&S.follow.has(m.a)&&!liveFor(r,'match',m))notify('follow',m.a,`a gagné son match contre ${m.b[0]}`,{v:'rec',id:r.id},true);
   liveNote(r,`${side===0?'Victoire':'Défaite'} ${deX(ours(m))}`,`${m.l} · ${side===0?'bat':'perd contre'} ${m.b[0]} ${setsTxt(m)}`,side===0?'win':'loss','match',m);
   if(r.ms.every(x=>x.st==='done')){if(S.scoring)liveNote(r,'Tous les matchs sont terminés','Vérifie les scores puis clôture la rencontre','start','cap');else endRec(r)}
   else if(!S.scoring){const n=r.ms.find(x=>x.st==='soon');if(n){n.st='live';n.sets=[[0,0]];liveStart(r,n)}}}
  else m.sets.push([0,0])}}
/* Fin de rencontre : le résultat part tout seul sur le mur et la discussion du direct s'efface */
function endRec(r){const auto=!S.scoring,v=view(),inp=$('msg-input'),draft=inp&&v.v==='rec'&&v.id===r.id?inp.value.trim():'';r.st='done';delete r.chat;S.scoring=false;const s=teamScore(r);
 const pid='p'+Date.now();posts.unshift({id:pid,by:'club',t:"À l'instant",kind:'result',rec:r.id,likes:0,com:draft?[{by:ME(),x:draft}]:[]});notify('club','club',`a publié le résultat : ${teamName(grp(r.tid))} ${s[0]} à ${s[1]} contre ${r.opp}`,{v:'post',id:pid});
 liveNote(r,`Fin de rencontre · ${s[0]>s[1]?'victoire':s[0]<s[1]?'défaite':'match nul'} ${s[0]} à ${s[1]}`,`Contre ${r.opp} · ${draft?'ton message est publié en commentaire du résultat':'résultat publié sur le mur'}`,s[0]>s[1]?'win':s[0]<s[1]?'loss':'start');
 /* Le brouillon tapé dans le chat du direct n'est jamais perdu : il part en commentaire du résultat, et on le dit */
 if(draft)setTimeout(()=>toast('La rencontre est terminée : ton message a été publié en commentaire du résultat'),50)}
/* Bandeau au-dessus du champ de message quand une photo est jointe */
function showAtt(){const a=$('att');if(!a)return;a.hidden=!S.img&&!S.reply;a.innerHTML=(S.reply?`<span class="quote grow">Réponse à ${S.reply.by==='club'?club().short:first(S.reply.by)} : ${esc(S.reply.x).slice(0,70)}</span><button type="button" class="ib rnd" data-a="unreply" aria-label="Annuler la réponse">${ic('x')}</button>`:'')+(S.img?`<span class="ph" style="background-image:url(${S.img})"></span><span class="grow"><span class="nm">Photo jointe</span><br><span class="muted small">Elle partira avec ton message.</span></span><button type="button" class="ib rnd" data-a="unattach" aria-label="Retirer la photo">${ic('x')}</button>`:'')}
/* Pendant le direct, on ne redessine que les scores affichés, pas tout l'écran */
function liveRefresh(r){const v=view();if($('sheet'))return;if(v.v==='rec'){if(v.id===r.id)render(true);return}if(!['home','club','agenda'].includes(v.v))return;if(r.st!=='live'){render(true);return}
 const s=teamScore(r);document.querySelectorAll(`[data-live="${r.id}"]`).forEach(e=>e.textContent=s.join(' - '));document.querySelectorAll(`[data-live2="${r.id}"]`).forEach(e=>e.innerHTML=`<b>${s[0]}</b> · ${s[1]}`)}
function shrinkLogo(file,cb){const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,600/im.width,240/im.height),c=document.createElement('canvas');c.width=Math.round(im.width*k)||600;c.height=Math.round(im.height*k)||240;c.getContext('2d').drawImage(im,0,0,c.width,c.height);cb(c.toDataURL('image/png'))};im.src=fr.result};fr.readAsDataURL(file)}
function shrink(file,cb){const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,900/im.width),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',.8))};im.src=fr.result};fr.readAsDataURL(file)}

/* ---------- formulaires ---------- */
const F=(id,l,ph,v)=>`<div class="fld"><label for="${id}">${l}</label><input id="${id}" required placeholder="${ph||''}" value="${v?esc(v):''}" autocomplete="off"></div>`,
 O=(id,l,ph,v)=>`<div class="fld"><label for="${id}">${l}</label><input id="${id}" placeholder="${ph||''}" value="${v?esc(v):''}" autocomplete="off"></div>`,
 T=(id,l,ph,v)=>`<div class="fld"><label for="${id}">${l}</label><textarea id="${id}" required placeholder="${ph||''}">${v?esc(v):''}</textarea></div>`,
 Sel=(id,l,opts,sel)=>`<div class="fld"><label for="${id}">${l}</label><select id="${id}">${opts.map(o=>`<option ${o===sel?'selected':''}>${o}</option>`).join('')}</select></div>`,
 Dt=(id,l,req,v)=>`<div class="fld"><label for="${id}">${l}</label><input type="date" id="${id}" ${req?'required':''} value="${v||isoIn(7)}"></div>`,
 Who=(id,l,ids)=>`<div class="fld"><label for="${id}">${l}</label><select id="${id}">${ids.map(k=>`<option value="${k}">${M[k].n}</option>`).join('')}</select></div>`,
 IMG=`<div class="fld"><label for="a-img">Photo de couverture (facultative)</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" hidden></div><span class="muted small">Si des jeunes apparaissent sur la photo, vérifie leur autorisation photo (indiquée par leurs parents).</span></div>`;
const adults=()=>Object.keys(M).filter(k=>k!=='club'&&M[k].role!=='Jeune');
const toUrl=u=>u?(/^https?:\/\//i.test(u)?u:'https://'+u):'';
function visBlock(){return `<details class="more"><summary>Sport et visibilité</summary><div class="in">${Sel('v-sport','Sport concerné',['Tennis et padel','Tennis','Padel'])}${Sel('v-pub','Visible par',['Tous les adhérents','Bureau uniquement','Équipe pédagogique','Parents'])}
 <div class="two">${Sel('v-gen','Genre',['Hommes et femmes','Hommes','Femmes'])}${Sel('v-age','Âge',['Jeunes et adultes','Jeunes','Adultes'])}</div>${Sel('v-prat','Pratique',['Compétiteurs et loisir','Compétiteurs (classés 40 et plus)','Loisir (non classés)'])}
 <div class="fld"><label class="chk" for="v-all"><input type="checkbox" id="v-all" checked data-hide="v-range">Tous classements et niveaux</label></div>
 <div id="v-range" class="stack" hidden><div class="two" id="v-rk">${Sel('v-lo','Tennis, de',RANKS,'30/1')}${Sel('v-hi','à',RANKS,'15/1')}</div><div class="two" id="v-nv">${Sel('n-lo','Padel, de',LV,'Niveau 3')}${Sel('n-hi','à',LV,'Niveau 7')}</div></div></div></details>`}
function readVis(){const x=id=>$(id).value,vis=[],rule={},sp=x('v-sport');
 if(x('v-pub')!=='Tous les adhérents'){vis.push(x('v-pub'));rule.pub=x('v-pub')}
 if(x('v-gen')!=='Hommes et femmes'){vis.push(x('v-gen'));rule.gen=x('v-gen')}
 if(x('v-age')!=='Jeunes et adultes'){vis.push(x('v-age'));rule.age=x('v-age')}
 if(x('v-prat')!=='Compétiteurs et loisir'){const p=x('v-prat').split(' (')[0];vis.push(p);rule.prat=p}
 if(!$('v-all').checked){
  if(sp!=='Padel'){const a=rIdx(x('v-lo')),b=rIdx(x('v-hi'));rule.tn=[Math.min(a,b),Math.max(a,b)];vis.push(RANKS[rule.tn[0]]+' à '+RANKS[rule.tn[1]])}
  if(sp!=='Tennis'){const a=LV.indexOf(x('n-lo'))+1,b=LV.indexOf(x('n-hi'))+1;rule.pd=[Math.min(a,b),Math.max(a,b)];vis.push('Niveau '+rule.pd[0]+' à '+rule.pd[1])}}
 return {vis,rule:Object.keys(rule).length?rule:null,sport:sp==='Tennis et padel'?'':sp}}
function forms(k,cid){if(k==='stage'){const e=forms('event',cid);return ['Nouveau stage',e[1],'Publier le stage']}const cm=COMMS.find(c=>c.id===cid);const coaches=Object.keys(M).filter(x=>(M[x].role||'').startsWith('Enseignant'));
 return ({
  annonce:['Nouvelle annonce',F('a-title','Titre','Court 3 fermé jeudi')+T('a-body','Message','Ce que les adhérents doivent savoir')+IMG+visBlock(),'Publier sur le mur'],
  event:['Nouvel événement',F('a-title','Titre','Soirée des bénévoles')+IMG+Dt('a-d1','Date de début',1)+`<div class="fld"><label for="a-d2">Date de fin</label><input type="date" id="a-d2" value="${isoIn(7)}" hidden><label class="chk" for="a-same"><input type="checkbox" id="a-same" checked data-hide="a-d2">Même jour</label></div><div class="two">${Sel('a-h1','Heure de début',HOURS,'14 h')}${Sel('a-h2','Heure de fin',HOURS,'18 h')}</div>`+F('a-place','Lieu','Club-house')+T('a-body','Description','Le programme en deux phrases')+`<div class="fld"><span class="lb">Inscription</span><div class="radio"><label for="a-reg-int"><input type="radio" name="a-reg" value="int" id="a-reg-int" checked>Dans l'appli</label><label for="a-reg-ext"><input type="radio" name="a-reg" value="ext" id="a-reg-ext">Sur Ten'Up</label></div></div><div id="ev-int">${Sel('ev-cap',"Places (au-delà : liste d'attente)",['Sans limite','10','20','30','40','50','80','100'])}</div><div id="ev-ext" hidden>${O('a-ten',"Lien Ten'Up de l'événement",'https://tenup.fft.fr/…')}</div>`+O('a-pay','Lien de paiement (HelloAsso…, facultatif)','https://www.helloasso.com/…')+visBlock(),"Publier l'événement"],
  comm:['Créer une commission',F('a-title','Nom','Commission bénévoles')+T('a-body','Description','Son rôle en deux phrases')+Who('a-cap','Responsable',adults()),'Créer la commission'],
  chan:['Créer un groupe de discussion',F('a-title','Nom','Covoiturage')+F('a-body','Description','Organiser les trajets des matchs')+Sel('c-g','Rubrique',['Club','Entraînements','Équipes'])+`<div class="fld"><label class="chk" for="c-ro"><input type="checkbox" id="c-ro">Seul le bureau peut écrire (groupe d'annonces)</label></div>`,'Créer le groupe'],
  commpromo:['Promouvoir la commission',F('a-title','Titre','',cm?'Rejoins la '+cm.name.toLowerCase():'')+T('a-body','Description','',cm?cm.desc:'')+IMG+`<p class="muted small">Les adhérents répondent « Ça m'intéresse » ou « Peut-être », et le responsable est prévenu.</p>`,'Publier sur le mur'],
  partner:['Ajouter un partenaire',F('a-title',"Nom de l'entreprise",'Garage des Tilleuls')+`<div class="fld"><label for="a-body">Description (facultative)</label><textarea id="a-body" placeholder="Activité, lien avec le club…"></textarea></div><div class="fld"><label for="a-img">Logo</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" hidden></div></div>`,'Ajouter le partenaire'],
  ad:['Mettre en avant nos partenaires',F('a-title','Titre du bandeau','','Nos partenaires')+Sel('ad-col','Couleur du bandeau',['Jaune','Rouge'])+`<div class="fld"><span class="lb">Partenaires à mettre en avant</span>${PARTNERS.map(x=>`<label class="chk"><input type="checkbox" name="ad-p" value="${x.id}" checked>${x.name}</label>`).join('')||'<p class="muted small">Ajoute d\'abord un partenaire.</p>'}</div><p class="muted small">Le bandeau défile sur le mur, sur fond plein, pour se démarquer des publications.</p>`,'Publier le bandeau'],
  tournoi:['Nouveau tournoi',F('a-title','Nom du tournoi',"Open d'hiver")+IMG+`<div class="two">${Sel('tr-sport','Sport',['Tennis','Padel'])}${Sel('tr-gen','Tableau',['Hommes','Femmes','Mixte'])}</div>`
   +`<div class="two">${Sel('tr-pub','Public',['Adultes','Jeunes','Seniors +'])}<div id="tr-vet" hidden>${Sel('tr-vet-s','Catégorie',['+35 ans','+45 ans','+55 ans','+65 ans','+75 ans'],'+45 ans')}</div></div>`
   +`<div class="two" id="tr-jeunes" hidden>${Sel('tr-a1','Âge de',Array.from({length:12},(_,i)=>(i+7)+' ans'),'11 ans')}${Sel('tr-a2','à',Array.from({length:12},(_,i)=>(i+7)+' ans'),'12 ans')}</div>`
   +`<div id="tr-tennis" class="stack">${Sel('tr-fmt','Format',['Traditionnel','TMC (multi-chances)'])}<div class="fld"><label class="chk" for="tr-open"><input type="checkbox" id="tr-open" checked data-hide="tr-range">Open : tous classements</label></div><div class="two" id="tr-range" hidden>${Sel('tr-lo','Classement de',RANKS,'30/2')}${Sel('tr-hi','à',RANKS,'15/1')}</div></div>`
   +`<div id="tr-padel" hidden>${Sel('tr-cat','Catégorie de tournoi',['P25','P50','P100','P250','P500','P1000'],'P100')}</div>`
   +Sel('tr-max','Nombre de participants maximum',['Sans limite','8','12','16','24','32','48','64','96','128'])
   +Dt('a-d1','Date de début',1)+`<div class="fld"><label for="a-d2">Date de fin</label><input type="date" id="a-d2" value="${isoIn(8)}" hidden><label class="chk" for="a-same"><input type="checkbox" id="a-same" checked data-hide="a-d2">Sur une seule journée</label></div>`
   +`<div class="two">${Sel('a-h1','Début des matchs',HOURS,'9 h')}${Dt('tr-dl','Fin des inscriptions',1,isoIn(4))}</div>`+F('a-place','Lieu','Au club')
   +`<div class="fld"><label for="a-body">Description (facultative)</label><textarea id="a-body" placeholder="Dotation, balles, restauration…"></textarea></div>`+O('tr-url',"Lien Ten'Up du tournoi",'https://tenup.fft.fr/…')+`<div class="note">Les joueurs s'inscrivent sur Ten'Up : la publication affiche un bouton qui ouvre ce lien.</div>`,'Publier le tournoi'],
  cta:['Nouvelle publication avec lien',F('a-title','Titre','Revivez la finale en vidéo')+T('a-body','Description','Ce que les adhérents trouveront derrière le bouton')+F('a-label','Texte du bouton','Voir la vidéo')+`<div class="fld"><label for="a-url">Lien</label><input id="a-url" required inputmode="url" placeholder="https://www.youtube.com/…" autocomplete="off"></div>`+IMG+visBlock(),'Publier sur le mur'],
  poll:['Nouveau sondage',F('a-title','Question','Quel jour pour la fête du club ?')+F('a-o1','Réponse 1','Samedi')+F('a-o2','Réponse 2','Dimanche')+[3,4,5,6].map(n=>O('a-o'+n,`Réponse ${n} (facultative)`,'')).join('')+`<div class="fld"><label for="a-close">Clôture du sondage (facultative)</label><input type="date" id="a-close"></div>`+visBlock(),'Publier le sondage'],
  article:['Nouvelle actu',Sel('a-cat','Rubrique',['Vie du club','Compétition','Jeunes','Padel','Portrait'])+F('a-title','Titre',"L'équipe 1 monte en Régional 1")+F('a-lead','Chapeau',"L'essentiel en une phrase")+T('a-body','Texte','Un paragraphe par ligne')+IMG+Sel('v-sport','Sport concerné',['Tennis et padel','Tennis','Padel']),'Publier dans les actus'],
  champ:['Créer un championnat',F('a-title','Nom','Interclubs de printemps')+`<div class="two">${Sel('a-sport','Sport',['Tennis','Padel'])}${Sel('a-age','Catégorie',['Adultes','Jeunes'])}</div>`+O('a-season','Saison','Printemps 2027'),'Créer le championnat'],
  team:['Ajouter une équipe',F('a-title','Nom','Équipe 3')+`<div class="two">${F('a-sub','Division','Départemental 2')}${Sel('a-gen','Genre',['Hommes','Femmes','Mixte'])}</div>`+Who('a-cap','Capitaine',adults()),"Créer l'équipe"],
  train:['Créer un groupe',F('a-title','Nom','Adultes loisir')+`<div class="two">${Sel('t-sport','Sport',['Tennis','Padel'])}${Sel('t-day','Jour',['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'],'Jeudi')}</div><div class="two">${Sel('a-h1','Heure de début',HOURS,'19 h')}${Sel('t-dur','Durée du cours',['1 h','1 h 30'],'1 h 30')}</div><div class="two">${Who('t-coach','Enseignant',coaches)}${Sel('a-gen','Public',['Mixte','Hommes','Femmes'])}</div>${Sel('t-loc','Lieu habituel',['Extérieur','En salle'])}<div class="two">${Sel('v-lo','Classement de',RANKS,'NC')}${Sel('v-hi','à',RANKS,'15')}</div><p class="muted small">Le groupe est créé vide. Sa page te propose ensuite les adhérents qui correspondent à ces critères.</p>`,'Créer le groupe'],
  fixture:['Ajouter une rencontre',F('a-opp','Adversaire','TC Égletons')+Dt('a-d1','Date',1)+`<div class="two">${Sel('a-h1','Heure',HOURS,'14 h')}${Sel('a-loc','Lieu',['À domicile',"À l'extérieur"])}</div>`+O('a-comp','Journée','Journée 5'),'Ajouter au calendrier'],
  play:['Chercher une partie',Sel('p-sport','Sport',['Tennis','Padel'])+Dt('a-d1','Date',1)+`<div class="two">${Sel('a-h1','Heure',HOURS,'18 h')}${Sel('a-dur','Durée du créneau',['1 h','1 h 30','2 h'],'1 h 30')}</div><div class="two">${Sel('a-fmt','Format',['Simple','Double'])}${Sel('a-pl','Places (en double)',['1','2','3'],'3')}</div><div class="two" id="p-rk">${Sel('v-lo','Classement de',RANKS,'30/1')}${Sel('v-hi','à',RANKS,'15/1')}</div><div class="two" id="p-lv" hidden>${Sel('l-lo','Niveau de',LV,'Niveau 4')}${Sel('l-hi','à',LV,'Niveau 6')}</div><p class="muted small">Seuls les adhérents de cette fourchette voient ta recherche et sont notifiés. En simple, une seule place. Le padel se joue toujours en double.</p><p class="muted small">${LVHELP}</p>`,'Publier ma recherche']
 })[k]}

/* ---------- actions ---------- */
const A={
 tab(d){const o=['home','chans','agenda','ecole','club','me'];S.dir=d.t===S.tab&&!S.stack.length?0:S.stack.length||o.indexOf(d.t)<o.indexOf(S.tab)?-1:1;S.tab=d.t;S.stack=[];render()},
 back(){S.dir=-1;S.stack.pop();render()},
 open(d){closeSheet();S.dir=1;S.stack.push({v:d.v,id:d.id});if(d.v==='chan')chans.find(c=>c.id===d.id).un=0;if(d.v==='grp')S.grpAll=false;render()},
 goClub(d){S.dir=1;S.tab='club';S.clubTab=d.t;S.stack=[];render()},
 member(d){closeSheet();if(d.id===ME()){A.tab({t:'me'});return}S.dir=1;S.stack.push({v:'member',id:d.id});render()},
 admin(){closeSheet();S.dir=1;S.stack.push({v:'admin'});render()},
 seg(d,el){if(S[d.k]===d.val)return;if(el){const b=[...el.parentNode.children];S.dir=b.indexOf(el)>b.findIndex(x=>x.getAttribute('aria-selected')==='true')?1:-1}S[d.k]=d.val;render()},
 close(){closeSheet()},
 toast(d){toast(d.msg)},
 like(d){if(S.liked.has(d.id))S.liked.delete(d.id);else{S.liked.add(d.id);S.pop=d.id}render(true);S.pop=null},
 comments(d){sheet('Commentaires',commentsBody(posts.find(p=>p.id===d.id)))},
 follow(d){if(isMinor(d.id))return;const on=!S.follow.has(d.id);on?S.follow.add(d.id):S.follow.delete(d.id);render(true);toast(on?`Tu suis ${first(d.id)} : tu seras notifié de ses résultats et de ses messages`:`Tu ne suis plus ${first(d.id)}`)},
 notifs(){if(pending()){toast("Les notifications s'ouvriront quand le club aura validé ton accès");return}sheet('Notifications',`<div class="body">${NOTIFS.length?NOTIFS.map((n,i)=>{if(S.blocked.has(n.by)||!nVis(n))return '';const r=n.conv&&recs.find(x=>x.id===n.conv),c=r&&r.conv&&r.conv[ME()];return r&&r.st==='soon'&&r.lineup&&r.lineup[ME()]?`<div class="msg nrow">${av(n.by,'sm')}<span class="grow"><span class="nm">${name(n.by)}</span> ${n.txt}<br><time>${n.t}</time><span class="ctl" style="margin-top:8px"><button class="btn sm grow ${c==='ok'?'':'ghost'}" data-a="conv" data-r="${r.id}" data-s="ok">Je suis dispo</button><button class="btn sm grow ${c==='no'?'hot':'ghost'}" data-a="conv" data-r="${r.id}" data-s="no">Pas dispo</button></span><button class="nm" data-a="ngo" data-i="${i}" style="color:var(--accent)">Voir la rencontre</button></span></div>`:`<button class="msg nrow" data-a="ngo" data-i="${i}">${av(n.by,'sm')}<span class="grow"><span class="nm">${name(n.by)}</span> ${n.txt}<br><time>${n.t}</time></span>${n.n?'<span class="st no">Nouveau</span>':''}</button>`}).join(''):empty('bell','Aucune notification','Suis des adhérents pour être prévenu de leurs résultats.')}<div class="note">Tu choisis ce que tu reçois dans ton profil, rubrique « Mes notifications ».</div></div>`);$('sheet').classList.add('side');NOTIFS.forEach(n=>n.n=0);render(true)},
 commAsk(d){const c=COMMS.find(c=>c.id===d.id),me=ME(),i=c.req.indexOf(me);if(i>=0){c.req.splice(i,1);render(true);toast('Demande annulée');return}c.req.push(me);render(true);toast('Demande envoyée · le responsable, les membres et le bureau sont prévenus')},
 commReq(d){const c=COMMS.find(c=>c.id===d.id),i=c.req.indexOf(d.u);if(i>=0)c.req.splice(i,1);if(d.ok&&!c.mem.includes(d.u))c.mem.push(d.u);NOTIFS.forEach(n=>{if(n.go&&n.go.v==='comm'&&n.go.id===c.id&&n.by===d.u)n.n=0});render(true);toast(d.ok?`${first(d.u)} rejoint la ${c.name.toLowerCase()} · prévenu`:`Demande de ${first(d.u)} refusée · prévenu`)},
 commLeave(d){const c=COMMS.find(c=>c.id===d.id),i=c.mem.indexOf(ME());if(i>=0)c.mem.splice(i,1);render(true);toast(`Tu as quitté la ${c.name.toLowerCase()}`)},
 delPartner(d){const i=PARTNERS.findIndex(x=>x.id===d.id);if(i<0)return;const x=PARTNERS.splice(i,1)[0],ads=posts.filter(p=>p.kind==='ad').map(p=>[p,p.partners.slice()]);ads.forEach(([p])=>p.partners=p.partners.filter(y=>y!==d.id));render(true);toast('Partenaire retiré',()=>{PARTNERS.splice(i,0,x);ads.forEach(([p,l])=>p.partners=l)})},
 ngo(d){const n=NOTIFS[+d.i],g=n&&n.go;closeSheet();if(!n)return;if(!g){if(n.by!=='club')A.member({id:n.by});return}
  if(g.v==='ecole'||(g.v==='agenda'&&g.ag==='cours')){S.ecTab='mine';A.tab({t:'ecole'});return}
  if(g.v==='agenda'){A.tab({t:'agenda'});return}
  const ok=g.v==='rec'?recs.some(r=>r.id===g.id):g.v==='post'?posts.some(p=>p.id===g.id&&(canSee(p)||p.arch)):g.v==='chan'?chans.some(c=>c.id===g.id&&chanOk(c)):true;
  if(ok)A.open(g);else toast("Ce contenu n'est plus disponible")},
 unattach(){S.img=null;showAtt();const i=$('m-img');if(i)i.value=''},
 unreply(){S.reply=null;showAtt()},
 undo(){const f=undoFn;undoFn=null;document.querySelectorAll('.tst.on').forEach(x=>{if(x.querySelector('.undo'))banHide(x)});if(f){f();render(true);toast('Suppression annulée')}},
 cmenu(d){const p=posts.find(p=>p.id===d.id),c=p&&p.com[+d.i];if(!c)return;const mine=c.by===ME(),at=`data-id="${p.id}" data-i="${d.i}"`,items=[(mine||isAdmin())&&['trash','Supprimer le commentaire','cdel',at,1],!mine&&['flag','Signaler ce commentaire','creport',at],!mine&&c.by!=='club'&&['block','Bloquer '+first(c.by),'block',`data-id="${c.by}"`,1]].filter(Boolean);
  sheet('Commentaire',`<div class="body"><div class="reacts big">${['👍','❤️','😂','👏','🎾'].map(e=>`<button class="react ${c.my===e?'on':''}" data-a="creact" ${at} data-e="${e}" aria-label="Réagir avec ${e}">${e}</button>`).join('')}</div><div class="menu">${items.map(i=>`<button class="${i[4]?'danger':''}" data-a="${i[2]}" ${i[3]||''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`)},
 creact(d){const p=posts.find(p=>p.id===d.id),c=p&&p.com[+d.i];if(!c)return;c.re=c.re||{};const e=d.e,was=c.my;if(was){c.re[was]--;if(c.re[was]<=0)delete c.re[was]}if(was===e)c.my=null;else{c.re[e]=(c.re[e]||0)+1;c.my=e}sheet('Commentaires',commentsBody(p),true)},
 loc(d){const g=grp(d.g);g.loc=g.loc||{};const nl=locOf(g,d.d)==='En salle'?'Extérieur':'En salle';g.loc[d.d]=nl;NOTIFS.unshift({by:g.coach,txt:`${g.name} du ${fmtD(d.d)} : le cours aura lieu ${nl==='En salle'?'en salle':'en extérieur'}`,t:"À l'instant",n:1,go:{v:'agenda',ag:'cours'},to:g.mem.slice()});render(true);toast(`Cours du ${fmtD(d.d)} ${nl==='En salle'?'en salle':'en extérieur'} · ${g.mem.length} élève${g.mem.length>1?'s':''} et leurs parents notifiés`)},
 cresp(d){const g=grp(d.g);g.resp=g.resp||{};const r=g.resp[d.d]=g.resp[d.d]||{};r[d.u]=r[d.u]===d.s?'':d.s;if(r[d.u]!=='no'&&g.abs&&g.abs[d.d])g.abs[d.d]=g.abs[d.d].filter(x=>x!==d.u);render(true);toast(r[d.u]==='ok'?"Présence confirmée · l'enseignant est prévenu":r[d.u]==='no'?"Absence signalée · l'enseignant est prévenu":'Réponse retirée')},
 cdel(d){const p=posts.find(p=>p.id===d.id),i=+d.i,c=p.com.splice(i,1)[0];closeSheet();render(true);toast('Commentaire supprimé',()=>p.com.splice(i,0,c))},
 creport(d){const p=posts.find(p=>p.id===d.id),c=p.com[+d.i];REPORTS.push({kind:'com',author:c.by,by:ME(),excerpt:esc(c.x),com:c,pid:p.id});closeSheet();toast('Signalement envoyé au bureau du club')},
 react(d){const l=msgList(d.ref),m=l&&l[+d.i];if(!m)return;m.re=m.re||{};const e=d.e,was=m.my;if(was){m.re[was]--;if(m.re[was]<=0)delete m.re[was]}if(was===e)m.my=null;else{m.re[e]=(m.re[e]||0)+1;m.my=e}if(!comBack(d.ref))closeSheet();render(true)},
 reply(d){const l=msgList(d.ref),m=l&&l[+d.i];if(!m)return;S.reply={by:m.by,x:m.x||'Photo'};closeSheet();showAtt();const i=$('msg-input');if(i)i.focus()},
 pin(d){const p=posts.find(p=>p.id===d.id);p.pin=!p.pin;closeSheet();render(true);toast(p.pin?'Publication épinglée en haut du mur':'Publication détachée du haut du mur')},
 ics(d){const p=posts.find(p=>p.id===d.id),dt=s=>s.replace(/-/g,''),t=h=>{const m=hMin(h);return String(Math.floor(m/60)).padStart(2,'0')+String(m%60).padStart(2,'0')+'00'},allDay=p.d2||!p.h1;
  const body=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RAM Club//FR','BEGIN:VEVENT','UID:'+p.id+'@appli-club','DTSTAMP:'+dt(TODAY)+'T000000Z',allDay?'DTSTART;VALUE=DATE:'+dt(p.d):'DTSTART:'+dt(p.d)+'T'+t(p.h1),allDay?'DTEND;VALUE=DATE:'+dt(isoIn(1,p.d2||p.d)):'DTEND:'+dt(p.d)+'T'+t(p.h2||p.h1),'SUMMARY:'+p.title.replace(/<[^>]+>/g,''),'LOCATION:'+p.place,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'text/calendar'}));a.download='evenement.ics';document.body.appendChild(a);a.click();a.remove();toast("Ouvre le fichier pour l'ajouter à ton agenda")}catch(e){toast("Ajout à l'agenda impossible ici")}},
 relance(d){const r=recs.find(r=>r.id===d.r),n=Object.keys(r.lineup||{}).filter(p=>((r.conv||{})[p]||'wait')==='wait').length;toast(`Relance envoyée à ${n} joueur${n>1?'s':''}`)},
 recTab(d){S.recTab=d.k;render(true)},
 planMine(){S.plan.mine=!S.plan.mine;render(true)},
 clubInfo(){const I2=CLUBINFO,num=a=>a.map(String);sheet('Infos du club',`<form class="body" id="info-form"><div class="two">${Sel('i-courts','Courts de tennis',num([0,1,2,3,4,5,6,7,8,9,10,12,15]),String(I2.courts))}${Sel('i-pistes','Pistes de padel',num([0,1,2,3,4,5,6,8]),String(I2.pistes))}</div>${F('i-house','Horaires du club-house','',I2.house)}${F('i-secr','Horaires du secrétariat','',I2.secr)}${F('i-addr','Adresse','',I2.addr)}<span class="lb">Tarifs</span>${FORM.map((f,i)=>`<div class="two">${O('i-fn'+i,'Formule','',f[0])}${O('i-fp'+i,'Prix','',f[2])}</div>`).join('')}${O('i-book','Lien de réservation des courts','https://…',I2.book)}${O('i-pay','Lien de paiement de la cotisation (HelloAsso…)','https://…',I2.pay)}${O('i-shop','Lien de la boutique','https://…',I2.shop)}<div class="fld"><span class="lb">Modules</span><label class="chk" for="i-actus"><input type="checkbox" id="i-actus" ${I2.mods.actus?'checked':''}>Actus (articles)</label><label class="chk" for="i-comm"><input type="checkbox" id="i-comm" ${I2.mods.comm?'checked':''}>Commissions</label><p class="muted small">Un petit club peut masquer les modules dont il n'a pas besoin.</p></div><button class="btn full">Enregistrer</button></form>`)},
 readh(){const me=ME();if(JOINREQ.some(j=>j.id===me))return;JOINREQ.push({id:me,n:M[me].n,mail:(M[me].n||'').toLowerCase().replace(/[^a-z]+/g,'.')+'@exemple.fr',via:"une reprise d'adhésion"});NOTIFS.unshift({by:me,txt:`a repris son adhésion et demande à retrouver l'accès à l'appli pour la saison ${S.season}`,t:"À l'instant",n:1,staff:1,go:{v:'join'}});render(true);toast('Demande envoyée · le bureau va réactiver ton accès')},
 revalid(d){VALID[d.id]=S.season;NOTIFS.unshift({by:'club',txt:`a validé ton adhésion pour la saison ${S.season} : tout l'appli t'est de nouveau ouverte`,t:"À l'instant",n:1,to:[d.id],mine:1});render(true);toast(`${first(d.id)} retrouve l'accès à l'appli pour ${S.season}`)},
 joinOk(d){const j0=JOINREQ[+d.i];if(j0&&j0.id&&M[j0.id]){JOINREQ.splice(+d.i,1);A.revalid({id:j0.id});return}const j=JOINREQ.splice(+d.i,1)[0],id='u'+Date.now();VALID[id]=S.season;M[id]={n:j.n,r:'NC',team:'Nouvel adhérent',fol:0,g:'H',bd:'1990-01-01',res:[]};CLUBINFO.joined++;render(true);toast(`${j.n} a rejoint l'appli · prévenu par e-mail`)},
 joinNo(d){const j=JOINREQ.splice(+d.i,1)[0];render(true);toast(`Demande de ${j.n} refusée`)},
 impSend(){const n=(S.imp||[]).length;S.invited=(S.invited||0)+n;S.imp=null;render(true);toast(`${n} invitation${n>1?'s':''} envoyée${n>1?'s':''} par e-mail`)},
 kidVis(d){M[d.id].resVis=d.v;render(true);toast(d.v==='club'?`Les résultats de ${first(d.id)} sont visibles par tout le club`:`Les résultats de ${first(d.id)} ne sont visibles que de son groupe et de ses encadrants`)},
 photoOk(d){M[d.id].photoOk=!M[d.id].photoOk;render(true);toast(M[d.id].photoOk?'Autorisation photo donnée':'Autorisation photo retirée')},
 absence(d){const k=d.id,ss=nextSessions(k,3);if(!ss.length){toast('Aucun cours à venir');return}sheet('Signaler une absence',`<form class="body" id="abs-form" data-k="${k}"><div class="fld"><label for="abs-s">Cours</label><select id="abs-s">${ss.map(s=>`<option value="${s.g.id}|${s.iso}">${s.g.name} · ${fmtD(s.iso)} · ${s.g.h}</option>`).join('')}</select></div>${O('abs-why','Motif (facultatif)','Malade, voyage scolaire…')}<button class="btn full">Prévenir l'enseignant</button></form>`)},
 parent2(d){sheet('Inviter le second parent',`<form class="body" id="p2-form" data-k="${d.id}"><div class="fld"><label for="p2-mail">E-mail du second parent</label><input id="p2-mail" type="email" required autocomplete="off"></div><p class="muted small">Il recevra une invitation pour suivre ${first(d.id)} avec les mêmes droits que toi.</p><button class="btn full">Envoyer l'invitation</button></form>`)},
 kidDel(d){sheet('Supprimer le compte de '+first(d.id),`<form class="body" id="kdel-form" data-k="${d.id}"><div class="note">Le compte, les résultats et les inscriptions de ${first(d.id)} seront supprimés sous 30 jours. Ses messages resteront affichés sous le nom « Ancien membre ».</div><div class="fld"><label class="chk" for="kdel-ok"><input type="checkbox" id="kdel-ok" required>Je confirme, en tant que représentant légal.</label></div><button class="btn full hot">Supprimer le compte</button></form>`)},
 att(d){const g=grp(d.id);g.att=g.att||{};const a=g.att[d.d]=g.att[d.d]||{},v=d.s==='1';a[d.u]=a[d.u]===v?undefined:v;render(true)},
 cancelCourse(d){const g=grp(d.id);g.cancel=g.cancel||[];const i=g.cancel.indexOf(d.d),off=i<0;if(off)g.cancel.push(d.d);else g.cancel.splice(i,1);NOTIFS.unshift({by:g.coach,txt:`${g.name} du ${fmtD(d.d)} : ${off?'cours annulé':'cours rétabli'}`,t:"À l'instant",n:1,go:{v:'agenda',ag:'cours'},to:g.mem.slice()});render(true);toast(off?`Cours du ${fmtD(d.d)} annulé · ${g.mem.length} élève${g.mem.length>1?'s':''} et leurs parents notifiés`:'Cours rétabli · élèves et parents notifiés')},
 grpBulk(d){const g=grp(d.g),ids=d.ids.split(',').filter(Boolean);ids.forEach(x=>{if(!g.mem.includes(x))g.mem.push(x)});render(true);toast(`${ids.length} adhérent${ids.length>1?'s':''} ajouté${ids.length>1?'s':''} à ${g.name} et prévenu${ids.length>1?'s':''}`)},
 plus(){if(pending()){toast('Tu pourras publier dès que le club aura validé ton accès');return}const st=isAdmin(),coach=S.role==='coach',mng=st||S.role==='cap',it=[['score','Ajouter un résultat','result'],S.role!=='kid'&&['search','Chercher une partie','newPost','data-k="play"'],st&&['info','Annonce','newPost','data-k="annonce"'],st&&['cal','Événement','newPost','data-k="event"'],coach&&['ball','Stage','newPost','data-k="stage"'],coach&&['school',"Groupe d'entraînement",'newPost','data-k="train"'],st&&['score','Tournoi','newPost','data-k="tournoi"'],st&&['poll','Sondage','newPost','data-k="poll"'],st&&['link','Publication avec lien','newPost','data-k="cta"'],st&&['club','Mettre en avant nos partenaires','newPost','data-k="ad"'],st&&CLUBINFO.mods.actus&&['news','Actu','newPost','data-k="article"'],...myComms().map(c=>['flag','Promouvoir · '+c.name,'newPost',`data-k="commpromo" data-c="${c.id}"`])].filter(Boolean);
  sheet('Publier',`<div class="body"><div class="menu">${it.map(i=>`<button data-a="${i[2]}" ${i[3]||''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`)},
 newPost(d){const [t,b,cta]=forms(d.k,d.c);S.img=null;sheet(t,`<form class="body" id="adm-form" data-k="${d.k}" data-c="${d.c||''}">${b}<button class="btn full">${cta}</button></form>`)},
 /* publications : menu, modification, suppression, signalement */
 pmenu(d){const p=posts.find(p=>p.id===d.id),mine=p.by===ME(),adm=isAdmin(),ev=p.kind==='event'&&adm&&!p.done&&!p.arch,at=`data-id="${p.id}"`;
  const rr=p.kind==='result'&&recs.find(r=>r.id===p.rec),rg=rr&&grp(rr.tid),rok=rr&&(adm||(rg&&(rg.cap===ME()||rg.mem.includes(ME()))));
  menuSheet('Options',[rok&&['image',rr.img?'Changer la photo de la rencontre':'Ajouter une photo','rimg',`data-id="${rr.id}"`],ev&&p.reg!=='ext'&&['users','Voir les inscrits','evList',at],ev&&p.reg!=='ext'&&['check',p.closed?'Rouvrir les inscriptions':'Clore les inscriptions','evClose',at],ev&&['image',"Terminer l'événement",'evDone',at],adm&&p.kind!=='ad'&&['flag',p.pin?'Détacher du haut du mur':'Épingler en haut du mur','pin',at],
   (mine||adm)&&['annonce','event','cta','poll','comm'].includes(p.kind)&&!p.arch&&['edit','Modifier','pedit',at],(mine||adm)&&['trash','Supprimer','pdel',at,1],
   !mine&&['flag','Signaler cette publication','preport',at],!mine&&p.by!=='club'&&['block','Bloquer '+first(p.by),'block',`data-id="${p.by}"`,1]])},
 rimg(d){S.img=null;const r=recs.find(r=>r.id===d.id);if(!r)return;sheet('Photo de la rencontre',`<form class="body" id="rimg-form" data-id="${r.id}"><p class="muted small">${teamName(grp(r.tid))} contre ${r.opp} · la photo s'affiche avec le résultat sur le mur et dans le détail de la rencontre.</p><div class="fld"><label for="a-img">${r.img?'Choisir une autre photo':'Choisir une photo'}</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" ${r.img?`style="background-image:url(${r.img})"`:'hidden'}></div>${r.img?`<label class="chk" for="r-noimg"><input type="checkbox" id="r-noimg">Retirer la photo</label>`:''}</div><button class="btn full">Enregistrer</button></form>`)},
 pedit(d){S.img=null;const p=posts.find(p=>p.id===d.id),plain=s=>String(s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  sheet('Modifier',`<form class="body" id="edit-form" data-id="${p.id}">${p.kind==='poll'?F('e-title','Question','',plain(p.q)):F('e-title','Titre','',plain(p.title))+T('e-body','Texte','',plain(p.body))}${p.kind==='event'?F('e-place','Lieu','',plain(p.place)):''}${p.kind==='poll'?'':`<div class="fld"><label for="a-img">${p.img?'Remplacer la photo de couverture':'Ajouter une photo de couverture'}</label><input type="file" id="a-img" accept="image/*"><div class="prev" id="a-prev" ${p.img?`style="background-image:url(${p.img})"`:'hidden'}></div>${p.img?`<label class="chk" for="e-noimg"><input type="checkbox" id="e-noimg">Retirer la photo</label>`:''}</div>`}<button class="btn full">Enregistrer</button></form>`)},
 pdel(d){const i=posts.findIndex(p=>p.id===d.id);if(i<0)return;const p=posts.splice(i,1)[0];closeSheet();if(view().v==='post')S.stack.pop();render(true);toast('Publication supprimée',()=>posts.splice(i,0,p))},
 preport(d){const p=posts.find(p=>p.id===d.id);REPORTS.push({kind:'post',author:p.by,by:ME(),excerpt:esc(String(p.title||p.q||p.body||(p.res&&p.res.sc)||'Publication').replace(/<[^>]+>/g,'')),post:p.id});closeSheet();toast('Signalement envoyé au bureau du club')},
 block(d){S.blocked.add(d.id);S.follow.delete(d.id);closeSheet();render(true);toast(`${first(d.id)} est bloqué : tu ne vois plus ses publications ni ses messages`)},
 unblock(d){S.blocked.delete(d.id);render(true);toast(`${first(d.id)} est débloqué`)},
 umenu(d){menuSheet(name(d.id),[['flag','Signaler ce profil','toast','data-msg="Signalement envoyé au bureau du club"'],S.blocked.has(d.id)?['check','Débloquer','unblock',`data-id="${d.id}"`]:['block','Bloquer '+first(d.id),'block',`data-id="${d.id}"`,1]])},
 mmenu(d){try{localStorage.setItem('club-lp-help','1')}catch(e){}const h=$('lp-help');if(h)h.remove();const l=msgList(d.ref),m=l&&l[+d.i];if(!m)return;const mine=m.by===ME(),at=`data-ref="${d.ref}" data-i="${d.i}"`,items=[!d.ref.startsWith('p:')&&['com','Répondre','reply',at],(mine||isAdmin())&&['trash','Supprimer le message','mdel',at,1],!mine&&['flag','Signaler ce message','mreport',at],!mine&&m.by!=='club'&&['block','Bloquer '+first(m.by),'block',`data-id="${m.by}"`,1]].filter(Boolean);
  sheet('Message',`<div class="body"><div class="reacts big">${['👍','❤️','😂','👏','🎾'].map(e=>`<button class="react ${m.my===e?'on':''}" data-a="react" ${at} data-e="${e}" aria-label="Réagir avec ${e}">${e}</button>`).join('')}</div><div class="menu">${items.map(i=>`<button class="${i[4]?'danger':''}" data-a="${i[2]}" ${i[3]||''}>${ic(i[0])}${i[1]}</button>`).join('')}</div></div>`)},
 mdel(d){const l=msgList(d.ref);if(!l)return;const i=+d.i,m=l.splice(i,1)[0];if(!comBack(d.ref))closeSheet();render(true);toast(d.ref.startsWith('p:')?'Commentaire supprimé':'Message supprimé',()=>{l.splice(i,0,m);comBack(d.ref)})},
 mreport(d){const l=msgList(d.ref),m=l[+d.i];REPORTS.push({kind:'msg',author:m.by,by:ME(),excerpt:esc(m.x||'Photo'),msg:m,ref:d.ref});closeSheet();toast('Signalement envoyé au bureau du club')},
 repDel(d){const r=REPORTS.splice(+d.i,1)[0];if(r.kind==='post'){const i=posts.findIndex(p=>p.id===r.post);if(i>=0)posts.splice(i,1)}else if(r.kind==='com'){const p=posts.find(p=>p.id===r.pid),i=p?p.com.indexOf(r.com):-1;if(i>=0)p.com.splice(i,1)}else{const l=msgList(r.ref),i=l?l.indexOf(r.msg):-1;if(i>=0)l.splice(i,1)}render(true);toast('Contenu supprimé')},
 repIgn(d){REPORTS.splice(+d.i,1);render(true);toast('Signalement classé')},
 photo(d,el){const u=el.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g,'');closeSheet();const b=document.createElement('div');b.className='back anim viewer';b.id='sheet';b.innerHTML=`<button class="ib vclose" data-a="close" aria-label="Fermer la photo">${ic('x')}</button><img class="pz" src="${u}" alt="Photo en plein écran" draggable="false">`;$('layer').appendChild(b);pinchZoom(b.querySelector('.pz'))},
 /* événements, sondages, parties */
 rsvp(d){const p=posts.find(p=>p.id===d.id);p.my=p.my===d.r?null:d.r;render(true);toast(p.kind==='comm'?(p.my?'Noté · le responsable de la commission est prévenu':'Réponse retirée'):p.my==='yes'?'Tu es inscrit · le club est prévenu':p.my==='maybe'?'Noté en peut-être':p.my==='wait'?"Tu es sur la liste d'attente · prévenu si une place se libère":'Inscription retirée')},
 evClose(d){const p=posts.find(p=>p.id===d.id);p.closed=!p.closed;closeSheet();render(true);toast(p.closed?'Inscriptions closes · les inscrits sont conservés':'Inscriptions rouvertes')},
 evList(d){const p=posts.find(p=>p.id===d.id),l=(p.ins||[]).concat(p.my==='yes'?[ME()]:[]),rest=Math.max(0,(p.yes||0)-(p.ins||[]).length),txt=l.map(name).join('\n');
  sheet('Inscrits',`<div class="body"><span class="kicker">${(p.yes||0)+(p.my==='yes'?1:0)} inscrits · ${(p.maybe||0)+(p.my==='maybe'?1:0)} peut-être</span><div>${l.map(i=>`<div class="item">${av(i,'sm')}<span class="grow"><span class="nm">${name(i)}</span> ${bd(i,p.sport)}</span></div>`).join('')}${rest?`<p class="muted small" style="padding-top:10px">et ${rest} autres adhérents (non détaillés dans cette démo).</p>`:''}</div><button class="btn full ghost" data-a="copy" data-txt="${esc(txt)}">Copier la liste des noms</button></div>`)},
 setupGo(d){closeSheet();S.stack=[];if(d.k==='champ'){S.tab='club';S.clubTab='teams';S.recTab='champ'}else{S.tab='ecole';S.ecTab='manage'}render()},
 copy(d){if(/Rejoins/.test(d.txt||''))(S.setup=S.setup||{}).inv=true;(navigator.clipboard?navigator.clipboard.writeText(d.txt):Promise.reject()).then(()=>toast('Liste copiée')).catch(()=>toast('Copie impossible ici : sélectionne les noms à la main'))},
 evDone(d){S.imgs=[];sheet("Terminer l'événement",`<form class="body" id="done-form" data-id="${d.id}"><div class="note">L'événement repasse en haut du mur avec le badge « Terminé », ton commentaire et les photos. Les commentaires des adhérents sont conservés, y compris dans les archives.</div><div class="fld"><label for="d-txt">Le mot du club (facultatif)</label><textarea id="d-txt" placeholder="Merci aux 60 participants, bravo aux vainqueurs…"></textarea></div><div class="fld"><label for="d-ph">Photos (10 maximum)</label><input type="file" id="d-ph" accept="image/*" multiple><div class="gal" id="d-prev"></div></div><button class="btn full">Terminer et publier sur le mur</button></form>`)},
 vote(d){const p=posts.find(p=>p.id===d.id);p.my=p.my===+d.i?null:+d.i;render(true)},
 play(d){const p=posts.find(p=>p.id===d.id),y=p.play,arr=d.r==='in'?y.in:y.wait,i=arr.indexOf(ME());i>=0?arr.splice(i,1):arr.push(ME());render(true);
  toast(d.r==='in'?(i>=0?`${first(p.by)} est prévenu de ton désistement`:`C'est noté · ${first(p.by)} est prévenu`):(i>=0?"Tu as quitté la liste d'attente":"Tu es sur la liste d'attente · prévenu si une place se libère"))},
 /* canaux */
 mute(d){const c=chans.find(c=>c.id===d.id);c.mute=!c.mute;render(true);toast(c.mute?`${c.name} en sourdine : plus de notifications`:`Notifications réactivées pour ${c.name}`)},
 /* équipes et rencontres */
 champ(d){S.champ=d.id;render(true)},
 scoring(){S.scoring=!S.scoring;render(true)},
 game(d){addGame(recs.find(r=>r.id===d.r),+d.i,+d.s);render(true);S.flash=null},
 ungame(d){const r=recs.find(r=>r.id===d.r),m=r.ms[+d.i],s=+d.s;let k=m.sets.length-1;
  if(m.st==='live'&&k>0&&m.sets[k][0]===0&&m.sets[k][1]===0&&m.sets[k-1][s]>0){m.sets.pop();k--}
  if(m.sets[k][s]>0){m.sets[k][s]--;const was=m.st==='done';if(was){m.st='live';delete m.w}liveNote(r,'Score corrigé · '+m.l,ours(m)+' contre '+m.b[0]+' · '+(setsTxt(m)||'0-0')+(was?' · le match reprend':''),'start','match',m)}else toast('Aucun jeu à retirer pour ce joueur sur ce set');render(true)},
 start(d){const r=recs.find(r=>r.id===d.r),m=r.ms[+d.i];m.st='live';m.sets=[[0,0]];render(true);liveStart(r,m)},
 endrec(d){endRec(recs.find(r=>r.id===d.r));render(true)},
 startRec(d){const r=recs.find(r=>r.id===d.r),g=grp(r.tid),T2=g.mem.filter(p=>r.lineup&&r.lineup[p]==='T'),pad=recSport(r)==='Padel';
  if(!T2.length){toast("Choisis d'abord les titulaires de la rencontre");return}
  if(pad&&T2.length%2){toast('En padel, convoque un nombre pair de titulaires : les matchs se jouent en double');return}
  const rows=pad?Array.from({length:T2.length/2},(_,i)=>O('so-'+i,`Double ${i+1} · adversaires de ${T2.slice(i*2,i*2+2).map(first).join(' et ')}`,'Noms de la paire adverse')).join(''):T2.map((p,i)=>O('so-'+i,`Simple ${i+1} · adversaire de ${first(p)}`,"Nom de l'adversaire")).join('')+(T2.length>=2?O('so-d','Double · paire adverse','Noms de la paire adverse'):'');
  sheet('Lancer la rencontre',`<form class="body" id="start-form" data-r="${r.id}"><div class="note">Les matchs sont créés à partir des titulaires. Tu saisis ensuite les scores jeu par jeu, visibles en direct par tous les adhérents.</div>${Sel('so-stb','Si un 3e set est nécessaire',['Set classique','Super tie-break en 10 points'],pad?'Super tie-break en 10 points':'Set classique')}${rows}<button class="btn full">Lancer le direct</button></form>`)},
 delRec(d){const i=recs.findIndex(r=>r.id===d.r);if(i<0)return;const r=recs.splice(i,1)[0],ps=posts.map((p,k)=>[p,k]).filter(([p])=>p.rec===d.r);ps.slice().reverse().forEach(([p,k])=>posts.splice(k,1));S.dir=-1;S.stack.pop();render();toast('Rencontre supprimée du calendrier',()=>{recs.splice(i,0,r);ps.forEach(([p,k])=>posts.splice(k,0,p))})},
 lineup(d){const r=recs.find(r=>r.id===d.r),L=r.lineup,was=L[d.id];if(was===d.s){delete L[d.id];delete r.conv[d.id]}else{L[d.id]=d.s;if(!was)delete r.conv[d.id]}
  render(true);toast(was===d.s?`${name(d.id)} retiré de la compo`:`${name(d.id)} convoqué comme ${d.s==='T'?'titulaire':'remplaçant'}`)},
 conv(d){const r=recs.find(r=>r.id===d.r),me=ME();r.conv[me]=r.conv[me]===d.s?'wait':d.s;render(true);toast(r.conv[me]==='ok'?'Réponse envoyée : tu es disponible':r.conv[me]==='no'?'Réponse envoyée : tu es indisponible':'Réponse retirée')},
 grpToggle(d){const g=grp(d.g),i=g.mem.indexOf(d.id);let extra='';
  if(i>=0){g.mem.splice(i,1);recs.filter(r=>r.tid===g.id&&r.st==='soon').forEach(r=>{if(r.lineup)delete r.lineup[d.id];if(r.conv)delete r.conv[d.id]});
   if(g.cap===d.id){g.cap=g.mem[0]||null;extra=g.cap?` · ${first(g.cap)} devient capitaine`:' · équipe sans capitaine'}}
  else g.mem.push(d.id);
  render(true);toast(i>=0?`${name(d.id)} retiré de ${g.name} et de ses compositions${extra}`:`${name(d.id)} ajouté à ${g.name} et prévenu`)},
 grpAll(){S.grpAll=!S.grpAll;render(true)},
 /* planning, archives, saison */
 planNav(d){S.plan.d=isoIn(+d.n*(S.plan.mode==='day'?1:7),S.plan.d);S.dir=+d.n;render(true);if(S.plan.mode==='day')scrollFirst()},
 planDay(d){S.plan.d=d.d;S.plan.mode='day';render(true);scrollFirst()},
 planMode(d){S.plan.mode=d.m;render(true);if(d.m==='day')scrollFirst()},
 planF(d){S.plan[d.g][d.k]=!S.plan[d.g][d.k];render(true)},
 arch(d){S.arch[d.k]=d.val;render(true)},
 season(){const e=+S.season.split('-')[1];sheet('Changer de saison',`<form class="body" id="season-form"><div class="note">Clôturer ${S.season} envoie dans les archives tous les articles, tous les événements et toutes les rencontres terminées. Le journal, l'agenda et les résultats repartent de zéro. Les rencontres à venir et les équipes sont conservées.</div><div class="two">${Sel('y1','Première année',[e,e+1,e+2].map(String))}${Sel('y2','Seconde année',[e+1,e+2,e+3].map(String))}</div><button class="btn full">Clôturer ${S.season} et lancer la prochaine</button></form>`)},
 delArt(d){const i=arts.findIndex(a=>a.id===d.id);if(i<0)return;const a=arts.splice(i,1)[0];S.dir=-1;S.stack.pop();render();toast('Actu supprimée',()=>arts.splice(i,0,a))},
 /* profil */
 theme(d){setTheme(+d.i);render(true);toast(`Appli aux couleurs de ${club().name}`)},
 role(d){S.role=d.r;S.scoring=false;S.tab='me';S.stack=[];S.chanTab='club';render();toast(`Tu vois l'appli en tant que : ${ROLE[d.r]}`)},
 share(d){S.share[d.k]=!S.share[d.k];render(true);toast(S.share[d.k]?`${MYCT[d.k][1]} visible par les adhérents`:`${MYCT[d.k][1]} masqué`)},
 nset(d){S.nset[d.k]=!S.nset[d.k];render(true)},
 delRes(d){const l=M[ME()].res,i=+d.i,r=l.splice(i,1)[0],pi=posts.findIndex(p=>p.res===r),p=pi>=0?posts.splice(pi,1)[0]:null;render(true);toast('Résultat supprimé de ton palmarès',()=>{l.splice(i,0,r);if(p)posts.splice(pi,0,p)})},
 teamFinal(d){const g=grp(d.id),f=g.final||{fmt:'Poule',pp:'1er',pn:6,tm:'stade',tp:'1er',ts:'Vainqueur',out:'Maintien',div:'',txt:''},P=PLACES.slice(0,16),num=Array.from({length:15},(_,i)=>String(i+2));
  sheet('Résultat final',`<form class="body" id="tf-form" data-id="${g.id}"><p class="muted small">${teamName(g)} · ${champOf(g).name} · ${g.sub}</p>${Sel('tf-fmt','Formule du championnat',['Poule','Tableau final','Poule puis tableau final'],f.fmt)}
  <div class="two" id="tf-p">${Sel('tf-pp','Place en poule',P,f.pp)}${Sel('tf-pn','Équipes dans la poule',num,String(f.pn))}</div>
  <div id="tf-t"><div class="fld"><span class="lb">Classement au tableau final</span><div class="radio"><label for="tm-s"><input type="radio" name="tm" value="stade" id="tm-s" ${f.tm!=='place'?'checked':''}>Stade atteint</label><label for="tm-p"><input type="radio" name="tm" value="place" id="tm-p" ${f.tm==='place'?'checked':''}>Place précise</label></div></div><div id="tf-tsw">${Sel('tf-ts','Stade atteint',STAGES,f.ts)}</div><div id="tf-tpw">${Sel('tf-tp','Place finale',P,f.tp)}</div></div>
  ${Sel('tf-out','Bilan de la saison',['Montée','Maintien','Descente'],f.out)}<div id="tf-d">${O('tf-div','Division de la saison prochaine (facultatif)','Régional 1',f.div)}</div>${O('tf-txt','Un mot pour le mur (facultatif)','Merci à tous les joueurs !',f.txt)}
  <p class="muted small">Le résultat est publié sur le mur du club. Une montée ou une première place donne le trophée Champion aux joueurs qui ont disputé au moins un match.</p><button class="btn full">Publier le résultat</button></form>`);tfSync()},
 result(){menuSheet('Ajouter un résultat',[['score','Match de tennis','resultT'],['ball','Tournoi de padel','resultP']])},
 resultP(){const mates=Object.keys(M).filter(k=>k!=='club'&&k!==ME()&&M[k].role!=='Jeune'&&(M[k].pad||M[k].pl)).sort((a,b)=>M[a].n.localeCompare(M[b].n));
  sheet('Tournoi de padel',`<form class="body" id="pres-form"><div class="two">${Sel('pr-place','Place obtenue',PLACES)}${Sel('pr-cat','Catégorie',['P25','P50','P100','P250','P500','P1000'],'P100')}</div><div class="two">${Sel('pr-pub','Public',['Adultes','Jeunes','Seniors +'])}${O('pr-age',"Âge (facultatif)",'+45, 15-18 ans…')}</div><div class="two">${Dt('pr-d','Date du tournoi',1,TODAY)}${F('pr-club','Club organisateur','Padel Club Tulle')}</div>
  <div class="fld"><span class="lb">Partenaire</span><div class="radio"><label for="pt-club"><input type="radio" name="pt" value="club" id="pt-club" checked>Du club</label><label for="pt-ext"><input type="radio" name="pt" value="ext" id="pt-ext">Extérieur</label></div></div>
  <div id="pt-c">${mates.length?Who('pr-mate','Joueur du club (pratique le padel)',mates):'<p class="muted small">Aucun autre joueur de padel au club.</p>'}</div><div id="pt-e" hidden>${O('pr-ext','Nom et prénom du partenaire','Julien Masson')}</div>
  <p class="muted small">Si ton partenaire est du club, le résultat s'ajoute aussi à son palmarès.</p><button class="btn full">${isMinor(ME())?'Publier (visible par ton groupe et tes parents)':'Publier et notifier mes '+M[ME()].fol+' abonnés'}</button></form>`)},
 palm(d){S.palm=d.s;render(true)},
 delPres(d){const l=M[ME()].pres||[],i=+d.i,r=l.splice(i,1)[0],pi=posts.findIndex(p=>p.pres===r),p=pi>=0?posts.splice(pi,1)[0]:null;render(true);toast('Résultat supprimé de ton palmarès padel',()=>{l.splice(i,0,r);if(p)posts.splice(pi,0,p)})},
 resultT(){const opt=`<option value="">–</option>`+[0,1,2,3,4,5,6,7].map(n=>`<option>${n}</option>`).join(''),row=(n,l)=>`<div class="setrow"><span class="nm">${l}</span><select id="s${n}a" aria-label="${l}, tes jeux">${opt}</select><span>/</span><select id="s${n}b" aria-label="${l}, jeux de l'adversaire">${opt}</select></div>`;
  sheet('Ajouter un résultat',`<form class="body" id="res-form">${F('r-opp','Adversaire','Prénom Nom')}<div class="two">${Sel('r-rank','Son classement',RANKS,'15/1')}${Sel('r-ctx','Compétition',['Tournoi','Championnat par équipes','Tournoi interne','Match amical'])}</div>${O('r-name','Nom du tournoi (facultatif)','Open de Brive')}<div class="fld"><label class="chk" for="r-fin"><input type="checkbox" id="r-fin">C'était la finale du tournoi</label></div>
  <div class="fld"><span class="lb">Score · tes jeux / ceux de l'adversaire</span>${row(1,'1er set')}${row(2,'2e set')}${row(3,'3e set')}<span class="muted small">Laisse le 3e set vide si le match s'est joué en deux sets.</span></div><button class="btn full">${isMinor(ME())?'Publier (visible par ton groupe et tes parents)':'Publier et notifier mes '+M[ME()].fol+' abonnés'}</button></form>`)},
 rank(d){const tn=d.k==='tennis',me=M[ME()];sheet(tn?'Mon classement tennis':'Mon classement padel',`<form class="body" id="rank-form" data-k="${d.k}">`+(tn?`<div class="fld"><label for="r-new">Classement</label><select id="r-new">${RANKS.map(r=>`<option value="${r}" ${r===me.r?'selected':''}>${r==='NC'?'Non classé':r}</option>`).join('')}</select></div>`:`<div class="fld"><label for="r-pad">Classement national</label><input id="r-pad" inputmode="numeric" pattern="[0-9]*" placeholder="Laisse vide si non classé" value="${me.pad||''}" autocomplete="off"></div><div class="fld"><label for="r-pl">Niveau de jeu</label><select id="r-pl">${['Aucun',...LV].map((l,i)=>`<option ${(me.pl||0)===i?'selected':''}>${l}</option>`).join('')}</select><span class="muted small">${LVHELP}</span></div>`)+`<p class="muted small">Le classement n'est pas relié à Ten'Up : tu le mets à jour toi-même, et tes abonnés sont prévenus.</p><button class="btn full">Enregistrer</button></form>`)},
 editMe(){const me=M[ME()],sx=me.g==='F'?'Femme':'Homme';
  sheet('Mes informations',`<form class="body" id="me-form">${F('e-name','Prénom et nom','',me.n)}<div class="two">${Sel('e-g','Sexe',['Homme','Femme'],sx)}${Dt('e-bd','Date de naissance',1,me.bd)}</div><div class="fld"><label for="e-tel">Téléphone</label><input id="e-tel" inputmode="tel" value="${esc(MYCT.tel[2])}" autocomplete="off"></div><div class="fld"><label for="e-mail">E-mail</label><input id="e-mail" type="email" value="${esc(MYCT.mail[2])}" autocomplete="off"></div><div class="two">${Sel('e-net','Réseau social',['Instagram','Facebook','TikTok'],MYCT.soc[1])}${O('e-soc','Identifiant','',MYCT.soc[2])}</div><p class="muted small">Téléphone, e-mail et réseau social ne sont visibles que si leur interrupteur est activé dans ton profil.</p><button class="btn full">Enregistrer</button></form>`)},
 addKid(){sheet('Ajouter un enfant',`<form class="body" id="kid-form">${F('k-name','Prénom et nom','Zoé Roux')}<div class="two">${Sel('k-g','Sexe',['Fille','Garçon'])}${Dt('k-bd','Date de naissance',1,'2016-01-01')}</div>${Sel('k-grp','Groupe',GROUPS.filter(g=>g.type==='train').map(g=>g.name))}<div class="fld"><label class="chk" for="k-ok"><input type="checkbox" id="k-ok" required>Je suis son représentant légal et j'autorise la création de son compte.</label></div><p class="muted small">Un compte jeune n'a pas de messagerie privée et n'accède qu'aux annonces et aux canaux de son groupe. Tu peux le consulter et le supprimer à tout moment.</p><button class="btn full">Créer le compte jeune</button></form>`)},
 look(){const c=club();S.img=null;S.logoL=null;S.logoD=null;const lp=(id,u,l,h)=>`<div class="fld"><label for="${id}">${l}</label><input type="file" id="${id}" accept="image/png,image/svg+xml,image/webp,image/*"><div class="lkl ${id==='lk-ll'?'dk':'lt'}" id="${id}-p" ${u?'':'hidden'}>${u?`<img src="${u}" alt="">`:''}</div>${u?`<label class="chk" for="${id}-x"><input type="checkbox" id="${id}-x">Retirer ce logo</label>`:''}<span class="muted small">${h}</span></div>`;
  sheet('Apparence du club',`<form class="body" id="look-form"><div class="two">${F('lk-name','Nom du club','',c.name)}<div class="fld"><label for="lk-short">Sigle (4 lettres max)</label><input id="lk-short" required maxlength="4" value="${esc(c.short)}" autocomplete="off"></div></div><div class="two"><div class="fld"><label for="lk-acc">Couleur du club</label><input type="color" id="lk-acc" value="${c.accent}"></div><div class="fld"><label for="lk-acc2">Couleur d'accent</label><input type="color" id="lk-acc2" value="${c.accent2||'#F5104C'}"></div></div>${Sel('lk-bg','Fond',['Sombre','Clair'],c.dark?'Sombre':'Clair')}<div id="lk-prev"></div><p class="muted small">La couleur du club habille les boutons, le curseur et les titres ; la couleur d'accent fait les ombres et les détails. Le rouge d'alerte et le bleu du padel restent fixes pour être reconnaissables.</p>${lp('lk-ll',c.logoL,'Logo clair (pour fond sombre)','Logo entier, de préférence en PNG transparent. Affiché en haut de l\'appli et dans le menu sur ordinateur.')}${lp('lk-ld',c.logoD,'Logo sombre (pour fond clair)','Le même logo en version foncée : l\'appli prend celui qui ressort sur le fond du club.')}<div class="fld"><label for="lk-logo">Photo de profil du club</label><input type="file" id="lk-logo" accept="image/*"><div class="prev" id="a-prev" ${c.logo?`style="background-image:url(${c.logo})"`:'hidden'}></div><span class="muted small">Image carrée : elle accompagne les publications et les messages du club.</span></div><button class="btn full">Appliquer au club</button></form>`);lookPrev()},
 delAccount(){if(isMinor(ME())){toast('Seul ton parent peut supprimer ton compte');return}sheet('Supprimer mon compte',`<form class="body" id="del-form"><div class="note">Ton profil, tes résultats et tes inscriptions seront supprimés sous 30 jours. Tes messages resteront affichés sous le nom « Ancien membre ». Un résultat de padel partagé reste dans le palmarès de ton partenaire, sans ton nom. Les comptes jeunes qui te sont rattachés seront aussi supprimés.</div><button type="button" class="btn sm ghost" data-a="toast" data-msg="Export préparé : tu le recevras par e-mail">Recevoir une copie de mes données</button><div class="fld"><label class="chk" for="del-ok"><input type="checkbox" id="del-ok" required>Je comprends que cette action est définitive.</label></div><button class="btn full hot">Supprimer définitivement mon compte</button></form>`)}
};

/* ---------- événements du navigateur ---------- */
document.addEventListener('click',e=>{const nb=e.target.closest('.nban');if(nb&&e.target.closest('.bq')){banHide(nb);A.notifs();return}if(nb&&nb._n&&!e.target.closest('[data-a]')){const i=NOTIFS.indexOf(nb._n);banHide(nb);if(i>=0){NOTIFS[i].n=0;A.ngo({i})}return}const lp=e.target.closest('[data-lp]');if(lp&&!e.target.closest('[data-a]')){if(e.detail===0)A[lp.dataset.lp](lp.dataset,lp);return}const el=e.target.closest('[data-a]');if(el){if(el.disabled)return;A[el.dataset.a](el.dataset,el);return}if(e.target.id==='sheet')closeSheet()});
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
/* Feuilles du bas : on les ferme aussi en les glissant vers le bas */
/* Appui long sur un message ou un commentaire : réactions, réponse, signalement */
let lpT=null,lpX=0,lpY=0;
document.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-lp]');if(!el||e.target.closest('[data-a]'))return;lpX=e.clientX;lpY=e.clientY;clearTimeout(lpT);lpT=setTimeout(()=>{lpT=null;try{navigator.vibrate&&navigator.vibrate(12)}catch(_){}A[el.dataset.lp](el.dataset,el)},450)});
document.addEventListener('pointermove',e=>{if(lpT&&Math.abs(e.clientX-lpX)+Math.abs(e.clientY-lpY)>10){clearTimeout(lpT);lpT=null}});
['pointerup','pointercancel'].forEach(t=>document.addEventListener(t,()=>{clearTimeout(lpT);lpT=null}));
document.addEventListener('contextmenu',e=>{const el=e.target.closest('[data-lp]');if(el){e.preventDefault();clearTimeout(lpT);lpT=null;A[el.dataset.lp](el.dataset,el)}});
/* Nouvelle saison : tout repart de zéro. On ne garde que les archives (résultats des équipes, articles, événements passés), les profils, les trophées et les points */
function newSeason(old){if(typeof freezeTrophies==='function')freezeTrophies();
 GROUPS.filter(g=>g.type==='team').forEach(g=>OLDG.push(g));CHAMPS.forEach(c=>OLDC.push(c));GROUPS.length=0;CHAMPS.length=0;
 for(let i=recs.length-1;i>=0;i--)if(!recs[i].arch)recs.splice(i,1);
 for(let i=posts.length-1;i>=0;i--)if(!posts[i].arch)posts.splice(i,1);
 for(let i=chans.length-1;i>=0;i--){const c=chans[i];if(c.g!=='club')chans.splice(i,1);else{c.msgs=[];c.un=0}}
 Object.keys(M).forEach(k=>{M[k].res=[];M[k].pres=[]});
 NOTIFS.length=0;NOTIFS.push({by:'club',txt:`ouvre la saison ${S.season} : bienvenue à tous !`,t:"À l'instant",n:1});S.liked.clear();S.scoring=false}
/* Formulaire du résultat final : on n'affiche que les champs utiles */
function tfSync(){const fm=val0('tf-fmt'),tm=document.querySelector('#tf-form input[name="tm"]:checked'),pl=tm&&tm.value==='place';if(!$('tf-p'))return;$('tf-p').hidden=fm==='Tableau final';$('tf-t').hidden=fm==='Poule';$('tf-tsw').hidden=pl;$('tf-tpw').hidden=!pl;$('tf-d').hidden=val0('tf-out')==='Maintien'}
const val0=id=>{const x=$(id);return x?x.value:''};
document.addEventListener('change',e=>{if(e.target.closest('#tf-form'))tfSync()});
/* Visionneuse de photos : seul endroit où l'on peut zoomer, à deux doigts (comme WhatsApp). Double-tap : zoom ×2,5 ; toucher simple sans zoom : fermer */
function pinchZoom(img){const P=new Map();let s=1,x=0,y=0,s0=1,d0=0,x0=0,y0=0,moved=false,lastTap=0;
 const apply=()=>{img.style.transform=`translate(${x}px,${y}px) scale(${s})`};
 const dist=()=>{const [a,b]=[...P.values()];return Math.hypot(a.x-b.x,a.y-b.y)};
 img.addEventListener('pointerdown',e=>{img.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=false;if(P.size===2){s0=s;d0=dist()}else{x0=e.clientX-x;y0=e.clientY-y}});
 img.addEventListener('pointermove',e=>{if(!P.has(e.pointerId))return;P.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(P.size===2){s=Math.min(4,Math.max(1,s0*dist()/d0));moved=true;apply()}else if(s>1){x=e.clientX-x0;y=e.clientY-y0;moved=true;apply()}});
 const up=e=>{P.delete(e.pointerId);if(P.size)return;if(s<=1.02){s=1;x=0;y=0;apply()}
  if(!moved){const now=Date.now();if(now-lastTap<300){s=s>1?1:2.5;x=0;y=0;img.style.transition='transform .2s';apply();setTimeout(()=>img.style.transition='',220);lastTap=0}else{lastTap=now;setTimeout(()=>{if(lastTap===now&&s===1)closeSheet()},310)}}};
 img.addEventListener('pointerup',up);img.addEventListener('pointercancel',up);
 img.addEventListener('wheel',e=>{e.preventDefault();s=Math.min(4,Math.max(1,s*(e.deltaY<0?1.15:.87)));if(s===1){x=0;y=0}apply()},{passive:false})}
/* Clavier (comme WhatsApp) : on garde le clavier natif ; l'appli se cale sur la partie visible de l'écran (visualViewport),
   donc la barre de saisie reste collée juste au-dessus du clavier, sans saut ni vide. La liste reste sur le dernier message. */
const VV=window.visualViewport;
function vvFit(){const p=$('phone');if(!VV||!p)return;const a=document.activeElement,typing=!!a&&/^(INPUT|TEXTAREA)$/.test(a.tagName)&&a.type!=='file',kb=Math.max(0,window.innerHeight-VV.height),open=typing&&kb>80;
 const was=p.classList.contains('kb');p.classList.toggle('kb',open);
 if(open){p.style.height=VV.height+'px';p.style.top=VV.offsetTop+'px'}else{p.style.height='';p.style.top='';if(was)window.scrollTo(0,0)}
 if(open&&!was)toEnd()}
function toEnd(){const v=view(),m=$('main'),cl=$('com-list');if(m&&(v.v==='chan'||v.v==='rec'))m.scrollTop=m.scrollHeight;if(cl)cl.scrollTop=cl.scrollHeight}
if(VV){VV.addEventListener('resize',vvFit);VV.addEventListener('scroll',vvFit)}
document.addEventListener('focusout',()=>setTimeout(vvFit,60));
/* Après l'envoi d'un message ou d'un commentaire, le clavier se ferme */
document.addEventListener('submit',e=>{const id=e.target.id;if(id==='composer'||id==='com-form')setTimeout(()=>{const a=document.activeElement;if(a&&a.blur)a.blur()},0)});
/* Toucher la liste des messages (hors barre de saisie) ferme le clavier */
document.addEventListener('pointerdown',e=>{const a=document.activeElement;if(!a||!/^(INPUT|TEXTAREA)$/.test(a.tagName)||!a.closest('.composer'))return;if(e.target.closest('#main,#com-list')&&!e.target.closest('.composer'))a.blur()},true);
/* Qui peut publier sur le mur : bureau, enseignants, membres d'une commission */
const myComms=()=>COMMS.filter(c=>c.mem.includes(ME())||c.resp===ME());
const canPublish=()=>isAdmin()||myComms().length>0;
/* Champ de message multiligne (comme WhatsApp) : une zone de texte et non un champ « texte »,
   ce qui évite la suggestion « Préremplir le contact » de Safari. Il grandit jusqu'à 5 lignes.
   Téléphone : la touche Entrée va à la ligne, on envoie avec le bouton. Ordinateur : Entrée envoie, Maj+Entrée va à la ligne. */
const taFit=t=>{t.style.height='auto';t.style.height=Math.min(t.scrollHeight,128)+'px'};
document.addEventListener('input',e=>{if(e.target.classList&&e.target.classList.contains('ta'))taFit(e.target)});
document.addEventListener('keydown',e=>{const t=e.target;if(!t.classList||!t.classList.contains('ta')||e.key!=='Enter'||e.shiftKey||e.isComposing)return;if(matchMedia('(pointer:coarse)').matches)return;e.preventDefault();const f=t.closest('form');if(f)f.requestSubmit()});
document.addEventListener('submit',e=>{const t=e.target.querySelector&&e.target.querySelector('.ta');if(t)setTimeout(()=>{t.style.height=''},0)});
let shY=null;
document.addEventListener('touchstart',e=>{const h=e.target.closest('.sheet header,.grab');shY=h?e.touches[0].clientY:null},{passive:true});
document.addEventListener('touchmove',e=>{if(shY===null)return;const dy=e.touches[0].clientY-shY,s=document.querySelector('#sheet .sheet');if(s&&dy>0)s.style.transform=`translateY(${dy}px)`},{passive:true});
document.addEventListener('touchend',e=>{if(shY===null)return;const dy=e.changedTouches[0].clientY-shY;shY=null;const s=document.querySelector('#sheet .sheet');if(dy>90)closeSheet();else if(s)s.style.transform=''},{passive:true});
function scrollFirst(){const m=$('main'),g=m.querySelector('#plan .gev');if(g)m.scrollTop+=g.getBoundingClientRect().top-m.getBoundingClientRect().top-140}
let tsx=null,tsy=0;
document.addEventListener('touchstart',e=>{const g=e.target.closest('#plan')&&!e.target.closest('.chips')&&S.plan.mode!=='events';tsx=g?e.touches[0].clientX:null;tsy=g?e.touches[0].clientY:0},{passive:true});
document.addEventListener('touchend',e=>{if(tsx===null)return;const t=e.changedTouches[0],dx=t.clientX-tsx,dy=t.clientY-tsy;tsx=null;if(Math.abs(dx)>60&&Math.abs(dx)>2*Math.abs(dy))A.planNav({n:dx<0?1:-1})},{passive:true});
document.addEventListener('input',e=>{if(e.target.id==='l-q'){S.list.q=e.target.value;render(true);const i=$('l-q');i.focus();i.setSelectionRange(i.value.length,i.value.length)}if(e.target.id==='lk-acc'||e.target.id==='lk-acc2')lookPrev()});
document.addEventListener('change',e=>{const el=e.target,prev=u=>{const p=$('a-prev');if(p){p.hidden=false;p.style.backgroundImage=`url(${u})`}};
 if(el.dataset.hide)$(el.dataset.hide).hidden=el.checked;
 if(el.id==='v-sport'&&$('v-rk')){$('v-rk').hidden=el.value==='Padel';$('v-nv').hidden=el.value==='Tennis'}
 if(el.id==='tr-sport'){const pad=el.value==='Padel';$('tr-tennis').hidden=pad;$('tr-padel').hidden=!pad}
 if(el.id==='tr-pub'){$('tr-jeunes').hidden=el.value!=='Jeunes';$('tr-vet').hidden=el.value!=='Seniors +'}
 if(el.name==='pt'&&$('pt-c')){$('pt-c').hidden=el.value!=='club';$('pt-e').hidden=el.value!=='ext'}
 if(el.name==='a-reg'&&$('ev-int')){$('ev-int').hidden=el.value!=='int';$('ev-ext').hidden=el.value!=='ext'}
 if(el.id==='lk-bg')lookPrev();
 if(el.id==='imp-file'&&el.files[0]){const fr=new FileReader();fr.onload=()=>{const rows=String(fr.result).split(/\r?\n/).map(l=>l.split(/[;,\t]/).map(x=>x.trim())).filter(r=>r.length>=2&&r[0]&&!/^pr[ée]nom$/i.test(r[0]));S.imp=rows.map(r=>({n:r[0]+' '+r[1],mail:r[2]||''}));$('imp-prev').innerHTML=S.imp.length?`<p class="small"><b>${S.imp.length} adhérent${S.imp.length>1?'s':''}</b> trouvé${S.imp.length>1?'s':''} : ${S.imp.slice(0,3).map(x=>esc(x.n)).join(', ')}${S.imp.length>3?'…':''}</p><button class="btn full" data-a="impSend">Envoyer ${S.imp.length} invitation${S.imp.length>1?'s':''}</button>`:'<p class="muted small">Aucune ligne lisible : vérifie le format prénom ; nom ; e-mail.</p>'};fr.readAsText(el.files[0])}
 if(el.id==='l-sort'){S.list.sort=el.value;render(true)}
 if(el.id==='l-f'){S.list.f=el.value;render(true)}
 if(el.id==='p-sport'){const pad=el.value==='Padel',f=$('a-fmt');$('p-rk').hidden=pad;$('p-lv').hidden=!pad;if(pad)f.value='Double';f.disabled=pad}
 if(el.id==='cap-sel'){grp(el.dataset.team).cap=el.value;render(true);toast(`${name(el.value)} est capitaine · prévenu`)}
 if((el.id==='a-img'||el.id==='lk-logo')&&el.files[0])shrink(el.files[0],u=>{S.img=u;prev(u)});
 if((el.id==='lk-ll'||el.id==='lk-ld')&&el.files[0])shrinkLogo(el.files[0],u=>{S[el.id==='lk-ll'?'logoL':'logoD']=u;const p=$(el.id+'-p');if(p){p.hidden=false;p.innerHTML=`<img src="${u}" alt="">`}lookPrev()});
 if(el.id==='m-img'&&el.files[0])shrink(el.files[0],u=>{S.img=u;showAtt()});
 if(el.id==='me-photo'&&el.files[0])shrink(el.files[0],u=>{M[ME()].photo=u;render(true);toast('Photo de profil mise à jour')});
 if(el.id==='d-ph'){[...el.files].slice(0,10-S.imgs.length).forEach(f=>shrink(f,u=>{if(S.imgs.length<10)S.imgs.push(u);const p=$('d-prev');if(p)p.innerHTML=S.imgs.map(x=>`<span class="ph" style="background-image:url(${x})"></span>`).join('')+`<span class="muted small" style="grid-column:1/-1">${S.imgs.length} photo${S.imgs.length>1?'s':''} sur 10</span>`}));el.value=''}
 if(el.id==='rec-ph'&&el.files[0])shrink(el.files[0],u=>{recs.find(r=>r.id===el.dataset.r).img=u;render(true);toast('Photo ajoutée · la publication du mur est à jour')})});

document.addEventListener('submit',e=>{e.preventDefault();const f=e.target,val=id=>{const x=$(id);return x?x.value.trim():''},g=id=>esc(val(id)),home=msg=>{closeSheet();S.tab='home';S.stack=[];render();toast(msg)};
 if(f.id==='composer'){const inp=$('msg-input'),x=inp.value.trim(),img=S.img;if(!x&&!img)return;const v=view(),c=v.v==='chan'?chans.find(c=>c.id===v.id):null,list=v.v==='rec'?recs.find(r=>r.id===v.id).chat:c&&c.msgs;if(!list)return;
  list.push({by:c&&c.ro&&isAdmin()?'club':ME(),x,img,t:"À l'instant",rep:S.reply||undefined});S.img=null;S.reply=null;showAtt();inp.value='';S.sent=true;render(true);S.sent=false;$('main').scrollTop=$('main').scrollHeight;inp.focus();return}
 if(f.id==='com-form'){const x=val('com-input');if(!x)return;const p=posts.find(p=>p.id===f.dataset.id);p.com.push({by:ME(),x,_pop:1,t:"À l'instant"});sheet('Commentaires',commentsBody(p),true);const l=$('com-list');l.scrollTop=l.scrollHeight;render(true);return}
 if(f.id==='edit-form'){const p=posts.find(p=>p.id===f.dataset.id);if(p.kind==='poll')p.q=g('e-title');else{p.title=g('e-title');p.body=g('e-body');if($('e-place'))p.place=g('e-place');if($('e-noimg')&&$('e-noimg').checked)delete p.img;if(S.img)p.img=S.img;S.img=null}closeSheet();render(true);toast('Publication modifiée');return}
 if(f.id==='done-form'){const i=posts.findIndex(p=>p.id===f.dataset.id),p=posts[i],n=Math.min(S.imgs.length,10);p.done={txt:g('d-txt'),photos:S.imgs.slice(0,10)};S.imgs=[];p.t="À l'instant";posts.splice(i,1);posts.unshift(p);home(`Événement terminé · publié sur le mur${n?' avec '+n+' photo'+(n>1?'s':''):''}`);return}
 if(f.id==='start-form'){const r=recs.find(r=>r.id===f.dataset.r),gr=grp(r.tid),T2=gr.mem.filter(p=>r.lineup[p]==='T'),pad=recSport(r)==='Padel',last=p=>M[p].n.split(' ').slice(1).join(' ')||M[p].n;
  r.ms=pad?Array.from({length:Math.ceil(T2.length/2)},(_,i)=>({l:'Double '+(i+1),an:T2.slice(i*2,i*2+2).map(last).join(' / '),b:[val('so-'+i)||'Paire adverse '+(i+1),''],sets:[],st:'soon'})):T2.map((p,i)=>({l:'Simple '+(i+1),a:p,b:[val('so-'+i)||'Adversaire '+(i+1),''],sets:[],st:'soon'})).concat(T2.length>=2?[{l:'Double',an:T2.slice(0,2).map(last).join(' / '),b:[val('so-d')||'Paire adverse',''],sets:[],st:'soon'}]:[]);
  r.stb=val('so-stb').startsWith('Super');r.ms.slice(0,2).forEach(m=>{m.st='live';m.sets=[[0,0]]});r.st='live';r.chat=[];S.scoring=true;closeSheet();render();liveNote(r,`Début de la rencontre contre ${r.opp}`,r.ms.filter(m=>m.st==='live').map(m=>`${m.l} : ${ours(m)}`).join(' · '),'start');return}
 if(f.id==='me-form'){const me=M[ME()];me.n=val('e-name')||me.n;me.g=val('e-g')==='Femme'?'F':'H';if(val('e-bd'))me.bd=val('e-bd');MYCT.tel[2]=val('e-tel');MYCT.mail[2]=val('e-mail');MYCT.soc[1]=val('e-net');MYCT.soc[2]=val('e-soc');closeSheet();render(true);toast('Informations mises à jour');return}
 if(f.id==='kid-form'){const id='k'+Date.now(),gr=GROUPS.find(x=>x.name===val('k-grp'));M[id]={n:g('k-name'),r:'NC',role:'Jeune',team:gr.name,fol:0,g:val('k-g')==='Fille'?'F':'H',bd:val('k-bd'),parent:ME(),photoOk:false,res:[]};(M[ME()].kids=M[ME()].kids||[]).push(id);gr.mem.push(id);closeSheet();render(true);toast(`Compte jeune créé · ${first(id)} rejoint ${gr.name}`);return}
 if(f.id==='look-form'){(S.setup=S.setup||{}).look=true;const c=club(),acc=$('lk-acc').value,dark=val('lk-bg')==='Sombre',dv=derive(acc,BASE[dark].bg);['bg','card','card2','line','fg','muted'].forEach(k=>delete c[k]);Object.assign(c,{name:val('lk-name')||c.name,short:(val('lk-short')||c.short).slice(0,4).toUpperCase(),accent:dv.col,accent2:$('lk-acc2').value,dark});if(S.img)c.logo=S.img;if(S.logoL)c.logoL=S.logoL;if(S.logoD)c.logoD=S.logoD;if($('lk-ll-x')&&$('lk-ll-x').checked)delete c.logoL;if($('lk-ld-x')&&$('lk-ld-x').checked)delete c.logoD;S.img=S.logoL=S.logoD=null;setTheme(S.club);closeSheet();render(true);
  toast(dv.adj?`Appliqué avec la couleur ajustée ${dv.col} pour rester lisible`:`Appli aux couleurs de ${c.name}`);return}
 if(f.id==='info-form'){(S.setup=S.setup||{}).info=true;const I2=CLUBINFO;I2.courts=+val('i-courts');I2.pistes=+val('i-pistes');I2.house=g('i-house');I2.secr=g('i-secr');I2.addr=g('i-addr');FORM.forEach((x,i)=>{x[0]=g('i-fn'+i)||x[0];x[2]=g('i-fp'+i)||x[2]});I2.book=esc(toUrl(val('i-book')));I2.pay=esc(toUrl(val('i-pay')));I2.shop=esc(toUrl(val('i-shop')));I2.mods={actus:$('i-actus').checked,comm:$('i-comm').checked};closeSheet();render(true);toast('Infos du club mises à jour');return}
 if(f.id==='abs-form'){const [gid,iso]=val('abs-s').split('|'),gr=grp(gid),k=f.dataset.k;gr.abs=gr.abs||{};gr.abs[iso]=gr.abs[iso]||[];if(!gr.abs[iso].includes(k))gr.abs[iso].push(k);gr.resp=gr.resp||{};(gr.resp[iso]=gr.resp[iso]||{})[k]='no';closeSheet();render(true);toast(`Absence signalée · ${name(gr.coach)} est prévenu${M[gr.coach].g==='F'?'e':''}`);return}
 if(f.id==='p2-form'){closeSheet();toast(`Invitation envoyée à ${val('p2-mail')}`);return}
 if(f.id==='kdel-form'){closeSheet();toast(`Demande enregistrée : le compte de ${first(f.dataset.k)} sera supprimé sous 30 jours`);return}
 if(f.id==='del-form'){closeSheet();toast('Demande enregistrée. Dans la vraie appli, ton compte serait supprimé sous 30 jours.');return}
 if(f.id==='season-form'){const y1=+val('y1'),y2=+val('y2'),old=S.season;if(y2!==y1+1){toast('Une saison couvre deux années qui se suivent');return}
  const inv=typeof seasonTrophies==='function'?seasonTrophies(old):0;GROUPS.forEach(gr=>{if(gr.final){(gr.hist=gr.hist||[]).push(gr.final);delete gr.final}});
  let n=0;arts.forEach(a=>{if(!a.arch){a.arch=old;n++}});recs.forEach(r=>{if(!r.arch&&r.st==='done'){r.arch=old;n++}});posts.forEach(p=>{if(!p.arch&&p.kind==='event'){p.arch=old;n++}});
  S.season=y1+'-'+y2;newSeason(old);S.arch={s:old,t:'arts'};closeSheet();S.tab='club';S.clubTab='club';S.stack=[{v:'archive'}];render();toast(`Saison ${old} clôturée · ${n} éléments archivés${inv?` · trophée Invaincu pour ${inv} joueur${inv>1?'s':''}`:''} · saison ${S.season} lancée : le mur, les groupes, les équipes et les palmarès repartent de zéro · chaque adhérent doit faire revalider son accès`);return}
 if(f.id==='rimg-form'){const r=recs.find(r=>r.id===f.dataset.id);if($('r-noimg')&&$('r-noimg').checked){delete r.img;closeSheet();render(true);toast('Photo retirée');return}if(!S.img){toast('Choisis une photo');return}r.img=S.img;S.img=null;closeSheet();render(true);toast('Photo ajoutée au résultat de la rencontre');return}
 if(f.id==='tf-form'){const gr=grp(f.dataset.id),fm=val('tf-fmt'),tm=f.querySelector('input[name="tm"]:checked').value,F2={season:S.season,fmt:fm,pp:val('tf-pp'),pn:+val('tf-pn'),tm,tp:val('tf-tp'),ts:val('tf-ts'),out:val('tf-out'),div:val('tf-out')==='Maintien'?'':val('tf-div'),txt:val('tf-txt'),from:gr.sub,champ:champOf(gr).name};
  if(fm!=='Tableau final'&&PLACES.indexOf(F2.pp)+1>F2.pn){toast("La place en poule dépasse le nombre d'équipes");return}
  gr.final=F2;const i=posts.findIndex(p=>p.kind==='teamfinal'&&p.tid===gr.id&&!p.arch);if(i>=0)posts.splice(i,1);
  posts.unshift({id:'p'+Date.now(),by:'club',t:"À l'instant",kind:'teamfinal',tid:gr.id,final:F2,sport:champOf(gr).sport,likes:0,com:[]});
  const won=F2.out==='Montée'||(fm!=='Tableau final'&&F2.pp==='1er'&&fm==='Poule')||(fm!=='Poule'&&(tm==='place'?F2.tp==='1er':F2.ts==='Vainqueur')),nc=won&&typeof teamChampion==='function'?teamChampion(gr):0;
  home(`Championnat clôturé · résultat publié sur le mur${nc?` · trophée Champion pour ${nc} joueur${nc>1?'s':''}`:''}`);return}
 if(f.id==='rank-form'){const me=M[ME()],tn=f.dataset.k==='tennis';let title,body;
  if(tn){const o=me.r,n=val('r-new');if(o===n){closeSheet();return}me.r=n;title=`Classement tennis <em>${n==='NC'?'non classé':n}</em>`;body=`${first(ME())} passe de ${o} à ${n}.`}
  else{const num=val('r-pad').replace(/\D/g,''),lv=val('r-pl'),np=num?+num:null,nl=lv==='Aucun'?null:LV.indexOf(lv)+1;if(np===(me.pad||null)&&nl===(me.pl||null)){closeSheet();return}me.pad=np;me.pl=nl;title=`Classement padel <em>${np?'n° '+np:'non classé'}</em>`;body=np?`${first(ME())} est désormais n° ${np} au classement padel${nl?', niveau '+nl:''}.`:`${first(ME())} n'est pas classé en padel${nl?', niveau '+nl:''}.`}
  posts.unshift({id:'p'+Date.now(),by:ME(),t:"À l'instant",kind:'annonce',sport:tn?'Tennis':'Padel',title,body,likes:0,com:[]});closeSheet();render(true);toast(`Classement mis à jour · ${me.fol} abonnés notifiés`);return}
 if(f.id==='pres-form'){const me=M[ME()],ext=f.querySelector('input[name="pt"]:checked').value==='ext',d=val('pr-d');
  if(d>TODAY){toast('La date du tournoi est dans le futur');return}
  if(ext&&!val('pr-ext')){toast('Indique le nom et le prénom de ton partenaire');return}
  const r={place:val('pr-place'),cat:val('pr-cat'),pub:val('pr-pub'),age:g('pr-age'),d,club:g('pr-club'),pid:ext?null:(val('pr-mate')||null),ext:ext?g('pr-ext'):null};
  (me.pres=me.pres||[]).unshift(r);if(r.pid){const m2=M[r.pid];(m2.pres=m2.pres||[]).unshift({...r,pid:ME(),ext:null})}
  posts.unshift({id:'p'+Date.now(),by:ME(),t:"À l'instant",kind:'padel',sport:'Padel',pres:r,likes:0,com:[]});S.palm='padel';home(`Résultat publié${r.pid?' · ajouté aussi au palmarès de '+first(r.pid):''} · ${me.fol} abonnés notifiés`);return}
 if(f.id==='res-form'){const me=M[ME()],sets=[1,2,3].map(n=>[val('s'+n+'a'),val('s'+n+'b')]).filter(s=>s[0]!==''&&s[1]!=='').map(s=>[+s[0],+s[1]]);
  if(sets.length<2){toast('Indique au moins les deux premiers sets');return}
  const bad=sets.findIndex(s=>!setOk(s[0],s[1]));if(bad>=0){toast(`Le ${bad+1}${bad?'e':'er'} set est impossible : un set se termine 6-0 à 6-4, 7-5 ou 7-6`);return}
  let mine=0,theirs=0;sets.forEach(s=>s[0]>s[1]?mine++:theirs++);
  if(sets.length===2&&mine===1){toast('Un set partout : ajoute le 3e set');return}
  if(sets.length===3&&(sets[0][0]>sets[0][1])===(sets[1][0]>sets[1][1])){toast('Le match était déjà gagné en deux sets : retire le 3e');return}
  const w=mine>theirs?1:0,or=val('r-rank'),perf=!!w&&rIdx(or)>rIdx(me.r),nm=val('r-name'),r={w,opp:val('r-opp'),or,sc:sets.map(s=>s.join('-')).join(' '),ctx:val('r-ctx')+(nm?' · '+nm:''),perf,fin:!!($('r-fin')&&$('r-fin').checked)};
  me.res.unshift(r);posts.unshift({id:'p'+Date.now(),by:ME(),t:"À l'instant",kind:'perf',res:r,likes:0,com:[]});home(perf?`Perf à ${or} publiée · ${me.fol} abonnés notifiés`:`Résultat publié · ${me.fol} abonnés notifiés`);return}
 if(f.id==='adm-form'){const k=f.dataset.k,cid=f.dataset.c,V2=$('v-pub')?readVis():{vis:[],rule:null,sport:$('v-sport')&&val('v-sport')!=='Tennis et padel'?val('v-sport'):''},img=S.img,base={id:'p'+Date.now(),by:'club',t:"À l'instant",likes:0,com:[],sport:V2.sport,vis:V2.vis,rule:V2.rule};
  if(k==='annonce'){posts.unshift({...base,kind:'annonce',title:g('a-title'),body:g('a-body'),img});S.img=null;home(V2.vis.length?'Annonce publiée · adhérents concernés notifiés':'Annonce publiée · tous les adhérents notifiés');return}
  if(k==='event'||k==='stage'){const reg=f.querySelector('input[name="a-reg"]:checked').value,d1=val('a-d1'),d2=val('a-d2'),one=$('a-same').checked||!d2||d2===d1,cp=val('ev-cap');
   if(d1<TODAY){toast('Cette date est déjà passée');return}
   if(!one&&d2<d1){toast('La date de fin est avant la date de début');return}
   if(hMin(val('a-h2'))<=hMin(val('a-h1'))){toast("L'heure de fin doit être après l'heure de début");return}
   posts.unshift({...base,...(k==='stage'?{stage:true,by:S.role==='coach'?ME():'club'}:{}),kind:'event',reg,title:g('a-title'),d:d1,d2:one?'':d2,h1:val('a-h1'),h2:val('a-h2'),date:(one?fmtD(d1):`Du ${fmtD(d1,1)} au ${fmtD(d2,1)}`)+' · '+val('a-h1')+' – '+val('a-h2'),place:g('a-place'),body:g('a-body'),img,yes:0,maybe:0,my:null,ins:[],cap:reg==='int'&&cp!=='Sans limite'?+cp:0,tenup:esc(toUrl(val('a-ten'))),pay:esc(toUrl(val('a-pay')))});S.img=null;home(reg==='int'?"Événement publié · inscriptions ouvertes dans l'appli":"Événement publié · inscription sur Ten'Up");return}
  if(k==='comm'){const id='cm'+Date.now(),r=val('a-cap');COMMS.push({id,name:g('a-title'),desc:g('a-body'),resp:r,mem:[r],req:[]});closeSheet();S.dir=1;S.stack.push({v:'comm',id});render();toast('Commission créée');return}
  if(k==='commpromo'){posts.unshift({...base,kind:'comm',comm:cid,title:g('a-title'),body:g('a-body'),img,yes:0,maybe:0,my:null});S.img=null;home('Commission mise en avant sur le mur');return}
  if(k==='partner'){PARTNERS.push({id:'pa'+Date.now(),name:g('a-title'),desc:g('a-body'),logo:img||null});S.img=null;closeSheet();render(true);toast('Partenaire ajouté');return}
  if(k==='ad'){const sel=[...f.querySelectorAll('input[name="ad-p"]:checked')].map(x=>x.value);if(!sel.length){toast('Coche au moins un partenaire');return}posts.unshift({...base,kind:'ad',partners:sel,title:g('a-title')||'Nos partenaires',color:val('ad-col')==='Rouge'?'hot':''});home('Bandeau partenaires publié sur le mur');return}
  if(k==='tournoi'){const sp=val('tr-sport'),pad=sp==='Padel',pub=val('tr-pub'),d1=val('a-d1'),d2=val('a-d2'),one=$('a-same').checked||!d2||d2===d1,dl=val('tr-dl'),a1=parseInt(val('tr-a1')),a2=parseInt(val('tr-a2')),open=pad||$('tr-open').checked,lo=val('tr-lo'),hi=val('tr-hi'),mx=val('tr-max');
   if(!one&&d2<d1){toast('La date de fin est avant la date de début');return}
   if(d1<TODAY){toast('Cette date est déjà passée');return}
   if(dl>d1){toast('La fin des inscriptions doit être avant le début du tournoi');return}
   if(pub==='Jeunes'&&a1>a2){toast("L'âge minimum est plus grand que l'âge maximum");return}
   const trn={sport:sp,gen:val('tr-gen'),pub,a1,a2,vet:val('tr-vet-s'),fmt:pad?'':val('tr-fmt').split(' (')[0],open,lo:RANKS[Math.min(rIdx(lo),rIdx(hi))],hi:RANKS[Math.max(rIdx(lo),rIdx(hi))],cat:pad?val('tr-cat'):'',max:mx==='Sans limite'?0:+mx,dl};
   posts.unshift({...base,sport:sp,kind:'event',reg:'ext',trn,tenup:esc(toUrl(val('tr-url'))),title:g('a-title'),d:d1,d2:one?'':d2,h1:val('a-h1'),h2:'20 h',date:(one?fmtD(d1):`Du ${fmtD(d1,1)} au ${fmtD(d2,1)}`)+' · '+val('a-h1'),place:g('a-place'),body:g('a-body'),img});S.img=null;home("Tournoi publié · inscriptions sur Ten'Up");return}
  if(k==='cta'){let u=val('a-url');if(!/^https?:\/\//i.test(u))u='https://'+u;posts.unshift({...base,kind:'cta',title:g('a-title'),body:g('a-body'),label:g('a-label'),url:esc(u),img});S.img=null;home('Publication en ligne · adhérents concernés notifiés');return}
  if(k==='poll'){const o=[1,2,3,4,5,6].map(n=>g('a-o'+n)).filter(Boolean);if(new Set(o.map(x=>x.toLowerCase())).size<o.length){toast('Deux réponses sont identiques : modifie-en une');return}const cl=val('a-close');if(cl&&cl<TODAY){toast('La date de clôture est déjà passée');return}posts.unshift({...base,kind:'poll',q:g('a-title'),opts:o.map(t=>[t,0]),my:null,close:cl||''});home('Sondage publié · adhérents concernés notifiés');return}
  if(k==='article'){const a={id:'a'+Date.now(),img,sport:V2.sport,cat:val('a-cat'),title:g('a-title'),date:"Aujourd'hui",lead:g('a-lead'),body:g('a-body').split(/\n+/).filter(Boolean)};arts.unshift(a);posts.unshift({...base,kind:'journal',art:a.id});S.img=null;home('Actu publiée');return}
  if(k==='chan'){const id='ch'+Date.now(),gg={'Club':'club','Entraînements':'train','Équipes':'team'}[val('c-g')];chans.push({id,g:gg,name:g('a-title'),desc:g('a-body'),ro:$('c-ro').checked?1:0,un:0,msgs:[{by:'club',x:'Groupe ouvert. Bienvenue !',t:"À l'instant"}]});closeSheet();S.tab='chans';S.chanTab=gg;S.stack=[];render();toast('Groupe de discussion créé');return}
  if(k==='champ'){const id='c'+Date.now();CHAMPS.push({id,name:g('a-title'),sport:val('a-sport'),age:val('a-age'),season:g('a-season')||'Saison '+S.season});closeSheet();S.dir=1;S.stack.push({v:'champ',id});render();toast('Championnat créé · ajoute ses équipes');return}
  if(k==='team'||k==='train'){const id='g'+Date.now(),nm=g('a-title');
   const o=k==='team'?{id,type:k,champ:cid,name:nm,gen:val('a-gen'),sub:g('a-sub'),cap:val('a-cap'),mem:[val('a-cap')]}:{id,type:k,name:nm,sport:val('t-sport'),day:DAYS.indexOf(val('t-day')),h:val('a-h1'),dur:val('t-dur'),coach:val('t-coach'),defLoc:val('t-loc'),gen:val('a-gen'),lo:val('v-lo'),hi:val('v-hi'),sub:val('t-day')+' '+val('a-h1')+' · '+val('t-dur')+' · '+first(val('t-coach')),mem:[]};
   GROUPS.push(o);chans.push({id,g:k,sport:k==='team'?champOf(o).sport:o.sport,name:k==='team'?teamName(o):nm,desc:o.sub,kid:(o.mem||[]).some(isMinor)?1:0,un:0,msgs:[{by:'club',x:'Canal ouvert. Bienvenue à tous !',t:"À l'instant"}]});closeSheet();S.dir=1;S.stack.push({v:k==='team'?'team':'grp',id});render();toast(`${nm} créé · son canal de discussion est ouvert`);return}
  if(k==='fixture'){const tm=grp(cid);if(tm.final){closeSheet();toast("Ce championnat est clôturé : impossible d'ajouter une rencontre");return}recs.push({id:'r'+Date.now(),d:val('a-d1'),h:val('a-h1'),tid:cid,opp:g('a-opp'),comp:tm.sub+(val('a-comp')?' · '+g('a-comp'):''),when:fmtD(val('a-d1'))+' · '+val('a-h1')+' · '+val('a-loc').toLowerCase(),st:'soon',lineup:{},conv:{}});closeSheet();render(true);toast("Rencontre ajoutée au calendrier · l'équipe est prévenue");return}
  if(k==='play'){const pad=val('p-sport')==='Padel',fmt=pad?'Double':val('a-fmt'),others=adults().filter(x=>x!==ME());let lo,hi,n,txt;
   if(pad){const a=LV.indexOf(val('l-lo'))+1,b=LV.indexOf(val('l-hi'))+1;lo=Math.min(a,b);hi=Math.max(a,b);n=others.filter(x=>M[x].pl>=lo&&M[x].pl<=hi).length;txt='de niveau '+lo+' à '+hi}
   else{const a=rIdx(val('v-lo')),b=rIdx(val('v-hi')),i0=Math.min(a,b),i1=Math.max(a,b);lo=RANKS[i0];hi=RANKS[i1];n=others.filter(x=>rIdx(M[x].r)>=i0&&rIdx(M[x].r)<=i1).length;txt='de '+lo+' à '+hi}
   posts.unshift({id:'p'+Date.now(),by:ME(),t:"À l'instant",kind:'play',likes:0,com:[],play:{sport:pad?'Padel':'Tennis',date:fmtD(val('a-d1')),time:val('a-h1'),dur:val('a-dur'),fmt,lo,hi,places:fmt==='Simple'?1:+val('a-pl'),in:[],wait:[]}});home(`Recherche publiée · visible par ${n} adhérent${n>1?'s':''} ${txt}`);return}}});

/* ---------- la démo vit : le direct avance, des messages arrivent ---------- */
setInterval(()=>{if(S.scoring||window.RAM_KEY)return;const r=recs.find(r=>r.sim&&r.st==='live');if(!r)return;const lives=r.ms.map((m,i)=>m.st==='live'?i:-1).filter(i=>i>=0),v=view(),here=()=>['home','recs'].includes(v.v)||(v.v==='rec'&&v.id===r.id);
 if(!lives.length){if(r.ms.every(x=>x.st==='done'))endRec(r);else{const n=r.ms.find(x=>x.st==='soon');n.st='live';n.sets=[[0,0]];liveStart(r,n)}liveRefresh(r);return}
 addGame(r,lives[Math.floor(Math.random()*lives.length)],Math.random()<.58?0:1);liveRefresh(r);S.flash=null},6500);
let simN=0;
setInterval(()=>{if(simN>=8||window.RAM_KEY)return;const v=view(),pool=chans.filter(c=>!c.ro&&chanOk(c)&&!(v.v==='chan'&&v.id===c.id)),who2=adults().filter(x=>x!=='me'&&!S.blocked.has(x));if(!pool.length||!who2.length)return;
 const c=pool[Math.floor(Math.random()*pool.length)],by=who2[Math.floor(Math.random()*who2.length)];simN++;c.msgs.push({by,x:CANNED[simN%CANNED.length],t:'Maintenant'});c.un++;if(!c.mute)notify('chan',by,`a écrit dans ${c.name}`,{v:'chan',id:c.id});
 if(['home','chans'].includes(v.v)&&!$('sheet'))render(true)},24000);

/* Le bandeau du haut se retire quand on fait défiler vers le bas, revient quand on remonte */
/* Il faut remonter d'au moins 160 px (ou revenir tout en haut) pour le faire revenir : le rebond en bas de page ne le rappelle plus */
/* Le bandeau flotte au-dessus de la page : il glisse sans changer la taille de la zone qui défile, donc le défilement reste collé au doigt */
var lastY=0,turnY=0;
function topPad(){const t=$('top'),m=$('main');m.style.paddingTop=t.offsetHeight+'px';m.style.setProperty('--segt',t.classList.contains('hide')?'calc(env(safe-area-inset-top,0px) - '+t.offsetHeight+'px)':'0px')}
$('main').addEventListener('scroll',()=>{const m=$('main'),max=m.scrollHeight-m.clientHeight,y=Math.min(Math.max(m.scrollTop,0),max),t=$('top'),hid=t.classList.contains('hide');
 if(y>lastY){turnY=y;if(y>80&&!hid&&!['chan','rec'].includes(view().v)){t.classList.add('hide');m.style.setProperty('--segt','calc(env(safe-area-inset-top,0px) - '+t.offsetHeight+'px)')}}
 else if(y<lastY&&hid&&(turnY-y>160||y<30)){t.classList.remove('hide');m.style.setProperty('--segt','0px')}
 lastY=y},{passive:true});
new ResizeObserver(topPad).observe($('top'),{box:'border-box'});
/* Glisser le doigt le long de la barre du bas pour choisir sa page, comme Instagram */
/* Curseur de la barre du bas (comme Instagram) : il suit le doigt pendant le glissé, puis se cale sur l'onglet le plus proche.
   Il fait exactement la largeur d'un onglet : la marge entre le curseur et le bord de la barre est la même en haut, en bas et sur les côtés. */
let pillPos=null;
const tabBtns=()=>[...$('tabs').querySelectorAll(':scope > button')];
/* Sur ordinateur (1024 px et plus), la barre devient un menu latéral : le curseur se déplace à la verticale */
const sideNav=()=>matchMedia('(min-width:1024px)').matches;
function pillSet(l,w,anim){const p=$('tpill');if(!p)return;p.style.transition=anim?'':'none';p.style.opacity='1';if(sideNav()){p.style.transform=`translateY(${l}px)`;p.style.height=w+'px';p.style.width=''}else{p.style.transform=`translateX(${l}px)`;p.style.width=w+'px';p.style.height=''}pillPos={l,w}}
function pillTo(b,fromLast){const p=$('tpill');if(!p)return;if(!b){p.style.opacity='0';return}
 if(fromLast&&pillPos){pillSet(pillPos.l,pillPos.w,false);void p.offsetWidth}
 if(sideNav())pillSet(b.offsetTop,b.offsetHeight,true);else pillSet(b.offsetLeft,b.offsetWidth,true)}
const nearestTab=x=>{let best=null,d=1e9;tabBtns().forEach(b=>{const dd=Math.abs(b.offsetLeft+b.offsetWidth/2-x);if(dd<d){d=dd;best=b}});return best};
let tabSw=null,tabDragged=false;
$('tabs').addEventListener('pointerdown',e=>{if(e.button>0||sideNav())return;const t=$('tabs');tabSw={x0:e.clientX,left:t.getBoundingClientRect().left+t.clientLeft,moved:false,id:e.pointerId,el:null}});
$('tabs').addEventListener('pointermove',e=>{const s=tabSw;if(!s||e.pointerId!==s.id)return;if(!s.moved&&Math.abs(e.clientX-s.x0)<8)return;const t=$('tabs'),bs=tabBtns();if(!bs.length)return;
 if(!s.moved){s.moved=true;try{t.setPointerCapture(e.pointerId)}catch(_){}t.classList.add('drag')}
 const w=bs[0].offsetWidth,pad=bs[0].offsetLeft,l=Math.min(t.clientWidth-pad-w,Math.max(pad,e.clientX-s.left-w/2));pillSet(l,w,false);
 const b=nearestTab(l+w/2);if(b!==s.el){bs.forEach(x=>x.classList.remove('hov'));if(b)b.classList.add('hov');s.el=b}});
function tabEnd(cancel){const s=tabSw,t=$('tabs');tabSw=null;t.classList.remove('drag');tabBtns().forEach(x=>x.classList.remove('hov'));if(!s||!s.moved)return;
 tabDragged=true;setTimeout(()=>tabDragged=false,60);const b=!cancel&&s.el;
 if(b){pillTo(b);if(b.getAttribute('aria-current')!=='page')setTimeout(()=>A[b.dataset.a](b.dataset,b),200)}else pillTo(t.querySelector('[aria-current]'))}
$('tabs').addEventListener('pointerup',()=>tabEnd(false));
$('tabs').addEventListener('pointercancel',()=>tabEnd(true));
/* Après un glissé, le « clic » de fin de geste n'ouvre pas l'onglet une deuxième fois */
$('tabs').addEventListener('click',e=>{if(tabDragged){e.stopPropagation();e.preventDefault()}},true);
/* Glisser le bandeau de notification vers le haut pour le ranger */
let banY=null;
let banEl=null;
document.addEventListener('touchstart',e=>{const b=e.target.closest('.nban');if(b){banEl=b;banY=e.touches[0].clientY;clearTimeout(b._t)}},{passive:true});
document.addEventListener('touchmove',e=>{if(banY===null)return;const d=Math.min(0,e.touches[0].clientY-banY);banEl.style.transform=`translateY(${d}px)`},{passive:true});
document.addEventListener('touchend',e=>{if(banY===null)return;const d=e.changedTouches[0].clientY-banY,b=banEl;banY=null;banEl=null;if(d<-25){e.preventDefault();banHide(b)}else{b.style.transform='';b._t=setTimeout(()=>banHide(b),3000)}});
let saved=0;try{saved=+localStorage.getItem('club-theme')||0}catch(e){}
setTheme(CLUBS[saved]?saved:0);render();
/* passage téléphone ↔ ordinateur (fenêtre redimensionnée) : le curseur se recale sur l'onglet actif */
matchMedia('(min-width:1024px)').addEventListener('change',()=>{pillPos=null;render(true);pillTo($('tabs').querySelector('[aria-current]'))});

/* ---------- Ouvrir un écran depuis une adresse (notification push, lien partagé) ----------
   Formats : #/rec/r1  #/chan/general  #/post/p1  #/agenda/cours  #/notifs  #/me */
function openFromUrl(u){const m=String(u||'').match(/#\/([a-z]+)(?:\/([^/?#]+))?/i);if(!m)return false;const [,v,id]=m;closeSheet();
 if(v==='ecole'||(v==='agenda'&&id==='cours')){S.ecTab=id&&id!=='cours'?id:'mine';A.tab({t:'ecole'});return true}
 if(v==='agenda'){A.tab({t:'agenda'});return true}
 if(['home','chans','club','me'].includes(v)){A.tab({t:v});return true}
 if(v==='notifs'){A.tab({t:'home'});A.notifs();return true}
 const ok=v==='rec'?recs.some(r=>r.id===id):v==='post'?posts.some(p=>p.id===id):v==='chan'?chans.some(c=>c.id===id&&chanOk(c)):false;
 if(ok){S.tab=v==='chan'?'chans':'home';S.stack=[{v,id}];render();return true}return false}
if(location.hash)openFromUrl(location.hash);
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='open')openFromUrl(e.data.url)});

/* ---------- Notifications push : abonnement (préparé, en attente du serveur) ----------
   À BRANCHER CÔTÉ SERVEUR :
   1. Générer une paire de clés VAPID (ex. « npx web-push generate-vapid-keys ») et coller la clé PUBLIQUE ci-dessous.
   2. Envoyer l'abonnement retourné par pushSubscribe() (sub.toJSON()) à l'API du club, avec l'identifiant de l'adhérent,
      par exemple POST /api/push/subscribe { memberId, club, subscription } (voir le TODO dans pushSubscribe).
   3. Côté serveur, envoyer les notifications avec la clé PRIVÉE (bibliothèque web-push), au format attendu par sw.js :
      {"title":"…","body":"…","url":"#/rec/r1","tag":"direct-r1"}.
   Sans clé, ou si le navigateur ne connaît pas le push (iPhone hors appli installée, iOS < 16.4…), rien n'est bloqué. */
const VAPID_PUBLIC_KEY='';
const pushReady=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
function b64ToU8(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)))}
async function pushSubscribe(){if(!VAPID_PUBLIC_KEY||!pushReady())return null;
 try{if(await Notification.requestPermission()!=='granted')return null;const reg=await navigator.serviceWorker.ready;
  const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(VAPID_PUBLIC_KEY)});
  /* TODO serveur : await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({memberId:ME(),subscription:sub.toJSON()})}); */
  return sub}catch(e){return null}}
A.pushOn=async()=>{if(!pushReady()){toast(isIOS()&&!standalone()?"Sur iPhone, installe d'abord l'appli sur l'écran d'accueil pour recevoir les notifications":"Ce navigateur ne gère pas les notifications push");return}
 if(!VAPID_PUBLIC_KEY){toast('Les notifications sur le téléphone arriveront quand le serveur du club sera branché');return}
 const sub=await pushSubscribe();toast(sub?'Notifications activées sur ce téléphone':'Notifications non autorisées : tu peux changer ça dans les réglages du téléphone')};

/* L'appli installable (index.html, avec manifeste) enregistre le service worker ; la version de démo n'en a pas */
const isPWAPage=!!document.querySelector('link[rel="manifest"]');

/* ---------- iPhone : écran guidé « Installer l'appli du club » au premier lancement dans Safari ---------- */
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
function installGuide(force){let later=false;try{later=localStorage.getItem('club-install-later')==='1'}catch(e){}if(!force&&(!isPWAPage||!isIOS()||standalone()||later))return;
 closeSheet();const d=document.createElement('div');d.className='back anim install';d.id='sheet';d.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="Installer l'appli du club" tabindex="-1"><div class="body ig">
 <span class="crest ig-crest ${club().logo?'logo':''}" ${club().logo?`style="background-image:url(${club().logo})"`:''}>${club().logo?'':club().short}</span>
 <h2 class="h3">Installer l'appli du club</h2><p class="muted">Sur iPhone, les notifications (messages, convocations, scores en direct) n'arrivent que si l'appli est ajoutée à l'écran d'accueil. Ça prend dix secondes :</p>
 <ol class="ig-steps"><li><span class="ig-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Touche le bouton <b>Partager</b> en bas de Safari.</span></li>
 <li><span class="ig-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><span>Fais défiler et choisis <b>Sur l'écran d'accueil</b>.</span></li>
 <li><span class="ig-ic">${ic('check')}</span><span>Touche <b>Ajouter</b>, puis ouvre l'appli depuis son icône.</span></li></ol>
 <div class="ig-demo" aria-hidden="true"><span class="ig-bar"><i></i><i class="hl"></i><i></i></span><span class="ig-arrow">↓</span></div>
 <button class="btn full ghost" data-a="installLater">Plus tard</button></div></div>`;$('layer').appendChild(d)}
A.installLater=()=>{try{localStorage.setItem('club-install-later','1')}catch(e){}closeSheet()};
A.installHelp=()=>installGuide(true);
setTimeout(()=>installGuide(false),600);

/* ---------- fond de l'appli : motif fixe au choix (points, quadrillage, diagonales, uni), mémorisé ---------- */
const MOTIFS=[['dots','Points'],['grid','Quadrillage'],['stripes','Diagonales'],['plain','Uni']];
function setMotif(k){if(!MOTIFS.some(m=>m[0]===k))k='dots';S.motif=k;document.documentElement.dataset.motif=k;try{localStorage.setItem('club-motif',k)}catch(e){}}
try{setMotif(localStorage.getItem('club-motif')||'dots')}catch(e){setMotif('dots')}
A.motif=d=>{setMotif(d.k);render(true)};

/* ---------- retour en arrière : glisser depuis le bord gauche vers la droite (sauf sur les écrans principaux) ---------- */
(function(){let x0=0,y0=0,t0=0,dx=0,on=false,lock=false;const els=()=>[$('main'),$('top'),$('foot')].filter(Boolean),ph=$('phone');
 const move=v=>{els().forEach(e=>e.style.transform=v?`translateX(${v}px)`:'');ph.style.setProperty('--sw',Math.min(v,60)+'px')};
 const reset=()=>{els().forEach(e=>e.classList.remove('swipe-back','swipe-done'));ph.classList.remove('swiping');move(0)};
 document.addEventListener('touchstart',e=>{if(e.touches.length!==1||!S.stack.length||$('sheet'))return;const t=e.touches[0],r=ph.getBoundingClientRect();
  if(t.clientX-r.left>28)return;x0=t.clientX;y0=t.clientY;t0=Date.now();dx=0;on=true;lock=false},{passive:true});
 document.addEventListener('touchmove',e=>{if(!on)return;const t=e.touches[0],ddx=t.clientX-x0,ddy=t.clientY-y0;
  if(!lock){if(Math.abs(ddy)>Math.abs(ddx)&&Math.abs(ddy)>8){on=false;return}if(ddx<8)return;lock=true;els().forEach(el=>el.classList.add('swipe-back'));ph.classList.add('swiping')}
  dx=Math.max(0,ddx);move(dx);e.preventDefault()},{passive:false});
 document.addEventListener('touchend',()=>{if(!on)return;on=false;if(!lock)return;const w=ph.clientWidth,fast=dx>40&&dx/(Date.now()-t0)>.5;
  els().forEach(el=>{el.classList.remove('swipe-back');el.classList.add('swipe-done')});
  if(dx>w*.33||fast){move(w);setTimeout(()=>{reset();S.dir=0;S.stack.pop();render();try{navigator.vibrate&&navigator.vibrate(8)}catch(_){}},180)}
  else{move(0);setTimeout(reset,190)}});
 document.addEventListener('touchcancel',()=>{if(on){on=false;reset()}});})();

/* ---------- actualiser en tirant vers le bas (comme Instagram) ----------
   Tout en haut d'une page, tirer vers le bas fait apparaître un indicateur de chargement sous la barre du haut ;
   au-delà du seuil, l'appli recharge le club depuis le serveur. */
(function(){const ph=$('phone'),m=$('main'),sp=document.createElement('div');sp.className='ptr';sp.setAttribute('aria-hidden','true');sp.innerHTML='<i></i>';ph.appendChild(sp);
 let y0=0,x0=0,d=0,on=false,lock=false,busy=false;const MAX=96,GO=64;
 const show=v=>{const t=$('top').offsetHeight;sp.style.top=t+'px';sp.style.opacity=Math.min(1,v/GO);sp.style.transform=`translate(-50%,${v/2-17}px)`;sp.firstChild.style.transform=`rotate(${v*4}deg)`;m.style.transform=v?`translateY(${v}px)`:''};
 const end=()=>{m.classList.add('ptr-back');sp.classList.add('ptr-back');show(0);setTimeout(()=>{m.classList.remove('ptr-back');sp.classList.remove('ptr-back','spin')},260)};
 m.addEventListener('touchstart',e=>{if(busy||e.touches.length!==1||m.scrollTop>0||$('sheet'))return;y0=e.touches[0].clientY;x0=e.touches[0].clientX;d=0;on=true;lock=false},{passive:true});
 m.addEventListener('touchmove',e=>{if(!on)return;const dy=e.touches[0].clientY-y0,dx=e.touches[0].clientX-x0;
  if(!lock){if(Math.abs(dx)>Math.abs(dy)||dy<0||m.scrollTop>0){on=false;return}if(dy<8)return;lock=true}
  d=Math.min(MAX,dy*.6);show(d);e.preventDefault()},{passive:false});
 m.addEventListener('touchend',async()=>{if(!on)return;on=false;if(!lock)return;
  if(d<GO){end();return}
  busy=true;sp.classList.add('spin');show(GO);try{navigator.vibrate&&navigator.vibrate(10)}catch(_){}
  const t0=Date.now();let ok=false;try{ok=window.ramRefresh?await window.ramRefresh():false}catch(_){}
  await new Promise(r=>setTimeout(r,Math.max(0,600-(Date.now()-t0))));   // l'indicateur tourne au moins un instant
  busy=false;end();if(!window.RAM||!RAM.live)toast('Démonstration : rien à actualiser')});
 m.addEventListener('touchcancel',()=>{if(on){on=false;end()}});})();
