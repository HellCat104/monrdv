// La consultation du cabinet DENTAIRE : ses rubriques et ses trames.
//
// Même règle que partout ailleurs dans MonRDV : les trames ne déposent que des
// INTITULÉS à remplir. Une trame qui écrirait « douleur provoquée : oui »
// ferait signer au praticien un symptôme qu'il n'a pas constaté.
//
// Les rubriques réutilisent la table `consultations` (v81), commune à toutes
// les branches : seuls les libellés et l'ordre changent, parce qu'un dentiste
// ne lit pas son dossier comme un gastro-entérologue. Deux colonnes lui sont
// propres — les dents concernées et les matériaux (v85).
import type { RubriqueConsultation, TrameConsultation } from '@/lib/gastro'

export const RUBRIQUES_CONSULTATION_DENTAIRE: RubriqueConsultation[] = [
  { cle: 'motif',            label: 'Motif de consultation', lignes: 2 },
  { cle: 'symptomes',        label: 'Symptômes', lignes: 3 },
  { cle: 'antecedents',      label: 'Antécédents et traitements', lignes: 3, aide: 'Repris du dossier, à amender pour cette séance' },
  { cle: 'allergies',        label: 'Allergies', lignes: 2 },
  { cle: 'examen_clinique',  label: 'Examen clinique', lignes: 4, aide: 'Exo-buccal, endo-buccal, hygiène, occlusion' },
  { cle: 'diagnostic',       label: 'Diagnostic', lignes: 2 },
  { cle: 'hypotheses',       label: 'Observations', lignes: 3 },
  { cle: 'traitement',       label: 'Actes réalisés ce jour', lignes: 3, aide: 'Ce qui a été FAIT au fauteuil. Les actes facturables se cochent sur le devis.' },
  { cle: 'examens_demandes', label: 'Radiographies et examens', lignes: 2 },
  { cle: 'conduite',         label: 'Conduite à tenir', lignes: 3 },
  { cle: 'recommandations',  label: 'Recommandations au patient', lignes: 3, aide: 'Consignes postopératoires, hygiène' },
]

export const TRAMES_CONSULTATION_DENTAIRE: TrameConsultation[] = [
  {
    cle: 'premiere', nom: 'Première consultation',
    champs: {
      motif: 'Première consultation — bilan',
      symptomes: 'Doléances du patient :\nDouleurs actuelles :\nDate des derniers soins :',
      examen_clinique: 'Exo-buccal :\nEndo-buccal — muqueuses :\nHygiène bucco-dentaire :\nTartre :\nOcclusion :\nParodonte :\nSchéma dentaire relevé : oui / non',
      conduite: 'Plan de traitement proposé :\nOrdre des séances :',
    },
  },
  {
    cle: 'douleur', nom: 'Douleur dentaire',
    champs: {
      motif: 'Douleur dentaire',
      symptomes: 'Dent en cause (si identifiée) :\nType de douleur :\nSpontanée ou provoquée :\nDéclenchée par le chaud / le froid / le sucré :\nDurée après le stimulus :\nRéveils nocturnes :\nAncienneté :',
      examen_clinique: 'Inspection :\nPercussion axiale :\nPercussion latérale :\nTest au froid :\nPalpation apicale :\nMobilité :\nTuméfaction :',
    },
  },
  {
    cle: 'controle', nom: 'Contrôle / détartrage',
    champs: {
      motif: 'Contrôle périodique',
      symptomes: 'Doléances depuis la dernière visite :',
      examen_clinique: 'Hygiène :\nTartre et colorations :\nÉtat des restaurations existantes :\nGencives — saignement au sondage :\nNouvelles lésions :',
      recommandations: 'Technique de brossage :\nBrossettes ou fil :\nProchain contrôle conseillé :',
    },
  },
  {
    cle: 'urgence', nom: 'Urgence',
    champs: {
      motif: 'Urgence dentaire',
      symptomes: 'Depuis quand :\nDouleur (intensité) :\nTuméfaction :\nFièvre :\nTrismus :\nDifficulté à avaler ou à respirer :\nTraumatisme :',
      examen_clinique: 'État général :\nDent ou secteur en cause :\nMobilité :\nSuppuration :\nAdénopathies :',
      conduite: 'Geste d’urgence réalisé :\nOrdonnance :\nRevoir le :',
    },
  },
  {
    cle: 'prothese', nom: 'Prothèse',
    champs: {
      motif: 'Séance de prothèse',
      examen_clinique: 'Préparation :\nEmpreinte (technique, matériau) :\nTeinte :\nProvisoire posé :\nOcclusion vérifiée :',
      conduite: 'Travail envoyé au laboratoire le :\nEssayage prévu le :',
    },
  },
  {
    cle: 'suite', nom: 'Suite de traitement',
    champs: {
      motif: 'Poursuite du plan de traitement',
      symptomes: 'Suites de la séance précédente :\nDouleurs post-opératoires :',
      examen_clinique: 'Contrôle du soin précédent :\nÉtat de la zone traitée :',
    },
  },
]


// ════════════════════════════════════════════════════════════════════════════
// LE CATALOGUE D'ACTES (v86)
// ════════════════════════════════════════════════════════════════════════════
//
// Des CATÉGORIES proposées pour ranger, et rien d'autre. Aucun acte n'est
// livré, aucun tarif n'est suggéré, aucune nomenclature n'est reproduite : les
// prix d'un cabinet de Rabat ne sont pas ceux d'un cabinet de Taroudant, et
// les codes de la NGAP ne sont pas à moi de les écrire.
//
// Le praticien peut saisir une catégorie qui n'est pas dans cette liste : elle
// l'aide à ranger, elle ne le contraint pas.
export const CATEGORIES_ACTES_DENTAIRES = [
  'Consultation et diagnostic',
  'Détartrage et prévention',
  'Soins conservateurs',
  'Restaurations et composites',
  'Endodontie',
  'Extractions',
  'Chirurgie orale',
  'Prothèse fixe',
  'Prothèse amovible',
  'Implantologie',
  'Parodontologie',
  'Orthodontie',
  'Radiologie',
  'Actes complémentaires',
]
