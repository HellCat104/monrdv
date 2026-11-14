// L'assuré — la personne qui porte la couverture — et ce que la feuille de
// soins imprime dans sa partie (« Partie réservée à l'assuré(e) »).
//
// ── POURQUOI LE REVOILÀ ─────────────────────────────────────────────────────
//
// En octobre 2026, la saisie de l'assuré avait été retirée de la fiche : ce
// cadre, l'assuré le signe, et le cabinet n'avait pas à déclarer à sa place.
// À l'usage, les cabinets le remplissent pourtant pour lui — numéro
// d'immatriculation recopié de la carte, adresse, lien de parenté — et le
// patient n'a plus qu'à signer. La saisie revient donc, FACULTATIVE : ce qui
// est renseigné s'imprime, ce qui ne l'est pas reste vierge pour la main de
// l'assuré.
//
// ── LE STOCKAGE ─────────────────────────────────────────────────────────────
//
// `patients.insurer_data` (jsonb, v65), avec les clés de la première version
// pour retrouver ce qui a déjà été saisi :
//   assure           nom et prénom de l'assuré, s'il n'est pas le patient
//   immatriculation  n° d'immatriculation (CNSS), d'affiliation (CNOPS)…
//   lien             « Lui même », « Conjoint » ou « Enfant »
//   cin_assure       CIN de l'assuré, s'il n'est pas le patient
//   adresse_assure   adresse de l'assuré, si elle diffère de celle du patient
// Les anciennes clés `affiliation`, `matricule`, `reference` sont relues comme
// un numéro d'assuré.
//
// La feuille RECOPIE l'assuré tel qu'il est le jour où elle est établie
// (`care_sheets.insurer_data`) : une feuille de mars ne change pas parce que
// le patient a changé d'employeur en octobre.

export const LIENS_ASSURE = ['Lui même', 'Conjoint', 'Enfant'] as const
export type LienAssure = typeof LIENS_ASSURE[number]

export interface Assure {
  nom: string | null
  immatriculation: string | null
  cin: string | null
  adresse: string | null
  lien: LienAssure | null
}

const texte = (v: unknown) => {
  const t = String(v ?? '').trim()
  return t || null
}

/** Le lien, quel que soit ce qui a été tapé autrefois (« épouse », « fils »). */
export function normaliserLien(v: unknown): LienAssure | null {
  const t = String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (!t) return null
  if (/lui|elle|meme|assure|adherent|patient/.test(t)) return 'Lui même'
  if (/conjoint|epou|mari|femme/.test(t)) return 'Conjoint'
  if (/enfant|fils|fille/.test(t)) return 'Enfant'
  return null
}

/** Le numéro d'assuré, sous l'une des clés qu'il a portées. */
export function numeroAssure(data: Record<string, unknown> | null | undefined): string | null {
  const d = data ?? {}
  return texte(d.immatriculation) ?? texte(d.affiliation) ?? texte(d.matricule) ?? texte(d.reference)
}

/** L'assuré tel qu'il s'imprime.
 *
 *  Le patient EST l'assuré quand le lien le dit (« Lui même »), ou quand rien
 *  ne désigne quelqu'un d'autre mais qu'un numéro d'assuré a été saisi : on
 *  reprend alors son nom, sa CIN et son adresse. Sans aucune donnée, on ne
 *  suppose rien — le cadre reste vierge. */
export function assureDe(
  data: Record<string, unknown> | null | undefined,
  patient: { first_name?: string | null; last_name?: string | null; cin?: string | null; address?: string | null } = {},
): Assure {
  const d = data ?? {}
  const numero = numeroAssure(d)
  const lienSaisi = normaliserLien(d.lien)
  const autre = texte(d.assure)
  const luiMeme = lienSaisi === 'Lui même' || (!lienSaisi && !autre && !!numero)
  const nomPatient = texte(`${patient.first_name ?? ''} ${patient.last_name ?? ''}`)

  if (!numero && !lienSaisi && !autre) {
    return { nom: null, immatriculation: null, cin: null, adresse: null, lien: null }
  }
  return {
    nom: luiMeme ? (nomPatient ?? autre) : autre,
    immatriculation: numero,
    cin: texte(d.cin_assure) ?? (luiMeme ? texte(patient.cin) : null),
    adresse: texte(d.adresse_assure) ?? (luiMeme ? texte(patient.address) : null),
    lien: luiMeme ? 'Lui même' : lienSaisi,
  }
}

/** Ce que la feuille recopie le jour où elle est établie : l'assuré résolu
 *  (nom, CIN et adresse du patient quand c'est lui), sous les clés de la
 *  fiche — un gabarit relit la feuille avec `assureDe` sans patient. */
export function instantaneAssure(
  data: Record<string, unknown> | null | undefined,
  patient: Parameters<typeof assureDe>[1],
): Record<string, string> {
  const a = assureDe(data, patient)
  const sortie: Record<string, string> = {}
  if (a.nom) sortie.assure = a.nom
  if (a.immatriculation) sortie.immatriculation = a.immatriculation
  if (a.lien) sortie.lien = a.lien
  if (a.cin) sortie.cin_assure = a.cin
  if (a.adresse) sortie.adresse_assure = a.adresse
  return sortie
}

/** Le libellé du numéro d'assuré, dans les mots de l'organisme. */
export function libelleNumeroAssure(mutuelle: string | null | undefined): string {
  const m = String(mutuelle ?? '').toLowerCase()
  if (m.includes('cnops')) return 'N° d’affiliation'
  if (m.includes('far')) return 'Matricule'
  if (m.includes('cnss') || m.includes('amo')) return 'N° d’immatriculation'
  return 'N° d’assuré / de police'
}
