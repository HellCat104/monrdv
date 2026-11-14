// GET /api/dentaire/visites?patient_id=…&avant=AAAA-MM-JJ — l'historique du
// patient, VISITE PAR VISITE.
//
// Pour chaque rendez-vous honoré : la consultation écrite (motif, diagnostic),
// les actes du plan faits ce jour-là, les dents modifiées pendant la séance,
// les clichés et les ordonnances. C'est ce qui manquait au dossier : chaque
// information existait, mais dans un onglet différent, et rien ne disait
// qu'elles appartenaient à la même journée.
//
// Paginé : dix visites à la fois, les plus récentes d'abord. Un patient suivi
// depuis dix ans n'ouvre pas dix ans d'historique à chaque fois.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDentiste, patientDuCabinet, PATIENT_INTROUVABLE } from '@/lib/dentaire-server'
import { regrouperParVisite, type RdvLu, type ConsultationLue, type PlanLu, type ChangementDentLu } from '@/lib/espace-dentaire'
import { describeToothChange, parseToothEvent } from '@/lib/dental-history'
import type { ImageDentaire } from '@/lib/imagerie'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

const PAGE = 10
const JOUR = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const auth = await requireDentiste()
  if ('error' in auth) return auth.error
  const { ctx } = auth

  const patientId = await patientDuCabinet(ctx, req.nextUrl.searchParams.get('patient_id'))
  if (!patientId) return PATIENT_INTROUVABLE()
  const avant = req.nextUrl.searchParams.get('avant')

  // Les visites : rendez-vous non annulés, déjà commencés ou passés. On en
  // lit un de plus que la page pour savoir s'il en reste.
  let q = ctx.supabase.from('appointments')
    .select('id, date, time, status, queue_status, consultation_type:consultation_types(name)')
    .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId)
    .neq('status', 'cancelled')
    .order('date', { ascending: false }).order('time', { ascending: false })
    .limit(PAGE + 1)
  // Le jour au Maroc, pas en UTC : un rendez-vous de 23 h ne doit pas sortir
  // de l'historique parce que le serveur est déjà au lendemain.
  q = avant && JOUR.test(avant) ? q.lt('date', avant) : q.lte('date', format(getNowInMaroc(), 'yyyy-MM-dd'))
  const { data: rdvRows, error } = await q
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })

  const rdvs: RdvLu[] = (rdvRows ?? []).slice(0, PAGE).map((r) => {
    const ct = r.consultation_type as { name?: string } | { name?: string }[] | null
    return {
      id: r.id, date: r.date, time: r.time ?? null, status: r.status ?? null,
      queue_status: r.queue_status ?? null,
      motif: (Array.isArray(ct) ? ct[0]?.name : ct?.name) ?? null,
    }
  })
  const encore = (rdvRows ?? []).length > PAGE
  if (rdvs.length === 0) return NextResponse.json({ visites: [], encore: false })
  const ids = rdvs.map((r) => r.id)

  // Chaque source lue À PART : une migration absente vide une colonne de
  // l'historique, jamais l'historique.
  const admin = createAdminClient() // tooth_history n'est lisible que par le serveur (v55)
  const [consultRes, planRes, histRes, imgRes, ordoRes] = await Promise.all([
    ctx.supabase.from('consultations')
      .select('id, appointment_id, date_consultation, created_at, statut, motif, diagnostic, traitement, dents')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId).in('appointment_id', ids),
    ctx.supabase.from('quotes')
      .select('id, label, status, created_at, items:quote_items(id, tooth, label, done, done_at, appointment_id, session_no, unit_price, quantity)')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId),
    admin.from('tooth_history')
      .select('id, tooth, states_before, states_after, faces_before, faces_after, natures_before, natures_after, appointment_id, note, actor_role, actor_email, created_at')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId).in('appointment_id', ids),
    ctx.supabase.from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen, appointment_id')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId)
      .not('type_image', 'is', null).limit(300),
    ctx.supabase.from('prescriptions')
      .select('id, appointment_id').eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId).in('appointment_id', ids),
  ])

  // Les clichés sans la colonne de séance, si la v100 manque.
  let images = (imgRes.data ?? []) as ImageDentaire[]
  if (imgRes.error) {
    const repli = await ctx.supabase.from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen')
      .eq('doctor_id', ctx.doctor.id).eq('patient_id', patientId)
      .not('type_image', 'is', null).limit(300)
    images = (repli.data ?? []) as ImageDentaire[]
  }

  const changements: ChangementDentLu[] = (histRes.error ? [] : histRes.data ?? []).map((row) => {
    const e = parseToothEvent(row as Parameters<typeof parseToothEvent>[0])
    return {
      tooth: e.tooth,
      appointment_id: e.appointment_id ?? null,
      texte: describeToothChange(e.states_before, e.states_after, e.faces_before, e.faces_after, e.natures_before, e.natures_after).texte,
    }
  })

  const visites = regrouperParVisite(rdvs, {
    consultations: (consultRes.error ? [] : consultRes.data ?? []) as ConsultationLue[],
    plans: ((planRes.error ? [] : planRes.data ?? []) as unknown as PlanLu[]).map((p) => ({ ...p, items: p.items ?? [] })),
    changements,
    images,
    ordonnances: ordoRes.error ? [] : ordoRes.data ?? [],
  })

  return NextResponse.json({ visites, encore })
}
