// Le registre des actes — ce qui touche la base. Les règles pures sont dans
// lib/actes-patient.ts ; ici, la lecture, l'écriture, et l'accord permanent
// entre la liste des actes et le plan de traitement (devis).
//
// ── L'ACCORD AVEC LE DEVIS ──────────────────────────────────────────────────
//
// Une ligne de devis ACCEPTÉ est un acte « à faire » de la liste. Les deux ne
// doivent jamais se contredire, quel que soit l'écran où le praticien agit :
//   — cocher « fait » sur la ligne du devis finit l'acte ;
//   — finir l'acte dans la liste coche la ligne du devis ;
//   — annuler ou refuser le devis annule ses actes pas encore faits ;
//   — supprimer la ligne du devis supprime l'acte (cascade en base).
//
// Tout passe par le client Supabase DE LA SESSION du médecin : la RLS reste
// le verrou, ces fonctions n'ouvrent rien de plus.
//
// Sans la migration v101, chaque fonction se tait : la table n'existe pas,
// l'écran du devis doit continuer de marcher exactement comme avant.
import type { SupabaseClient } from '@supabase/supabase-js'
import { tableAbsente, colonneAbsente } from '@/lib/migrations'
import {
  acteDepuisLigneDevis, STATUTS_DEVIS_ENGAGES,
  type ActePatient, type LigneDevisLue, type StatutActe,
} from '@/lib/actes-patient'

export const COLONNES_ACTE =
  'id, patient_id, appointment_id, quote_item_id, date_acte, dents, faces, libelle, code, prix, remarque, statut, care_sheet_id, created_at'

/** Une ligne lue en base, aux types de l'écran (numeric arrive en chaîne). */
export function lireActe(r: Record<string, unknown>): ActePatient {
  return {
    id: String(r.id),
    patient_id: String(r.patient_id),
    appointment_id: (r.appointment_id as string | null) ?? null,
    quote_item_id: (r.quote_item_id as string | null) ?? null,
    date_acte: String(r.date_acte ?? '').slice(0, 10),
    dents: Array.isArray(r.dents) ? (r.dents as string[]) : [],
    faces: Array.isArray(r.faces) ? (r.faces as string[]) : [],
    libelle: String(r.libelle ?? ''),
    code: (r.code as string | null) ?? null,
    prix: Number(r.prix ?? 0),
    remarque: (r.remarque as string | null) ?? null,
    statut: (r.statut as StatutActe) ?? 'fini',
    care_sheet_id: (r.care_sheet_id as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
  }
}

/** Le registre est-il en place sur cette base ? */
export function registreAbsent(code?: string | null): boolean {
  return tableAbsente(code) || colonneAbsente(code)
}

/** Fait entrer dans la liste les lignes des devis acceptés de ce patient qui
 *  n'y sont pas encore. Idempotent : `quote_item_id` est unique en base, et
 *  une course entre deux écrans ne crée pas de doublon. */
export async function synchroniserDevis(
  supabase: SupabaseClient, doctorId: string, patientId: string,
): Promise<void> {
  const { data: devis, error } = await supabase
    .from('quotes')
    .select('id, status, accepted_at, created_at, items:quote_items(id, tooth, label, unit_price, quantity, done, done_at, appointment_id, created_at)')
    .eq('doctor_id', doctorId).eq('patient_id', patientId)
    .in('status', STATUTS_DEVIS_ENGAGES as unknown as string[])
  if (error || !devis?.length) return

  const lignes = devis.flatMap((q) => ((q.items ?? []) as LigneDevisLue[]).map((it) => ({ it, q })))
  if (lignes.length === 0) return

  const { data: deja, error: errDeja } = await supabase
    .from('actes_patient').select('quote_item_id')
    .eq('doctor_id', doctorId).eq('patient_id', patientId)
    .in('quote_item_id', lignes.map((l) => l.it.id))
  if (errDeja) return
  const connues = new Set((deja ?? []).map((d) => d.quote_item_id as string))

  const nouvelles = lignes
    .filter(({ it }) => !connues.has(it.id))
    .map(({ it, q }) => ({
      ...acteDepuisLigneDevis(it, { accepted_at: q.accepted_at as string | null, created_at: q.created_at as string | null }),
      doctor_id: doctorId,
      patient_id: patientId,
    }))
  if (nouvelles.length === 0) return

  const { error: errIns } = await supabase
    .from('actes_patient')
    .upsert(nouvelles, { onConflict: 'quote_item_id', ignoreDuplicates: true })
  if (errIns && !registreAbsent(errIns.code)) {
    console.error('[Actes] synchronisation du plan de traitement :', errIns.message)
  }
}

/** La ligne de devis vient de changer : l'acte qui en vient suit.
 *  - `done` passe à vrai → l'acte est fini, à la date du jour ;
 *  - `done` passe à faux → un acte fini redevient « à faire » ;
 *  - libellé, prix, dent : repris tant que l'acte n'est pas sur une feuille
 *    de soins (une feuille remise au patient ne change plus). */
export async function suivreLigneDevis(
  supabase: SupabaseClient, doctorId: string, ligne: LigneDevisLue,
): Promise<void> {
  const { data: acte, error } = await supabase
    .from('actes_patient').select('id, statut, care_sheet_id')
    .eq('doctor_id', doctorId).eq('quote_item_id', ligne.id).maybeSingle()
  if (error || !acte) return

  const maj: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (ligne.done && acte.statut !== 'fini') {
    maj.statut = 'fini'
    maj.date_acte = (ligne.done_at ?? new Date().toISOString()).slice(0, 10)
    maj.appointment_id = ligne.appointment_id ?? null
  } else if (!ligne.done && acte.statut === 'fini') {
    maj.statut = 'a_faire'
  }
  if (!acte.care_sheet_id) {
    const projete = acteDepuisLigneDevis(ligne, { accepted_at: null, created_at: null })
    maj.libelle = projete.libelle
    maj.prix = projete.prix
    maj.dents = projete.dents
    if (projete.code) maj.code = projete.code
  }
  const { error: errMaj } = await supabase
    .from('actes_patient').update(maj).eq('id', acte.id).eq('doctor_id', doctorId)
  if (errMaj) console.error('[Actes] suivi de la ligne de devis :', errMaj.message)
}

/** Le devis est annulé ou refusé : ce qui n'était pas fait ne le sera pas. Les
 *  actes déjà finis restent finis — ils ont été faits. */
export async function annulerActesDuDevis(
  supabase: SupabaseClient, doctorId: string, quoteId: string,
): Promise<void> {
  const { data: items } = await supabase
    .from('quote_items').select('id').eq('quote_id', quoteId).eq('doctor_id', doctorId)
  const ids = (items ?? []).map((i) => i.id as string)
  if (ids.length === 0) return
  const { error } = await supabase
    .from('actes_patient')
    .update({ statut: 'annule', updated_at: new Date().toISOString() })
    .eq('doctor_id', doctorId).in('quote_item_id', ids).in('statut', ['a_faire', 'en_cours'])
  if (error && !registreAbsent(error.code)) console.error('[Actes] annulation des actes du devis :', error.message)
}

/** L'acte vient de changer de statut dans la liste : la ligne du devis suit.
 *  Fini → ligne cochée « faite », à la date de l'acte ; autre statut → ligne
 *  décochée. Le rendez-vous rattaché à la ligne n'est pas touché ici : c'est
 *  un geste de caisse (voir /api/quotes/[id]/items/[itemId]). */
export async function suivreActeDansDevis(
  supabase: SupabaseClient, doctorId: string, acte: Pick<ActePatient, 'quote_item_id' | 'statut' | 'date_acte'>,
): Promise<void> {
  if (!acte.quote_item_id) return
  const fait = acte.statut === 'fini'
  const { data: ligne } = await supabase
    .from('quote_items').select('id, done, quote_id, appointment_id')
    .eq('id', acte.quote_item_id).eq('doctor_id', doctorId).maybeSingle()
  if (!ligne || Boolean(ligne.done) === fait) return
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const ancienRdv = (ligne.appointment_id as string | null) ?? null
  const { error } = await supabase
    .from('quote_items')
    .update({
      done: fait,
      // L'heure n'a pas de sens pour un acte daté a posteriori : midi évite
      // qu'un fuseau ne le fasse glisser d'un jour.
      done_at: fait ? (acte.date_acte === aujourdhui ? new Date().toISOString() : `${acte.date_acte}T12:00:00Z`) : null,
      // Même règle que la route du devis : une ligne qui n'est plus faite
      // n'appartient plus à aucune séance.
      ...(fait ? {} : { appointment_id: null }),
    })
    .eq('id', ligne.id).eq('doctor_id', doctorId)
  if (error) { console.error('[Actes] suivi dans le devis :', error.message); return }

  // Le rendez-vous que la ligne quitte est libéré s'il ne porte plus aucune
  // ligne de ce devis — sinon il resterait « réglé via le devis » et ne
  // pourrait plus être encaissé (même raisonnement que la route du devis).
  if (!fait && ancienRdv) {
    const { count } = await supabase
      .from('quote_items').select('id', { count: 'exact', head: true })
      .eq('quote_id', ligne.quote_id).eq('doctor_id', doctorId).eq('appointment_id', ancienRdv)
    if ((count ?? 0) === 0) {
      await supabase.from('appointments').update({ quote_id: null })
        .eq('id', ancienRdv).eq('doctor_id', doctorId).eq('quote_id', ligne.quote_id)
    }
  }
}
