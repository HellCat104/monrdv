// Résumé de consultation des RDV clôturés (note + ordonnances + certificats).
//
// Ce chargement n'existait que dans l'agenda : partout ailleurs (tableau de bord,
// dossier patient), les cartes de RDV clôturés affichaient « Aucune note » alors
// que la note existait. Helper partagé pour garder une seule source de vérité.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Appointment } from '@/types'

export async function withConsultationSummary<T extends Appointment>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  appointments: T[],
): Promise<T[]> {
  const doneIds = appointments.filter((a) => a.queue_status === 'parti').map((a) => a.id)
  if (doneIds.length === 0) return appointments

  const [notesRes, presRes, certsRes] = await Promise.all([
    supabase.from('consultation_notes').select('appointment_id, note').in('appointment_id', doneIds),
    supabase.from('prescriptions').select('id, appointment_id, content').in('appointment_id', doneIds),
    supabase.from('certificates').select('id, appointment_id, title, motif').in('appointment_id', doneIds),
  ])

  const noteBy = new Map<string, string>()
  for (const n of notesRes.data ?? []) if (n.appointment_id) noteBy.set(n.appointment_id, n.note)

  const presBy = new Map<string, { id: string; content: string }[]>()
  for (const p of presRes.data ?? []) {
    if (!p.appointment_id) continue
    const arr = presBy.get(p.appointment_id) ?? []
    arr.push({ id: p.id, content: p.content })
    presBy.set(p.appointment_id, arr)
  }

  const certBy = new Map<string, { id: string; title: string; motif: string | null }[]>()
  for (const c of certsRes.data ?? []) {
    if (!c.appointment_id) continue
    const arr = certBy.get(c.appointment_id) ?? []
    arr.push({ id: c.id, title: c.title, motif: c.motif })
    certBy.set(c.appointment_id, arr)
  }

  return appointments.map((a) => (a.queue_status === 'parti' ? {
    ...a,
    consultation_summary: noteBy.get(a.id) ?? null,
    consultation_prescriptions: presBy.get(a.id) ?? [],
    consultation_certificates: certBy.get(a.id) ?? [],
  } : a))
}
