// La branche GASTRO-ENTÉROLOGIE : ce que les écrans ont besoin de savoir.
//
// ── LA RÈGLE QUI GOUVERNE TOUT CE FICHIER ───────────────────────────────────
//
// On n'écrit QUE ce que le médecin a tapé. Aucune rubrique vide ne s'imprime,
// aucune région non explorée n'apparaît, aucun intervalle de surveillance
// n'est déduit d'un diagnostic, aucune posologie n'est livrée en dur.
//
// Ce n'est pas une précaution de façade. Un compte rendu d'endoscopie est un
// document signé : s'il annonce « œsophage sans particularité » parce que le
// formulaire avait une case par défaut, le médecin atteste d'un examen qu'il
// n'a pas fait. Les trames ci-dessous ne contiennent donc que des INTITULÉS à
// remplir — jamais une constatation.
import type { Endoscopie, LigneOrdonnance, ProtocolePreparation, TypeEndoscopie } from '@/types'
import { formatDateFr } from '@/lib/utils'

// ════════════════════════════════════════════════════════════════════════════
// B — Les rubriques de la consultation
// ════════════════════════════════════════════════════════════════════════════

export interface RubriqueConsultation {
  cle: string
  label: string
  /** Hauteur du champ : certaines rubriques sont une ligne, d'autres un récit. */
  lignes: number
  aide?: string
}

export const RUBRIQUES_CONSULTATION: RubriqueConsultation[] = [
  { cle: 'motif',            label: 'Motif de consultation', lignes: 2 },
  { cle: 'histoire',         label: 'Histoire de la maladie', lignes: 4 },
  { cle: 'symptomes',        label: 'Symptômes digestifs et évolution', lignes: 4 },
  { cle: 'antecedents',      label: 'Antécédents et traitements', lignes: 3, aide: 'Repris du dossier, à amender pour cette consultation' },
  { cle: 'allergies',        label: 'Allergies', lignes: 2 },
  { cle: 'mesures',          label: 'Constantes, poids et mesures', lignes: 2 },
  { cle: 'examen_clinique',  label: 'Examen clinique', lignes: 4 },
  { cle: 'hypotheses',       label: 'Hypothèses diagnostiques', lignes: 3 },
  { cle: 'diagnostic',       label: 'Diagnostic retenu', lignes: 2 },
  { cle: 'examens_demandes', label: 'Examens complémentaires demandés', lignes: 3 },
  { cle: 'traitement',       label: 'Traitement prescrit', lignes: 3 },
  { cle: 'conduite',         label: 'Conduite à tenir', lignes: 3 },
  { cle: 'recommandations',  label: 'Recommandations', lignes: 3 },
]

/** Une trame de consultation : des INTITULÉS que le médecin remplit.
 *
 *  Chaque ligne se termine par « : » et rien derrière. C'est délibéré — une
 *  trame qui proposerait « Pyrosis : oui » cocherait un symptôme à la place du
 *  praticien, et il signerait l'observation. Ici elle ne fait que lui éviter
 *  d'oublier une question. */
export interface TrameConsultation {
  cle: string
  nom: string
  champs: Partial<Record<string, string>>
}

export const TRAMES_CONSULTATION: TrameConsultation[] = [
  {
    cle: 'rgo', nom: 'Reflux gastro-œsophagien',
    champs: {
      motif: 'Reflux gastro-œsophagien',
      symptomes: 'Pyrosis :\nRégurgitations :\nDysphagie :\nToux ou symptômes ORL :\nHoraire et facteurs déclenchants :\nAncienneté :',
      examen_clinique: 'État général :\nAbdomen :\nSignes d’alarme (amaigrissement, anémie, dysphagie) :',
    },
  },
  {
    cle: 'douleurs', nom: 'Douleurs abdominales',
    champs: {
      motif: 'Douleurs abdominales',
      symptomes: 'Siège :\nType :\nIrradiation :\nHoraire :\nFacteurs déclenchants et calmants :\nSignes associés :',
      examen_clinique: 'État général :\nPalpation :\nDéfense ou contracture :\nOrifices herniaires :\nToucher rectal :\nSignes d’alarme (fièvre, défense, amaigrissement, ictère) :',
    },
  },
  {
    cle: 'transit', nom: 'Troubles du transit',
    champs: {
      motif: 'Troubles du transit',
      symptomes: 'Fréquence des selles :\nConsistance (Bristol) :\nAlternance :\nDouleurs associées :\nBallonnements :\nAncienneté :',
      examen_clinique: 'État général :\nAbdomen :\nToucher rectal :\nSignes d’alarme (rectorragies, amaigrissement, anémie, âge > 50 ans) :',
    },
  },
  {
    cle: 'diarrhee', nom: 'Diarrhée chronique',
    champs: {
      motif: 'Diarrhée chronique',
      symptomes: 'Ancienneté :\nNombre de selles / 24 h :\nSelles nocturnes :\nGlaires ou sang :\nAmaigrissement :\nVoyage, antibiotiques récents :\nTerrain (thyroïde, diabète) :',
      examen_clinique: 'Poids et variation :\nÉtat d’hydratation :\nAbdomen :\nSignes extra-digestifs :\nSignes d’alarme (sang, selles nocturnes, amaigrissement, fièvre) :',
    },
  },
  {
    cle: 'constipation', nom: 'Constipation',
    champs: {
      motif: 'Constipation',
      symptomes: 'Fréquence des selles :\nEffort de poussée :\nSensation d’évacuation incomplète :\nLaxatifs utilisés :\nApports en fibres et en eau :\nAncienneté :',
      examen_clinique: 'Abdomen :\nMarge anale :\nToucher rectal :\nSignes d’alarme (début récent après 50 ans, sang, amaigrissement) :',
    },
  },
  {
    // Le motif le plus fréquent du cabinet après le reflux, et il n'avait pas
    // de trame : le praticien repartait d'une page blanche dix fois par mois.
    cle: 'epigastralgies', nom: 'Épigastralgies / H. pylori',
    champs: {
      motif: 'Douleurs épigastriques',
      symptomes: 'Type de douleur :\nHoraire par rapport aux repas :\nBrûlures :\nBallonnements :\nNausées ou vomissements :\nAnciennet\u00e9 :',
      antecedents: 'Traitements déjà essayés et leur effet :\nAINS, aspirine, corticoïdes :\nTabac, alcool :\nTest H. pylori déjà fait (lequel, quand, résultat) :',
      examen_clinique: 'État général :\nSensibilité épigastrique :\nSignes d’alarme (amaigrissement, vomissements, anémie, dysphagie, âge > 50 ans) :',
    },
  },
  {
    cle: 'sii', nom: 'Intestin irritable',
    champs: {
      motif: 'Douleurs abdominales chroniques et ballonnements',
      symptomes: 'Douleur : siège, soulagée par la défécation ?\nModification de la fréquence des selles :\nModification de la consistance :\nAncienneté et rythme :\nRetentissement sur la vie quotidienne :',
      histoire: 'Facteurs alimentaires identifiés :\nStress, sommeil, activité physique :\nRégimes déjà tentés :',
      examen_clinique: 'État général :\nAbdomen :\nSignes d’alarme (sang, amaigrissement, fièvre, antécédent familial de cancer ou de MICI, anémie) :',
    },
  },
  {
    cle: 'suivi', nom: 'Suivi de maladie chronique',
    champs: {
      motif: 'Suivi de maladie chronique',
      histoire: 'Pathologie suivie :\nDate du diagnostic :\nTraitement en cours et observance :\nDernier examen et sa date :',
      symptomes: 'Évolution depuis la dernière consultation :\nPoussées :\nTolérance du traitement :',
      examen_clinique: 'Poids et variation :\nAbdomen :\nSignes extra-digestifs :\nSignes d’alarme ou de décompensation :',
    },
  },
]

// ════════════════════════════════════════════════════════════════════════════
// C — Les régions explorées
// ════════════════════════════════════════════════════════════════════════════
//
// Une région n'apparaît dans le compte rendu QUE si le médecin y a écrit
// quelque chose. C'est la raison pour laquelle les observations vivent dans un
// objet et non dans des colonnes figées : une colonne vide ne se distingue pas
// d'une région non explorée, et le lecteur du compte rendu ne peut pas deviner
// laquelle des deux il a sous les yeux.

export const REGIONS_ENDOSCOPIE: Record<TypeEndoscopie, { cle: string; label: string }[]> = {
  gastroscopie: [
    { cle: 'oesophage',  label: 'Œsophage' },
    { cle: 'cardia',     label: 'Cardia et jonction œso-gastrique' },
    { cle: 'estomac',    label: 'Estomac' },
    { cle: 'pylore',     label: 'Pylore' },
    { cle: 'duodenum',   label: 'Duodénum' },
  ],
  coloscopie: [
    { cle: 'anus',          label: 'Marge anale et canal anal' },
    { cle: 'rectum',        label: 'Rectum' },
    { cle: 'sigmoide',      label: 'Sigmoïde' },
    { cle: 'colon_gauche',  label: 'Côlon gauche' },
    { cle: 'transverse',    label: 'Côlon transverse' },
    { cle: 'colon_droit',   label: 'Côlon droit' },
    { cle: 'caecum',        label: 'Cæcum et valvule de Bauhin' },
    { cle: 'ileon',         label: 'Iléon terminal' },
  ],
}

export const LIBELLE_EXAMEN: Record<TypeEndoscopie, string> = {
  gastroscopie: 'Compte rendu de gastroscopie',
  coloscopie:   'Compte rendu de coloscopie',
}

/** Le compte rendu assemblé, prêt à lire et à imprimer.
 *
 *  Chaque bloc n'est ajouté que s'il porte du texte. Le document d'un examen
 *  où seuls l'œsophage et l'estomac ont été vus ne mentionne pas le duodénum :
 *  le silence dit « non exploré », une phrase toute faite dirait « normal ».
 *  Les deux ne sont pas la même chose devant un tribunal. */
export function assemblerCompteRendu(e: Endoscopie): { titre: string; blocs: { titre: string; texte: string }[] } {
  const blocs: { titre: string; texte: string }[] = []
  const ajoute = (titre: string, texte?: string | null) => {
    const t = (texte ?? '').trim()
    if (t) blocs.push({ titre, texte: t })
  }

  ajoute('Indication', e.indication)
  ajoute('Conditions de réalisation', e.conditions)

  if (e.type_examen === 'coloscopie') {
    ajoute('Préparation', e.preparation)
    ajoute('Qualité de la préparation', e.qualite_preparation)
    ajoute('Étendue de l’exploration', e.etendue)
    ajoute('Qualité de la visualisation', e.qualite_visualisation)
  }

  const regions = REGIONS_ENDOSCOPIE[e.type_examen] ?? []
  const vues = regions
    .map((r) => ({ label: r.label, texte: (e.observations?.[r.cle] ?? '').trim() }))
    .filter((r) => r.texte)
  if (vues.length > 0) {
    ajoute('Observations', vues.map((r) => `${r.label} : ${r.texte}`).join('\n'))
  }

  ajoute('Lésions observées', e.lesions)

  const polypes = (e.polypes ?? []).filter((p) =>
    [p.localisation, p.taille_mm, p.morphologie, p.geste].some((v) => (v ?? '').trim()))
  if (polypes.length > 0) {
    ajoute('Polypes', polypes.map((p, i) => {
      const morceaux = [
        (p.localisation ?? '').trim(),
        (p.taille_mm ?? '').trim() ? `${String(p.taille_mm).trim()} mm` : '',
        (p.morphologie ?? '').trim(),
        (p.geste ?? '').trim() ? `geste : ${String(p.geste).trim()}` : '',
      ].filter(Boolean)
      return `${i + 1}. ${morceaux.join(' — ')}`
    }).join('\n'))
  }

  ajoute('Biopsies et prélèvements', e.prelevements)
  ajoute('Conclusion', e.conclusion)
  ajoute('Recommandations et suivi', e.recommandations)
  if (e.surveillance_le) {
    ajoute('Surveillance proposée', `Prochain contrôle proposé le ${formatDateFr(e.surveillance_le)}.`)
  }

  return { titre: LIBELLE_EXAMEN[e.type_examen], blocs }
}

// ════════════════════════════════════════════════════════════════════════════
// D — La fiche de préparation
// ════════════════════════════════════════════════════════════════════════════
//
// Aucun protocole n'est livré avec MonRDV. Les produits, les volumes et les
// horaires relèvent du praticien : en imposer reviendrait à prescrire à sa
// place. La fiche ci-dessous n'est qu'une mise en page de CE QU'IL A ÉCRIT.
//
// Rien n'y recommande l'arrêt d'un traitement : `consignes_medicaments` est
// son texte, pas une phrase toute faite sur les anticoagulants.

export function assemblerPreparation(
  p: ProtocolePreparation,
  heureExamen?: string | null,
): { titre: string; blocs: { titre: string; texte: string }[] } {
  const blocs: { titre: string; texte: string }[] = []
  const ajoute = (titre: string, texte?: string | null) => {
    const t = (texte ?? '').trim()
    if (t) blocs.push({ titre, texte: t })
  }

  if (heureExamen) ajoute('Heure prévue de l’examen', heureExamen)
  ajoute('Régime alimentaire', p.regime)
  ajoute('Produit de préparation', p.produit)
  ajoute('Modalités de prise', p.modalites)

  const horaires = (p.horaires ?? []).filter((h) => (h.quand ?? '').trim() || (h.quoi ?? '').trim())
  if (horaires.length > 0) {
    ajoute('Horaires', horaires.map((h) => `${(h.quand ?? '').trim()} — ${(h.quoi ?? '').trim()}`).join('\n'))
  }

  ajoute('Vos médicaments habituels', p.consignes_medicaments)
  ajoute('Consignes pratiques', p.consignes_pratiques)
  return { titre: 'Préparation à la coloscopie', blocs }
}

// ════════════════════════════════════════════════════════════════════════════
// E — Les modèles d'ordonnance
// ════════════════════════════════════════════════════════════════════════════

/** Le texte d'ordonnance produit par un modèle. Il est DÉPOSÉ dans l'éditeur,
 *  où le médecin l'adapte au patient avant d'enregistrer : un modèle ne
 *  prescrit pas, il évite de retaper. */
export function rendreModele(lignes: LigneOrdonnance[], examens?: string | null, notes?: string | null): string {
  const morceaux: string[] = []
  for (const l of lignes ?? []) {
    const bouts = [
      (l.medicament ?? '').trim(),
      (l.dosage ?? '').trim(),
      (l.voie ?? '').trim(),
      (l.frequence ?? '').trim(),
      (l.duree ?? '').trim(),
    ].filter(Boolean)
    if (bouts.length > 0) morceaux.push(`- ${bouts.join(' — ')}`)
  }
  const e = (examens ?? '').trim()
  if (e) morceaux.push('', 'Examens demandés :', e)
  const n = (notes ?? '').trim()
  if (n) morceaux.push('', n)
  return morceaux.join('\n')
}

/** Catégories PROPOSÉES pour ranger les modèles. Ce ne sont que des
 *  étiquettes : elles ne portent aucune posologie, et le médecin peut en
 *  saisir d'autres. */
export const CATEGORIES_MODELE = [
  'Inhibiteurs de la pompe à protons (IPP)',
  'Éradication d’Helicobacter pylori',
  'Préparation à la coloscopie',
  'Prescriptions courantes',
]
