import { isGastroDoctor } from '@/types'
import { isDentalDoctor } from '@/lib/dental'
import { CATEGORIES_MODELE, rendreModele } from '@/lib/gastro'
import { CATEGORIES_MODELE_DENTAIRE } from '@/lib/dentaire'
import type { LigneOrdonnance } from '@/types'

// Aides ordonnance : lignes récemment prescrites par le médecin (auto-apprentissage).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRecentPrescriptionLines(supabase: any, doctorId: string, exclude: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('prescriptions')
    .select('content')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
    .limit(30)

  const freq = new Map<string, number>()
  for (const p of data ?? []) {
    for (const raw of String(p.content ?? '').split('\n')) {
      const line = raw.trim().replace(/^[-•*]\s*/, '')
      if (line.length < 8 || line.length > 120) continue
      freq.set(line, (freq.get(line) ?? 0) + 1)
    }
  }
  const excl = new Set(exclude.map((e) => e.toLowerCase()))
  return Array.from(freq.entries())
    .filter(([line]) => !excl.has(line.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([line]) => line)
}

// Ordonnance dont on repart pour en écrire une nouvelle (« Renouveler »).
//
// Le geste le plus répété chez un généraliste : un patient chronique revient et
// repart avec les mêmes lignes. Jusqu'ici il fallait tout retaper, parce que les
// ordonnances récentes n'étaient qu'une liste à consulter.
//
// On RECOPIE le texte dans une ordonnance NEUVE — on ne modifie jamais
// l'ancienne : une ordonnance remise au patient est un document délivré, et le
// dossier doit garder la trace des deux délivrances.
//
// Le patient est vérifié en plus du médecin : l'identifiant vient de l'URL, et
// rien n'empêcherait sans cela de reprendre l'ordonnance d'un autre patient du
// même cabinet dans le dossier de celui-ci.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrdonnanceAReprendre(
  supabase: any,
  doctorId: string,
  patientId: string,
  prescriptionId?: string | null,
): Promise<{ content: string; created_at: string } | null> {
  if (!prescriptionId) return null
  const { data } = await supabase
    .from('prescriptions')
    .select('content, created_at')
    .eq('id', prescriptionId)
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()
  if (!data?.content) return null
  return { content: String(data.content), created_at: String(data.created_at) }
}


// ── LES MODÈLES D'ORDONNANCE ────────────────────────────────────────────────
//
// Ils étaient réservés à la gastro-entérologie, et seulement sur l'ordonnance
// ouverte depuis la fiche patient. Deux limites sans raison : la table est
// commune, et un dentiste qui rédige « après extraction » trois fois par jour
// a exactement le même besoin. Celle qu'on rédige PENDANT la consultation,
// elle, n'en proposait aucun — c'est pourtant là qu'on écrit le plus.
//
// Un modèle n'est jamais appliqué tout seul : il dépose du texte que le
// praticien relit, adapte et valide. Et rien n'est livré pré-rempli.

export interface ModeleOrdonnance {
  id: string; nom: string; categorie: string | null; texte: string
}

/** Les branches qui disposent de modèles. Ailleurs, on ne charge rien plutôt
 *  que d'afficher un panneau vide et une requête de plus à chaque ouverture. */
export function aDesModeles(specialites: string[]): boolean {
  return isGastroDoctor(specialites) || isDentalDoctor(specialites)
}

/** Les catégories proposées pour RANGER les modèles. Elles diffèrent par
 *  branche : « Éradication d'Helicobacter pylori » n'a rien à faire chez un
 *  dentiste, « Après une extraction » rien à faire chez un gastro-entérologue. */
export function categoriesModeles(specialites: string[]): string[] {
  return isDentalDoctor(specialites) ? CATEGORIES_MODELE_DENTAIRE : CATEGORIES_MODELE
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function chargerModeles(supabase: any, specialites: string[]): Promise<ModeleOrdonnance[]> {
  if (!aDesModeles(specialites)) return []
  const { data, error } = await supabase
    .from('prescription_templates').select('id, nom, categorie, lignes, examens, notes')
    .is('archive_le', null).order('categorie').order('nom')
  // Pas de migration, pas de modèles — mais jamais d'ordonnance inaccessible.
  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((m: any) => ({
    id: m.id, nom: m.nom, categorie: m.categorie,
    texte: rendreModele((m.lignes ?? []) as LigneOrdonnance[], m.examens, m.notes),
  })).filter((m: ModeleOrdonnance) => m.texte.trim())
}
