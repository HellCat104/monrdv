// Aller chercher en base ce que lib/espace-dentaire.ts relit.
//
// Même partage que la préparation de consultation (lib/preparation-serveur) :
// le module pur conclut, ce fichier lit. Toutes les lectures filtrent sur le
// médecin ET le patient, en plus de la RLS : une route qui l'oublierait ne
// doit rien pouvoir montrer d'un autre cabinet.
//
// ── CE QUI SE TAIT PLUTÔT QUE D'ÉCHOUER ─────────────────────────────────────
//
// Chaque table est lue à part. Une migration en retard (v54 devis, v81
// consultations, v94 imagerie, v100 séance) vide SA partie de la synthèse,
// jamais l'écran : un dentiste dont la base n'a pas l'imagerie voit quand
// même son dernier diagnostic.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  syntheseDentaire, rdvDuJour,
  type SyntheseDentaire, type RdvLu, type ConsultationLue, type PlanLu,
} from '@/lib/espace-dentaire'
import type { ImageDentaire } from '@/lib/imagerie'

type Lignes = Record<string, unknown>[]

async function lire(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<Lignes> {
  try {
    const { data, error } = await p
    if (error) return []
    return (data as Lignes | null) ?? []
  } catch {
    return []
  }
}

/** Combien de rendez-vous la synthèse relit. Le dernier passé suffit à la
 *  synthèse ; on en prend assez pour trouver aussi celui du jour. */
const RDV_RECENTS = 30
const IMAGES_RECENTES = 60

export interface DonneesEspaceDentaire {
  synthese: SyntheseDentaire
  /** Le rendez-vous du jour sur lequel s'ouvre le mode Consultation. */
  rdvDuJour: RdvLu | null
  plans: PlanLu[]
  images: ImageDentaire[]
}

export async function chargerEspaceDentaire(
  supabase: SupabaseClient,
  doctorId: string,
  patient: { id: string; allergies?: string | null; current_treatments?: string | null },
  risques: string[],
  aujourdhui: string,
): Promise<DonneesEspaceDentaire> {
  const [rdvRows, consultRows, planRows, imageRows] = await Promise.all([
    lire(supabase.from('appointments')
      .select('id, date, time, status, queue_status, consultation_type:consultation_types(name)')
      .eq('doctor_id', doctorId).eq('patient_id', patient.id)
      .lte('date', aujourdhui)
      .order('date', { ascending: false }).order('time', { ascending: false })
      .limit(RDV_RECENTS)),
    lire(supabase.from('consultations')
      .select('id, appointment_id, date_consultation, created_at, statut, motif, diagnostic, traitement, dents')
      .eq('doctor_id', doctorId).eq('patient_id', patient.id)
      .order('created_at', { ascending: false }).limit(20)),
    lire(supabase.from('quotes')
      .select('id, label, status, created_at, items:quote_items(id, tooth, label, done, done_at, appointment_id, session_no, unit_price, quantity)')
      .eq('doctor_id', doctorId).eq('patient_id', patient.id)
      .neq('status', 'annule')
      .order('created_at', { ascending: false }).limit(20)),
    lire(supabase.from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen')
      .eq('doctor_id', doctorId).eq('patient_id', patient.id)
      .not('type_image', 'is', null)
      .order('created_at', { ascending: false }).limit(IMAGES_RECENTES)),
  ])

  const rdvs: RdvLu[] = rdvRows.map((r) => {
    const ct = r.consultation_type as { name?: string } | { name?: string }[] | null
    const nom = Array.isArray(ct) ? ct[0]?.name : ct?.name
    return {
      id: String(r.id), date: String(r.date), time: (r.time as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      queue_status: (r.queue_status as string | null) ?? null,
      motif: nom ?? null,
    }
  })
  const consultations = consultRows as unknown as ConsultationLue[]
  const plans = planRows.map((p) => ({
    ...(p as unknown as PlanLu),
    items: ((p.items as PlanLu['items'] | null) ?? []),
  }))
  const images = imageRows as unknown as ImageDentaire[]

  return {
    synthese: syntheseDentaire({
      allergies: patient.allergies ?? null,
      traitements: patient.current_treatments ?? null,
      risques, rdvs, consultations, plans, images,
    }, aujourdhui),
    rdvDuJour: rdvDuJour(rdvs, aujourdhui),
    plans,
    images,
  }
}
