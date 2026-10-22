/* Données fictives de la démo et petits outils partagés */
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const I={
home:'<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>',chat:'<path d="M4 5h16v11H9l-5 4z"/>',score:'<path d="M3 5h18v14H3zM12 5v14M6.5 10v4M16 10h2.5v2H16v2h2.5"/>',club:'<path d="M5 21V4M5 4h13l-3 4 3 4H5"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
bell:'<path d="M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4"/>',bellOff:'<path d="M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4M3 3l18 18"/>',heart:'<path d="M12 20S4 14.5 4 9a4.2 4.2 0 018-1.8A4.2 4.2 0 0120 9c0 5.5-8 11-8 11z"/>',com:'<path d="M4 5h16v11H9l-5 4z"/>',back:'<path d="M15 5l-7 7 7 7"/>',send:'<path d="M4 12l16-8-6 16-3-6z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
edit:'<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',cal:'<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',poll:'<path d="M5 20V10M12 20V4M19 20v-7"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3.5-5 7-5s7 1.5 7 5M16 4.500a3.500 3.500 0 010 7M22 20c0-2.500-1.500-4-4-4.600"/>',
news:'<path d="M4 4h13v16H4zM17 9h3v11h-3M7 8h7M7 12h7M7 16h4"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.500"/>',phone:'<path d="M7 3h10v18H7zM11 18h2"/>',mail:'<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',at:'<circle cx="12" cy="12" r="4"/><path d="M16 8v5a2.500 2.500 0 005 0v-1a9 9 0 10-4 7.500"/>',
ball:'<circle cx="12" cy="12" r="9"/><path d="M5.500 5.500c3 3 3 10 0 13M18.500 5.500c-3 3-3 10 0 13"/>',check:'<path d="M5 12l5 5 9-10"/>',pin:'<path d="M12 21s7-6.500 7-11.500a7 7 0 10-14 0C5 14.500 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>',plus:'<path d="M12 5v14M5 12h14"/>',
eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',folder:'<path d="M3 6h7l2 3h9v10H3z"/>',trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
more:'<circle cx="5" cy="12" r="1.400"/><circle cx="12" cy="12" r="1.400"/><circle cx="19" cy="12" r="1.400"/>',search:'<circle cx="11" cy="11" r="6.500"/><path d="M16 16l5 5"/>',flag:'<path d="M5 21V4h12l-2 4 2 4H5"/>',block:'<circle cx="12" cy="12" r="9"/><path d="M5.600 5.600l12.800 12.800"/>',
image:'<path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6"/><circle cx="8.500" cy="9" r="1.500"/>',gear:'<circle cx="12" cy="12" r="7.200"/><circle cx="12" cy="12" r="2.800"/><path d="M19.20 10.30L22.00 10.50L22.00 13.50L19.20 13.70M18.29 15.89L20.13 18.01L18.01 20.13L15.89 18.29M13.70 19.20L13.50 22.00L10.50 22.00L10.30 19.20M8.11 18.29L5.99 20.13L3.87 18.01L5.71 15.89M4.80 13.70L2.00 13.50L2.00 10.50L4.80 10.30M5.71 8.11L3.87 5.99L5.99 3.87L8.11 5.71M10.30 4.80L10.50 2.00L13.50 2.00L13.70 4.80M15.89 5.71L18.01 3.87L20.13 5.99L18.29 8.11"/>',
link:'<path d="M10 14a4 4 0 005.700 0l3-3a4 4 0 00-5.700-5.700l-1 1M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1"/>',shield:'<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
const ic=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]||''}</svg>`;

let TODAY='2026-10-13';
const RANKS=['NC','40','30/5','30/4','30/3','30/2','30/1','30','15/5','15/4','15/3','15/2','15/1','15','5/6','4/6','3/6','2/6','1/6','0'];
const LV=[1,2,3,4,5,6,7,8,9,10].map(n=>'Niveau '+n);
const DAYS=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],DA=['Dim.','Lun.','Mar.','Mer.','Jeu.','Ven.','Sam.'],MO=['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
const HOURS=[];for(let h=7;h<=23;h++)HOURS.push(h+' h',h+' h 30');
const hMin=h=>{const m=String(h||'').match(/(\d+) h(?: (\d+))?/);return m?+m[1]*60+(+m[2]||0):0};
function fmtD(iso,short){if(!iso)return '';const [y,m,d]=iso.split('-').map(Number);return (short?'':DA[new Date(y,m-1,d).getDay()]+' ')+d+' '+MO[m-1]+(y!==+TODAY.slice(0,4)?' '+y:'')}
function isoIn(n,from){const [y0,m0,d0]=(from||TODAY).split('-').map(Number),d=new Date(y0,m0-1,d0);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const rIdx=r=>RANKS.indexOf(r);

/* Ce que chaque club personnalise : nom, sigle, logo, couleurs */
const CLUBS=[
 {name:'TPC Les Tilleuls',short:'TPC',label:'Tilleuls',dark:true,accent:'#E0F50A',hot:'#F5104C'},
 {name:'TC Terre Rouge',short:'TCR',label:'Terre Rouge',dark:true,accent:'#FF6B2C',hot:'#F2D9A6',bg:'#17110E',card:'#221813',card2:'#2E2019',line:'#3D2C23',fg:'#F6EBDD',muted:'#B39C89'},
 {name:'Padel Club Azur',short:'PCA',label:'Azur',dark:false,accent:'#1E45F0',hot:'#FF4D2E'}
];

const M={
 me:{n:'Camille Roux',r:'15/2',role:'Capitaine',team:'Équipe 1 Hommes',fol:18,g:'H',bd:'1991-04-18',pad:2840,pl:5,kids:['leo'],res:[{w:1,opp:'M. Lopez',or:'15/2',sc:'6-3 6-4',ctx:'Championnat par équipes'},{w:0,opp:'S. Renard',or:'15',sc:'4-6 6-7',ctx:'Tournoi · Open de Brive'},{w:1,opp:'T. Vasseur',or:'15/1',sc:'7-5 3-6 6-4',ctx:'Tournoi · Open de Brive',perf:1}]},
 club:{n:'',role:'Club'},
 hugo:{n:'Hugo Martin',r:'15/4',role:'Président',team:'Bureau · Équipe 2',fol:64,g:'H',bd:'1968-09-02',res:[{w:1,opp:'P. Noël',or:'15/5',sc:'6-2 6-2',ctx:'Tournoi interne'}]},
 sarah:{n:'Sarah Benali',r:'2/6',role:'Enseignante',team:'École de tennis',fol:112,g:'F',bd:'1988-01-25',pad:1120,pl:7,res:[{w:1,opp:'C. Dumas',or:'1/6',sc:'7-5 6-4',ctx:'Open de Limoges',perf:1}]},
 mehdi:{n:'Mehdi Lacroix',r:'NC',role:'Enseignant',team:'Enseignant padel',fol:58,g:'H',bd:'1993-10-05',pad:410,pl:9,res:[]},
 thomas:{n:'Thomas Leroy',r:'4/6',team:'Équipe 1 Hommes',fol:47,g:'H',bd:'1997-06-11',pad:3310,pl:5,res:[{w:1,opp:'B. Petit',or:'3/6',sc:'6-4 7-6',ctx:'Tournoi de Tulle',perf:1}]},
 ines:{n:'Inès Faure',r:'15/1',role:'Capitaine',team:'Équipe 1 Femmes',fol:39,g:'F',bd:'2001-11-30',res:[{w:1,opp:'L. Vidal',or:'5/6',sc:'6-4 3-6 7-5',ctx:'Tournoi de Tulle',perf:1},{w:1,opp:'A. Gay',or:'15/1',sc:'6-1 6-3',ctx:'Tournoi de Tulle'}]},
 marc:{n:'Marc Dubois',r:'15/3',role:'Bureau',team:'Équipe 1 Hommes',fol:21,g:'H',bd:'1979-03-14',pad:6120,pl:3,res:[{w:0,opp:'F. Roy',or:'15/2',sc:'5-7 4-6',ctx:'Championnat par équipes'}]},
 nathan:{n:'Nathan Colin',r:'15',team:'Équipe 1 Hommes',fol:33,g:'H',bd:'1999-08-07',pad:1890,pl:6,res:[{w:1,opp:'J. Pons',or:'15/1',sc:'6-3 6-2',ctx:'Championnat par équipes'}]},
 emma:{n:'Emma Garcia',r:'15/2',team:'Équipe 1 Femmes',fol:26,g:'F',bd:'1994-12-19',pad:2470,pl:5,res:[{w:1,opp:'N. Henry',or:'15/3',sc:'6-4 6-4',ctx:'Tournoi interne'}]},
 antoine:{n:'Antoine Brun',r:'15/3',team:'Équipe 1 Hommes',fol:15,g:'H',bd:'1986-05-23',pad:4050,pl:4,res:[{w:1,opp:'G. Lemaire',or:'15/3',sc:'7-5 6-3',ctx:'Tournoi interne'}]},
 paul:{n:'Paul Girard',r:'30',role:'Capitaine',team:'Padel 1',fol:12,g:'H',bd:'1990-02-09',pad:760,pl:8,res:[{w:0,opp:'D. Marty',or:'30/1',sc:'6-7 3-6',ctx:'Tournoi interne'}]},
 julie:{n:'Julie Perrin',r:'30/1',role:'Parent',team:'Parent de Zoé',fol:9,g:'F',bd:'1983-07-01',res:[]},
 leo:{n:'Léo Roux',r:'30/3',role:'Jeune',team:'Galaxie U12 compétition',fol:6,g:'H',bd:'2015-03-09',parent:'me',res:[{w:1,opp:'T. Blanc',or:'30/2',sc:'6-4 6-3',ctx:'Tournoi jeunes de Tulle',perf:1}]}
};
/* Palmarès padel : des places en tournoi, avec un partenaire du club ou extérieur */
M.me.pres=[{place:'3e',cat:'P100',pub:'Adultes',age:'',d:'2026-09-27',club:'Padel Club Tulle',pid:'nathan'},{place:'1er',cat:'P25',pub:'Adultes',age:'',d:'2026-09-06',club:'TPC Les Tilleuls',pid:'paul'}];
M.paul.pres=[{place:'2e',cat:'P250',pub:'Adultes',age:'',d:'2026-10-04',club:'Padel Arena Limoges',ext:'Julien Masson'},{place:'1er',cat:'P25',pub:'Adultes',age:'',d:'2026-09-06',club:'TPC Les Tilleuls',pid:'me'}];
M.nathan.pres=[{place:'3e',cat:'P100',pub:'Adultes',age:'',d:'2026-09-27',club:'Padel Club Tulle',pid:'me'}];
M.mehdi.pres=[{place:'1er',cat:'P500',pub:'Adultes',age:'',d:'2026-09-20',club:'Padel Center Bordeaux',ext:'Lucas Ferrer'}];
/* Coordonnées : affichées seulement si l'adhérent a donné son accord (numéros et adresses fictifs) */
const CT={sarah:{tel:'06 39 98 12 04',mail:'sarah.benali@exemple.fr',soc:['Instagram','@sarah.coach.tennis']},hugo:{tel:'06 39 98 44 10',mail:'hugo.martin@exemple.fr'},thomas:{tel:'06 39 98 27 51',soc:['Instagram','@tom.leroy']},ines:{mail:'ines.faure@exemple.fr',soc:['TikTok','@ines.plays']},nathan:{tel:'06 39 98 63 18'},emma:{soc:['Facebook','Emma Garcia']},marc:{tel:'06 39 98 70 33',mail:'marc.dubois@exemple.fr'},mehdi:{tel:'06 39 98 81 47'}};
const MYCT={tel:['phone','Téléphone','06 39 98 05 21'],mail:['mail','E-mail','camille.roux@exemple.fr'],soc:['at','Instagram','@camille.rx']};

const CHAMPS=[
 {id:'c1',name:'Interclubs seniors',sport:'Tennis',age:'Adultes',season:'Automne 2026'},
 {id:'c2',name:'Interclubs padel',sport:'Padel',age:'Adultes',season:'Saison 2026-2027'},
 {id:'c3',name:'Championnat U12',sport:'Tennis',age:'Jeunes',season:'Automne 2026'}
];
const GROUPS=[
 {id:'eq1',type:'team',champ:'c1',name:'Équipe 1',gen:'Hommes',sub:'Régional 2',cap:'me',mem:['me','thomas','nathan','marc','antoine']},
 {id:'eq2',type:'team',champ:'c1',name:'Équipe 2',gen:'Hommes',sub:'Départemental 1',cap:'hugo',mem:['hugo','paul']},
 {id:'eqd',type:'team',champ:'c1',name:'Équipe 1',gen:'Femmes',sub:'Régional 3',cap:'ines',mem:['ines','emma','sarah','julie']},
 {id:'pad1',type:'team',champ:'c2',name:'Padel 1',gen:'Hommes',sub:'Départemental',cap:'paul',mem:['paul','nathan','antoine','mehdi']},
 {id:'tu12',type:'team',champ:'c3',name:'U12',gen:'Mixte',sub:'Départemental',cap:'sarah',mem:['leo']},
 {id:'compet',type:'train',defLoc:'Extérieur',loc:{'2026-10-13':'En salle'},resp:{'2026-10-13':{ines:'ok',thomas:'ok',nathan:'no'}},day:2,h:'19 h',dur:'1 h 30',sport:'Tennis',coach:'sarah',name:'Adultes compétition',sub:'Mardi 19 h · 1 h 30 · Sarah',mem:['me','ines','thomas','nathan']},
 {id:'padp',type:'train',defLoc:'En salle',day:4,h:'18 h 30',dur:'1 h',sport:'Padel',coach:'mehdi',gen:'Mixte',name:'Padel perfectionnement',sub:'Jeudi 18 h 30 · 1 h · Mehdi',mem:['paul','nathan','emma']},
 {id:'u12',type:'train',defLoc:'Extérieur',day:3,h:'14 h',dur:'1 h 30',sport:'Tennis',coach:'sarah',name:'Galaxie U12 compétition',sub:'Mercredi 14 h · 1 h 30 · Sarah',mem:['leo']}
];

const posts=[
 {id:'p0',by:'club',t:'Il y a 1 h',kind:'event',reg:'int',sport:'Tennis',d:'2026-10-24',h1:'14 h',h2:'22 h',date:'Sam. 24 oct · 14 h – 22 h',place:'Courts 1 à 4',title:'Doubles surprise <em>et barbecue</em>',body:"Tirage au sort des paires à 14 h, matchs en 4 jeux, barbecue à partir de 19 h. Ouvert à tous les adhérents, familles bienvenues.",yes:23,maybe:7,my:null,ins:['emma','nathan','hugo','sarah','marc','paul'],likes:31,com:[{by:'emma',x:'Je viens avec les salades.'}]},
 {id:'p1',by:'club',t:'Il y a 2 h',kind:'event',reg:'ext',sport:'Tennis',d:'2026-10-26',d2:'2026-11-15',date:'Du 26 oct au 15 nov',place:'Au club',trn:{sport:'Tennis',gen:'Mixte',pub:'Adultes',fmt:'Traditionnel',open:true,max:64,dl:'2026-10-25'},title:"Tournoi interne <em>d'automne</em>",body:"Inscriptions ouvertes jusqu'au 25 octobre. Simples et doubles, tous classements. Finales le 15 novembre, suivies du repas du club.",likes:42,com:[{by:'ines',x:'Inscrite en simple et en double.'},{by:'marc',x:"On peut s'inscrire en double sans partenaire ?"},{by:'club',x:'Oui Marc, on forme les paires le 26 au matin.'}]},
 {id:'p12',by:'club',t:'Il y a 4 h',kind:'event',reg:'ext',sport:'Padel',d:'2026-10-31',d2:'2026-11-01',h1:'9 h',h2:'20 h',date:'Du 31 oct au 1 nov · 9 h',place:'Pistes 1 et 2',title:'Tournoi P100 <em>de la Toussaint</em>',body:"Tableau messieurs, poules puis phase finale. Balles fournies, buvette ouverte tout le week-end.",trn:{sport:'Padel',gen:'Hommes',pub:'Adultes',cat:'P100',max:24,dl:'2026-10-27'},likes:14,com:[]},
 {id:'p13',by:'club',t:'Hier',kind:'event',reg:'ext',sport:'Tennis',d:'2026-11-08',h1:'9 h',h2:'18 h',date:'Dim. 8 nov · 9 h – 18 h',place:'Courts 1 à 4',title:'TMC jeunes <em>13-14 ans</em>',body:"Tournoi multi-chances : chaque joueur dispute au moins quatre matchs, qu'il gagne ou qu'il perde.",trn:{sport:'Tennis',gen:'Mixte',pub:'Jeunes',a1:13,a2:14,fmt:'TMC',open:false,lo:'30/2',hi:'15/4',max:16,dl:'2026-11-04'},likes:9,com:[]},
 {id:'p7',by:'emma',t:'Il y a 3 h',kind:'play',play:{sport:'Tennis',date:'Mer. 14 oct',time:'18 h',dur:'1 h 30',fmt:'Simple',lo:'15/4',hi:'15/1',places:1,in:[],wait:[]},likes:2,com:[]},
 {id:'p2',by:'ines',t:'Il y a 5 h',kind:'perf',res:{w:1,opp:'L. Vidal',or:'5/6',sc:'6-4 3-6 7-5',ctx:'Tournoi de Tulle · quart de finale',perf:1},likes:27,com:[{by:'sarah',x:'Le travail au service paie. Bravo !'},{by:'thomas',x:'Énorme. Demie demain ?'}]},
 {id:'p6',by:'club',t:'Il y a 5 h',kind:'poll',vis:['Compétiteurs','Adultes'],rule:{age:'Adultes',prat:'Compétiteurs'},q:'Quel créneau pour le nouveau cours de préparation physique ?',opts:[['Samedi 9 h',14],['Samedi 11 h',9],['Jeudi 19 h 30',17]],my:null,likes:8,com:[]},
 {id:'p3',by:'club',t:'Il y a 6 h',kind:'match',rec:'r1',body:"L'équipe 1 reçoit le TC Brive pour la 3e journée. Venez pousser derrière les courts 1 et 2, la buvette est ouverte.",likes:18,com:[]},
 {id:'p9',by:'nathan',t:'Hier',kind:'play',play:{sport:'Padel',date:'Ven. 16 oct',time:'20 h',dur:'1 h 30',fmt:'Double',lo:4,hi:6,places:3,in:['paul'],wait:[]},likes:1,com:[]},
 {id:'p10',by:'julie',t:'Hier',kind:'play',play:{sport:'Tennis',date:'Sam. 17 oct',time:'10 h',dur:'1 h',fmt:'Simple',lo:'30/3',hi:'30',places:1,in:[],wait:[]},likes:0,com:[]},
 {id:'p8',by:'paul',t:'Hier',kind:'play',play:{sport:'Tennis',date:'Jeu. 15 oct',time:'19 h',dur:'1 h 30',fmt:'Double',lo:'15/4',hi:'15',places:3,in:['nathan','marc','antoine'],wait:['hugo']},likes:4,com:[]},
 {id:'ad1',by:'club',t:'',kind:'ad',partners:['pa1','pa2','pa3','pa4'],title:'Nos partenaires',color:'',likes:0,com:[]},
 {id:'p4',by:'club',t:'Hier',kind:'journal',art:'a1',likes:35,com:[{by:'julie',x:'Zoé en parle encore. Merci aux coachs.'}]},
 {id:'p14',by:'club',t:'Hier',kind:'comm',comm:'anim',title:'Rejoins la <em>commission animation</em>',body:"On cherche trois bénévoles pour préparer la fête du club et le tournoi interne. Une réunion par mois, beaucoup de bonne humeur.",yes:6,maybe:3,my:null,likes:11,com:[]},
 {id:'p11',by:'club',t:'Hier',kind:'cta',title:'Le textile du club <em>est arrivé</em>',body:'Sweats, t-shirts et shorts aux couleurs du club, produits à la demande.',label:'Voir la collection',url:'https://www.riseandmove.fr',likes:12,com:[]},
 {id:'p5',by:'club',t:'Hier',kind:'annonce',title:'Court 3 <em>fermé jeudi</em>',body:"Réfection des lignes jeudi 15 de 8 h à 14 h. Les réservations concernées sont déplacées sur le court 4.",likes:6,com:[]},
 {id:'x5',arch:'2025-2026',by:'club',t:'Juin 2026',kind:'event',reg:'int',d:'2026-06-27',h1:'18 h',h2:'23 h',date:'Sam. 27 juin 2026 · 18 h – 23 h',place:'Club-house',title:'Fête du club',body:'Finales du tournoi interne, remise des prix et repas.',yes:86,maybe:0,my:null,done:{txt:'Merci aux 86 participants et aux bénévoles du barbecue.',photos:[]},likes:54,com:[{by:'hugo',x:'Belle soirée, à refaire.'}]},
 {id:'x6',arch:'2025-2026',by:'club',t:'Avril 2026',kind:'event',reg:'int',sport:'Tennis',d:'2026-04-13',d2:'2026-04-17',date:'Du 13 au 17 avr 2026 · 9 h – 17 h',place:'Courts 1 à 4',title:'Stage de Pâques jeunes',body:'Cinq jours de tennis et de multisports pour les 8-14 ans.',yes:32,maybe:0,my:null,likes:21,com:[]}
];

const chans=[
 {id:'annonces',g:'club',name:'Annonces',desc:'Le club uniquement',ro:1,un:1,msgs:[{by:'club',x:"Rappel : certificats médicaux à déposer avant le 31 octobre pour valider la licence.",t:'Sam.'},{by:'club',x:"Court 3 fermé jeudi matin pour réfection des lignes.",t:'09:12'}]},
 {id:'general',g:'club',name:'Général',desc:'Tous les adhérents',un:3,msgs:[{by:'hugo',x:"Merci aux bénévoles pour la journée portes ouvertes, 31 nouvelles inscriptions.",t:'Hier'},{by:'paul',x:"Quelqu'un a retrouvé une raquette noire sur le court 2 ?",t:'10:40'},{by:'sarah',x:"Elle est au club-house, derrière le bar.",t:'10:44'},{by:'paul',x:'Parfait, merci !',t:'10:45'}]},
 {id:'padel',g:'club',sport:'Padel',name:'Padel',desc:'Parties et tournois P25 / P100',un:0,msgs:[{by:'paul',x:"Il manque un joueur pour ce soir 20 h, piste 2.",t:'11:02'},{by:'mehdi',x:"Stage smash et bandeja samedi matin, 6 places.",t:'11:20'}]},
 {id:'compet',g:'train',name:'Adultes compétition',desc:'Mardi 19 h · Sarah',un:2,msgs:[{by:'sarah',x:"Mardi : séance retour de service puis points à thème. Prévoyez la corde à sauter.",t:'Dim.'},{by:'ines',x:"Je serai là 10 min en retard, je sors du travail à 18 h 45.",t:'Dim.'},{by:'sarah',x:"Pas de souci Inès. On commence par l'échauffement physique.",t:'Dim.'}]},
 {id:'u12',g:'train',name:'Galaxie U12 compétition',desc:'Mercredi 14 h · Sarah',kid:1,un:1,msgs:[{by:'sarah',x:"Plateau départemental dimanche à Tulle, départ du club à 8 h 15. Qui peut covoiturer ?",t:'Hier'},{by:'julie',x:"J'ai 3 places au départ du club.",t:'Hier'}]},
 {id:'eq1',g:'team',name:'Équipe 1 Hommes',desc:'Régional 2',un:0,msgs:[{by:'me',x:"Compo de samedi publiée dans l'onglet Équipes. Rendez-vous 12 h 45 au club.",t:'Hier'},{by:'nathan',x:'Présent.',t:'Hier'},{by:'marc',x:'Je prends les balles.',t:'Hier'}]},
 {id:'pad1',g:'team',sport:'Padel',name:'Padel 1',desc:'Interclubs padel',un:0,msgs:[{by:'paul',x:"Rencontre dimanche 10 h à domicile, arrivez pour 9 h 30.",t:'Lun.'}]}
];
const CANNED=['Bien reçu, merci.','Je confirme ma présence.','Qui est dispo pour taper la balle demain soir ?','Bravo à tous pour ce week-end.','Pensez à ramener les balles au club-house.','Je peux prendre deux personnes en voiture.'];

const recs=[
 {id:'r1',d:TODAY,h:'14 h',tid:'eq1',opp:'TC Brive',comp:'Régional 2 · Journée 3',when:"Aujourd'hui · 14 h · à domicile",st:'live',sim:1,
  chat:[{by:'hugo',x:'Gros match de Nathan, premier point pour nous.',t:'15:20'},{by:'julie',x:'Allez Thomas, tout se joue au 3e set !',t:'15:42'},{by:'ines',x:"J'arrive au club dans 10 minutes.",t:'15:44'}],
  lineup:{thomas:'T',nathan:'T',marc:'T',antoine:'T'},conv:{thomas:'ok',nathan:'ok',marc:'ok',antoine:'ok'},
  ms:[{l:'Simple 1',a:'thomas',b:['A. Morel','3/6'],sets:[[6,4],[3,6],[2,1]],st:'live',court:'Court 1'},
   {l:'Simple 2',a:'nathan',b:['J. Pons','15/1'],sets:[[6,3],[6,2]],st:'done',w:0,court:'Court 2'},
   {l:'Simple 3',a:'marc',b:['R. Caron','15/2'],sets:[[4,6],[5,5]],st:'live',court:'Court 2'},
   {l:'Simple 4',a:'antoine',b:['C. Blanc','15/3'],sets:[],st:'soon',court:'Court 1'},
   {l:'Double',an:'Leroy / Colin',b:['Morel / Pons',''],sets:[],st:'soon',court:'Court 1'}]},
 {id:'r2',d:'2026-10-17',h:'14 h',tid:'eq1',opp:'TC Tulle',comp:'Régional 2 · Journée 4',when:"Sam. 17 oct · 14 h · à l'extérieur",st:'soon',lineup:{thomas:'T',nathan:'T',marc:'T',antoine:'T',me:'R'},conv:{thomas:'ok',nathan:'ok',marc:'wait',antoine:'no'}},
 {id:'r3',d:'2026-10-18',h:'10 h',tid:'pad1',opp:'AS Padel Objat',comp:'Interclubs padel · Journée 2',when:'Dim. 18 oct · 10 h · à domicile',st:'soon',lineup:{paul:'T',nathan:'T',antoine:'T',mehdi:'T'},conv:{paul:'ok',nathan:'ok',mehdi:'wait'}},
 {id:'r5',d:'2026-10-25',h:'9 h',tid:'eqd',opp:'TC Égletons',comp:'Régional 3 · Journée 3',when:'Dim. 25 oct · 9 h · à domicile',st:'soon',lineup:{ines:'T',emma:'T',sarah:'T'},conv:{ines:'ok',emma:'ok'}},
 {id:'r4',d:'2026-10-04',h:'14 h',tid:'eq2',opp:'TC Ussel',comp:'Départemental 1 · Journée 2',when:"Dim. 4 oct · à l'extérieur",st:'done',ms:[
  {l:'Simple 1',a:'hugo',b:['D. Faure','15/3'],sets:[[6,4],[6,4]],st:'done',w:0},
  {l:'Simple 2',an:'Lucas Morin',ar:'15/5',b:['P. Besse','15/5'],sets:[[3,6],[6,7]],st:'done',w:1},
  {l:'Simple 3',an:'Karim Saïdi',ar:'30',b:['T. Vial','30/1'],sets:[[6,2],[6,3]],st:'done',w:0},
  {l:'Simple 4',an:'Élise Bonnet',ar:'30/1',b:['M. Roche','30'],sets:[[6,7],[4,6]],st:'done',w:1},
  {l:'Double 1',an:'Martin / Morin',b:['Faure / Besse',''],sets:[[6,3],[7,5]],st:'done',w:0},
  {l:'Double 2',an:'Saïdi / Bonnet',b:['Vial / Roche',''],sets:[[7,6],[6,4]],st:'done',w:0}]},
 {id:'x3',arch:'2025-2026',d:'2026-05-17',h:'9 h',tid:'eq1',opp:'TC Limoges',comp:'Régional 2 · Journée 5',when:'Dim. 17 mai 2026 · à domicile',st:'done',fin:[4,2]},
 {id:'x4',arch:'2025-2026',d:'2026-05-10',h:'9 h',tid:'eqd',opp:'TC Guéret',comp:'Régional 3 · Journée 4',when:"Dim. 10 mai 2026 · à l'extérieur",st:'done',fin:[2,4]},
 {id:'x7',arch:'2025-2026',d:'2026-04-26',h:'10 h',tid:'pad1',opp:'Padel Club Tulle',comp:'Interclubs padel · Journée 6',when:'Dim. 26 avr 2026 · à domicile',st:'done',fin:[3,0]}
];

const arts=[
 {id:'a1',sport:'Tennis',cat:'Jeunes',title:'Les U12 en finale départementale',date:'11 octobre',lead:"Quatre victoires en poule, une demie arrachée au super tie-break : le groupe Galaxie jouera le titre le 8 novembre.",body:["Ils étaient six à faire le déplacement à Tulle dimanche, accompagnés de Sarah et de trois parents. Le groupe U12 est sorti premier de sa poule sans perdre une rencontre.","La demi-finale s'est jouée au double décisif. Menés 7-4 dans le super tie-break, Léo et Zoé ont aligné six points de suite pour s'imposer 10-7.","La finale aura lieu au club le dimanche 8 novembre à 10 h. On compte sur vous au bord du court."]},
 {id:'a2',cat:'Portrait',title:'Sarah, quinze ans au bord du court',date:'6 octobre',lead:"Arrivée en 2011 comme stagiaire, elle dirige aujourd'hui l'école de tennis et ses 140 jeunes.",body:["Diplômée d'État, classée 2/6, Sarah Benali a formé une bonne partie des joueurs de l'équipe 1 actuelle.","Sa méthode tient en une phrase qu'elle répète à chaque séance : on joue correctement avant de jouer fort.","Cette saison, elle ouvre un créneau de préparation physique le samedi matin, accessible à tous les compétiteurs."]},
 {id:'a3',sport:'Padel',cat:'Padel',title:'Deux nouvelles pistes au printemps',date:'29 septembre',lead:"Le bureau a voté le projet : les travaux démarrent en février pour une ouverture en avril.",body:["Les deux pistes existantes affichent complet tous les soirs depuis un an. Deux pistes couvertes supplémentaires seront construites à côté du court 5.","Le financement est assuré par la mairie, la région et un emprunt du club sur sept ans.","Les formules padel restent au même tarif pour la saison en cours."]},
 {id:'x1',arch:'2025-2026',sport:'Tennis',cat:'Compétition',title:"L'équipe 1 se maintient en Régional 2",date:'14 juin 2026',lead:"Une victoire 4-2 lors de la dernière journée a suffi aux hommes pour sauver leur place.",body:["Tout s'est joué sur le dernier double, remporté au super tie-break devant une trentaine de supporters.","Le capitaine a salué un groupe resté soudé malgré trois défaites en début de phase."]},
 {id:'x2',arch:'2025-2026',sport:'Padel',cat:'Padel',title:'Premier tournoi P100 organisé au club',date:'22 mars 2026',lead:"Vingt-quatre paires engagées, des tribunes pleines et un club-house ouvert jusqu'à minuit.",body:["Le club a accueilli son premier tournoi homologué de padel. La finale a opposé deux paires venues de Limoges.","Le bureau prévoit deux dates supplémentaires la saison prochaine."]}
];
const FORM=[["Adhésion adulte","Tennis illimité, licence comprise","210 € / an"],["Adhésion jeune","Moins de 18 ans, licence comprise","140 € / an"],["École de tennis","1 h 30 par semaine, 30 séances","+ 190 € / an"],["Pass padel","Réservation illimitée en heures creuses","35 € / mois"],["Location de piste","Padel, 1 h 30, 4 joueurs","32 €"]];
const PARTNERS=[
 {id:'pa1',name:'Garage des Tilleuls',desc:'Entretien et réparation toutes marques. Partenaire des équipes.'},
 {id:'pa2',name:'Boulangerie Lachaud',desc:'Pains, viennoiseries et le goûter des plateaux jeunes. Partenaire du tournoi interne.'},
 {id:'pa3',name:'Optique du Centre',desc:"Lunettes de sport et lentilles. Partenaire de l'école de tennis."},
 {id:'pa4',name:'Rise and Move',desc:'Textile sportif produit à la demande. Partenaire textile du club.',logo:LOGO,dark:1}
];
/* Commissions du club : un responsable, des membres, des demandes en attente */
const COMMS=[
 {id:'sport',name:'Commission sportive',desc:"Organise les championnats par équipes, les tournois du club et le suivi des compétiteurs.",resp:'me',mem:['me','thomas','ines'],req:[]},
 {id:'anim',name:'Commission animation',desc:"Prépare les soirées, la fête du club, les tournois internes et la buvette.",resp:'julie',mem:['julie','emma','hugo'],req:['paul']},
 {id:'jeunes',name:'Commission jeunes',desc:"Accompagne l'école de tennis, les plateaux et les stages des moins de 18 ans.",resp:'sarah',mem:['sarah','julie'],req:[]},
 {id:'padelc',name:'Commission padel',desc:"Gère le planning des pistes, les tournois P25 à P250 et le projet des nouvelles pistes.",resp:'mehdi',mem:['mehdi','paul','nathan'],req:[]}
];
const NOTIFS=[{by:'paul',txt:'souhaite rejoindre la commission animation',t:'Il y a 3 h',n:1,go:{v:'comm',id:'anim'}},{by:'thomas',txt:'mène 2 jeux à 1 au 3e set contre A. Morel',t:'En direct',n:1,go:{v:'rec',id:'r1'}},{by:'club',txt:"a publié un événement : Doubles surprise et barbecue",t:'Il y a 1 h',n:1,go:{v:'post',id:'p0'}},{by:'ines',txt:'a signé une perf à 5/6 au Tournoi de Tulle',t:'Il y a 5 h',go:{v:'post',id:'p2'}},{by:'sarah',txt:'a écrit dans Adultes compétition',t:'Dim.',go:{v:'chan',id:'compet'}}];
const REPORTS=[];

/* État de l'appli. role : admin (bureau), cap (capitaine), mem (adhérent), kid (compte jeune de Léo) */
const S={ecTab:'mine',ag:'all',tab:'home',stack:[],club:0,role:'admin',liked:new Set(),follow:new Set(['ines','sarah','thomas']),blocked:new Set(),
 chanTab:'club',recTab:'now',clubTab:'actus',champ:'c1',scoring:false,flash:null,pop:null,sent:false,dir:0,img:null,imgs:[],grpAll:false,
 share:{tel:true,mail:false,soc:true},nset:{club:true,follow:true,chan:true,team:true,live:false,play:true,mine:true},
 plan:{mode:'events',d:TODAY,cat:{ens:1,ani:1,eq:1},sp:{Tennis:1,Padel:1}},list:{sort:'tennis',f:'all',q:''},palm:'tennis',season:'2026-2027',arch:{s:'',t:'arts'}};

const club=()=>CLUBS[S.club];
/* logo /RAM Club lisible sur les couleurs du club : blanc sur fond sombre, noir sur fond clair */
const ramLogo=()=>club().dark?'img/ram-club-blanc.png':'img/ram-club-noir.png';
const ME=()=>window.RAM_KEY||(S.role==='wait'?'lucas':S.role==='kid'?'leo':S.role==='coach'?'sarah':'me');
/* L'enseignant a les pouvoirs du bureau, sauf les commissions ; le bureau seul gère les commissions */
const isAdmin=()=>S.role==='admin'||S.role==='coach';
const isBureau=()=>S.role==='admin';
const canTeam=g=>isAdmin()||(!!g&&g.cap===ME()&&(S.role==='cap'||!!window.RAM_KEY));
const name=id=>id==='club'?club().name:M[id].n;
const first=id=>name(id).split(' ')[0];
const age=id=>{if(!M[id]||!M[id].bd)return 30;const [y,m,d]=M[id].bd.split('-').map(Number),[Y,Mo,D]=TODAY.split('-').map(Number);return Y-y-((Mo<m||(Mo===m&&D<d))?1:0)};
/* Équipes et championnats des saisons clôturées : retirés de l'appli, gardés pour les archives */
const OLDG=[],OLDC=[];
const grp=id=>GROUPS.find(g=>g.id===id)||OLDG.find(g=>g.id===id);
const champOf=g=>g&&(CHAMPS.find(c=>c.id===g.champ)||OLDC.find(c=>c.id===g.champ));
const recSport=r=>{const c=champOf(grp(r.tid));return c?c.sport:''};
const teamName=g=>g.name+(g.gen&&g.gen!=='Mixte'?' '+g.gen:'');
function teamScore(r){if(r.fin)return r.fin;let a=0,b=0;(r.ms||[]).forEach(m=>{if(m.st==='done')m.w===0?a++:b++});return[a,b]}
/* Un set est valide s'il se termine 6-0 à 6-4, 7-5 ou 7-6 */
const setOk=(a,b)=>{const hi=Math.max(a,b),lo=Math.min(a,b);return (hi===6&&lo<=4)||(hi===7&&(lo===5||lo===6))};
/* Infos du club modifiables par le bureau, demandes d'adhésion, échelle des niveaux padel */
const CLUBINFO={courts:6,pistes:2,members:412,joined:318,house:'Tous les jours, 9 h – 21 h',secr:'Mer. et sam., 14 h – 18 h',addr:'12 allée des Tilleuls',shop:'https://www.riseandmove.fr',book:'',pay:'',code:'TPC-4821',mods:{actus:true,comm:true}};
const JOINREQ=[{id:'lucas',n:'Lucas Petit',mail:'lucas.petit@exemple.fr',via:'le code du club'},{n:'Lucie Marchand',mail:'lucie.marchand@exemple.fr',via:'le code du club'},{n:'Olivier Fabre',mail:'olivier.fabre@exemple.fr',via:"un lien d'invitation"}];
const LVHELP="Échelle du club : 1-2 débutant · 3-4 loisir · 5-6 intermédiaire · 7-8 confirmé · 9-10 compétition. Le niveau est validé par les enseignants padel.";
const isMinor=id=>!!(M[id]&&M[id].role==='Jeune');
Object.assign(I,{sound:'<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',mute:'<path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6"/>'});
M.leo.photoOk=false;
S.share={tel:false,mail:false,soc:false};S.plan.mine=false;S.reply=null;
chans[1].msgs[0].re={'👍':4,'❤️':2};
posts.find(p=>p.id==='p6').close='2026-10-20';
grp('pad1').mem.push('me');recs.find(r=>r.id==='r3').lineup.me='R';
Object.assign(I,{trophy:'<path d="M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M12 14v4M8 21h8M9 18h6"/>',school:'<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'});
posts.splice(2,0,{id:'p15',by:'sarah',t:'Il y a 4 h',kind:'event',stage:true,reg:'int',sport:'Tennis',d:'2026-10-26',d2:'2026-10-30',h1:'9 h',h2:'12 h',date:'Du 26 au 30 oct · 9 h – 12 h',place:'Courts 1 à 4',title:'Stage de la Toussaint <em>jeunes</em>',body:"Cinq matinées de technique et de matchs pour les 8-14 ans, encadrées par Sarah.",yes:9,maybe:2,cap:16,my:null,ins:[],likes:7,com:[]});
posts.find(p=>p.id==='p1').com[0].re={'👏':3};
/* Accès à l'appli : validé saison par saison. Un compte non validé pour la saison en cours ne voit que son profil */
M.lucas={n:'Lucas Petit',r:'30/1',team:'Nouvel inscrit',fol:0,g:'H',bd:'1996-03-02',res:[]};
const VALID={};Object.keys(M).forEach(k=>{if(k!=='lucas')VALID[k]=S.season});
const pending=()=>S.role!=='admin'&&S.role!=='coach'&&VALID[ME()]!==S.season;
/* Résultats finaux des équipes, saisons passées */
GROUPS.find(g=>g.id==='eq1').hist=[{season:'2025-2026',fmt:'Poule',pp:'3e',pn:6,tm:'stade',ts:'',tp:'',out:'Maintien',div:'',from:'Régional 2',champ:'Championnat de France par équipes',txt:'Maintien assuré lors de la dernière journée.'}];
GROUPS.find(g=>g.id==='eqd').hist=[{season:'2025-2026',fmt:'Poule puis tableau final',pp:'1er',pn:5,tm:'stade',ts:'Demi-finaliste',tp:'',out:'Montée',div:'Régional 3',from:'Départemental 1',champ:'Championnat de France par équipes',txt:''}];
NOTIFS.unshift({by:'sarah',txt:'Adultes compétition de ce soir : le cours a lieu en salle (pluie annoncée)',t:'Il y a 2 h',n:1,go:{v:'agenda',ag:'cours'},to:['me','ines','thomas','nathan']});
NOTIFS.unshift({by:'paul',txt:'te convoque comme remplaçant : Padel 1 – AS Padel Objat, dim. 18 oct',t:'Il y a 20 min',n:1,go:{v:'rec',id:'r3'},conv:'r3'});
/* Chaque groupe d'entraînement et chaque équipe a toujours son groupe de discussion (rattrape les groupes qui n'en avaient pas) */
function ensureGroupChans(){GROUPS.forEach(g=>{if((g.type!=='train'&&g.type!=='team')||chans.some(c=>c.id===g.id))return;const co=champOf(g);
 chans.push({id:g.id,g:g.type,sport:g.type==='team'?(co&&co.sport):g.sport,name:g.type==='team'?teamName(g):g.name,desc:g.sub,kid:g.mem.some(isMinor)?1:0,un:0,
  msgs:[{by:g.type==='train'?(g.coach||'club'):(g.cap||'club'),x:g.type==='train'?`Bienvenue dans le groupe ${g.name} ! Les infos des cours passeront ici.`:'Bienvenue dans le groupe de l\'équipe ! Compos et convocations passeront ici.',t:'Lun.'}]})})}
ensureGroupChans();
