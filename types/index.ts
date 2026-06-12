// Types principaux de l'application MonRDV

export interface Doctor {
  id: string
  name: string
  email: string
  phone: string
  specialty: string
  slug: string
  city?: string
  address?: string
  photo_url?: string
  bio?: string | null
  status?: string
  subscription_status?: string
  cnom_number?: string
  working_hours: WorkingHours
  appointment_duration: number // en minutes : 15, 20 ou 30
  created_at: string
}

export interface BlockedDate {
  id: string
  doctor_id: string
  date: string   // YYYY-MM-DD
  reason: string | null
  created_at: string
}

export interface WorkingHours {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

export interface TimeBreak {
  start: string // format HH:mm
  end: string   // format HH:mm
}

export interface DaySchedule {
  enabled: boolean
  start: string // format HH:mm
  end: string   // format HH:mm
  breaks?: TimeBreak[] // pauses multiples (déjeuner, etc.)
  // Ancien format (compatibilité) — ne plus utiliser, lu via getDayBreaks()
  breakStart?: string
  breakEnd?: string
}

export interface Patient {
  id: string
  doctor_id: string
  first_name: string
  last_name: string
  phone: string
  email?: string | null
  age?: number | null
  // Dossier médical enrichi
  allergies?: string | null
  chronic_conditions?: string | null
  current_treatments?: string | null
  notes?: string | null
  created_at: string
}

// Motif de consultation configurable par le médecin (durée propre)
export interface ConsultationType {
  id: string
  doctor_id: string
  name: string
  duration_minutes: number
  active: boolean
  created_at: string
}

// Note de consultation (historique chronologique du dossier patient)
export interface ConsultationNote {
  id: string
  doctor_id: string
  patient_id: string
  appointment_id?: string | null
  note: string
  created_at: string
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled'
export type AppointmentAttendance = 'present' | 'absent' | 'late' | null

export interface Appointment {
  id: string
  doctor_id: string
  patient_id: string
  date: string         // format YYYY-MM-DD
  time: string         // format HH:mm
  status: AppointmentStatus
  notes: string | null
  doctor_notes: string | null
  attendance: AppointmentAttendance
  cancel_token: string | null
  // Motif + durée (variable selon le motif choisi)
  consultation_type_id?: string | null
  duration_minutes?: number | null
  // Paiement
  amount_paid?: number | null
  paid_at?: string | null
  created_at: string
  // Relations jointes
  patient?: Patient
  consultation_type?: ConsultationType | null
}

// Pour les créneaux disponibles
export interface TimeSlot {
  time: string    // format HH:mm
  available: boolean
}

// Pour la réservation publique
export interface BookingFormData {
  first_name: string
  last_name: string
  phone: string
  email?: string
  age?: number
  date: string
  time: string
  notes?: string
}

// Statistiques du tableau de bord
export interface DashboardStats {
  today_count: number
  month_count: number
  cancelled_count: number
  absence_rate: number
}

// Jours de congé
export interface VacationDay {
  date: string // format YYYY-MM-DD
  label: string
}

// Horaires par défaut (Maroc, lundi-vendredi 9h-18h)
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  monday:    { enabled: true,  start: '09:00', end: '18:00' },
  tuesday:   { enabled: true,  start: '09:00', end: '18:00' },
  wednesday: { enabled: true,  start: '09:00', end: '18:00' },
  thursday:  { enabled: true,  start: '09:00', end: '18:00' },
  friday:    { enabled: true,  start: '09:00', end: '13:00' },
  saturday:  { enabled: true,  start: '09:00', end: '13:00' },
  sunday:    { enabled: false, start: '09:00', end: '18:00' },
}

// Ordre fixe des jours (Lundi → Dimanche)
export const DAY_ORDER: (keyof WorkingHours)[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]

// Correspondance noms des jours français
export const DAY_NAMES_FR: Record<keyof WorkingHours, string> = {
  monday:    'Lundi',
  tuesday:   'Mardi',
  wednesday: 'Mercredi',
  thursday:  'Jeudi',
  friday:    'Vendredi',
  saturday:  'Samedi',
  sunday:    'Dimanche',
}

// Liste complète des spécialités médicales
export const SPECIALITES_LIST = [
  'Médecin généraliste',
  'Cardiologue',
  'Dermatologue',
  'Médecine esthétique',
  'Pédiatre',
  'Ophtalmologue',
  'Dentiste',
  'Neurologue',
  'Pneumologue',
  'Psychiatre',
  'Rhumatologue',
  'Urologue',
  'Gastro-entérologue',
  'Gynécologue',
  'Orthopédiste',
  'Endocrinologue',
  'ORL (Oto-rhino-laryngologiste)',
  'Chirurgien général',
  'Chirurgien orthopédique',
  'Chirurgien cardiaque',
  'Chirurgien plasticien',
  'Anesthésiste-réanimateur',
  'Radiologue',
  'Biologiste médical',
  'Néphrologue',
  'Hématologue',
  'Oncologue',
  'Infectiologue',
  'Allergologue',
  'Médecin du sport',
  'Médecin urgentiste',
  'Gériatre',
  'Nutritionniste / Diététicien',
  'Kinésithérapeute',
  'Psychologue',
  'Stomatologiste',
  'Autre',
] as const

export type Specialite = typeof SPECIALITES_LIST[number]

// Liste des villes du Maroc
export const VILLES_MAROC = [
  'Casablanca',
  'Rabat',
  'Marrakech',
  'Fès',
  'Tanger',
  'Agadir',
  'Meknès',
  'Oujda',
  'Kénitra',
  'Tétouan',
  'Salé',
  'Mohammedia',
  'El Jadida',
  'Béni Mellal',
  'Nador',
  'Settat',
  'Khouribga',
  'Safi',
  'Laâyoune',
  'Essaouira',
  'Ouarzazate',
  'Taza',
  'Khémisset',
  'Berrechid',
  'Larache',
  'Khénifra',
  'Dakhla',
  'Tiznit',
  'Taourirt',
  'Guelmim',
  'Errachidia',
  'Al Hoceïma',
  'Ifrane',
  'Azrou',
  'Taroudant',
] as const

// Statuts en français
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending:   'À confirmer',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
}

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export const ATTENDANCE_LABELS: Record<NonNullable<AppointmentAttendance>, string> = {
  present: 'Présent',
  absent:  'Absent',
  late:    'En retard',
}

export const ATTENDANCE_COLORS: Record<NonNullable<AppointmentAttendance>, string> = {
  present: 'bg-green-100 text-green-700',
  absent:  'bg-red-100 text-red-700',
  late:    'bg-orange-100 text-orange-700',
}
