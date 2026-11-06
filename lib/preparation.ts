// Ce qu'il faut savoir sur ce patient AVANT d'ouvrir la bouche.
//
// ── LE PROBLÈME QUE ÇA RÈGLE ────────────────────────────────────────────────
//
// Le dossier contient tout, et c'est bien le problème : antécédents,
// constantes, ordonnances, rappels, documents, chacun dans son onglet. Pour
// savoir si la tension de Mme El Amrani monte depuis deux visites, il faut
// ouvrir Constantes, lire deux lignes et faire la soustraction de tête — à
// 10 h 02, avec elle assise en face.
//
// Ce fichier fait cette lecture à la place du praticien. Il ne diagnostique
// rien : il RELIT ce qui est déjà écrit et remonte ce qui mérite un regard.
// « Tension élevée aux deux dernières mesures » est un constat arithmétique,
// pas un avis.
//
// ── LA RÈGLE QUI TIENT TOUT ─────────────────────────────────────────────────
//
// Aucun point n'est inventé. Chacun se rattache à une donnée du dossier et
// cite sa date. Un logiciel qui signale ce qu'il ne peut pas prouver finit
// par être ignoré en bloc, et ce jour-là il emporte avec lui les signaux qui
// comptaient.
//
// Rien n'est bloquant non plus. Le praticien connaît son patient mieux que ce
// fichier ; on lui met l'information sous les yeux, il en fait ce qu'il veut.

// AUCUN import : ce module ne dépend de rien. C'est ce qui permet de le
// compiler et de le tester seul, sans Next, sans Supabase et sans alias de
// chemins — voir scripts/tester-preparation.mjs.

/** Ce qu'on sait d'un dossier, dans la forme où les écrans le chargent déjà. */
export interface DossierPourPreparation {
  patient: {
    birth_date?: string | null
    age?: number | null
    allergies?: string | null
    chronic_conditions?: string | null
    conditions?: string[] | null
    surgeries?: string | null
    current_treatments?: string | null
    anamnese_maj?: string | null
  }
  /** De la plus récente à la plus ancienne. */
  constantes: { measured_at: string; values: Record<string, number> }[]
  /** De la plus récente à la plus ancienne. */
  consultations: { date: string; titre: string }[]
  /** De la plus récente à la plus ancienne. */
  ordonnances: { created_at: string }[]
  /** Documents du dossier, de la plus récente à la plus ancienne. */
  documents: { created_at: string; file_name: string }[]
  /** Rappels encore ouverts. */
  rappels: { due_date: string; reason: string | null }[]
  /** Le jour de référence, en AAAA-MM-JJ. */
  aujourdhui: string
}

export type NiveauPoint = 'urgent' | 'attention' | 'info'

export interface PointAVerifier {
  niveau: NiveauPoint
  /** Court : c'est ce qu'on lit en diagonale dans la liste du jour. */
  titre: string
  /** La donnée et sa date, pour que le constat soit vérifiable. */
  detail: string
}

export interface Preparation {
  allergies: string | null
  antecedents: string[]
  traitements: string[]
  /** La dernière prise, mise en mots : « TA 148/92 · 78 kg · IMC 29,4 ». */
  dernieresConstantes: string | null
  /** La date de cette prise. */
  constantesLe: string | null
  dernieresConsultations: { date: string; titre: string }[]
  points: PointAVerifier[]
}

// ── Les seuils, nommés et justifiés ─────────────────────────────────────────
//
// Ce ne sont PAS des seuils de décision médicale : ce sont des seuils
// d'ATTENTION, choisis larges pour ne pas crier tous les jours.

/** Au-delà, on considère que le bilan biologique mérite d'être refait. Un an,
 *  parce que c'est le rythme admis d'un suivi de chronique stable. */
const MOIS_BILAN = 12
/** Tension au-dessus de laquelle on parle d'élevée, en consultation. */
const TA_SYSTOLIQUE_HAUTE = 140
const TA_DIASTOLIQUE_HAUTE = 90
/** Une ordonnance de fond se renouvelle à ce rythme : au-delà, le patient est
 *  probablement à court. */
const MOIS_ORDONNANCE = 3
/** Un questionnaire médical plus vieux que ça a cessé d'être à jour. */
const MOIS_ANAMNESE = 12

const jour = (d: string) => String(d ?? '').slice(0, 10)

/** Nombre de mois pleins entre deux dates AAAA-MM-JJ. */
export function moisEntre(depuis: string, jusqua: string): number {
  const a = jour(depuis)
  const b = jour(jusqua)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return 0
  const [a1, a2, a3] = a.split('-').map(Number)
  const [b1, b2, b3] = b.split('-').map(Number)
  return (b1 - a1) * 12 + (b2 - a2) - (b3 < a3 ? 1 : 0)
}

/** Les lignes d'un champ de texte libre, nettoyées. Les praticiens y séparent
 *  indifféremment par retour à la ligne, virgule ou point-virgule. */
function lignes(texte: string | null | undefined): string[] {
  return String(texte ?? '')
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** La dernière prise de constantes, mise en une phrase lisible. */
function enMots(values: Record<string, number>): string | null {
  const bouts: string[] = []
  const sys = values.systolic
  const dia = values.diastolic
  if (sys && dia) bouts.push(`TA ${sys}/${dia}`)
  else if (sys) bouts.push(`TA systolique ${sys}`)
  if (values.heart_rate) bouts.push(`FC ${values.heart_rate}`)
  if (values.temperature) bouts.push(`${values.temperature} °C`)
  if (values.spo2) bouts.push(`SpO₂ ${values.spo2} %`)
  if (values.blood_glucose) bouts.push(`glycémie ${values.blood_glucose} g/L`)
  if (values.weight) bouts.push(`${values.weight} kg`)
  const imc = calculerIMC(values)
  if (imc) bouts.push(`IMC ${imc.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`)
  return bouts.length > 0 ? bouts.join(' · ') : null
}

/** L'IMC, quand le poids ET la taille sont connus dans la même prise. */
export function calculerIMC(values: Record<string, number>): number | null {
  const p = Number(values.weight)
  const t = Number(values.height)
  if (!p || !t || t < 50) return null
  return p / ((t / 100) ** 2)
}

/** Un document est-il un résultat d'examen ? On se fie au nom du fichier :
 *  c'est faillible, et c'est pour ça que le point qui en découle est un
 *  simple « info », jamais une alerte. */
function ressembleAUnBilan(nom: string): boolean {
  return /bilan|analyse|biolog|labo|r[ée]sultat|nfs|glyc|hba1c|cr[ée]atin|lipid|tsh/i.test(nom)
}

/**
 * Relit le dossier et rend ce qu'il faut avoir sous les yeux.
 *
 * Pure : aucune requête, aucune date « maintenant » implicite — le jour de
 * référence est passé. C'est ce qui la rend testable.
 */
export function preparer(d: DossierPourPreparation): Preparation {
  const points: PointAVerifier[] = []
  const auj = jour(d.aujourdhui)

  const allergies = String(d.patient.allergies ?? '').trim() || null
  const antecedents = [
    ...(d.patient.conditions ?? []),
    ...lignes(d.patient.chronic_conditions),
    ...lignes(d.patient.surgeries).map((s) => `Chirurgie : ${s}`),
  ]
  const traitements = lignes(d.patient.current_treatments)

  const derniere = d.constantes[0]
  const precedente = d.constantes[1]

  // ── 1. L'allergie, toujours en tête ──────────────────────────────────────
  if (allergies) {
    points.push({ niveau: 'urgent', titre: 'Allergie', detail: allergies })
  }

  // ── 2. La tension, si elle est haute deux fois de suite ──────────────────
  //
  // Deux fois, pas une : une tension haute un jour de stress ne dit rien. Deux
  // mesures hautes d'affilée, c'est une tendance, et c'est ce qui fait changer
  // un traitement.
  const haute = (v?: { values: Record<string, number> }) =>
    !!v && ((v.values.systolic ?? 0) >= TA_SYSTOLIQUE_HAUTE
      || (v.values.diastolic ?? 0) >= TA_DIASTOLIQUE_HAUTE)
  if (haute(derniere) && haute(precedente)) {
    points.push({
      niveau: 'attention',
      titre: 'Tension élevée aux deux dernières mesures',
      detail: `${derniere.values.systolic ?? '?'}/${derniere.values.diastolic ?? '?'} le ${frJour(derniere.measured_at)}, `
        + `${precedente.values.systolic ?? '?'}/${precedente.values.diastolic ?? '?'} le ${frJour(precedente.measured_at)}.`,
    })
  } else if (haute(derniere)) {
    points.push({
      niveau: 'info',
      titre: 'Tension élevée à la dernière mesure',
      detail: `${derniere.values.systolic ?? '?'}/${derniere.values.diastolic ?? '?'} le ${frJour(derniere.measured_at)}. Une seule mesure ne fait pas une tendance.`,
    })
  }

  // ── 3. Le poids qui bouge ────────────────────────────────────────────────
  //
  // Cinq pour cent entre deux prises : c'est le seuil où une perte de poids
  // cesse d'être du bruit.
  if (derniere?.values.weight && precedente?.values.weight) {
    const ecart = derniere.values.weight - precedente.values.weight
    const part = Math.abs(ecart) / precedente.values.weight
    if (part >= 0.05) {
      points.push({
        niveau: 'attention',
        titre: ecart < 0 ? 'Perte de poids' : 'Prise de poids',
        detail: `${precedente.values.weight} kg le ${frJour(precedente.measured_at)} → `
          + `${derniere.values.weight} kg le ${frJour(derniere.measured_at)} `
          + `(${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg).`,
      })
    }
  }

  // ── 4. Le bilan biologique qui date ──────────────────────────────────────
  const bilan = d.documents.find((doc) => ressembleAUnBilan(doc.file_name))
  const suiviChronique = antecedents.length > 0 || traitements.length > 0
  if (suiviChronique) {
    if (!bilan) {
      points.push({
        niveau: 'info',
        titre: 'Aucun bilan au dossier',
        detail: 'Ce patient a un suivi au long cours et aucun résultat d’examen n’est rangé dans ses documents.',
      })
    } else {
      const mois = moisEntre(bilan.created_at, auj)
      if (mois >= MOIS_BILAN) {
        points.push({
          niveau: 'attention',
          titre: `Dernier bilan il y a ${mois} mois`,
          detail: `« ${bilan.file_name} », déposé le ${frJour(bilan.created_at)}.`,
        })
      }
    }
  }

  // ── 5. L'ordonnance de fond à renouveler ─────────────────────────────────
  if (traitements.length > 0) {
    const derniereOrd = d.ordonnances[0]
    if (!derniereOrd) {
      points.push({
        niveau: 'info',
        titre: 'Traitement de fond sans ordonnance au dossier',
        detail: `${traitements.join(', ')} — aucune ordonnance n’a été établie ici.`,
      })
    } else {
      const mois = moisEntre(derniereOrd.created_at, auj)
      if (mois >= MOIS_ORDONNANCE) {
        points.push({
          niveau: 'attention',
          titre: `Dernière ordonnance il y a ${mois} mois`,
          detail: `Traitement de fond en cours (${traitements.join(', ')}). Établie le ${frJour(derniereOrd.created_at)}.`,
        })
      }
    }
  }

  // ── 6. Le rappel arrivé à échéance ───────────────────────────────────────
  for (const r of d.rappels) {
    if (jour(r.due_date) <= auj) {
      points.push({
        niveau: 'attention',
        titre: 'Rappel de suivi arrivé à échéance',
        detail: `${r.reason ? `${r.reason} — ` : ''}prévu le ${frJour(r.due_date)}.`,
      })
    }
  }

  // ── 7. Le dossier vide ───────────────────────────────────────────────────
  //
  // Un dossier sans antécédent ni allergie n'est pas rassurant : il est
  // seulement muet. La nuance compte — « rien à signaler » et « on n'a jamais
  // demandé » ne se soignent pas pareil.
  if (!allergies && antecedents.length === 0 && traitements.length === 0) {
    points.push({
      niveau: 'info',
      titre: 'Aucun antécédent renseigné',
      detail: 'Ni allergie, ni maladie chronique, ni traitement de fond au dossier. À remplir si c’est la première fois que vous le voyez.',
    })
  }

  // ── 8. Le questionnaire médical qui a vieilli ────────────────────────────
  if (d.patient.anamnese_maj) {
    const mois = moisEntre(d.patient.anamnese_maj, auj)
    if (mois >= MOIS_ANAMNESE) {
      points.push({
        niveau: 'info',
        titre: `Questionnaire médical vieux de ${mois} mois`,
        detail: `Dernière confirmation le ${frJour(d.patient.anamnese_maj)}.`,
      })
    }
  }

  return {
    allergies,
    antecedents,
    traitements,
    dernieresConstantes: derniere ? enMots(derniere.values) : null,
    constantesLe: derniere ? jour(derniere.measured_at) : null,
    dernieresConsultations: d.consultations.slice(0, 3),
    points: points.sort((a, b) => rang(a.niveau) - rang(b.niveau)),
  }
}

const rang = (n: NiveauPoint) => (n === 'urgent' ? 0 : n === 'attention' ? 1 : 2)

/** Une date AAAA-MM-JJ en JJ/MM/AAAA, sans passer par un objet Date — le
 *  Maroc est à UTC+0 et `toISOString` décale d'un jour une date sur deux. */
export function frJour(d: string): string {
  const s = jour(d)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [a, m, j] = s.split('-')
  return `${j}/${m}/${a}`
}
