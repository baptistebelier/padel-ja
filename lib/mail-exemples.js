/* Un exemple de chaque e-mail, avec des données fictives : sert à l'aperçu (tools/apercu-emails.js) et aux tests.
   « qui » = qui le reçoit, « quand » = ce qui le déclenche. */
'use strict';
const Mail = require('./mail.js');

const BASE = 'https://pista.riseandmove.fr', PLANNING = 'https://dojo.riseandmove.fr/';
const exemples = () => [
  { id: 'bienvenue', qui: 'juge-arbitre', quand: 'création d’un compte /RAM sur /Pista', mail: Mail.welcomeMail({ first: 'Camille', appUrl: BASE }) },
  { id: 'mot-de-passe', qui: 'titulaire du compte', quand: 'mot de passe oublié', mail: Mail.resetMail({ first: 'Camille', link: BASE + '/reinitialiser?t=jeton-exemple' }) },
  { id: 'acces', qui: 'acheteur', quand: 'achat d’un pass sur la boutique', mail: Mail.accessMail({ first: 'Camille', items: ['Pass tournoi'], until: Date.UTC(2026, 11, 20), link: BASE + '/reinitialiser?t=jeton-exemple', appUrl: BASE }) },
  { id: 'adjoint', qui: 'juge-arbitre adjoint invité', quand: 'ajout comme adjoint d’un tournoi', mail: Mail.adjointMail({ by: 'Camille Roux', tournoi: 'P100 Soirée', link: BASE + '/t/exemple' }) },
  { id: 'resa-eleve', qui: 'élève', quand: 'réservation d’un cours sur la page publique', mail: Mail.resaMail({ first: 'Léa', nom: 'Cours individuel', jour: 'mardi 24 novembre', heure: '18 h', duree: '1 h', lieu: 'En salle', coach: 'Sarah', prix: 45, couvert: '', lien: BASE + '/r/annuler?c=club1&id=r1&t=signature', page: BASE + '/r/club1/cle1' }) },
  { id: 'resa-coach', qui: 'enseignant', quand: 'un élève réserve sur sa page', mail: Mail.resaCoachMail({ coach: 'Sarah', eleve: 'Léa Martin', contact: 'lea@exemple.test · 06 12 34 56 78', nom: 'Cours individuel', jour: 'mardi 24 novembre', heure: '18 h', duree: '1 h', lieu: 'En salle', prix: 45, couvert: '', lien: PLANNING }) },
  { id: 'annulation-eleve', qui: 'élève', quand: 'il annule lui-même (lien du mail)', mail: Mail.annulationMail({ first: 'Léa', nom: 'Cours individuel', coach: 'Sarah', jour: 'mardi 24 novembre', heure: '18 h' }) },
  { id: 'annulation-coach', qui: 'enseignant', quand: 'un élève annule', mail: Mail.annulationCoachMail({ coach: 'Sarah', eleve: 'Léa Martin', nom: 'Cours individuel', jour: 'mardi 24 novembre', heure: '18 h', lien: PLANNING }) },
  { id: 'cours-annule', qui: 'élève', quand: 'l’enseignant annule le cours réservé', mail: Mail.resaChangeMail({ first: 'Léa', nom: 'Cours individuel', coach: 'Sarah', annule: true, jour: 'mardi 24 novembre', heure: '18 h' }) },
  { id: 'cours-deplace', qui: 'élève', quand: 'l’enseignant déplace le cours réservé', mail: Mail.resaChangeMail({ first: 'Léa', nom: 'Cours individuel', coach: 'Sarah', annule: false, jour: 'mercredi 25 novembre', heure: '19 h' }) },
  { id: 'acces-resa', qui: 'élève déjà connu', quand: '« Déjà élève ? Se connecter » sur la page de réservation', mail: Mail.accesResaMail({ first: 'Léa', coach: 'Sarah', link: BASE + '/reinitialiser?t=jeton-exemple&retour=%2Fr%2Fclub1%2Fcle1' }) },
  { id: 'confirmation-adresse', qui: 'titulaire du compte', quand: 'confirmation d’adresse depuis la page de réservation', mail: Mail.confirmationMail({ first: 'Léa', coach: 'Sarah', link: BASE + '/r/club1/cle1?v=jeton-exemple' }) },
  { id: 'inscription-ok', qui: 'inscrit', quand: 'inscription par lien /i/, validée', mail: Mail.inscriptionMail({ first: 'Léa', titre: 'Séance collective', coach: 'Sarah', jour: 'jeudi 26 novembre', heure: '19 h', duree: '1 h 30', lieu: 'Padel Club Azur', tarif: '15 €', statut: 'ok', lien: BASE + '/i/annuler?c=club1&p=p1&k=e1&d=2026-11-26&t=signature' }) },
  { id: 'inscription-attente', qui: 'inscrit', quand: 'inscription par lien /i/, liste d’attente', mail: Mail.inscriptionMail({ first: 'Léa', titre: 'Séance collective', coach: 'Sarah', jour: 'jeudi 26 novembre', heure: '19 h', statut: 'wait', lien: BASE + '/i/annuler?c=club1&p=p1&k=e1&d=2026-11-26&t=signature' }) },
  { id: 'inscription-coach', qui: 'enseignant', quand: 'une inscription par son lien', mail: Mail.inscriptionCoachMail({ coach: 'Sarah', eleve: 'Léa Martin', contact: 'lea@exemple.test · 06 12 34 56 78', titre: 'Séance collective', jour: 'jeudi 26 novembre', heure: '19 h', statut: 'ok', lien: PLANNING }) },
  { id: 'desinscription-eleve', qui: 'inscrit', quand: 'il se désinscrit (lien du mail)', mail: Mail.desinscriptionMail({ first: 'Léa', titre: 'Séance collective', jour: 'jeudi 26 novembre', heure: '19 h', coach: 'Sarah' }) },
  { id: 'desinscription-coach', qui: 'enseignant', quand: 'un inscrit se désinscrit', mail: Mail.desinscriptionCoachMail({ coach: 'Sarah', eleve: 'Léa Martin', titre: 'Séance collective', jour: 'jeudi 26 novembre', heure: '19 h', lien: PLANNING }) },
  { id: 'place-libre', qui: 'personne en liste d’attente', quand: 'une place se libère et elle passe inscrite', mail: Mail.placeLibreMail({ first: 'Noé', titre: 'Séance collective', coach: 'Sarah', jour: 'jeudi 26 novembre', heure: '19 h' }) }
];
module.exports = { exemples };
