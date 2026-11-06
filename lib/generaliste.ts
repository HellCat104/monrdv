// La consultation du MÉDECIN GÉNÉRALISTE : ses rubriques et ses trames.
//
// ── POURQUOI CE FICHIER ─────────────────────────────────────────────────────
//
// Des trois branches développées, le généraliste était la seule sans
// consultation structurée. Le gastro-entérologue et le dentiste ont chacun
// leur écran à rubriques ; lui écrivait tout dans une case de texte, sous
// quatre intitulés en gris.
//
// L'écran est le même pour les trois (components/consultation/
// ConsultationStructuree.tsx) : il reçoit ses rubriques et ses trames, il ne
// les connaît pas. Ce fichier est donc tout ce qu'il manquait.
//
// ── CE QUI CHANGE PAR RAPPORT AU GASTRO ─────────────────────────────────────
//
// Le généraliste voit TOUT : de l'angine au suivi d'un hypertendu de soixante
// ans. Ses rubriques sont donc plus larges et moins nombreuses — « Examen
// clinique » plutôt que « Symptômes digestifs », pas d'« hypothèses
// diagnostiques » séparées du diagnostic. En revanche il a deux rubriques que
// les autres n'ont pas : l'ARRÊT DE TRAVAIL, qu'on lui demande tous les
// jours, et l'ÉDUCATION du patient, qui est le gros du suivi d'un chronique.
//
// ── LA RÈGLE DES TRAMES, QUI NE SE NÉGOCIE PAS ──────────────────────────────
//
// Une trame ne dépose que des INTITULÉS suivis de « : », jamais une réponse.
// « Tension artérielle : » et non « Tension artérielle : normale ». Une trame
// qui répondrait à la place du praticien lui ferait signer une constatation
// qu'il n'a pas faite.
import type { RubriqueConsultation, TrameConsultation } from '@/lib/gastro'

export const RUBRIQUES_GENERALISTE: RubriqueConsultation[] = [
  { cle: 'motif', label: 'Motif de consultation', lignes: 2 },
  { cle: 'histoire', label: 'Histoire de la maladie', lignes: 4 },
  { cle: 'antecedents', label: 'Antécédents et traitements', lignes: 3, aide: 'Repris du dossier, à amender pour cette consultation' },
  { cle: 'allergies', label: 'Allergies', lignes: 2 },
  { cle: 'mesures', label: 'Constantes et mesures', lignes: 2, aide: 'Reprises de la dernière prise, à corriger si vous remesurez' },
  { cle: 'examen_clinique', label: 'Examen clinique', lignes: 5 },
  { cle: 'diagnostic', label: 'Diagnostic retenu', lignes: 2 },
  { cle: 'examens_demandes', label: 'Examens complémentaires demandés', lignes: 3 },
  { cle: 'traitement', label: 'Traitement prescrit', lignes: 3 },
  { cle: 'conduite', label: 'Conduite à tenir et éducation du patient', lignes: 3 },
  { cle: 'arret_travail', label: 'Arrêt de travail', lignes: 2, aide: 'Durée et motif, s’il y a lieu. Le certificat s’établit depuis l’onglet Documents.' },
]

/** Les motifs qui remplissent la salle d'attente d'un généraliste marocain.
 *
 *  Huit, pas trente : une liste qu'on parcourt des yeux. Celles qui manquent
 *  se traitent très bien à la main — c'est le quotidien qu'on outille, pas
 *  l'exhaustivité. */
export const TRAMES_GENERALISTE: TrameConsultation[] = [
  {
    cle: 'hta', nom: 'Hypertension — suivi',
    champs: {
      motif: 'Suivi d’hypertension artérielle',
      histoire: 'Ancienneté de l’HTA :\nTraitement actuel et observance :\nAutomesure à domicile :\nTolérance du traitement :',
      examen_clinique: 'Tension artérielle (bras droit / bras gauche) :\nFréquence cardiaque :\nPoids :\nAuscultation cardiaque :\nŒdèmes des membres inférieurs :\nSouffle vasculaire :',
      conduite: 'Régime hyposodé :\nActivité physique :\nAutomesure tensionnelle :\nProchain contrôle :',
    },
  },
  {
    cle: 'diabete', nom: 'Diabète — suivi',
    champs: {
      motif: 'Suivi de diabète',
      histoire: 'Type et ancienneté :\nTraitement actuel et observance :\nGlycémies à domicile :\nHypoglycémies :',
      examen_clinique: 'Poids et IMC :\nTension artérielle :\nExamen des pieds (sensibilité, pouls, lésions) :\nÉtat cutané :',
      examens_demandes: 'HbA1c :\nGlycémie à jeun :\nCréatinine et DFG :\nMicroalbuminurie :\nBilan lipidique :\nFond d’œil :',
      conduite: 'Alimentation :\nActivité physique :\nAutosurveillance :\nSoins des pieds :',
    },
  },
  {
    cle: 'respiratoire', nom: 'Infection respiratoire',
    champs: {
      motif: 'Infection respiratoire',
      histoire: 'Début des symptômes :\nFièvre :\nToux (sèche ou productive) :\nExpectorations :\nDyspnée :\nContage :',
      examen_clinique: 'Température :\nFréquence respiratoire :\nSaturation :\nGorge et tympans :\nAuscultation pulmonaire :\nAdénopathies :',
    },
  },
  {
    cle: 'fievre', nom: 'Fièvre',
    champs: {
      motif: 'Fièvre',
      histoire: 'Début et évolution :\nFrissons :\nSignes associés (urinaires, digestifs, ORL, cutanés) :\nVoyage récent :\nTraitement déjà pris :',
      examen_clinique: 'Température :\nTension artérielle et pouls :\nÉtat général et conscience :\nGorge, tympans, adénopathies :\nAuscultation :\nAbdomen :\nPeau (éruption, purpura) :',
    },
  },
  {
    cle: 'abdominal', nom: 'Douleur abdominale',
    champs: {
      motif: 'Douleur abdominale',
      histoire: 'Siège :\nType :\nIrradiation :\nHoraire et ancienneté :\nFacteurs déclenchants et calmants :\nTransit :\nVomissements :',
      examen_clinique: 'Température :\nAbdomen (souplesse, défense, douleur provoquée) :\nOrifices herniaires :\nFosses lombaires :\nToucher rectal :',
    },
  },
  {
    cle: 'lombalgie', nom: 'Lombalgie',
    champs: {
      motif: 'Lombalgie',
      histoire: 'Début et circonstance :\nSiège et irradiation :\nHoraire (mécanique ou inflammatoire) :\nRetentissement sur le travail :\nTraitement déjà pris :',
      examen_clinique: 'Mobilité du rachis :\nContracture paravertébrale :\nLasègue :\nExamen neurologique des membres inférieurs :\nSignes d’alarme (fièvre, amaigrissement, trouble sphinctérien) :',
    },
  },
  {
    cle: 'certificat', nom: 'Certificat d’aptitude',
    champs: {
      motif: 'Visite en vue d’un certificat d’aptitude',
      histoire: 'Activité ou poste concerné :\nAntécédents pertinents :\nTraitement en cours :',
      examen_clinique: 'Taille, poids, IMC :\nTension artérielle et pouls :\nAuscultation cardiaque et pulmonaire :\nAppareil locomoteur :\nVision et audition :',
      conduite: 'Aptitude :\nRéserves ou restrictions :',
    },
  },
  {
    cle: 'renouvellement', nom: 'Renouvellement d’ordonnance',
    champs: {
      motif: 'Renouvellement de traitement au long cours',
      histoire: 'Traitement en cours :\nObservance :\nEffets indésirables :\nÉvénement depuis la dernière consultation :',
      examen_clinique: 'Tension artérielle :\nPoids :\nTolérance clinique :',
      conduite: 'Durée du renouvellement :\nBilan à prévoir :',
    },
  },
]
