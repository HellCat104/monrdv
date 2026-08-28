// API : liste et création de rendez-vous
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendAppointmentConfirmationToPatient } from '@/lib/email'
import { formatPhoneMaroc, isValidPhoneMaroc, generateCancelToken, getSlotsForDuration, getDayKey, getNowInMaroc, getDayBreaks, toMinutes, isFullDayBlocked, blockedIntervals, DEFAULT_LEAD_HOURS } from '@/lib/utils'
import { format, parseISO, addDays, addMonths } from 'date-fns'
import { randomUUID } from 'crypto'

// GET /api/appointments?doctor_id=...&date=...
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Vérifie que le doctor_id demandé appartient bien au médecin connecté
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('email', user.email)
    .single()

  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id')
  const date = searchParams.get('date')

  // Sécurité : ignore le doctor_id passé en param, utilise toujours celui du token auth
  let query = supabase
    .from('appointments')
    .select('*, patient:patients(*)')
    .eq('doctor_id', doctor.id)
    .order('date', { ascending: true })
    .order('time', { ascending: true })

  if (date) query = query.eq('date', date)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Erreur serveur interne" }, { status: 500 })

  return NextResponse.json(data)
}

// POST /api/appointments — création d'un RDV (médecin ou patient public)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    doctor_id,
    first_name,
    last_name,
    phone,
    email,
    age,
    date,
    time,
    notes,
    consultation_type_id,
    specialty,
    consent,
    public: isPublic,
    birth_date: birthDateInput,
    for_child: forChild,
    child_birth_date,
    child_sex,
  } = body

  // Validation minimale
  // Le médecin peut désigner une fiche existante (patient_id) au lieu de
  // ressaisir l'identité. Réservé à l'espace praticien : jamais côté public.
  const pickedPatientId = !isPublic && body.patient_id ? String(body.patient_id) : ''

  if (pickedPatientId) {
    if (!doctor_id || !date || !time) {
      return NextResponse.json({ error: 'Paramètre manquant' }, { status: 400 })
    }
  } else if (!doctor_id || !first_name || !last_name || !phone || !date || !time) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  // Pour les réservations publiques (patient) :
  if (isPublic) {
    // Email obligatoire (seul moyen d'envoyer confirmation + rappel)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return NextResponse.json({ error: 'Un email valide est obligatoire pour recevoir votre confirmation et votre rappel' }, { status: 400 })
    }
    // Consentement au traitement des données obligatoire (loi 09-08)
    if (consent !== true) {
      return NextResponse.json({ error: 'Vous devez accepter le traitement de vos données' }, { status: 400 })
    }
    // NB : l'exigence d'âge / date de naissance dépend du forfait du médecin
    // (aucune donnée démographique en forfait Agenda) — vérifiée plus bas,
    // une fois le médecin chargé.
  }

  // Sanitisation et limites de longueur pour les champs texte
  const sanitize = (s: unknown) => (typeof s === 'string' ? s : '').trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  // Neutralise les jokers LIKE : sans ça, « % » sélectionne n'importe quel patient
  const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')
  let safeFirst  = sanitize(first_name).substring(0, 100)
  let safeLast   = sanitize(last_name).substring(0, 100)
  let safePhone  = sanitize(phone).substring(0, 20)
  let safeEmail  = email ? sanitize(email).substring(0, 254) : undefined
  const safeNotes  = notes ? sanitize(notes).substring(0, 500) : undefined
  let safeAge      = age && Number.isInteger(age) && age > 0 && age <= 120 ? age : undefined

  // Réservation « pour mon enfant » (compte parent connecté requis)
  const isForChild = forChild === true && isPublic === true
  // Date de naissance générique (RDV créé par le médecin/cabinet)
  const genericBirth = /^\d{4}-\d{2}-\d{2}$/.test(String(birthDateInput ?? '')) ? String(birthDateInput) : null
  let safeChildBirth = isForChild && /^\d{4}-\d{2}-\d{2}$/.test(String(child_birth_date ?? '')) ? String(child_birth_date) : genericBirth
  let safeChildSex: 'M' | 'F' | null = isForChild && (child_sex === 'M' || child_sex === 'F') ? child_sex : null
  let childAge = safeChildBirth
    ? Math.max(0, Math.floor((Date.now() - new Date(safeChildBirth + 'T00:00:00').getTime()) / (1000 * 3600 * 24 * 365.25)))
    : undefined

  // Validation du numéro de téléphone marocain (la fiche existante fournit le sien)
  if (!pickedPatientId && !isValidPhoneMaroc(safePhone)) {
    return NextResponse.json({ error: 'Numéro de téléphone invalide (format marocain attendu, ex: 0612345678)' }, { status: 400 })
  }

  // Validation format date (YYYY-MM-DD) et heure (HH:MM)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Format de date ou heure invalide' }, { status: 400 })
  }

  // Jour même : interdit pour les réservations publiques (le médecin garde la
  // maîtrise de sa journée), autorisé pour le médecin connecté (appel au cabinet)
  // tant que l'heure n'est pas passée.
  const nowMaroc = getNowInMaroc()
  const today = format(nowMaroc, 'yyyy-MM-dd')
  if (isPublic) {
    if (date <= today) {
      return NextResponse.json({ error: 'Les réservations le jour même ne sont pas acceptées' }, { status: 400 })
    }
  } else {
    if (date < today) {
      return NextResponse.json({ error: 'Impossible de créer un rendez-vous dans le passé' }, { status: 400 })
    }
    if (date === today && time <= format(nowMaroc, 'HH:mm')) {
      return NextResponse.json({ error: 'Ce créneau est déjà passé' }, { status: 400 })
    }
  }

  // Pour les réservations du médecin, vérifie l'authentification
  const supabase = createClient()
  const { data: { user: bookingUser } } = await supabase.auth.getUser()
  if (!isPublic) {
    if (!bookingUser) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  // « Pour mon enfant » : le lien au compte parent est le cœur de la fonction
  if (isForChild && !bookingUser) {
    return NextResponse.json({ error: 'Connectez-vous à votre espace patient pour réserver pour votre enfant' }, { status: 401 })
  }

  // Utilise le client admin pour les réservations publiques (bypass RLS)
  const db = isPublic ? createAdminClient() : supabase

  // Vérifie que le médecin existe, est approuvé et a un abonnement actif
  const { data: doctorCheck } = await db
    .from('doctors')
    .select('id, status, subscription_status, working_hours, appointment_duration, specialty, specialties, plan, booking_lead_hours')
    .eq('id', doctor_id)
    .single()

  if (!doctorCheck || doctorCheck.status !== 'approved') {
    return NextResponse.json({ error: 'Ce médecin n\'accepte pas les réservations en ligne' }, { status: 403 })
  }

  if (doctorCheck.subscription_status !== 'actif') {
    return NextResponse.json({ error: 'Ce médecin n\'accepte pas les réservations en ligne' }, { status: 403 })
  }

  // Données démographiques selon le forfait :
  // - Forfait Agenda : on ne collecte QUE le contact (nom, prénom, téléphone,
  //   email) — ni âge, ni date de naissance, ni sexe (CNDP).
  // - Forfait Cabinet : âge (adulte) ou date de naissance (enfant) obligatoires.
  const collectDemographics = doctorCheck.plan !== 'agenda'
  if (!collectDemographics) {
    safeAge = undefined
    safeChildBirth = null
    safeChildSex = null
    childAge = undefined
  } else if (isPublic) {
    if (forChild === true) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(child_birth_date ?? ''))) {
        return NextResponse.json({ error: 'La date de naissance de l\'enfant est obligatoire' }, { status: 400 })
      }
      const bd = new Date(child_birth_date + 'T00:00:00')
      const ageYears = (Date.now() - bd.getTime()) / (1000 * 3600 * 24 * 365.25)
      if (isNaN(bd.getTime()) || ageYears < 0 || ageYears > 18) {
        return NextResponse.json({ error: 'Date de naissance de l\'enfant invalide (0-18 ans)' }, { status: 400 })
      }
    } else if (!Number.isInteger(age) || age <= 0 || age > 120) {
      return NextResponse.json({ error: 'Un âge valide est obligatoire' }, { status: 400 })
    }
  }

  // Résout la durée du RDV côté serveur (jamais confiance au client) :
  // durée du motif choisi si valide, sinon durée de base du médecin.
  let appointmentDuration = doctorCheck.appointment_duration
  let safeTypeId: string | null = null
  if (consultation_type_id) {
    const { data: ctype } = await db
      .from('consultation_types')
      .select('id, duration_minutes')
      .eq('id', consultation_type_id)
      .eq('doctor_id', doctor_id)
      .eq('active', true)
      .maybeSingle()
    if (ctype) {
      appointmentDuration = ctype.duration_minutes
      safeTypeId = ctype.id
    }
  }

  // RDV existants et blocages du jour, en une seule aller-retour
  const [{ data: dayAppointments }, { data: dayBlocks }] = await Promise.all([
    db.from('appointments')
      .select('time, duration_minutes')
      .eq('doctor_id', doctor_id)
      .eq('date', date)
      .neq('status', 'cancelled'),
    db.from('blocked_dates')
      .select('start_time, end_time')
      .eq('doctor_id', doctor_id)
      .eq('date', date),
  ])

  const occupied = (dayAppointments ?? []).map((a) => ({
    time: a.time.substring(0, 5),
    duration: a.duration_minutes || doctorCheck.appointment_duration,
  }))
  const blocks = dayBlocks ?? []

  // Restrictions de créneau — UNIQUEMENT pour les réservations publiques (patients).
  // Le médecin reste maître de son agenda : il peut réserver pendant sa pause,
  // un jour fermé ou un jour de congé (cas d'urgence, faveur, etc.).
  if (isPublic) {
    const parsedDate = new Date(`${date}T00:00:00`)
    const dayKey = getDayKey(parsedDate)
    const daySchedule = doctorCheck.working_hours?.[dayKey]

    if (!daySchedule?.enabled) {
      return NextResponse.json({ error: 'Ce jour n\'est pas ouvert à la réservation' }, { status: 400 })
    }

    // Une plage bloquée occupe le créneau au même titre qu'un RDV.
    const slots = getSlotsForDuration(
      daySchedule.start,
      daySchedule.end,
      appointmentDuration,
      doctorCheck.appointment_duration,
      getDayBreaks(daySchedule),
      [...occupied, ...blockedIntervals(blocks)]
    )

    const slot = slots.find((s) => s.time === time)
    if (!slot) {
      return NextResponse.json({ error: 'Ce créneau n\'est pas disponible' }, { status: 400 })
    }
    if (!slot.available) {
      return NextResponse.json({ error: 'Ce créneau est déjà réservé' }, { status: 409 })
    }

    // Seul un congé (blocage sans horaire) ferme la journée entière. Un
    // blocage d'une heure ne retire que son intervalle, déjà écarté ci-dessus.
    if (isFullDayBlocked(blocks)) {
      return NextResponse.json({ error: 'Cette date n\'est pas disponible' }, { status: 400 })
    }

    // Délai de prévenance : réserver le jour même est permis, mais pas dans
    // l'immédiat. Contrôle refait ici — le calendrier n'est qu'une commodité.
    const leadHours = doctorCheck.booking_lead_hours ?? DEFAULT_LEAD_HOURS
    const nowMaroc = getNowInMaroc()
    const todayMaroc = format(nowMaroc, 'yyyy-MM-dd')
    if (date < todayMaroc) {
      return NextResponse.json({ error: 'Cette date est passée' }, { status: 400 })
    }
    if (date === todayMaroc &&
        toMinutes(time) < toMinutes(format(nowMaroc, 'HH:mm')) + leadHours * 60) {
      return NextResponse.json(
        { error: `Ce créneau est trop proche : réservez au moins ${leadHours} h à l'avance.` },
        { status: 400 })
    }
  } else {
    // Médecin : pas de restriction d'horaires, mais on bloque quand même
    // le chevauchement avec un RDV existant (pas deux patients en même temps).
    const newStart = toMinutes(time)
    const newEnd = newStart + appointmentDuration
    const overlaps = occupied.some((o) => {
      const s = toMinutes(o.time)
      return newStart < s + o.duration && newEnd > s
    })
    if (overlaps) {
      return NextResponse.json({ error: 'Ce créneau chevauche un rendez-vous existant' }, { status: 409 })
    }
  }

  let formattedPhone = formatPhoneMaroc(safePhone)
  const cancelToken = generateCancelToken()
  const shouldLinkPatientToUser =
    !!bookingUser && (
      (!!safeEmail && bookingUser.email === safeEmail) ||
      (!!bookingUser.phone && bookingUser.phone === formattedPhone)
    )

  // Trouve ou crée le patient — dédoublonnage par NOM + PRÉNOM + TÉLÉPHONE
  // (insensible à la casse) pour un même médecin. Le téléphone est l'identifiant
  // fiable : deux homonymes avec des numéros différents = deux personnes distinctes.
  let patientId: string

  // Fiche choisie dans la liste par le praticien : on confirme qu'elle lui
  // appartient (le client RLS le garantit déjà, ce contrôle est explicite).
  const { data: picked } = pickedPatientId
    ? await db.from('patients').select('id, first_name, last_name, phone, email')
        .eq('id', pickedPatientId).eq('doctor_id', doctor_id).maybeSingle()
    : { data: null }
  if (pickedPatientId && !picked) {
    return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })
  }
  if (picked) {
    // Le formulaire n'a envoyé aucune identité : on reprend celle de la fiche,
    // sinon la confirmation et la notification partiraient vides.
    safeFirst = picked.first_name ?? ''
    safeLast = picked.last_name ?? ''
    safePhone = picked.phone ?? ''
    safeEmail = picked.email ?? undefined
    formattedPhone = picked.phone ?? ''
  }

  const { data: existingPatient } = pickedPatientId ? { data: null } : await db
    .from('patients')
    .select('id, user_id, email')
    .eq('doctor_id', doctor_id)
    .eq('phone', formattedPhone)
    .ilike('first_name', escapeLike(safeFirst))
    .ilike('last_name', escapeLike(safeLast))
    .limit(1)
    .maybeSingle()

  if (picked) {
    patientId = picked.id
  } else if (existingPatient) {
    patientId = existingPatient.id
    // SÉCURITÉ — appropriation de dossier : on ne modifie une fiche PRÉEXISTANTE
    // (email, date de naissance…) et on ne la rattache à un compte QUE si ce compte
    // la possède DÉJÀ (user_id). Aucun signal fourni par le client — email ou
    // téléphone auto-déclarés — ne peut conférer la propriété : sinon connaître
    // nom + téléphone (souvent publics) suffirait à s'approprier le dossier médical
    // d'autrui. En particulier : on n'écrit JAMAIS l'email sur une fiche non possédée
    // (l'écrire permettait ensuite de la revendiquer par « email de la fiche = email
    // du compte », et détournait confirmations/rappels/jeton d'annulation).
    // Le rattachement d'une fiche créée au cabinet passe par la fusion (côté médecin).
    const alreadyMine = !!bookingUser && !!existingPatient.user_id && existingPatient.user_id === bookingUser.id
    if (alreadyMine) {
      const updates: Record<string, unknown> = {}
      if (safeEmail && !existingPatient.email) updates.email = safeEmail
      if (safeAge) updates.age = safeAge
      if (isForChild) {
        updates.is_child = true
        updates.birth_date = safeChildBirth
        if (safeChildSex) updates.sex = safeChildSex
        if (childAge != null) updates.age = childAge
      }
      if (Object.keys(updates).length > 0) {
        await db.from('patients').update(updates).eq('id', patientId)
      }
    }
  } else {
    const { data: newPatient, error: patientError } = await db
      .from('patients')
      .insert({
        doctor_id,
        first_name: safeFirst,
        last_name: safeLast,
        phone: formattedPhone,
        email: safeEmail || null,
        age: childAge ?? safeAge ?? null,
        birth_date: safeChildBirth,
        sex: safeChildSex,
        is_child: isForChild,
        // Fiche neuve : rattachement direct au compte parent (aucune donnée
        // préexistante ne peut être détournée). Les fiches EXISTANTES, elles,
        // exigent la vérification email/téléphone (voir plus haut).
        user_id: (isForChild && bookingUser) || shouldLinkPatientToUser ? bookingUser!.id : null,
      })
      .select('id')
      .single()

    if (patientError || !newPatient) {
      return NextResponse.json({ error: 'Erreur création patient' }, { status: 500 })
    }
    patientId = newPatient.id
  }

  // Spécialité choisie : validée contre les spécialités du médecin (jamais le client).
  // Médecin mono-spécialité → on stocke sa spécialité ; sinon null si non fournie/invalide.
  const docSpecs = (doctorCheck.specialties && doctorCheck.specialties.length > 0)
    ? doctorCheck.specialties
    : (doctorCheck.specialty ? [doctorCheck.specialty] : [])
  const safeSpecialty = (specialty && docSpecs.includes(specialty))
    ? specialty
    : (docSpecs.length === 1 ? docSpecs[0] : null)

  // RDV récurrents : uniquement pour une création manuelle par le médecin
  // (jamais en réservation publique). Le RDV principal + les occurrences
  // partagent recurrence_group_id ; chacune reste déplaçable/annulable seule.
  const rec = !isPublic ? (body.recurrence as { freq?: string; count?: number } | undefined) : undefined
  const recFreq = rec && ['weekly', 'biweekly', 'monthly'].includes(String(rec.freq)) ? String(rec.freq) : null
  const recCount = recFreq ? Math.min(26, Math.max(2, Math.floor(Number(rec?.count) || 0))) : 1
  const recGroupId = recCount > 1 ? randomUUID() : null

  // Crée le rendez-vous
  const { data: appointment, error: aptError } = await db
    .from('appointments')
    .insert({
      doctor_id,
      patient_id: patientId,
      date,
      time,
      status: 'confirmed',
      notes: safeNotes || null,
      cancel_token: cancelToken,
      consultation_type_id: safeTypeId,
      specialty: safeSpecialty,
      duration_minutes: appointmentDuration,
      recurrence_group_id: recGroupId,
      // Trace du consentement légal (réservation publique uniquement)
      consent_at: isPublic ? new Date().toISOString() : null,
    })
    .select('*')
    .single()

  if (aptError || !appointment) {
    // Race condition : le créneau a été pris entre la vérification et l'insertion.
    // 23505 = index unique (même heure de départ) ; 23P01 = contrainte d'exclusion
    // no_overlapping_appointments (chevauchement d'intervalles à durées variables).
    if (aptError?.code === '23505' || aptError?.code === '23P01') {
      return NextResponse.json({ error: 'Ce créneau vient d\'être réservé. Veuillez en choisir un autre.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur création RDV' }, { status: 500 })
  }

  // Occurrences suivantes de la série récurrente (même heure, jours travaillés)
  if (recGroupId) {
    const base = parseISO(date)
    const wh = (doctorCheck.working_hours ?? {}) as Record<string, { enabled?: boolean } | undefined>
    for (let k = 1; k < recCount; k++) {
      const d = recFreq === 'monthly' ? addMonths(base, k) : addDays(base, (recFreq === 'biweekly' ? 14 : 7) * k)
      if (wh[getDayKey(d)]?.enabled === false) continue
      await db.from('appointments').insert({
        doctor_id, patient_id: patientId, date: format(d, 'yyyy-MM-dd'), time,
        status: 'confirmed', notes: safeNotes || null, cancel_token: generateCancelToken(),
        consultation_type_id: safeTypeId, specialty: safeSpecialty,
        duration_minutes: appointmentDuration, consent_at: null, recurrence_group_id: recGroupId,
      })
      // On ignore silencieusement les collisions (créneau déjà pris ce jour-là)
    }
  }

  // Récupère les infos du médecin pour le SMS et les emails
  const { data: doctor } = await db
    .from('doctors')
    .select('name, email, specialty')
    .eq('id', doctor_id)
    .single()

  const baseUrl = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
  const patientName = `${safeFirst} ${safeLast}`

  // Envoi des emails — AWAIT obligatoire en serverless, sinon la fonction
  // se termine avant que l'email parte (les promesses non attendues sont tuées).
  const emailTasks: Promise<unknown>[] = []

  // Email de confirmation au patient (si email fourni)
  if (safeEmail && doctor) {
    emailTasks.push(
      sendAppointmentConfirmationToPatient({
        patientEmail: safeEmail,
        patientName,
        doctorName: doctor.name,
        specialty: doctor.specialty,
        date,
        time,
        cancelToken,
      }).catch((err) => console.error('[Email] confirmation patient:', err))
    )
  }

  await Promise.allSettled(emailTasks)

  // Réponse minimale : ne jamais renvoyer cancel_token ni les champs internes
  // au navigateur (le token ne circule que par email).
  return NextResponse.json(
    { id: appointment.id, date: appointment.date, time: appointment.time },
    { status: 201 }
  )
}
