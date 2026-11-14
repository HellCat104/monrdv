// GET /api/dentaire/dent?patient_id=…&dent=36 — ce que le dossier sait d'UNE
// dent, hors du schéma : ses lignes de plan de traitement et ses clichés.
//
// Le panneau de la dent (mode Dossier comme mode Consultation) l'appelle à
// l'ouverture d'une dent. Lu à la demande, et non chargé avec le dossier : un
// patient a trente-deux dents et le praticien en ouvre deux.
//
// Les clichés reviennent avec une URL signée de courte durée, pour les seules
// images de cette dent — pas pour tout le dossier.
import { NextRequest, NextResponse } from 'next/server'
import { requireDentiste, patientDuCabinet, PATIENT_INTROUVABLE } from '@/lib/dentaire-server'
import { isValidTooth } from '@/lib/dental'
import { contexteDent, type PlanLu } from '@/lib/espace-dentaire'
import type { ImageDentaire } from '@/lib/imagerie'

export const dynamic = 'force-dynamic'

const BUCKET = 'patient-documents'
const DUREE_URL = 600 // 10 minutes : le temps de regarder, pas de partager.

export async function GET(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const patientId = await patientDuCabinet(ctx, req.nextUrl.searchParams.get('patient_id'))
  if (!patientId) return PATIENT_INTROUVABLE()
  const dent = String(req.nextUrl.searchParams.get('dent') ?? '')
  if (!isValidTooth(dent)) return NextResponse.json({ error: 'Dent invalide' }, { status: 400 })

  const [plansRes, imagesRes] = await Promise.all([
    ctx.supabase.from('quotes')
      .select('id, label, status, created_at, items:quote_items(id, tooth, label, done, done_at, appointment_id, session_no, unit_price, quantity)')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId)
      .order('created_at', { ascending: false }).limit(30),
    // La séance (v100) d'abord, puis sans elle : une migration en retard
    // coûte le badge « cette séance », pas la liste des clichés.
    ctx.supabase.from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen, appointment_id')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId)
      .not('type_image', 'is', null)
      .order('created_at', { ascending: false }).limit(200),
  ])

  let images = (imagesRes.data ?? []) as (ImageDentaire & { appointment_id?: string | null })[]
  if (imagesRes.error) {
    const repli = await ctx.supabase.from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId)
      .not('type_image', 'is', null)
      .order('created_at', { ascending: false }).limit(200)
    images = (repli.data ?? []) as ImageDentaire[]
  }

  const plans = ((plansRes.data ?? []) as unknown as PlanLu[]).map((p) => ({ ...p, items: p.items ?? [] }))
  const contexte = contexteDent(dent, plans, images)

  // Les URL, pour les seuls clichés de cette dent.
  const chemins = contexte.images.map((i) => i.file_path)
  const urls: Record<string, string> = {}
  if (chemins.length > 0) {
    const { data: signees } = await ctx.supabase.storage.from(BUCKET).createSignedUrls(chemins, DUREE_URL)
    for (const s of signees ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl
  }

  return NextResponse.json({
    plan: contexte.plan,
    images: contexte.images.map((i) => ({ ...i, url: urls[i.file_path] ?? null })),
  })
}
