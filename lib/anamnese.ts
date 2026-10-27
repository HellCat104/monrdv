// L'ANAMNÈSE MÉDICALE STRUCTURÉE — et les alertes qui doivent précéder le geste.
//
// ── LE PROBLÈME QUE ÇA RÈGLE ────────────────────────────────────────────────
//
// Le dossier portait déjà « allergies », « maladies chroniques », « traitement
// en cours » : quatre champs de texte libre. Un texte libre ne prévient
// personne. « Sintrom depuis 2019 » écrit en 2022 dans un champ qu'on n'ouvre
// pas ne s'affiche nulle part le jour où on extrait une dent.
//
// Ce qui change une séance dentaire n'est pas un paragraphe, c'est une réponse
// à une question précise : ce patient prend-il un anticoagulant ? est-il
// allergique à la pénicilline ? porte-t-il une valve ? Posées une fois,
// rangées, elles peuvent être RELUES PAR LE LOGICIEL et affichées d'elles-mêmes
// au bon moment — en haut du dossier, et au-dessus de l'odontogramme.
//
// ── CE QUE CE FICHIER NE FAIT PAS ───────────────────────────────────────────
//
// Aucune posologie, aucun choix de molécule, aucun protocole chiffré. La
// « conduite » attachée à chaque risque dit ce que la réponse CHANGE et auprès
// de qui vérifier — jamais quoi prescrire. Prescrire est l'affaire du
// praticien ; signaler à temps est l'affaire du logiciel.
//
// Le texte libre n'est pas remplacé : les deux sources alimentent la même
// bannière. Un cabinet qui ne remplit jamais le questionnaire garde ses
// alertes d'allergies.

export type Reponse = 'oui' | 'non' | 'inconnu'
export type Gravite = 'majeur' | 'modere' | 'info'

/** Ce qui est écrit en base, par question : la réponse et une précision libre.
 *  { "anticoagulant": { "r": "oui", "p": "Sintrom" } } */
export interface ReponseStockee { r?: Reponse; p?: string }
export type Anamnese = Record<string, ReponseStockee>

export interface ItemAnamnese {
  cle: string
  question: string
  groupe: string
  gravite: Gravite
  /** Ce que « oui » change à la séance. Un rappel de vérification. */
  conduite?: string
  /** Aide de saisie du champ de précision. */
  precision?: string
}

// ── LE QUESTIONNAIRE ────────────────────────────────────────────────────────
//
// Ordonné par ce qui change le geste, pas par appareil. L'hémostase et le cœur
// d'abord : c'est ce qui se décide AVANT de toucher une dent.
export const ITEMS_ANAMNESE: ItemAnamnese[] = [
  // ── Saignement et cœur ────────────────────────────────────────────────────
  {
    cle: 'anticoagulant', groupe: 'Saignement et cœur', gravite: 'majeur',
    question: 'Prenez-vous un anticoagulant ou un antiagrégant ?',
    precision: 'Lequel, depuis quand, prescrit par qui',
    conduite: 'Ne jamais interrompre le traitement de sa propre initiative : l’arrêt se décide avec le prescripteur. Prévoir l’hémostase locale et une consigne post-opératoire écrite.',
  },
  {
    cle: 'trouble_saignement', groupe: 'Saignement et cœur', gravite: 'majeur',
    question: 'Saignez-vous longtemps après une coupure ou une extraction ?',
    precision: 'Antécédent connu, bilan déjà fait',
    conduite: 'Trouble de l’hémostase possible : un bilan ou un avis est à obtenir avant tout geste sanglant.',
  },
  {
    cle: 'endocardite', groupe: 'Saignement et cœur', gravite: 'majeur',
    question: 'Valve cardiaque, prothèse, cardiopathie congénitale ou antécédent d’endocardite ?',
    precision: 'Nature, date, cardiologue suivant le patient',
    conduite: 'Risque d’endocardite infectieuse : l’antibioprophylaxie et l’indication du geste se décident avec le cardiologue, selon le protocole en vigueur.',
  },
  {
    cle: 'cardiaque', groupe: 'Saignement et cœur', gravite: 'modere',
    question: 'Maladie cardiaque, hypertension, infarctus ou AVC ?',
    precision: 'Lequel, quand, traitement',
    conduite: 'Séance courte, patient installé sans attente prolongée. L’anesthésique et son adjuvant sont à choisir en connaissance de ce terrain.',
  },
  {
    cle: 'pacemaker', groupe: 'Saignement et cœur', gravite: 'modere',
    question: 'Pacemaker ou défibrillateur implanté ?',
    precision: 'Type, date de pose',
    conduite: 'Vérifier la compatibilité du matériel électrique du cabinet (bistouri, détartreur) avec le dispositif.',
  },

  // ── Allergies ─────────────────────────────────────────────────────────────
  {
    cle: 'allergie_anesthesique', groupe: 'Allergies', gravite: 'majeur',
    question: 'Avez-vous déjà mal réagi à une anesthésie locale ?',
    precision: 'Produit, nature de la réaction',
    conduite: 'Préciser la nature de la réaction : un malaise vagal n’est pas une allergie. En cas de doute, un avis allergologique précède l’acte.',
  },
  {
    cle: 'allergie_antibiotique', groupe: 'Allergies', gravite: 'majeur',
    question: 'Allergie à la pénicilline ou à un autre antibiotique ?',
    precision: 'Lequel, nature de la réaction',
    conduite: 'À reporter sur toute ordonnance. Cette information change la classe prescrite.',
  },
  {
    cle: 'allergie_latex', groupe: 'Allergies', gravite: 'majeur',
    question: 'Allergie au latex ?',
    precision: 'Réaction constatée',
    conduite: 'Gants et matériel sans latex à préparer AVANT l’installation du patient.',
  },
  {
    cle: 'allergie_autre', groupe: 'Allergies', gravite: 'modere',
    question: 'Autre allergie (médicament, métal, iode, anti-inflammatoire) ?',
    precision: 'Laquelle',
    conduite: 'À vérifier avant toute prescription et avant le choix des matériaux.',
  },

  // ── Os et cicatrisation ───────────────────────────────────────────────────
  {
    cle: 'bisphosphonates', groupe: 'Os et cicatrisation', gravite: 'majeur',
    question: 'Traitement pour l’ostéoporose ou les os (bisphosphonates, dénosumab), actuel ou passé ?',
    precision: 'Lequel, voie, durée, encore en cours ?',
    conduite: 'Risque d’ostéonécrose des maxillaires : toute avulsion ou chirurgie osseuse se décide avec le prescripteur, y compris si le traitement est arrêté.',
  },
  {
    cle: 'radiotherapie', groupe: 'Os et cicatrisation', gravite: 'majeur',
    question: 'Radiothérapie de la tête ou du cou ?',
    precision: 'Zone irradiée, dates',
    conduite: 'Territoire irradié : la cicatrisation osseuse est compromise. Avis spécialisé avant tout geste chirurgical.',
  },
  {
    cle: 'diabete', groupe: 'Os et cicatrisation', gravite: 'modere',
    question: 'Diabète ?',
    precision: 'Type, équilibré ou non, dernier dosage connu',
    conduite: 'Cicatrisation et risque infectieux majorés si le diabète est déséquilibré. Éviter le patient à jeun en fin de matinée.',
  },
  {
    cle: 'immunodepression', groupe: 'Os et cicatrisation', gravite: 'majeur',
    question: 'Chimiothérapie, corticoïdes au long cours, greffe ou immunodépression ?',
    precision: 'Nature, depuis quand',
    conduite: 'Risque infectieux majoré et cicatrisation ralentie : coordonner la séance avec le médecin traitant ou le spécialiste.',
  },

  // ── Terrain général ──────────────────────────────────────────────────────
  {
    cle: 'grossesse', groupe: 'Terrain général', gravite: 'majeur',
    question: 'Êtes-vous enceinte ou allaitez-vous ?',
    precision: 'Terme, suivi par qui',
    conduite: 'Radiographies et prescriptions à réévaluer. Les soins non urgents peuvent être reportés ; l’urgence, elle, se traite.',
  },
  {
    cle: 'renal_hepatique', groupe: 'Terrain général', gravite: 'modere',
    question: 'Maladie du rein ou du foie ?',
    precision: 'Laquelle, dialyse ?',
    conduite: 'Les posologies et certaines classes sont à adapter : à prendre en compte avant de prescrire.',
  },
  {
    cle: 'hepatite_vih', groupe: 'Terrain général', gravite: 'modere',
    question: 'Hépatite B ou C, VIH ?',
    precision: 'Laquelle, suivi en cours',
    conduite: 'Les précautions standard s’appliquent à tous les patients, sans exception. L’information sert au suivi, non au tri.',
  },
  {
    cle: 'epilepsie', groupe: 'Terrain général', gravite: 'modere',
    question: 'Épilepsie ou crises convulsives ?',
    precision: 'Fréquence, traitement',
    conduite: 'Séance calme, matériel dégagé de la bouche entre deux temps opératoires.',
  },
  {
    cle: 'asthme', groupe: 'Terrain général', gravite: 'modere',
    question: 'Asthme ou problème respiratoire ?',
    precision: 'Traitement, dernière crise',
    conduite: 'Demander au patient d’apporter son inhalateur. Certains anti-inflammatoires sont à éviter sur ce terrain.',
  },
  {
    cle: 'syncope', groupe: 'Terrain général', gravite: 'modere',
    question: 'Avez-vous déjà fait un malaise lors de soins dentaires ?',
    precision: 'Circonstances',
    conduite: 'Installer le patient en position semi-allongée, éviter l’attente à jeun, ne pas le laisser seul au relevage.',
  },
  {
    cle: 'traitement_cours', groupe: 'Terrain général', gravite: 'info',
    question: 'Autre traitement en cours ?',
    precision: 'Lesquels',
    conduite: 'À confronter à toute nouvelle prescription.',
  },

  // ── Habitudes ────────────────────────────────────────────────────────────
  {
    cle: 'tabac', groupe: 'Habitudes', gravite: 'info',
    question: 'Tabac ?',
    precision: 'Quantité, depuis quand',
    conduite: 'Facteur aggravant du parodonte et de la cicatrisation ; à documenter avant une chirurgie ou un implant.',
  },
  {
    cle: 'bruxisme', groupe: 'Habitudes', gravite: 'info',
    question: 'Serrez-vous ou grincez-vous des dents ?',
    precision: 'Jour, nuit, usure constatée',
    conduite: 'Pèse sur le pronostic des restaurations et des prothèses : à intégrer au plan de traitement.',
  },
]

export const GROUPES_ANAMNESE = Array.from(new Set(ITEMS_ANAMNESE.map((i) => i.groupe)))

export const ITEM_PAR_CLE: Record<string, ItemAnamnese> =
  Object.fromEntries(ITEMS_ANAMNESE.map((i) => [i.cle, i]))

// ── CE QUE LA BANNIÈRE AFFICHE ──────────────────────────────────────────────

export interface Risque {
  cle: string
  /** Formulation courte, affirmative : c'est un constat, pas une question. */
  titre: string
  gravite: Gravite
  precision?: string
  conduite?: string
}

/** Formulation affirmative du risque, pour l'affichage. La question
 *  (« Prenez-vous… ? ») sert à la saisie ; l'alerte, elle, affirme. */
const TITRES: Record<string, string> = {
  anticoagulant: 'Sous anticoagulant ou antiagrégant',
  trouble_saignement: 'Saignement prolongé rapporté',
  endocardite: 'Risque d’endocardite (valve, prothèse, cardiopathie)',
  cardiaque: 'Terrain cardiovasculaire',
  pacemaker: 'Pacemaker ou défibrillateur',
  allergie_anesthesique: 'Réaction à une anesthésie locale',
  allergie_antibiotique: 'Allergie à un antibiotique',
  allergie_latex: 'Allergie au latex',
  allergie_autre: 'Autre allergie',
  bisphosphonates: 'Bisphosphonates ou dénosumab',
  radiotherapie: 'Radiothérapie cervico-faciale',
  diabete: 'Diabète',
  immunodepression: 'Immunodépression',
  grossesse: 'Grossesse ou allaitement',
  renal_hepatique: 'Insuffisance rénale ou hépatique',
  hepatite_vih: 'Hépatite ou VIH',
  epilepsie: 'Épilepsie',
  asthme: 'Asthme',
  syncope: 'Antécédent de malaise au fauteuil',
  traitement_cours: 'Traitement en cours',
  tabac: 'Tabac',
  bruxisme: 'Bruxisme',
}

const ORDRE: Record<Gravite, number> = { majeur: 0, modere: 1, info: 2 }

export function normaliserAnamnese(valeur: unknown): Anamnese {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) return {}
  const out: Anamnese = {}
  for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
    if (!ITEM_PAR_CLE[cle] || !v || typeof v !== 'object') continue
    const { r, p } = v as ReponseStockee
    const rep = r === 'oui' || r === 'non' || r === 'inconnu' ? r : undefined
    const prec = typeof p === 'string' && p.trim() ? p.trim().slice(0, 500) : undefined
    if (!rep && !prec) continue
    out[cle] = { ...(rep ? { r: rep } : {}), ...(prec ? { p: prec } : {}) }
  }
  return out
}

/** Les risques à AFFICHER : tout ce qui a été répondu « oui », plus les
 *  allergies notées en texte libre dans le dossier. Triés par gravité, parce
 *  qu'une bannière qui mélange le tabac et l'anticoagulant ne sert à rien. */
export function risquesActifs(
  source: { anamnese?: unknown; allergies?: string | null },
): Risque[] {
  const a = normaliserAnamnese(source.anamnese)
  const liste: Risque[] = []

  // Le texte libre du dossier d'abord : il existait avant le questionnaire et
  // il reste la seule source pour les cabinets qui ne le remplissent pas.
  const libre = (source.allergies ?? '').trim()
  if (libre) {
    liste.push({
      cle: '_allergies_libres', titre: 'Allergies notées au dossier',
      gravite: 'majeur', precision: libre,
    })
  }

  for (const item of ITEMS_ANAMNESE) {
    if (a[item.cle]?.r !== 'oui') continue
    liste.push({
      cle: item.cle, titre: TITRES[item.cle] ?? item.question,
      gravite: item.gravite, precision: a[item.cle]?.p, conduite: item.conduite,
    })
  }
  return liste.sort((x, y) => ORDRE[x.gravite] - ORDRE[y.gravite])
}

/** Les « ne sait pas » sur un point majeur. Une inconnue sur l'hémostase n'est
 *  pas une absence de risque : elle se résout avant le geste, pas après. */
export function aVerifier(anamnese: unknown): Risque[] {
  const a = normaliserAnamnese(anamnese)
  return ITEMS_ANAMNESE
    .filter((i) => i.gravite === 'majeur' && a[i.cle]?.r === 'inconnu')
    .map((i) => ({ cle: i.cle, titre: TITRES[i.cle] ?? i.question, gravite: i.gravite }))
}

export function anamneseRemplie(anamnese: unknown): boolean {
  return Object.keys(normaliserAnamnese(anamnese)).length > 0
}

/** Une anamnèse de 2023 n'est pas une anamnèse. Un patient a pu commencer un
 *  anticoagulant depuis. Au-delà d'un an on invite à la reconfirmer — on
 *  n'efface rien et on ne bloque rien. */
export function anamneseAncienne(maj: string | null | undefined, mois = 12): boolean {
  if (!maj) return false
  const d = new Date(`${String(maj).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const limite = new Date()
  limite.setMonth(limite.getMonth() - mois)
  return d < limite
}
