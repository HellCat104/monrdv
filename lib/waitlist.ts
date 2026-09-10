// Liste d'attente — « prévenez-moi si une place se libère plus tôt » (v56).
//
// ── CE QUE CE MODULE EST, ET POURQUOI IL EST SEUL ───────────────────────────
//
// Un créneau se vide par une dizaine de portes : le médecin annule, déplace ou
// supprime un rendez-vous ; la secrétaire annule, déplace ou supprime une
// fiche ; le patient annule par le lien de l'e-mail ou depuis son espace, ou
// supprime son compte ; et la liste d'attente elle-même libère l'ancien
// rendez-vous de celui qui avance le sien. Recopier la logique d'offre dans
// chaque route, c'est garantir que la prochaine l'oubliera et que les
// premières divergeront entre-temps. Tout passe donc par
// `proposerCreneauLibere`, et par elle seule. La liste des appelants est
// tenue en tête de cette fonction.
//
// ── LA RÈGLE QUI TIENT TOUT : ON PRÉVIENT, ON NE DÉPLACE JAMAIS ─────────────
//
// Aucune fonction ici ne déplace un rendez-vous de sa propre initiative.
// Déplacer sans demander serait inacceptable : le patient a posé une
// demi-journée, prévenu son employeur, organisé une garde d'enfant autour de
// l'heure qu'il a choisie. On lui envoie une INVITATION ; s'il ne répond pas,
// son rendez-vous tardif tient toujours, et le cabinet se retrouve dans la
// situation qui était la sienne avant : un créneau vide.
//
// ── UN PATIENT NE SE RETROUVE JAMAIS SANS RENDEZ-VOUS ───────────────────────
//
// Quand il accepte l'offre (`reserverOffre`), l'ordre des écritures est NON
// NÉGOCIABLE : on CRÉE le nouveau rendez-vous, et on n'annule l'ancien QUE si
// la création a renvoyé une ligne. Jamais l'inverse : annuler d'abord, puis
// perdre la course sur le nouveau créneau, laisserait le patient les mains
// vides — il aurait perdu la place qu'il avait pour une place qu'il n'a pas.
// Le pire cas possible est donc qu'il se retrouve avec DEUX rendez-vous (si
// l'annulation de l'ancien échoue) ; il en est alors averti, le médecin aussi.
//
// ── LE DÉLAI DE PRÉVENANCE EST VOLONTAIREMENT IGNORÉ ICI ────────────────────
//
// `doctors.booking_lead_hours` (défaut 3 h) protège le praticien des
// réservations sauvages de dernière minute : un inconnu qui pose un
// rendez-vous pour dans vingt minutes. Ce module N'APPLIQUE PAS ce délai, et
// ce n'est pas un oubli — c'est une décision explicite de la propriétaire du
// produit.
//
// Tout l'intérêt de la liste d'attente est de remplir CE SOIR le créneau de
// DEMAIN MATIN, quand une annulation tombe à 18 h pour un rendez-vous à 10 h.
// Un médecin réglé sur « pas le jour même » (24 h) ne verrait plus jamais ce
// cas — le plus fréquent et le plus coûteux — rempli.
//
// Et la situation n'est pas la même : le délai encadre une réservation
// SAUVAGE. Ici, c'est le cabinet qui invite nommément un patient déjà connu,
// déjà inscrit, à avancer son propre rendez-vous. Le praticien qui ne veut pas
// de ça coupe la liste d'attente entière (`doctors.waitlist_enabled`) — un
// réglage franc plutôt qu'un délai détourné.
//
// MERCI DE NE PAS « CORRIGER » CE POINT EN AJOUTANT UN CONTRÔLE DE LEAD HOURS,
// ni dans l'envoi de l'offre, ni dans la réservation.
//
// ── E-MAIL UNIQUEMENT ───────────────────────────────────────────────────────
//
// Il n'y a pas de SMS dans ce produit : lib/twilio.ts n'est appelé nulle part.
// On n'en introduit pas ici. Un patient sans adresse e-mail n'est donc jamais
// candidat — on ne saurait pas le prévenir.

import { createAdminClient } from '@/lib/supabase/server'
import {
  sendWaitlistOfferEmail, sendWaitlistBookedEmailToPatient, sendWaitlistBookedEmailToDoctor,
} from '@/lib/email'
import { displayName } from '@/lib/profession'
import {
  generateCancelToken, getNowInMaroc, toMinutes, blockedIntervals, isFullDayBlocked,
  getDayKey, getDayBreaks, formatDateFr, formatTime,
} from '@/lib/utils'
import { format, addMinutes } from 'date-fns'
import type { WorkingHours } from '@/types'

type Admin = ReturnType<typeof createAdminClient>

// ════════════════════════════════════════════════════════════════════════════
// Outils
// ════════════════════════════════════════════════════════════════════════════

/** Durée de repli quand ni le rendez-vous ni le médecin n'en portent une —
 *  la même que la contrainte d'exclusion v31 (COALESCE(duration_minutes, 30)). */
const DUREE_REPLI = 30

/**
 * Plafond d'offres par créneau libéré.
 *
 * Premier arrivé premier servi suppose de prévenir tout le monde en même
 * temps, mais un cabinet qui accumulerait deux cents inscriptions enverrait
 * deux cents e-mails dans le temps d'une requête serverless — elle serait tuée
 * avant la fin, et l'annulation elle-même paraîtrait échouer. On borne, en
 * servant d'abord les inscriptions les plus anciennes : qui attend depuis le
 * plus longtemps passe devant.
 */
const MAX_OFFRES_PAR_CRENEAU = 20

/** Attente maximale d'un envoi d'e-mail. Au-delà on rend la main (serverless),
 *  l'envoi se terminera ou non : on le compte alors comme « incertain ». */
const DELAI_EMAIL_MS = 5000

/** « HH:mm:ss » ou « HH:mm » → « HH:mm ». La base stocke des `time` avec secondes. */
function hhmm(t: string): string {
  return String(t).substring(0, 5)
}

/** « 2026-09-10 10:00 » en heure marocaine : comparable en chaîne, comme dans
 *  les routes d'annulation, pour que les deux ne divergent jamais. */
function maintenantMaroc(): string {
  return format(getNowInMaroc(), 'yyyy-MM-dd HH:mm')
}

/**
 * Délai minimal entre l'envoi d'une offre et le créneau proposé.
 *
 * À ne PAS confondre avec `booking_lead_hours`, le délai de prévenance du
 * praticien, qui reste volontairement ignoré par la liste d'attente (voir
 * l'en-tête du module). Ce plancher-ci a une autre raison d'être : une place
 * libérée à 9 h 50 pour 10 h ne sera reprise par personne — le temps de lire
 * l'e-mail, de se préparer et de traverser la ville. L'envoyer quand même,
 * c'est déranger une vingtaine de patients pour rien et entamer la confiance
 * qu'ils accordent aux offres suivantes.
 *
 * Il ne s'applique qu'à l'ENVOI. Une offre partie à temps reste réservable
 * jusqu'au début du créneau : c'est au patient de juger s'il peut venir.
 */
const PLANCHER_OFFRE_MINUTES = 60

function quand(date: string, time: string): string {
  return `${date} ${hhmm(time)}`
}

/** « jeudi 10 septembre 2026 à 10:00 » — pour les messages affichés au patient. */
function lisible(date: string, time: string): string {
  return `${formatDateFr(date)} à ${formatTime(String(time))}`
}

type Envoi = 'ok' | 'echec' | 'incertain'

async function avecDelai(tache: Promise<boolean>): Promise<Envoi> {
  return Promise.race<Envoi>([
    tache.then((ok): Envoi => (ok ? 'ok' : 'echec')).catch((): Envoi => 'echec'),
    new Promise<Envoi>((resolve) => setTimeout(() => resolve('incertain'), DELAI_EMAIL_MS)),
  ])
}

// ════════════════════════════════════════════════════════════════════════════
// Le créneau est-il réellement réservable ?
// ════════════════════════════════════════════════════════════════════════════

type Reservable = { ok: true } | { ok: false; raison: 'horaires' | 'bloque' | 'occupe' | 'illisible' }

/**
 * Refait le calcul plutôt que de le supposer. Une annulation ne libère pas
 * forcément la place : un rendez-vous plus long peut chevaucher, le médecin a
 * pu poser un blocage, quelqu'un l'a déjà reprise. Proposer une place déjà
 * prise, c'est faire courir le patient pour rien et le décourager de recliquer
 * la fois suivante.
 *
 * Les HORAIRES sont vérifiés aussi, et c'est voulu : le médecin « reste maître
 * de son agenda » et peut poser un rendez-vous d'urgence pendant sa pause ou
 * un jour fermé (app/api/appointments). Si ce rendez-vous-là est annulé, la
 * pause redevient une pause — pas une place à offrir au public.
 *
 * Les BLOCAGES doivent être relus au moment de réserver : la contrainte
 * d'exclusion GiST ne connaît que les rendez-vous, pas `blocked_dates`. Un
 * médecin qui bloque la plage après l'envoi de l'offre ne serait protégé par
 * rien d'autre que ce contrôle.
 *
 * Le délai de prévenance n'est PAS vérifié (voir l'en-tête du module).
 */
async function creneauReservable(admin: Admin, p: {
  doctorId: string
  date: string
  time: string
  duree: number
  workingHours: WorkingHours | null
  dureeBase: number
}): Promise<Reservable> {
  const debut = toMinutes(p.time)
  const fin = debut + p.duree

  const jour = p.workingHours?.[getDayKey(new Date(`${p.date}T00:00:00`))]
  if (!jour?.enabled || !jour.start || !jour.end) return { ok: false, raison: 'horaires' }
  if (debut < toMinutes(jour.start) || fin > toMinutes(jour.end)) return { ok: false, raison: 'horaires' }
  if (getDayBreaks(jour).some((b) => debut < toMinutes(b.end) && fin > toMinutes(b.start))) {
    return { ok: false, raison: 'horaires' }
  }

  const [rdvJour, blocagesJour] = await Promise.all([
    admin.from('appointments')
      .select('time, duration_minutes')
      .eq('doctor_id', p.doctorId)
      .eq('date', p.date)
      .neq('status', 'cancelled')
      // Les patients « sans RDV » (walk-in, v31) sont hors grille : ils
      // n'occupent aucun créneau et sont exclus de la contrainte en base.
      // Un walk_in NULL est compté comme occupant — prudence de ce côté-là.
      .or('walk_in.is.null,walk_in.eq.false'),
    admin.from('blocked_dates')
      .select('start_time, end_time')
      .eq('doctor_id', p.doctorId)
      .eq('date', p.date),
  ])
  if (rdvJour.error || blocagesJour.error) {
    console.error('[liste-attente] lecture de la journée :',
      rdvJour.error?.message ?? blocagesJour.error?.message)
    return { ok: false, raison: 'illisible' }
  }

  const blocages = blocagesJour.data ?? []
  if (isFullDayBlocked(blocages)) return { ok: false, raison: 'bloque' }
  const chevauche = (liste: { time: string; duration: number }[]) => liste.some((o) => {
    const s = toMinutes(o.time)
    return debut < s + o.duration && fin > s
  })
  if (chevauche(blockedIntervals(blocages))) return { ok: false, raison: 'bloque' }

  const occupes = (rdvJour.data ?? []).map((a: { time: string; duration_minutes: number | null }) => ({
    time: hhmm(a.time),
    duration: a.duration_minutes || p.dureeBase,
  }))
  if (chevauche(occupes)) return { ok: false, raison: 'occupe' }

  return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════════
// Hygiène des inscriptions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Ferme les inscriptions actives adossées à ces rendez-vous.
 *
 * Le trigger `trg_close_waitlist_on_cancel` (v56) fait la même chose en base à
 * chaque annulation ; on le double ici pour ne pas dépendre d'un objet SQL que
 * rien, côté code, ne prouve présent. Idempotent : sur une ligne déjà fermée
 * par le trigger, l'UPDATE ne touche rien.
 *
 * Ne lève jamais : une hygiène qui ferait échouer une annulation serait pire
 * que le désordre qu'elle corrige. Mais un échec est journalisé, jamais tu.
 */
export async function fermerInscriptionsDuRdv(appointmentIds: string[]): Promise<boolean> {
  const ids = appointmentIds.filter(Boolean)
  if (ids.length === 0) return true
  try {
    const { error } = await createAdminClient()
      .from('waitlist_entries')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .in('appointment_id', ids)
      .eq('status', 'active')
    if (error) {
      console.error('[liste-attente] fermeture impossible :', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[liste-attente] fermeture impossible :', e)
    return false
  }
}

/**
 * Droit à l'effacement (loi 09-08) : SUPPRIME toutes les inscriptions de ces
 * fiches patient — actives ou non, rendez-vous passés compris — et, par
 * cascade, leurs offres (jetons compris). Fermer ne suffirait pas : la ligne
 * dirait encore « cette personne attendait une place chez ce médecin ».
 *
 * On passe par les inscriptions (quelques lignes) plutôt que par la liste de
 * tous les rendez-vous du patient : un suivi de kinésithérapie en compte des
 * centaines, et un `.in()` de centaines d'identifiants dépasse la longueur
 * d'URL que PostgREST accepte — l'effacement échouerait sur les patients les
 * plus fidèles.
 */
export async function effacerInscriptionsDesPatients(patientIds: string[]): Promise<boolean> {
  const ids = patientIds.filter(Boolean)
  if (ids.length === 0) return true
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('waitlist_entries')
      .select('id, rdv:appointments!inner(patient_id)')
      .in('rdv.patient_id', ids)
    if (error) {
      console.error('[liste-attente] effacement : lecture impossible :', error.message)
      return false
    }
    const entreeIds = (data ?? []).map((l: { id: string }) => l.id)
    if (entreeIds.length === 0) return true
    const { error: errDelete } = await admin.from('waitlist_entries').delete().in('id', entreeIds)
    if (errDelete) {
      console.error('[liste-attente] effacement impossible :', errDelete.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[liste-attente] effacement impossible :', e)
    return false
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Inscription / désinscription
// ════════════════════════════════════════════════════════════════════════════

export type ResultatInscription = { ok: true } | { ok: false; raison: string }

/**
 * Inscrit un rendez-vous en liste d'attente.
 *
 * L'APPELANT a déjà vérifié que ce rendez-vous appartient à la personne qui
 * demande (route de réservation qui vient de le créer, ou espace patient).
 * Cette fonction vérifie tout le reste — et renvoie une phrase affichable, car
 * un refus muet laisserait le patient croire qu'il sera prévenu.
 *
 * `doctor_id` est recopié par le trigger v56 depuis le rendez-vous ; on
 * l'envoie quand même, lu dans la même ligne, pour ne pas dépendre de l'ordre
 * d'évaluation des contraintes NOT NULL.
 */
export async function inscrireEnListeAttente(appointmentId: string): Promise<ResultatInscription> {
  try {
    const admin = createAdminClient()
    const { data: rdv, error } = await admin
      .from('appointments')
      .select(`id, doctor_id, date, time, status, walk_in, amount_paid, invoice_no,
               patient:patients(email),
               doctor:doctors(waitlist_enabled, status, subscription_status)`)
      .eq('id', appointmentId)
      .maybeSingle()
    if (error) {
      // Typiquement : la migration v56 n'est pas encore passée (colonne
      // waitlist_enabled absente). Le rendez-vous, lui, est bien enregistré.
      console.error('[liste-attente] lecture du rendez-vous à inscrire :', error.message)
      return { ok: false, raison: 'La liste d\'attente n\'est pas disponible pour le moment.' }
    }
    if (!rdv) return { ok: false, raison: 'Rendez-vous introuvable.' }

    const medecin = rdv.doctor as unknown as { waitlist_enabled?: boolean; status?: string; subscription_status?: string } | null
    const patient = rdv.patient as unknown as { email?: string | null } | null

    if (rdv.status === 'cancelled') return { ok: false, raison: 'Ce rendez-vous est annulé.' }
    if (rdv.walk_in) return { ok: false, raison: 'Un passage sans rendez-vous ne peut pas être avancé.' }
    if (quand(rdv.date, rdv.time) <= maintenantMaroc()) return { ok: false, raison: 'Ce rendez-vous est déjà passé.' }
    // Un acte réglé relève de la comptabilité : le déplacer, c'est déplacer le
    // paiement, et c'est au cabinet de le faire (même règle que l'annulation
    // en ligne, app/api/cancel/[token]).
    if (rdv.invoice_no || rdv.amount_paid != null) {
      return { ok: false, raison: 'Ce rendez-vous a déjà été réglé : contactez le cabinet pour le déplacer.' }
    }
    if (!medecin || medecin.waitlist_enabled !== true
        || medecin.status !== 'approved' || medecin.subscription_status !== 'actif') {
      return { ok: false, raison: 'Ce cabinet ne propose pas la liste d\'attente.' }
    }
    if (!patient?.email) {
      return { ok: false, raison: 'Aucune adresse e-mail n\'est associée à ce rendez-vous : nous ne pourrions pas vous prévenir.' }
    }

    const { error: errInsert } = await admin.from('waitlist_entries').insert({
      appointment_id: rdv.id,
      doctor_id: rdv.doctor_id,
      status: 'active',
    })
    if (errInsert) {
      // 23505 = index partiel uniq_waitlist_active_appointment : DÉJÀ inscrit
      // (double clic, case cochée à la réservation puis dans l'espace
      // patient). Le résultat voulu est atteint.
      if (errInsert.code === '23505') return { ok: true }
      console.error('[liste-attente] inscription impossible :', errInsert.message)
      return { ok: false, raison: 'L\'inscription n\'a pas pu être enregistrée. Réessayez.' }
    }
    return { ok: true }
  } catch (e) {
    console.error('[liste-attente] inscription impossible :', e)
    return { ok: false, raison: 'L\'inscription n\'a pas pu être enregistrée. Réessayez.' }
  }
}

/** Désinscription volontaire (espace patient, ou lien de l'e-mail d'offre). */
export async function desinscrireDeListeAttente(appointmentId: string): Promise<boolean> {
  return fermerInscriptionsDuRdv([appointmentId])
}

/**
 * Parmi ces rendez-vous, lesquels ont une inscription active ?
 * Renvoie `null` si la table est illisible (migration non passée) : l'appelant
 * cache alors l'interrupteur au lieu d'afficher un état faux.
 */
export async function rdvInscrits(appointmentIds: string[]): Promise<Set<string> | null> {
  if (appointmentIds.length === 0) return new Set()
  const { data, error } = await createAdminClient()
    .from('waitlist_entries')
    .select('appointment_id')
    .in('appointment_id', appointmentIds)
    .eq('status', 'active')
  if (error) {
    console.error('[liste-attente] lecture des inscriptions :', error.message)
    return null
  }
  return new Set((data ?? []).map((l: { appointment_id: string }) => l.appointment_id))
}

// ════════════════════════════════════════════════════════════════════════════
// LE CŒUR : un créneau vient de se libérer
// ════════════════════════════════════════════════════════════════════════════

/**
 * Pourquoi le créneau s'est libéré. Décide du sort de l'inscription du
 * rendez-vous qui libère la place :
 *  - annulation   : elle est fermée (plus de borne) ;
 *  - suppression  : la cascade l'a déjà effacée ;
 *  - deplacement  : le rendez-vous EXISTE toujours ailleurs, l'inscription
 *                   survit — mais on ne lui propose pas sa propre ancienne
 *                   place : le cabinet vient justement de l'en sortir ;
 *  - liste_attente: le patient vient d'avancer son rendez-vous grâce à la
 *                   liste ; son inscription est `used`, rien à faire.
 */
export type MotifLiberation = 'annulation' | 'suppression' | 'deplacement' | 'liste_attente'

/** Un créneau qui vient de se vider. Lu AVANT l'écriture qui l'a libéré. */
export interface CreneauLibere {
  motif: MotifLiberation
  doctorId: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm ou HH:mm:ss */
  time: string
  /** Durée du rendez-vous qui libère la place. Null ⇒ durée de base du médecin. */
  durationMinutes?: number | null
  /** Un passage « sans RDV » n'occupait aucun créneau : l'annuler ne libère rien. */
  walkIn?: boolean | null
  /** Le rendez-vous qui libère la place. */
  appointmentId?: string | null
}

/** Construit le créneau libéré à partir d'une ligne `appointments` lue avant l'écriture. */
export function creneauDuRdv(
  motif: MotifLiberation,
  rdv: { id: string; doctor_id: string; date: string; time: string; duration_minutes?: number | null; walk_in?: boolean | null },
): CreneauLibere {
  return {
    motif,
    appointmentId: rdv.id,
    doctorId: rdv.doctor_id,
    date: String(rdv.date),
    time: String(rdv.time),
    durationMinutes: rdv.duration_minutes ?? null,
    walkIn: rdv.walk_in ?? null,
  }
}

export interface ResultatOffre {
  /** E-mails d'offre dont Resend a confirmé l'envoi. */
  notifies: number
  /** Offres enregistrées dont l'envoi a échoué ou n'a pas répondu à temps. */
  echecs: number
  /** Pourquoi personne n'a été prévenu — pour les journaux, jamais pour l'utilisateur. */
  raison?: string
}

/** Forme d'une inscription telle que PostgREST la renvoie avec ses jointures. */
interface LigneCandidate {
  id: string
  created_at: string
  appointment: {
    id: string
    patient_id: string
    date: string
    time: string
    status: string
    duration_minutes: number | null
    walk_in: boolean | null
    amount_paid: number | null
    invoice_no: string | null
    patient: { first_name: string | null; last_name: string | null; email: string | null } | null
  } | null
}

/**
 * Un créneau vient de se libérer : trouve les candidats éligibles et leur
 * envoie l'offre.
 *
 * APPELANTS (à tenir à jour — c'est la liste qu'un audit doit pouvoir relire) :
 *   app/api/appointments/[id]/route.ts         PATCH annulation + déplacement, DELETE (médecin)
 *   app/api/cabinet/appointments/route.ts      PATCH annulation + déplacement (secrétaire)
 *   app/api/cabinet/patients/route.ts          DELETE fiche patient (secrétaire)
 *   app/api/cancel/[token]/route.ts            POST (patient, lien de l'e-mail)
 *   app/api/patient/appointments/[id]/cancel   POST (patient, espace patient)
 *   app/api/patient/data/route.ts              DELETE (effacement du compte)
 *   lib/waitlist.ts → reserverOffre            l'ancien rendez-vous de qui avance le sien
 *
 * Ne lève JAMAIS. Elle est appelée APRÈS que la libération a été enregistrée
 * et vérifiée : si elle échouait bruyamment, le patient verrait « l'annulation
 * n'a pas pu être enregistrée » alors qu'elle l'a été.
 */
export async function proposerCreneauLibere(c: CreneauLibere): Promise<ResultatOffre> {
  try {
    // Le patient qui vient d'annuler n'est pas candidat à son propre créneau,
    // et son inscription n'a plus de borne. À faire EN PREMIER.
    if (c.motif === 'annulation' && c.appointmentId) {
      await fermerInscriptionsDuRdv([c.appointmentId])
    }

    if (c.walkIn) return { notifies: 0, echecs: 0, raison: 'passage sans rendez-vous : aucun créneau libéré' }
    if (!c.doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.date)) || !/^\d{2}:\d{2}/.test(String(c.time))) {
      return { notifies: 0, echecs: 0, raison: 'créneau incomplet' }
    }

    const admin = createAdminClient()
    const heure = hhmm(c.time)
    const cleCreneau = quand(c.date, heure)

    // ── 1) Le créneau est-il encore atteignable ? ────────────────────────────
    // Annuler un rendez-vous d'hier (correction d'agenda a posteriori) libère
    // une case qui n'intéresse plus personne ; une place qui démarre dans dix
    // minutes, pas davantage. D'où le plancher (voir PLANCHER_OFFRE_MINUTES,
    // qui n'est pas le délai de prévenance du praticien).
    const maintenant = maintenantMaroc()
    if (cleCreneau <= maintenant) return { notifies: 0, echecs: 0, raison: 'créneau déjà passé' }
    const plancher = format(addMinutes(getNowInMaroc(), PLANCHER_OFFRE_MINUTES), 'yyyy-MM-dd HH:mm')
    if (cleCreneau < plancher) return { notifies: 0, echecs: 0, raison: 'créneau trop proche pour être repris' }

    // ── 2) Le praticien veut-il de la liste d'attente ? ──────────────────────
    const { data: medecin, error: errMedecin } = await admin
      .from('doctors')
      .select('id, name, specialty, waitlist_enabled, appointment_duration, working_hours, status, subscription_status')
      .eq('id', c.doctorId)
      .maybeSingle()
    if (errMedecin) {
      // Typiquement : migration v56 pas encore passée. L'annulation, elle, a réussi.
      console.error('[liste-attente] lecture médecin :', errMedecin.message)
      return { notifies: 0, echecs: 0, raison: 'médecin illisible' }
    }
    if (!medecin) return { notifies: 0, echecs: 0, raison: 'médecin introuvable' }
    if (medecin.waitlist_enabled !== true) return { notifies: 0, echecs: 0, raison: 'désactivée par le médecin' }
    // Un cabinet suspendu ou en attente de validation n'accepte plus de
    // réservation : lui envoyer des patients produirait un lien qui refuse.
    if (medecin.status !== 'approved' || medecin.subscription_status !== 'actif') {
      return { notifies: 0, echecs: 0, raison: 'cabinet inactif' }
    }

    const dureeBase = Number(medecin.appointment_duration) > 0 ? Number(medecin.appointment_duration) : DUREE_REPLI
    const dureeCreneau = Number(c.durationMinutes) > 0 ? Number(c.durationMinutes) : dureeBase

    // ── 3) Le créneau est-il RÉELLEMENT libre ? ──────────────────────────────
    const libre = await creneauReservable(admin, {
      doctorId: c.doctorId, date: c.date, time: heure, duree: dureeCreneau,
      workingHours: (medecin.working_hours ?? null) as WorkingHours | null, dureeBase,
    })
    if (!libre.ok) return { notifies: 0, echecs: 0, raison: `créneau non réservable (${libre.raison})` }

    // ── 4) Les candidats ─────────────────────────────────────────────────────
    const { data: brut, error: errCandidats } = await admin
      .from('waitlist_entries')
      .select(`id, created_at,
               appointment:appointments!inner(id, patient_id, date, time, status, duration_minutes,
                 walk_in, amount_paid, invoice_no,
                 patient:patients(first_name, last_name, email))`)
      .eq('doctor_id', c.doctorId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(500)
    if (errCandidats) {
      console.error('[liste-attente] lecture des inscriptions :', errCandidats.message)
      return { notifies: 0, echecs: 0, raison: 'inscriptions illisibles' }
    }

    const candidats: LigneCandidate[] = []
    const aEteindre: string[] = []
    const patientsVus = new Set<string>()

    for (const ligne of (brut ?? []) as unknown as LigneCandidate[]) {
      const rdv = ligne.appointment
      // Rendez-vous entre-temps annulé (le trigger aurait dû fermer
      // l'inscription ; s'il manque, on rattrape ici).
      if (!rdv || rdv.status === 'cancelled') { aEteindre.push(ligne.id); continue }

      const quandRdv = quand(rdv.date, rdv.time)
      // Rendez-vous déjà passé : l'inscription n'a plus d'objet et personne ne
      // l'a fermée (le patient ne s'est pas présenté, l'agenda a défilé).
      if (quandRdv <= maintenant) { aEteindre.push(ligne.id); continue }

      // Le rendez-vous qui vient de libérer la place (déplacement) : on ne lui
      // repropose pas ce que le cabinet vient de lui retirer.
      if (c.appointmentId && rdv.id === c.appointmentId) continue

      // LA RÈGLE : strictement PLUS TÔT que son propre rendez-vous. Un créneau
      // postérieur ne l'intéresse pas ; le lui proposer serait du harcèlement.
      // (Le « même praticien » est garanti par le filtre doctor_id.)
      if (quandRdv <= cleCreneau) continue

      if (rdv.walk_in) continue
      // Acte réglé : le déplacer, c'est déplacer un paiement — au cabinet d'agir.
      if (rdv.invoice_no || rdv.amount_paid != null) continue

      // La place doit contenir SON rendez-vous. Un patient attendu 60 min ne
      // rentre pas dans un créneau de 30 : on déborderait sur le suivant, et la
      // contrainte d'exclusion refuserait au moment du clic — après lui avoir
      // fait espérer.
      const dureeSienne = rdv.duration_minutes || dureeBase
      if (dureeSienne > dureeCreneau) continue

      // Pas d'e-mail, pas d'offre : le produit n'envoie pas de SMS.
      if (!rdv.patient?.email) continue

      // Un même patient inscrit pour deux rendez-vous ne reçoit qu'UN e-mail
      // pour cette place : celui de son inscription la plus ancienne.
      if (patientsVus.has(rdv.patient_id)) continue
      patientsVus.add(rdv.patient_id)

      candidats.push(ligne)
      if (candidats.length >= MAX_OFFRES_PAR_CRENEAU) break
    }

    if (aEteindre.length > 0) {
      const { error } = await admin.from('waitlist_entries')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .in('id', aEteindre)
        .eq('status', 'active')
      if (error) console.error('[liste-attente] purge des inscriptions périmées :', error.message)
    }

    if (candidats.length === 0) return { notifies: 0, echecs: 0, raison: 'aucun candidat éligible' }

    // ── 5) L'offre ───────────────────────────────────────────────────────────
    // ORDRE DES ÉCRITURES : on INSÈRE l'offre en base, on vérifie, PUIS on
    // envoie l'e-mail. Jamais l'inverse — un e-mail parti avant l'écriture
    // porterait un lien qui ne mène nulle part.
    //
    // L'insertion porte la règle « jamais deux fois la même offre » : la
    // contrainte uniq_waitlist_offer_slot (inscription, date, heure) refuse le
    // doublon, y compris quand deux libérations concurrentes du même créneau
    // arrivent ici en même temps. Refus = on n'envoie rien.
    const nomMedecin = displayName(medecin.name ?? '', medecin.specialty)

    const resultats = await Promise.all(candidats.map(async (cand) => {
      const rdv = cand.appointment!
      const { data: offre, error: errOffre } = await admin
        .from('waitlist_offers')
        .insert({
          entry_id: cand.id,
          offered_date: c.date,
          offered_time: heure,
          duration_minutes: dureeCreneau,
        })
        .select('id, token')
        .single()

      if (errOffre || !offre) {
        if (errOffre?.code === '23505') return 'deja' as const
        console.error('[liste-attente] offre non enregistrée pour', cand.id,
          errOffre?.message ?? '(aucune ligne)')
        return 'echec' as const
      }

      const envoi = await avecDelai(sendWaitlistOfferEmail({
        patientEmail: rdv.patient!.email!,
        patientName: `${rdv.patient!.first_name ?? ''} ${rdv.patient!.last_name ?? ''}`.trim(),
        doctorName: nomMedecin,
        specialty: medecin.specialty ?? '',
        offeredDate: c.date,
        offeredTime: heure,
        currentDate: rdv.date,
        currentTime: hhmm(rdv.time),
        offerToken: offre.token,
      }))
      if (envoi !== 'ok') {
        // L'offre reste en base (le lien est valable si l'e-mail finit par
        // partir) ; on ne la renverra pas — mais on veut le voir.
        console.error('[liste-attente] e-mail d\'offre', envoi, '— offre', offre.id)
      }
      return envoi
    }))

    const notifies = resultats.filter((r) => r === 'ok').length
    const echecs = resultats.filter((r) => r === 'echec' || r === 'incertain').length
    return { notifies, echecs }
  } catch (e) {
    // Filet de sécurité : la libération a déjà réussi, elle ne doit pas être
    // rapportée en échec parce que la liste d'attente a trébuché.
    console.error('[liste-attente] offre impossible :', e)
    return { notifies: 0, echecs: 0, raison: 'erreur interne' }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// L'offre vue depuis le lien de l'e-mail (/creneau/[token])
// ════════════════════════════════════════════════════════════════════════════

export type EtatOffre =
  | 'inconnue'        // jeton inexistant ou mal copié
  | 'deja_utilisee'   // l'inscription a déjà servi (cette offre ou une autre)
  | 'close'           // rendez-vous d'origine annulé, ou désinscription
  | 'desactivee'      // le cabinet a coupé la liste d'attente, ou n'est plus actif
  | 'passee'          // le créneau proposé est passé
  | 'plus_utile'      // le rendez-vous actuel est déjà plus tôt (déplacé entre-temps)
  | 'reglee'          // le rendez-vous actuel a été réglé : au cabinet de le déplacer
  | 'prise'           // un autre patient a pris la place
  | 'indisponible'    // bloquée par le médecin, ou hors de ses horaires désormais
  | 'erreur'          // lecture impossible
  | 'disponible'

/** Ce que la page peut afficher sans rien exposer (ni jeton, ni e-mail). */
export interface AffichageOffre {
  medecin: string          // déjà préfixé « Dr. » si besoin
  specialite: string
  slug: string | null
  creneau: string          // « jeudi 10 septembre 2026 à 10:00 »
  actuel: string | null    // le rendez-vous qu'il a aujourd'hui
}

export interface VueOffre {
  etat: EtatOffre
  message: string
  affichage: AffichageOffre | null
}

/** Données internes — ne sortent jamais de ce module vers le navigateur. */
interface OffreInterne {
  offre: { id: string; offered_date: string; offered_time: string; duration_minutes: number; booked_appointment_id: string | null }
  entree: { id: string; status: string; doctor_id: string }
  rdv: {
    id: string; doctor_id: string; patient_id: string; date: string; time: string; status: string
    duration_minutes: number | null; walk_in: boolean | null; amount_paid: number | null
    invoice_no: string | null; notes: string | null; consultation_type_id: string | null
    specialty: string | null; quote_id: string | null; recurrence_group_id: string | null
    consent_at: string | null; amount_due: number | null; cancel_token: string | null
    patient: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null
  } | null
  medecin: {
    id: string; name: string | null; specialty: string | null; slug: string | null; email: string | null
    waitlist_enabled: boolean | null; status: string | null; subscription_status: string | null
    appointment_duration: number | null; working_hours: WorkingHours | null
  } | null
}

/** Les phrases vues par le patient. Jamais une erreur technique. */
function messagePour(etat: EtatOffre, a: AffichageOffre | null): string {
  const maintenu = a?.actuel ? ` Votre rendez-vous du ${a.actuel} est maintenu.` : ''
  switch (etat) {
    case 'inconnue':      return 'Ce lien de réservation n\'existe pas ou a été mal copié.'
    case 'deja_utilisee': return 'Vous avez déjà avancé votre rendez-vous grâce à la liste d\'attente : cette offre ne peut plus servir. Votre nouveau rendez-vous figure dans l\'e-mail de confirmation.'
    case 'close':         return 'Cette offre n\'est plus valable : le rendez-vous auquel elle se rattachait a été annulé, ou vous vous êtes désinscrit(e) de la liste d\'attente.'
    case 'desactivee':    return `Le cabinet ne propose plus de places par liste d'attente.${maintenu}`
    case 'passee':        return `Ce créneau est passé.${maintenu}`
    case 'plus_utile':    return `Votre rendez-vous actuel (${a?.actuel ?? '—'}) est déjà plus tôt que ce créneau.`
    case 'reglee':        return 'Votre rendez-vous a déjà été réglé : contactez le cabinet pour le déplacer.'
    case 'prise':         return `Ce créneau vient d'être pris par un autre patient.${maintenu} Vous restez inscrit(e) : vous serez prévenu(e) de la prochaine place.`
    case 'indisponible':  return `Ce créneau n'est plus proposé par le cabinet.${maintenu} Vous restez inscrit(e) : vous serez prévenu(e) de la prochaine place.`
    case 'erreur':        return `Une erreur est survenue. Réessayez dans un instant.${maintenu}`
    case 'disponible':    return ''
  }
}

async function lireOffre(token: string): Promise<{ etat: EtatOffre; interne: OffreInterne | null }> {
  // 64 caractères hexadécimaux, pas autre chose : inutile d'interroger la base
  // pour un jeton qui ne peut pas exister.
  if (!/^[a-f0-9]{64}$/.test(token)) return { etat: 'inconnue', interne: null }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('waitlist_offers')
    .select(`id, offered_date, offered_time, duration_minutes, booked_appointment_id,
             entree:waitlist_entries!inner(id, status, doctor_id,
               rdv:appointments(id, doctor_id, patient_id, date, time, status, duration_minutes,
                 walk_in, amount_paid, invoice_no, notes, consultation_type_id, specialty,
                 quote_id, recurrence_group_id, consent_at, amount_due, cancel_token,
                 patient:patients(first_name, last_name, email, phone)))`)
    .eq('token', token)
    .maybeSingle()
  if (error) {
    console.error('[liste-attente] lecture de l\'offre :', error.message)
    return { etat: 'erreur', interne: null }
  }
  if (!data) return { etat: 'inconnue', interne: null }

  const entree = data.entree as unknown as (OffreInterne['entree'] & { rdv: OffreInterne['rdv'] })
  const { data: medecin, error: errMedecin } = await admin
    .from('doctors')
    .select('id, name, specialty, slug, email, waitlist_enabled, status, subscription_status, appointment_duration, working_hours')
    .eq('id', entree.doctor_id)
    .maybeSingle()
  if (errMedecin) {
    console.error('[liste-attente] lecture du médecin de l\'offre :', errMedecin.message)
    return { etat: 'erreur', interne: null }
  }

  const interne: OffreInterne = {
    offre: {
      id: data.id,
      offered_date: String(data.offered_date),
      offered_time: hhmm(String(data.offered_time)),
      duration_minutes: data.duration_minutes,
      booked_appointment_id: data.booked_appointment_id,
    },
    entree: { id: entree.id, status: entree.status, doctor_id: entree.doctor_id },
    rdv: entree.rdv ?? null,
    medecin: (medecin ?? null) as OffreInterne['medecin'],
  }
  return { etat: 'disponible', interne }
}

function affichageDe(i: OffreInterne): AffichageOffre {
  return {
    medecin: displayName(i.medecin?.name ?? '', i.medecin?.specialty),
    specialite: i.medecin?.specialty ?? '',
    slug: i.medecin?.slug ?? null,
    creneau: lisible(i.offre.offered_date, i.offre.offered_time),
    actuel: i.rdv && i.rdv.status !== 'cancelled' ? lisible(i.rdv.date, i.rdv.time) : null,
  }
}

/**
 * Évalue une offre : l'ordre des contrôles est celui dans lequel le patient
 * a besoin de la réponse (d'abord « ce lien a-t-il un sens ? », ensuite
 * « la place est-elle encore là ? »).
 */
async function evaluerInterne(token: string): Promise<{ etat: EtatOffre; interne: OffreInterne | null }> {
  const lu = await lireOffre(token)
  if (!lu.interne) return lu
  const i = lu.interne

  if (i.entree.status === 'used') return { etat: 'deja_utilisee', interne: i }
  if (i.entree.status !== 'active' || !i.rdv || i.rdv.status === 'cancelled') return { etat: 'close', interne: i }

  const m = i.medecin
  if (!m || m.waitlist_enabled !== true || m.status !== 'approved' || m.subscription_status !== 'actif') {
    return { etat: 'desactivee', interne: i }
  }

  const maintenant = maintenantMaroc()
  const cle = quand(i.offre.offered_date, i.offre.offered_time)
  if (cle <= maintenant) return { etat: 'passee', interne: i }

  // Le rendez-vous a pu être déplacé par le cabinet depuis l'envoi : la règle
  // « strictement plus tôt que le sien » se revérifie sur son état ACTUEL.
  if (quand(i.rdv.date, i.rdv.time) <= cle) return { etat: 'plus_utile', interne: i }
  if (i.rdv.invoice_no || i.rdv.amount_paid != null) return { etat: 'reglee', interne: i }

  const dureeBase = Number(m.appointment_duration) > 0 ? Number(m.appointment_duration) : DUREE_REPLI
  const libre = await creneauReservable(createAdminClient(), {
    doctorId: m.id,
    date: i.offre.offered_date,
    time: i.offre.offered_time,
    // SA durée à lui : c'est ce rendez-vous-là qui sera créé.
    duree: i.rdv.duration_minutes || dureeBase,
    workingHours: m.working_hours,
    dureeBase,
  })
  if (!libre.ok) {
    if (libre.raison === 'occupe') return { etat: 'prise', interne: i }
    if (libre.raison === 'illisible') return { etat: 'erreur', interne: i }
    return { etat: 'indisponible', interne: i }
  }
  return { etat: 'disponible', interne: i }
}

/** Pour la page /creneau/[token] : état + phrase + ce qu'on peut afficher. */
export async function evaluerOffre(token: string): Promise<VueOffre> {
  try {
    const { etat, interne } = await evaluerInterne(token)
    const affichage = interne ? affichageDe(interne) : null
    return { etat, message: messagePour(etat, affichage), affichage }
  } catch (e) {
    console.error('[liste-attente] évaluation de l\'offre :', e)
    return { etat: 'erreur', message: messagePour('erreur', null), affichage: null }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Réserver la place (clic sur « Avancer mon rendez-vous »)
// ════════════════════════════════════════════════════════════════════════════

export type ResultatReservation =
  | { ok: true; nouveau: string; ancien: string; ancienAnnule: boolean }
  | { ok: false; etat: EtatOffre; message: string }

/**
 * Crée le nouveau rendez-vous, puis annule l'ancien.
 *
 * 1. RÉSERVER L'INSCRIPTION : active → used, conditionnellement. C'est ce qui
 *    arbitre entre deux requêtes du MÊME patient (deux onglets, deux offres
 *    cliquées à la fois) : une seule passe, l'autre lit « déjà utilisée ». Sans
 *    ce verrou, les deux créeraient chacune un rendez-vous.
 * 2. CRÉER le nouveau rendez-vous. C'est ici que la contrainte d'exclusion
 *    arbitre entre patients différents : le perdant reçoit 23P01 (ou 23505,
 *    même heure de départ). En cas d'échec, on rend l'inscription à `active`
 *    — le patient garde son rendez-vous ET sa place dans la file.
 * 3. SEULEMENT si (2) a renvoyé une ligne : annuler l'ancien. Le trigger v56
 *    ne touche pas l'inscription, déjà `used` (d'où l'ordre 1 → 3).
 * 4. Prévenir le patient et le médecin, puis proposer l'ancienne place aux
 *    autres inscrits : une annulation qui libère une place, c'en est une.
 */
export async function reserverOffre(token: string): Promise<ResultatReservation> {
  let actuelLisible: string | null = null
  try {
    const { etat, interne } = await evaluerInterne(token)
    const affichage = interne ? affichageDe(interne) : null
    actuelLisible = affichage?.actuel ?? null
    if (etat !== 'disponible' || !interne || !interne.rdv || !interne.medecin) {
      return { ok: false, etat, message: messagePour(etat, affichage) }
    }
    const { offre, entree, rdv, medecin } = interne
    const admin = createAdminClient()
    const horodatage = new Date().toISOString()

    // ── 1) Réserver l'inscription ────────────────────────────────────────────
    const { data: prise, error: errPrise } = await admin
      .from('waitlist_entries')
      .update({ status: 'used', updated_at: horodatage })
      .eq('id', entree.id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()
    if (errPrise) {
      console.error('[liste-attente] verrou de l\'inscription :', errPrise.message)
      return { ok: false, etat: 'erreur', message: messagePour('erreur', affichage) }
    }
    if (!prise) {
      // Une autre requête l'a consommée entre la lecture et ici, ou le
      // rendez-vous vient d'être annulé : on relit pour dire laquelle.
      const relu = await evaluerInterne(token)
      const e = relu.etat === 'disponible' ? 'deja_utilisee' : relu.etat
      return { ok: false, etat: e, message: messagePour(e, affichage) }
    }

    // ── 2) Créer le nouveau rendez-vous ──────────────────────────────────────
    // On recopie ce qui caractérise la consultation (motif, spécialité, durée,
    // devis, série récurrente, consentement déjà donné) : c'est la même
    // consultation, plus tôt. Jamais le paiement : un acte réglé n'est pas
    // éligible (contrôlé plus haut).
    const dureeSienne = rdv.duration_minutes
      || (Number(medecin.appointment_duration) > 0 ? Number(medecin.appointment_duration) : DUREE_REPLI)
    const { data: nouveau, error: errNouveau } = await admin
      .from('appointments')
      .insert({
        doctor_id: rdv.doctor_id,
        patient_id: rdv.patient_id,
        date: offre.offered_date,
        time: offre.offered_time,
        status: 'confirmed',
        notes: rdv.notes,
        cancel_token: generateCancelToken(),
        consultation_type_id: rdv.consultation_type_id,
        specialty: rdv.specialty,
        duration_minutes: dureeSienne,
        quote_id: rdv.quote_id,
        recurrence_group_id: rdv.recurrence_group_id,
        amount_due: rdv.amount_due,
        consent_at: rdv.consent_at,
        walk_in: false,
      })
      .select('id, date, time, cancel_token')
      .single()

    if (errNouveau || !nouveau) {
      // Rendre l'inscription : le patient n'a rien obtenu, il ne doit rien
      // perdre — ni son rendez-vous (jamais touché), ni sa place dans la file.
      const { data: rendue, error: errRendue } = await admin
        .from('waitlist_entries')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', entree.id)
        .eq('status', 'used')
        .select('id')
        .maybeSingle()
      if (errRendue || !rendue) {
        console.error('[liste-attente] inscription non rendue après échec, entrée', entree.id,
          errRendue?.message ?? '(aucune ligne)')
      }
      // 23P01 = contrainte d'exclusion (chevauchement) ; 23505 = même heure de
      // départ (unique_active_slot). Dans les deux cas : quelqu'un a été plus
      // rapide. C'est le fonctionnement normal, pas une panne.
      if (errNouveau?.code === '23P01' || errNouveau?.code === '23505') {
        return { ok: false, etat: 'prise', message: messagePour('prise', affichage) }
      }
      console.error('[liste-attente] création du nouveau rendez-vous :', errNouveau?.message)
      return { ok: false, etat: 'erreur', message: messagePour('erreur', affichage) }
    }

    // Trace : quelle offre a produit quel rendez-vous. Non bloquant — le
    // rendez-vous existe, c'est l'essentiel — mais jamais tu.
    const { data: trace, error: errTrace } = await admin
      .from('waitlist_offers')
      .update({ booked_appointment_id: nouveau.id })
      .eq('id', offre.id)
      .select('id')
      .maybeSingle()
    if (errTrace || !trace) {
      console.error('[liste-attente] trace de l\'offre non écrite', offre.id, errTrace?.message ?? '(aucune ligne)')
    }

    // ── 3) SEULEMENT MAINTENANT : annuler l'ancien ───────────────────────────
    const { data: annule, error: errAnnule } = await admin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', rdv.id)
      .neq('status', 'cancelled')
      .select('id')
      .maybeSingle()
    if (errAnnule) {
      // Le patient a DEUX rendez-vous. Pas zéro. On le lui dit, au médecin aussi.
      console.error('[liste-attente] ancien rendez-vous NON annulé', rdv.id, ':', errAnnule.message)
    }
    // Aucune ligne sans erreur : le cabinet l'a annulé entre-temps. Il est donc
    // bien annulé — mais la place a déjà été proposée par celui qui l'a fait.
    const ancienAnnule = !errAnnule
    const libereParNous = !errAnnule && !!annule

    // ── 4) Prévenir, puis relancer la chaîne ─────────────────────────────────
    const nomPatient = `${rdv.patient?.first_name ?? ''} ${rdv.patient?.last_name ?? ''}`.trim()
    const nomMedecin = displayName(medecin.name ?? '', medecin.specialty)
    const taches: Promise<unknown>[] = []

    if (rdv.patient?.email) {
      taches.push(avecDelai(sendWaitlistBookedEmailToPatient({
        patientEmail: rdv.patient.email,
        patientName: nomPatient,
        doctorName: nomMedecin,
        specialty: medecin.specialty ?? '',
        oldDate: rdv.date,
        oldTime: hhmm(rdv.time),
        newDate: String(nouveau.date),
        newTime: hhmm(String(nouveau.time)),
        newCancelToken: nouveau.cancel_token,
        ancienAnnule,
        oldCancelToken: rdv.cancel_token,
      })).then((r) => { if (r !== 'ok') console.error('[liste-attente] confirmation patient :', r) }))
    }
    if (medecin.email) {
      taches.push(avecDelai(sendWaitlistBookedEmailToDoctor({
        doctorEmail: medecin.email,
        doctorName: nomMedecin,
        patientName: nomPatient,
        patientPhone: rdv.patient?.phone ?? '',
        oldDate: rdv.date,
        oldTime: hhmm(rdv.time),
        newDate: String(nouveau.date),
        newTime: hhmm(String(nouveau.time)),
        ancienAnnule,
      })).then((r) => { if (r !== 'ok') console.error('[liste-attente] confirmation médecin :', r) }))
    }
    // L'ancien créneau (vendredi) est libre : on le propose à ceux qui
    // attendent après vendredi. Chaque réservation déclenche au plus UNE
    // relance, pour UN créneau : la chaîne avance d'un maillon par clic
    // humain, elle ne peut pas s'emballer dans une même requête.
    if (libereParNous) {
      taches.push(proposerCreneauLibere(creneauDuRdv('liste_attente', rdv)))
    }
    // AWAIT obligatoire en serverless : une promesse non attendue est tuée
    // avec la fonction.
    await Promise.allSettled(taches)

    return {
      ok: true,
      nouveau: lisible(String(nouveau.date), String(nouveau.time)),
      ancien: lisible(rdv.date, rdv.time),
      ancienAnnule,
    }
  } catch (e) {
    console.error('[liste-attente] réservation impossible :', e)
    return { ok: false, etat: 'erreur', message: messagePour('erreur', actuelLisible ? {
      medecin: '', specialite: '', slug: null, creneau: '', actuel: actuelLisible,
    } : null) }
  }
}

/**
 * « Ne plus me proposer de créneaux », depuis le lien de l'e-mail. Un patient
 * sans compte n'a pas d'autre moyen d'arrêter les offres : sans ce bouton, la
 * seule issue serait de marquer nos e-mails comme indésirables — et c'est
 * toute la délivrabilité de MonRDV qui en pâtirait.
 */
export async function desinscrireParOffre(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const lu = await lireOffre(token)
    if (!lu.interne) {
      return { ok: false, message: messagePour(lu.etat === 'erreur' ? 'erreur' : 'inconnue', null) }
    }
    if (lu.interne.entree.status !== 'active') {
      return { ok: true, message: 'Vous ne recevrez plus de propositions pour ce rendez-vous.' }
    }
    const { error } = await createAdminClient()
      .from('waitlist_entries')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', lu.interne.entree.id)
      .eq('status', 'active')
    if (error) {
      console.error('[liste-attente] désinscription par lien :', error.message)
      return { ok: false, message: 'La désinscription n\'a pas pu être enregistrée. Réessayez.' }
    }
    return { ok: true, message: 'C\'est noté : vous ne recevrez plus de propositions. Votre rendez-vous est maintenu.' }
  } catch (e) {
    console.error('[liste-attente] désinscription par lien :', e)
    return { ok: false, message: 'La désinscription n\'a pas pu être enregistrée. Réessayez.' }
  }
}
