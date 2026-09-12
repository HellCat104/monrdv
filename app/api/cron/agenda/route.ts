// Cron job : envoie l'agenda du jour à chaque médecin actif chaque matin
// Déclenché par Vercel Cron (voir vercel.json) — tous les jours à 7h
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendDailyAgendaToDoctor } from '@/lib/email'
import { format, addDays } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { MAROC_TZ } from '@/lib/utils'
import type { WorkingHours } from '@/types'

// Cron matinal : peut envoyer plusieurs dizaines d'emails. On laisse le temps
// à la fonction (défaut Vercel = 10 s, trop court) — cron-job.org coupe à 30 s,
// donc on vise un temps de réponse bas via envois en parallèle (voir plus bas).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Correspondance JS day (0=dim, 1=lun...) → clé WorkingHours
const JS_DAY_TO_KEY: Record<number, keyof WorkingHours> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  // Sans secret configuré, la comparaison portait sur « Bearer undefined » —
  // la première valeur qu'un attaquant essaie. On refuse explicitement.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET absent : appel refusé')
    return NextResponse.json({ error: 'Cron non configuré' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Date d'aujourd'hui au Maroc
  const nowMaroc  = toZonedTime(new Date(), MAROC_TZ)
  const today     = format(nowMaroc, 'yyyy-MM-dd')
  const dayKey    = JS_DAY_TO_KEY[nowMaroc.getDay()]

  // Récupère tous les médecins actifs avec leur email et horaires
  const { data: doctors, error } = await supabase
    .from('doctors')
    .select('id, name, email, working_hours')
    .eq('status', 'approved')
    .eq('subscription_status', 'actif')

  if (error || !doctors) {
    // Sans cette trace, un échec de cette requête produisait une 500 muette :
    // cron-job.org signalait la panne, et les journaux Vercel ne disaient pas
    // pourquoi. On ne peut pas réparer ce qu'on ne peut pas lire.
    // La raison part AUSSI dans la réponse. Les journaux d'exécution de Vercel
    // ne se gardent que quelques dizaines de minutes sur l'offre Hobby : une
    // panne à 6 h du matin est illisible avant même le réveil. cron-job.org,
    // lui, conserve la réponse du serveur dans son historique. Aucun risque de
    // fuite : on est déjà passé par la vérification du jeton ci-dessus.
    const raison = error?.message ?? 'aucun médecin renvoyé'
    console.error('[cron agenda] lecture des médecins impossible :', raison)
    return NextResponse.json({ error: 'Lecture des médecins impossible', detail: raison }, { status: 500 })
  }

  // On ne garde que les médecins qui travaillent aujourd'hui.
  const workingDoctors = doctors.filter((doctor) => {
    const wh = doctor.working_hours as WorkingHours | null
    return !(wh && wh[dayKey] && !wh[dayKey].enabled)
  })
  const skipped = doctors.length - workingDoctors.length

  // UNE seule requête pour tous les RDV du jour (au lieu d'une par médecin),
  // puis regroupement en mémoire par médecin — évite le N+1 qui faisait timeout.
  const { data: allApts, error: errApts } = await supabase
    .from('appointments')
    .select('doctor_id, time, patient:patients(first_name, last_name, phone)')
    .in('doctor_id', workingDoctors.map((d) => d.id))
    .eq('date', today)
    .neq('status', 'cancelled')
    .order('time', { ascending: true })

  // Le résultat de cette requête n'était pas contrôlé : en cas d'échec, la
  // liste devenait vide et CHAQUE médecin recevait un agenda annonçant une
  // journée sans rendez-vous. Un praticien qui s'y fie ne vient pas, ou ne
  // prépare rien — c'est pire qu'un e-mail manquant. On préfère ne rien
  // envoyer et laisser la tâche échouer bruyamment : elle sera relancée.
  if (errApts) {
    console.error('[cron agenda] lecture des rendez-vous impossible :', errApts.message)
    return NextResponse.json({ error: 'Lecture des rendez-vous impossible', detail: errApts.message }, { status: 500 })
  }

  const aptsByDoctor = new Map<string, { time: string; patientName: string; phone: string }[]>()
  for (const apt of allApts ?? []) {
    const list = aptsByDoctor.get(apt.doctor_id) ?? []
    list.push({
      time:        apt.time,
      patientName: `${(apt.patient as any)?.first_name ?? ''} ${(apt.patient as any)?.last_name ?? ''}`.trim(),
      phone:       (apt.patient as any)?.phone ?? '',
    })
    aptsByDoctor.set(apt.doctor_id, list)
  }

  const dateFormatted = format(nowMaroc, 'dd/MM/yyyy')

  // Envois EN PARALLÈLE (au lieu de séquentiel) — le point clé pour rester
  // sous le délai de cron-job.org.
  const results = await Promise.all(
    workingDoctors.map((doctor) =>
      sendDailyAgendaToDoctor({
        doctorEmail:  doctor.email,
        doctorName:   doctor.name,
        date:         dateFormatted,
        appointments: aptsByDoctor.get(doctor.id) ?? [],
      }).catch(() => false)
    )
  )
  const sent   = results.filter(Boolean).length
  const failed = results.length - sent

  console.log(`[Cron agenda] ${sent} envoyés, ${skipped} ignorés (jour off), ${failed} échoués`)
  return NextResponse.json({ sent, skipped, failed, date: today })
}
