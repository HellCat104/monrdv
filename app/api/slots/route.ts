// API : créneaux horaires disponibles pour une date donnée.
// Supporte les motifs de consultation à durée variable (?type=<consultation_type_id>).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getSlotsForDuration, getDayKey, getDayBreaks, getNowInMaroc, toMinutes, isFullDayBlocked, DEFAULT_LEAD_HOURS, blockedIntervals, type OccupiedInterval } from '@/lib/utils'
import { parseISO, format } from 'date-fns'

// GET /api/slots?doctor_id=...&date=YYYY-MM-DD[&type=<uuid>][&poste=<uuid>]
//
// ── POURQUOI `poste` EXIGE UNE SESSION ──────────────────────────────────────
//
// Avec un poste, un créneau déjà pris SUR UN AUTRE poste redevient libre
// (v89). C'est juste pour le cabinet, qui sait qui fait quoi ; ce serait
// trompeur sur la page publique, où la création de rendez-vous ignore les
// postes et refuserait ensuite le créneau annoncé libre.
//
// Cette route est publique et n'avait aucune authentification. Le paramètre
// n'est donc honoré que si l'appelant est connecté ; sinon il est IGNORÉ, et
// la réponse reste celle d'avant. Pas d'erreur : un visiteur qui bricole
// l'adresse obtient simplement les créneaux ordinaires.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  const date = searchParams.get('date')
  const typeId = searchParams.get('type')
  const posteDemande = searchParams.get('poste')

  if (!doctorId || !date) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Requête 1 : infos médecin (nécessaire avant les autres pour vérifier le jour)
  const { data: doctor, error: doctorError } = await supabase
    .from('doctors')
    .select('working_hours, appointment_duration, status, subscription_status, booking_lead_hours')
    .eq('id', doctorId)
    .single()

  if (doctorError || !doctor) {
    return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  }

  // Médecin non réservable (non approuvé ou abonnement inactif) : aucun créneau.
  // Évite d'afficher des disponibilités que la création de RDV refusera ensuite.
  if (doctor.status !== 'approved' || doctor.subscription_status !== 'actif') {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  const leadHours = doctor.booking_lead_hours ?? DEFAULT_LEAD_HOURS

  // Vérifie si le jour est ouvert — court-circuit si fermé
  const parsedDate = parseISO(date)
  const dayKey = getDayKey(parsedDate)
  const daySchedule = doctor.working_hours[dayKey]

  if (!daySchedule?.enabled) {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  // Durée du RDV : celle du motif choisi, sinon la durée de base du médecin
  let duration = doctor.appointment_duration
  if (typeId) {
    const { data: ctype } = await supabase
      .from('consultation_types')
      .select('duration_minutes')
      .eq('id', typeId)
      .eq('doctor_id', doctorId)
      .eq('active', true)
      .maybeSingle()
    if (ctype?.duration_minutes) duration = ctype.duration_minutes
  }

  // Le poste n'est honoré que pour un appelant connecté — voir l'en-tête.
  let poste: string | null = null
  if (posteDemande) {
    const { data: { user } } = await createClient().auth.getUser()
    if (user) poste = posteDemande
  }

  // Requêtes 2 & 3 en parallèle — blocages (jour entier ou plages) + RDV existants
  const [blockedResult, bookedResult] = await Promise.all([
    supabase
      .from('blocked_dates')
      .select('start_time, end_time')
      .eq('doctor_id', doctorId)
      .eq('date', date),
    supabase
      .from('appointments')
      .select('time, duration_minutes, poste_id')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .neq('status', 'cancelled'),
  ])

  const blocks = blockedResult.data ?? []
  // Un blocage sans horaire = journée entière fermée
  if (isFullDayBlocked(blocks)) {
    return NextResponse.json({ slots: [] }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  }

  // Chaque RDV existant occupe [time, time + sa durée) — durée de base si absente
  // Avec un poste demandé, seuls les rendez-vous DE CE POSTE occupent le
  // créneau : c'est tout l'objet de la v89. Les blocages, eux, ferment le
  // cabinet entier — un congé ne se contourne pas en changeant de fauteuil.
  //
  // `poste_id` n'existe qu'à partir de la v89 : absent, il vaut null partout
  // et la comparaison retrouve exactement le comportement d'avant.
  const rdvDuJour = (bookedResult.data ?? []) as { time: string; duration_minutes: number | null; poste_id?: string | null }[]
  const retenus = poste ? rdvDuJour.filter((b) => (b.poste_id ?? null) === poste) : rdvDuJour
  const occupied: OccupiedInterval[] = [...blockedIntervals(blocks), ...retenus.map((b) => ({
    time: b.time.substring(0, 5),
    duration: b.duration_minutes || doctor.appointment_duration,
  }))]

  let slots = getSlotsForDuration(
    daySchedule.start,
    daySchedule.end,
    duration,
    doctor.appointment_duration,
    getDayBreaks(daySchedule),
    occupied
  )

  // Pour la journée en cours (heure marocaine), les heures déjà passées
  // ne sont plus proposées (utile au cabinet : RDV du jour même).
  const nowMaroc = getNowInMaroc()
  // Le jour même, on ne propose que ce qui laisse au médecin son délai de
  // prévenance : un patient ne doit pas pouvoir surgir dans dix minutes.
  if (date === format(nowMaroc, 'yyyy-MM-dd')) {
    const cutoff = toMinutes(format(nowMaroc, 'HH:mm')) + leadHours * 60
    slots = slots.map((s) => (toMinutes(s.time) < cutoff ? { ...s, available: false } : s))
  }

  // Une adresse qui PORTE un poste n'entre jamais dans un cache partagé —
  // qu'il ait été honoré ou non.
  //
  // J'avais d'abord conditionné cela au poste RETENU, et c'était faux : pour
  // un visiteur le paramètre est ignoré, la réponse repartait donc en
  // `public, s-maxage=30`… et se trouvait mise en cache SOUS UNE ADRESSE QUI
  // CONTIENT LE POSTE. Le praticien qui demandait ensuite la même adresse
  // recevait la réponse du visiteur : mesuré, 14 créneaux au lieu de 17.
  // La même réponse pour deux lecteurs qui n'ont pas les mêmes droits ne doit
  // jamais dépendre de qui est passé en premier.
  return NextResponse.json({ slots }, {
    headers: {
      'Cache-Control': posteDemande
        ? 'private, no-store'
        : 'public, s-maxage=30, stale-while-revalidate=60',
    },
  })
}
