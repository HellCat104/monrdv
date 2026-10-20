// Disponibilités sur plusieurs jours, en un seul passage base.
//
// POURQUOI CE FICHIER EXISTE
// `GET /api/slots` traite UNE date par appel : parfait pour la page publique,
// où le patient clique un jour après l'autre. Le chatbot WhatsApp, lui, doit
// annoncer d'emblée « voici les 7 prochains jours » — sept appels HTTP et une
// vingtaine d'allers-retours Supabase pour UN message entrant, alors que Meta
// attend une réponse en moins de deux secondes avant de rejouer le webhook.
//
// Ici : une requête médecin, une pour le motif, une pour TOUS les blocages de
// la période, une pour TOUS les RDV de la période. Quatre requêtes, puis la
// boucle se fait en mémoire avec les MÊMES fonctions que la route
// (`getSlotsForDuration`, `getDayBreaks`, `blockedIntervals`…). La règle de
// disponibilité n'est donc pas réécrite : si elle change dans lib/utils.ts,
// elle change aux deux endroits.
//
// Conséquence volontaire : le chatbot ne peut proposer que ce que cette
// fonction renvoie. Aucun créneau ne peut être inventé, ni par un modèle de
// langage, ni par une erreur de parcours.

import { addDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getSlotsForDuration,
  getDayKey,
  getDayBreaks,
  getNowInMaroc,
  toMinutes,
  isFullDayBlocked,
  blockedIntervals,
  DEFAULT_LEAD_HOURS,
  type OccupiedInterval,
} from '@/lib/utils'
import type { WorkingHours } from '@/types'

export interface JourDisponible {
  date: string       // YYYY-MM-DD
  libelle: string    // « Jeu. 16 oct. » — tient dans les 24 caractères d'une ligne WhatsApp
  creneaux: string[] // heures libres, « HH:mm »
}

export interface Disponibilites {
  medecin: {
    id: string
    name: string
    /** Sert à construire le lien vers la page publique. Renvoyé ICI plutôt que
     *  relu par l'appelant : la fiche médecin vient déjà d'être chargée, et
     *  l'étape « quel jour ? » la relisait aussitôt pour cette seule colonne. */
    slug: string | null
    city: string | null
    address: string | null
    show_prices: boolean
    appointment_duration: number
  }
  duree: number           // durée retenue (celle du motif, sinon celle du médecin)
  jours: JourDisponible[] // uniquement les jours qui ont au moins un créneau
}

/** Libellé court d'une date « YYYY-MM-DD », sans conversion de fuseau.
 *  Une date seule désigne un jour de calendrier : la reconstruire par
 *  composantes évite le décalage d'un jour quand le serveur est en avance
 *  sur le Maroc (même piège que `formatDateFr` dans lib/utils.ts). */
function libelleCourt(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return format(new Date(y, m - 1, d), 'EEE d MMM', { locale: fr })
}

/**
 * Créneaux libres du médecin sur les `jours` prochains jours.
 * @returns null si le médecin est introuvable ou non réservable
 *          (non approuvé, abonnement inactif) — même règle que /api/slots,
 *          qui refuserait ensuite la création du RDV.
 */
export async function disponibilitesSurPeriode(
  doctorId: string,
  jours = 7,
  consultationTypeId?: string | null
): Promise<Disponibilites | null> {
  const supabase = createAdminClient()

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, slug, city, address, show_prices, working_hours, appointment_duration, status, subscription_status, booking_lead_hours')
    .eq('id', doctorId)
    .single()

  if (!doctor) return null
  if (doctor.status !== 'approved' || doctor.subscription_status !== 'actif') return null

  // Durée du RDV : celle du motif choisi, sinon la durée de base du médecin.
  // Elle conditionne les créneaux : un motif de 45 min n'a pas les mêmes
  // ouvertures qu'un contrôle de 15 min.
  let duree = doctor.appointment_duration
  if (consultationTypeId) {
    const { data: motif } = await supabase
      .from('consultation_types')
      .select('duration_minutes')
      .eq('id', consultationTypeId)
      .eq('doctor_id', doctorId)
      .eq('active', true)
      .maybeSingle()
    if (motif?.duration_minutes) duree = motif.duration_minutes
  }

  const nowMaroc = getNowInMaroc()
  const premier = format(nowMaroc, 'yyyy-MM-dd')
  const dernier = format(addDays(nowMaroc, jours - 1), 'yyyy-MM-dd')

  // Toute la période en deux requêtes, au lieu de deux par jour.
  const [blocagesRes, rdvRes] = await Promise.all([
    supabase
      .from('blocked_dates')
      .select('date, start_time, end_time')
      .eq('doctor_id', doctorId)
      .gte('date', premier)
      .lte('date', dernier),
    supabase
      .from('appointments')
      .select('date, time, duration_minutes')
      .eq('doctor_id', doctorId)
      .gte('date', premier)
      .lte('date', dernier)
      .neq('status', 'cancelled'),
  ])

  // Regroupement par jour : la boucle ne refiltre pas les tableaux complets.
  const blocagesParJour = new Map<string, { start_time: string | null; end_time: string | null }[]>()
  for (const b of blocagesRes.data ?? []) {
    const cle = String(b.date).slice(0, 10)
    if (!blocagesParJour.has(cle)) blocagesParJour.set(cle, [])
    blocagesParJour.get(cle)!.push({ start_time: b.start_time, end_time: b.end_time })
  }

  const rdvParJour = new Map<string, OccupiedInterval[]>()
  for (const r of rdvRes.data ?? []) {
    const cle = String(r.date).slice(0, 10)
    if (!rdvParJour.has(cle)) rdvParJour.set(cle, [])
    rdvParJour.get(cle)!.push({
      time: String(r.time).substring(0, 5),
      duration: r.duration_minutes || doctor.appointment_duration,
    })
  }

  const horaires = doctor.working_hours as WorkingHours
  const leadHours = doctor.booking_lead_hours ?? DEFAULT_LEAD_HOURS
  // Le jour même, on ne propose rien qui prive le médecin de son délai de
  // prévenance : un patient ne doit pas pouvoir surgir dans dix minutes.
  const butoirAujourdhui = toMinutes(format(nowMaroc, 'HH:mm')) + leadHours * 60

  const resultat: JourDisponible[] = []

  for (let i = 0; i < jours; i++) {
    const jour = addDays(nowMaroc, i)
    const date = format(jour, 'yyyy-MM-dd')

    const planning = horaires?.[getDayKey(jour)]
    if (!planning?.enabled) continue

    const blocages = blocagesParJour.get(date) ?? []
    // Un blocage sans horaire = journée entière fermée (congé).
    if (isFullDayBlocked(blocages)) continue

    const occupes: OccupiedInterval[] = [
      ...blockedIntervals(blocages),
      ...(rdvParJour.get(date) ?? []),
    ]

    let creneaux = getSlotsForDuration(
      planning.start,
      planning.end,
      duree,
      doctor.appointment_duration,
      getDayBreaks(planning),
      occupes
    )
      .filter((c) => c.available)
      .map((c) => c.time)

    if (date === premier) {
      creneaux = creneaux.filter((c) => toMinutes(c) >= butoirAujourdhui)
    }

    // Un jour sans créneau n'est pas proposé : mieux vaut 4 jours utiles que
    // 7 lignes dont 3 mènent à une liste vide.
    if (creneaux.length > 0) {
      resultat.push({ date, libelle: libelleCourt(date), creneaux })
    }
  }

  return {
    medecin: {
      id: doctor.id,
      name: doctor.name,
      slug: doctor.slug ?? null,
      city: doctor.city,
      address: doctor.address,
      show_prices: doctor.show_prices !== false,
      appointment_duration: doctor.appointment_duration,
    },
    duree,
    jours: resultat,
  }
}
