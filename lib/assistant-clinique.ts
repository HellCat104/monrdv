// L'ASSISTANT CLINIQUE — le contrat, avant toute intelligence artificielle.
//
// ── CE QUI EXISTE, ET CE QUI N'EXISTE PAS ───────────────────────────────────
//
// Aucune IA n'est branchée sur le dossier médical aujourd'hui. Ce fichier
// fixe la RÈGLE à laquelle toute IA future devra se plier, pour qu'elle
// s'ajoute sans qu'on ait à revoir les écrans ni les tables :
//
//   UNE IA NE MODIFIE JAMAIS LE DOSSIER. ELLE PROPOSE ; LE DENTISTE DÉCIDE.
//
// Les usages prévus, et où ils se brancheront :
//   · AVANT la consultation — un résumé du dossier. Il s'affichera À CÔTÉ de
//     la synthèse calculée (lib/espace-dentaire.ts, `syntheseDentaire`), qui
//     reste la référence : la synthèse dit ce qui est en base, l'IA dit ce
//     qu'elle en comprend.
//   · PENDANT — dictée vocale → transcription → proposition de note structurée
//     dans les rubriques de la consultation (motif, examen, diagnostic…).
//   · APRÈS — proposition de compte rendu, de synthèse, d'éléments manquants
//     (ceux de `pointsDeCloture`), et d'un rappel de suivi.
//
// ── LE PARCOURS D'UNE PROPOSITION ───────────────────────────────────────────
//
//   proposee ──► acceptee  ──► écrite par le chemin NORMAL (la même route,
//            │                 les mêmes contrôles, le même journal que si le
//            ├─► modifiee  ──► dentiste l'avait tapée lui-même)
//            └─► rejetee   ──► rien n'est écrit
//
// L'auteur d'une donnée acceptée est le DENTISTE qui l'a validée. La
// proposition garde sa trace (`source`, `modele`), pour qu'on sache ce qui
// est venu d'une machine.

export type SourceProposition =
  | 'resume_dossier'
  | 'dictee'
  | 'compte_rendu'
  | 'elements_manquants'
  | 'rappel_suivi'

export type StatutProposition = 'proposee' | 'acceptee' | 'modifiee' | 'rejetee'

export interface PropositionClinique {
  id: string
  source: SourceProposition
  /** Le modèle qui l'a produite — pour la traçabilité, jamais pour l'affichage. */
  modele: string
  /** Où la donnée irait si elle était acceptée. */
  cible: {
    patientId: string
    appointmentId?: string | null
    /** La rubrique visée, ex. 'consultations.diagnostic'. */
    champ: string
  }
  texte: string
  statut: StatutProposition
  creeLe: string
  /** Le texte finalement retenu, quand le dentiste l'a corrigé. */
  texteRetenu?: string
  decidePar?: string
  decideLe?: string
}

/** Une proposition peut-elle être écrite au dossier ? Seulement si un
 *  dentiste l'a acceptée ou corrigée. C'est LE contrôle que tout chemin
 *  d'écriture venant d'une IA devra appeler. */
export function peutEtreEcrite(p: PropositionClinique): boolean {
  return (p.statut === 'acceptee' || p.statut === 'modifiee') && !!p.decidePar && !!p.decideLe
}

/** Le texte à écrire : celui que le dentiste a retenu, jamais le brut de la
 *  machine s'il l'a corrigé. */
export function texteAEcrire(p: PropositionClinique): string | null {
  if (!peutEtreEcrite(p)) return null
  return p.statut === 'modifiee' ? (p.texteRetenu ?? null) : p.texte
}
