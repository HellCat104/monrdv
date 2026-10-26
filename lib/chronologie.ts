// La chronologie médicale : tout ce qui est arrivé à ce patient, dans l'ordre.
//
// Le dossier range chaque chose dans son tiroir — les consultations ici, les
// ordonnances là, les documents importés ailleurs. C'est commode pour saisir,
// et inutilisable pour comprendre : « qu'est-ce qui s'est passé en mars ? »
// oblige à ouvrir quatre onglets et à recoller les dates de tête.
//
// En gastro-entérologie cette question est la consultation elle-même. Un
// patient suivi pour une MICI ou surveillé après polypectomie revient tous les
// ans pendant dix ans ; ce qu'on cherche, c'est l'enchaînement — le compte
// rendu, l'anapath qui a suivi, le traitement qui en est sorti, le contrôle
// programmé.
//
// CE FICHIER NE LIT RIEN. Il reçoit ce que le dossier a déjà chargé et le met
// en ordre. Aucune requête de plus : la chronologie ne doit rien coûter.
import type { ConsultationNote, Prescription, PatientDocument, VitalSign, Recall } from '@/types'

/** Ce que la chronologie a besoin de savoir d'un certificat — pas la table
 *  entière : le dossier n'en charge que l'en-tête, et recopier le contenu de
 *  chaque document pour l'afficher en une ligne serait du gâchis. */
interface CertificatEnTete {
  id: string
  title: string
  motif?: string | null
  created_at: string
}

export type NatureEvenement =
  | 'consultation' | 'ordonnance' | 'certificat' | 'document' | 'constantes' | 'rappel'

export interface Evenement {
  id: string
  /** Jour de l'événement, au format YYYY-MM-DD : c'est lui qui ordonne. */
  jour: string
  nature: NatureEvenement
  titre: string
  /** Deuxième ligne, facultative : le détail qu'on lit sans ouvrir. */
  detail?: string
  /** Vrai pour un rappel encore à venir : il se place en haut, à part. */
  futur?: boolean
}

/** Le jour d'un horodatage, sans passer par un fuseau : une date de dossier
 *  est un jour de calendrier, pas un instant. */
function jourDe(iso?: string | null): string {
  return (iso ?? '').substring(0, 10)
}

/** Première ligne utile d'un texte, pour résumer sans ouvrir. */
function premiereLigne(texte: string, max = 90): string {
  const t = texte.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`
}

export const LIBELLE_CATEGORIE: Record<string, string> = {
  biologie: 'Analyses biologiques',
  imagerie: 'Imagerie',
  anatomopathologie: 'Anatomopathologie',
  compte_rendu: 'Compte rendu externe',
  autre: 'Document',
}

export function construireChronologie(d: {
  notes: ConsultationNote[]
  prescriptions: Prescription[]
  certificates: CertificatEnTete[]
  documents: PatientDocument[]
  vitals: VitalSign[]
  recalls: Recall[]
  /** Le jour d'aujourd'hui, pour séparer ce qui est fait de ce qui est prévu. */
  aujourdhui: string
}): Evenement[] {
  const evenements: Evenement[] = []

  for (const n of d.notes) {
    evenements.push({
      id: `note-${n.id}`, jour: jourDe(n.created_at), nature: 'consultation',
      titre: 'Consultation',
      detail: premiereLigne(n.note ?? ''),
    })
  }

  for (const p of d.prescriptions) {
    evenements.push({
      id: `ordo-${p.id}`, jour: jourDe(p.created_at), nature: 'ordonnance',
      titre: 'Ordonnance',
      detail: premiereLigne(p.content ?? ''),
    })
  }

  for (const c of d.certificates) {
    evenements.push({
      id: `cert-${c.id}`, jour: jourDe(c.created_at), nature: 'certificat',
      titre: c.title || 'Document établi',
      detail: c.motif ?? undefined,
    })
  }

  for (const doc of d.documents) {
    const cat = (doc as PatientDocument & { categorie?: string | null }).categorie
    evenements.push({
      id: `doc-${doc.id}`, jour: jourDe(doc.created_at), nature: 'document',
      titre: LIBELLE_CATEGORIE[cat ?? 'autre'] ?? 'Document',
      detail: doc.file_name,
    })
  }

  for (const v of d.vitals) {
    evenements.push({
      id: `vit-${v.id}`, jour: jourDe(v.measured_at), nature: 'constantes',
      titre: 'Constantes',
    })
  }

  // Les rappels sont le seul événement qui regarde DEVANT. Un contrôle prévu
  // dans deux ans n'est pas de l'histoire, c'est un engagement — et c'est
  // justement ce qu'on perd de vue. Il monte en tête de chronologie.
  for (const r of d.recalls) {
    if (r.status === 'cancelled') continue
    evenements.push({
      id: `rap-${r.id}`, jour: r.due_date, nature: 'rappel',
      titre: 'Suivi programmé',
      detail: r.reason ?? undefined,
      futur: r.due_date > d.aujourdhui,
    })
  }

  // Du plus récent au plus ancien, et le futur d'abord — à date égale, un
  // rendez-vous à prendre passe avant le compte rendu qui l'a motivé.
  return evenements
    .filter((e) => e.jour)
    .sort((a, b) => (a.jour === b.jour ? Number(!!b.futur) - Number(!!a.futur) : b.jour.localeCompare(a.jour)))
}
