// GET /api/dentaire/cloture?rdv=… — ce qui a été enregistré pendant la séance,
// relu juste avant de la terminer.
//
// Rien ne bloque : on montre au praticien ce qui est en base, pour qu'il voie
// d'un coup d'œil ce qui manque peut-être. Relu côté serveur, et non déduit
// de ce que l'écran croit avoir enregistré — c'est la base qui fait foi.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDentiste, estUuid } from '@/lib/dentaire-server'
import { pointsDeCloture } from '@/lib/espace-dentaire'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const rdvId = req.nextUrl.searchParams.get('rdv')
  if (!estUuid(rdvId)) return NextResponse.json({ error: 'Rendez-vous invalide' }, { status: 400 })
  const { data: rdv } = await ctx.supabase.from('appointments')
    .select('id, patient_id').eq('id', rdvId).eq('doctor_id', ctx.doctor.id).maybeSingle()
  if (!rdv?.patient_id) return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 })

  const admin = createAdminClient()
  const compter = async (p: PromiseLike<{ count: number | null; error: unknown }>) => {
    try { const r = await p; return r.error ? 0 : r.count ?? 0 } catch { return 0 }
  }
  const [consultRes, note, actes, dents, ordonnances, images] = await Promise.all([
    ctx.supabase.from('consultations').select('id, diagnostic, statut')
      .eq('doctor_id', ctx.doctor.id).eq('appointment_id', rdvId),
    compter(ctx.supabase.from('consultation_notes').select('id', { count: 'exact', head: true })
      .eq('doctor_id', ctx.doctor.id).eq('appointment_id', rdvId).neq('note', '')),
    compter(ctx.supabase.from('quote_items').select('id', { count: 'exact', head: true })
      .eq('doctor_id', ctx.doctor.id).eq('appointment_id', rdvId).eq('done', true)),
    compter(admin.from('tooth_history').select('id', { count: 'exact', head: true })
      .eq('doctor_id', ctx.doctor.id).eq('appointment_id', rdvId)),
    compter(ctx.supabase.from('prescriptions').select('id', { count: 'exact', head: true })
      .eq('doctor_id', ctx.doctor.id).eq('appointment_id', rdvId)),
    compter(ctx.supabase.from('patient_documents').select('id', { count: 'exact', head: true })
      .eq('doctor_id', ctx.doctor.id).eq('appointment_id', rdvId)),
  ])
  const consults = consultRes.error ? [] : consultRes.data ?? []
  const ecrite = consults.length > 0

  return NextResponse.json({
    points: pointsDeCloture({
      consultationEcrite: ecrite,
      diagnostic: consults.some((c) => (c.diagnostic ?? '').trim().length > 0),
      actesFaits: actes,
      dentsModifiees: dents,
      ordonnances,
      images,
      noteLibre: note > 0,
    }),
  })
}
