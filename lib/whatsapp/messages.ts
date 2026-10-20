// Tous les textes du chatbot, à un seul endroit.
//
// PREMIÈRE RÉDACTION — À RELIRE. Ce sont les mots que le patient lit :
// ils portent la voix de MonRDV, pas la mienne. Ils sont ici pour être corrigés
// sans toucher à la machine à états.
//
// CONTRAINTES WHATSAPP, non négociables (Meta tronque sans avertir) :
//   bouton       — 3 maximum, titre ≤ 20 caractères
//   liste        — 10 lignes maximum, titre de ligne ≤ 24, description ≤ 72
//   bouton liste — ≤ 20 caractères
//
// RÈGLE DE CONTENU : aucun élément clinique ne sort d'ici. Ni motif dans un
// récapitulatif de RDV existant, ni acte, ni montant dû, ni ordonnance. Le
// téléphone peut être celui du mari, du frère, du cybercafé — ce qu'on écrit
// peut être lu par quelqu'un d'autre que le patient.

/** Mots qui font basculer en urgence, à n'importe quelle étape.
 *  Volontairement large : un faux positif coûte un appel au cabinet,
 *  un faux négatif coûte un patient mal orienté. */
export const MOTS_URGENCE = [
  'urgence', 'urgent', 'saigne', 'saignement', 'hémorragie', 'hemorragie',
  'gonfl', 'abcès', 'abces', 'cassé', 'casse une dent', 'traumatisme', 'chute',
  'fièvre', 'fievre', 'insupportable', 'très mal', 'tres mal', 'souffre',
  'douleur', 'mal partout', 'respire',
]

export const T = {
  // ---------------------------------------------------------------- accueil
  accueilConnu: (prenom: string, medecin: string, ville: string | null) =>
    `Bonjour ${prenom} 👋\nCabinet ${medecin}${ville ? ` — ${ville}` : ''}\n\nQue puis-je faire pour vous ?`,

  accueilCabinet: (medecin: string, ville: string | null) =>
    `Bonjour 👋\nCabinet ${medecin}${ville ? ` — ${ville}` : ''}\n\nQue puis-je faire pour vous ?`,

  accueilInconnu:
    `Bonjour 👋 Je suis l'assistant de prise de rendez-vous MonRDV.\n\n` +
    `Vous avez déjà un praticien, ou vous en cherchez un ?`,

  btnPrendreRdv: 'Prendre un RDV',
  btnProchainRdv: 'Mon prochain RDV',
  btnSecretaire: 'Parler au cabinet',
  btnTrouverPraticien: 'Trouver un cabinet',
  btnDejaCabinet: "J'ai un cabinet",

  trouverPraticien: (lien: string) =>
    `Vous trouverez tous les praticiens, leurs adresses et leurs horaires ici :\n${lien}\n\n` +
    `Vous pourrez prendre rendez-vous directement depuis leur page.`,

  // -------------------------------------------------------------- résolution
  quelCabinet: `Chez quel praticien souhaitez-vous un rendez-vous ?`,
  btnListeCabinets: 'Voir les cabinets',

  // « Cabinet X — le rendez-vous est pour qui ? » sonnait comme un guichet.
  // Un patient qui écrit à son dentiste n'attend pas un formulaire : on salue,
  // on dit où il est tombé, puis on pose la question.
  quellePersonne: (medecin: string) =>
    `Bonjour 👋\n\nVous êtes bien au cabinet ${medecin}.\n\n` +
    `Ce numéro est partagé par plusieurs personnes — pour qui est le rendez-vous ?`,
  btnListePersonnes: 'Choisir',
  ligneAutrePersonne: 'Quelqu’un d’autre',

  demanderIdentite:
    `Pour créer votre fiche, indiquez-moi votre **prénom et nom**.\n\n` +
    `Exemple : Yasmine Alaoui`,

  identiteIncomprise:
    `Je n'ai pas bien saisi. Écrivez simplement votre prénom puis votre nom.\n\n` +
    `Exemple : Yasmine Alaoui`,

  // -------------------------------------------------------------------- âge
  // Demandé SEULEMENT quand la route en a besoin et qu'on ne l'a pas déjà :
  // forfait Cabinet, et fiche sans âge ni date de naissance. Au forfait Agenda,
  // la question ne se pose jamais — ce forfait ne collecte aucune donnée
  // démographique, et poser la question reviendrait à la collecter quand même.
  demanderAge: `Quel âge avez-vous ?\n\nRépondez simplement par un nombre.`,
  demanderAgePour: (prenom: string) => `Quel âge a ${prenom} ?\n\nRépondez simplement par un nombre.`,
  ageInvalide: `Je n'ai pas compris l'âge. Répondez par un nombre, par exemple : 34`,

  // ------------------------------------------------------------------ motif
  quelMotif: `Pour quel motif ?`,
  btnListeMotifs: 'Choisir le motif',

  // ------------------------------------------------------------------- jour
  quelJour: (medecin: string) => `Prochaines disponibilités — ${medecin} :`,
  btnListeJours: 'Voir les dates',
  ligneJour: (nbCreneaux: number) =>
    nbCreneaux === 1 ? '1 créneau libre' : `${nbCreneaux} créneaux libres`,
  lignePlusTard: 'Plus tard / autres dates',
  descriptionPlusTard: 'Voir tout l’agenda sur le site',

  plusTard: (medecin: string, lien: string) =>
    `Pour les dates au-delà de 7 jours, l'agenda complet de ${medecin} est ici :\n${lien}`,

  aucuneDispo: (medecin: string, lien: string) =>
    `Aucun créneau libre dans les 7 prochains jours chez ${medecin} 😕\n\n` +
    `L'agenda complet est ici :\n${lien}\n\n` +
    `Vous pouvez aussi demander au cabinet de vous rappeler.`,

  // ------------------------------------------------------------------ heure
  quelleHeure: (libelleJour: string) => `${libelleJour} — à quelle heure ?`,
  btnListeHeures: 'Choisir l’heure',

  // ----------------------------------------------------------- confirmation
  // Le bouton « Je confirme » vaut consentement au traitement des données
  // (loi 09-08) : la mention doit donc être LUE avant le clic, pas après.
  recapitulatif: (medecin: string, quand: string, motif: string, pour: string | null) =>
    `Je récapitule :\n\n` +
    `👨‍⚕️ ${medecin}\n` +
    `📅 ${quand}\n` +
    `🦷 ${motif}\n` +
    (pour ? `👤 Pour ${pour}\n` : '') +
    `\nEn confirmant, vous acceptez que ces informations soient transmises au cabinet.`,

  btnConfirmer: 'Je confirme',
  btnChanger: 'Changer',

  confirme: (medecin: string, quand: string, adresse: string | null, lienAnnuler: string, lienAgenda: string) =>
    `✅ C'est noté.\n\n` +
    `${medecin}\n${quand}\n` +
    (adresse ? `📍 ${adresse}\n` : '') +
    `\n📅 Ajouter à mon agenda :\n${lienAgenda}\n\n` +
    `Un empêchement ? Annulez ici pour libérer la place :\n${lienAnnuler}`,

  proposerEmail:
    `Souhaitez-vous recevoir un rappel par email la veille ?\n\n` +
    `Si oui, écrivez-moi simplement votre adresse email.`,
  btnPasDEmail: 'Non merci',
  emailEnregistre: `C'est enregistré, vous recevrez un rappel la veille 👍`,
  emailInvalide: `Cette adresse ne semble pas valide. Réécrivez-la, ou répondez « non ».`,

  // ---------------------------------------------------------------- échecs
  creneauPris: (libelleJour: string) =>
    `Ce créneau vient d'être réservé à l'instant 😕\n\nAutres disponibilités ${libelleJour} :`,

  creneauPlusValide:
    `Ce créneau n'est plus disponible. Reprenons depuis les dates.`,

  fenetreExpiree:
    `Notre conversation précédente a expiré. Repartons de zéro 👋`,

  // Le mot proposé ici DOIT figurer dans `demandeUnHumain` (machine.ts). Il
  // disait « cabinet », retiré depuis de la liste parce qu'il escaladait des
  // réservations qui se passaient bien : le message promettait donc ce que le
  // code ne faisait plus.
  incompris:
    `Je n'ai pas compris 🤔\n\nUtilisez les propositions ci-dessous — ou écrivez ` +
    `« secrétaire » pour qu'une personne du cabinet vous réponde.`,

  // --------------------------------------------------------------- urgence
  // Aucune question clinique, aucune évaluation, aucune parole rassurante :
  // le chatbot n'est pas qualifié et ne doit pas en donner l'impression.
  urgence: (telCabinet: string | null) =>
    `⚠️ Je ne peux pas évaluer une urgence médicale.\n\n` +
    (telCabinet ? `📞 Appelez le cabinet : ${telCabinet}\n` : '') +
    `🚑 Urgence vitale : 150\n\n` +
    `Je préviens le cabinet immédiatement.`,

  // --------------------------------------------------------------- escalade
  escalade:
    `Je transmets votre message au cabinet 📩\n` +
    `Une personne vous répondra dans la journée.`,
}
