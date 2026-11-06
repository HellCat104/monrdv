// Aller chercher en base ce que `preparer()` relit.
//
// ── POURQUOI UN FICHIER SÉPARÉ ──────────────────────────────────────────────
//
// `lib/preparation.ts` ne parle pas à la base : on lui donne un dossier, il
// rend des constats. C'est ce qui le rend testable sans Supabase, et c'est
// aussi ce qui le rend aveugle. Ce fichier-ci est l'autre moitié : il va
// chercher les lignes, et rien d'autre.
//
// ── UNE REQUÊTE PAR JOURNÉE, PAS UNE PAR PATIENT ────────────────────────────
//
// « Ma journée » affiche quatorze rendez-vous. Préparer chacun séparément,
// c'est cinq requêtes fois quatorze — soixante-dix allers-retours pour une
// page d'accueil. On charge donc TOUS les patients du jour en cinq requêtes,
// puis on répartit en mémoire.
//
// ── CE QUI SE TAIT PLUTÔT QUE D'ÉCHOUER ─────────────────────────────────────
//
// Une table ou une colonne manquante (migration pas passée, forfait qui ne la
// porte pas) rend une préparation vide, jamais une erreur : un écran d'accueil
// qui plante parce qu'une table de rappels n'existe pas est un écran inutile.

import type { SupabaseClient } from '@supabase/supabase-js'
import { preparer, type Preparation, type DossierPourPreparation } from '@/lib/preparation'
import { RECALL_OUVERTS } from '@/types'

/** Les colonnes du patient dont la préparation se sert. Lues à part des
 *  colonnes récentes (`conditions`, `anamnese_maj`) : voir plus bas. */
const COLONNES_PATIENT = 'id, birth_date, age, allergies, chronic_conditions, surgeries, current_treatments'
/** Celles arrivées par migration (v72, v87) : absentes sur une base pas à
 *  jour, et leur absence ne doit pas emporter tout le reste. */
const COLONNES_RECENTES = 'id, conditions, anamnese_maj'

type Lignes = Record<string, unknown>[]

/** Regroupe des lignes par `patient_id`, en conservant l'ordre d'arrivée. */
function parPatient(lignes: Lignes): Map<string, Lignes> {
  const m = new Map<string, Lignes>()
  for (const l of lignes) {
    const cle = String(l.patient_id ?? '')
    if (!cle) continue
    const d = m.get(cle)
    if (d) d.push(l)
    else m.set(cle, [l])
  }
  return m
}

/** Une requête dont l'échec rend une liste vide. */
async function sansCasser(p: PromiseLike<{ data: unknown }>): Promise<Lignes> {
  try {
    const { data } = await p
    return (data as Lignes | null) ?? []
  } catch {
    return []
  }
}

/**
 * Prépare plusieurs patients d'un coup — c'est la forme qu'utilise
 * « Ma journée ».
 *
 * Rend une Map : un patient absent de la Map est un patient dont la lecture a
 * échoué, et l'appelant affiche alors la ligne sans annotation plutôt que de
 * ne rien afficher.
 */
export async function preparerPlusieurs(
  supabase: SupabaseClient,
  doctorId: string,
  patientIds: string[],
  aujourdhui: string,
): Promise<Map<string, Preparation>> {
  const resultat = new Map<string, Preparation>()
  const ids = Array.from(new Set(patientIds.filter(Boolean)))
  if (ids.length === 0) return resultat

  const [patients, recentes, constantes, consultations, ordonnances, documents, rappels] = await Promise.all([
    sansCasser(supabase.from('patients').select(COLONNES_PATIENT).eq('doctor_id', doctorId).in('id', ids)),
    // À part, pour que l'absence des colonnes de v72/v87 ne vide pas le reste.
    sansCasser(supabase.from('patients').select(COLONNES_RECENTES).eq('doctor_id', doctorId).in('id', ids)),
    // Les DEUX dernières prises suffisent : la préparation ne compare jamais
    // plus loin que la précédente. On en prend quatre par sécurité d'ordre.
    sansCasser(supabase.from('vital_signs').select('patient_id, measured_at, values')
      .eq('doctor_id', doctorId).in('patient_id', ids)
      .order('measured_at', { ascending: false }).limit(4 * ids.length)),
    sansCasser(supabase.from('consultations').select('patient_id, date_consultation, motif, diagnostic')
      .eq('doctor_id', doctorId).in('patient_id', ids).eq('statut', 'validee')
      .order('date_consultation', { ascending: false }).limit(5 * ids.length)),
    sansCasser(supabase.from('prescriptions').select('patient_id, created_at')
      .eq('doctor_id', doctorId).in('patient_id', ids)
      .order('created_at', { ascending: false }).limit(2 * ids.length)),
    sansCasser(supabase.from('patient_documents').select('patient_id, created_at, file_name')
      .eq('doctor_id', doctorId).in('patient_id', ids)
      .order('created_at', { ascending: false }).limit(10 * ids.length)),
    sansCasser(supabase.from('recalls').select('patient_id, due_date, reason, status')
      .eq('doctor_id', doctorId).in('patient_id', ids).in('status', RECALL_OUVERTS)
      .order('due_date', { ascending: true })),
  ])

  const recentesPar = new Map(recentes.map((r) => [String(r.id), r]))
  const cstPar = parPatient(constantes)
  const consPar = parPatient(consultations)
  const ordPar = parPatient(ordonnances)
  const docPar = parPatient(documents)
  const rapPar = parPatient(rappels)

  for (const p of patients) {
    const id = String(p.id)
    const r = recentesPar.get(id)
    const dossier: DossierPourPreparation = {
      patient: {
        birth_date: p.birth_date as string | null,
        age: p.age as number | null,
        allergies: p.allergies as string | null,
        chronic_conditions: p.chronic_conditions as string | null,
        conditions: (r?.conditions as string[] | null) ?? null,
        surgeries: p.surgeries as string | null,
        current_treatments: p.current_treatments as string | null,
        anamnese_maj: (r?.anamnese_maj as string | null) ?? null,
      },
      constantes: (cstPar.get(id) ?? []).map((c) => ({
        measured_at: String(c.measured_at),
        values: (c.values as Record<string, number> | null) ?? {},
      })),
      consultations: (consPar.get(id) ?? []).map((c) => ({
        date: String(c.date_consultation),
        // Le motif d'abord : c'est ce qui situe la visite. Le diagnostic en
        // second, parce qu'il n'est pas toujours renseigné.
        titre: String(c.motif ?? '').trim() || String(c.diagnostic ?? '').trim() || 'Consultation',
      })),
      ordonnances: (ordPar.get(id) ?? []).map((o) => ({ created_at: String(o.created_at) })),
      documents: (docPar.get(id) ?? []).map((d) => ({
        created_at: String(d.created_at),
        file_name: String(d.file_name ?? ''),
      })),
      rappels: (rapPar.get(id) ?? []).map((x) => ({
        due_date: String(x.due_date),
        reason: (x.reason as string | null) ?? null,
      })),
      aujourdhui,
    }
    resultat.set(id, preparer(dossier))
  }

  return resultat
}

/** Un seul patient — pour le résumé en tête de dossier et de consultation. */
export async function preparerUn(
  supabase: SupabaseClient,
  doctorId: string,
  patientId: string,
  aujourdhui: string,
): Promise<Preparation | null> {
  const m = await preparerPlusieurs(supabase, doctorId, [patientId], aujourdhui)
  return m.get(patientId) ?? null
}
