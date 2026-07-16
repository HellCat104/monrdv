// Types principaux de l'application MonRDV

export interface Doctor {
  id: string
  name: string
  email: string
  phone: string
  specialty: string          // spécialité principale (titre)
  specialties?: string[] | null  // toutes les spécialités (inclut la principale)
  slug: string
  city?: string
  address?: string
  photo_url?: string
  bio?: string | null
  status?: string
  subscription_status?: string
  cnom_number?: string
  // Identifiants légaux (facture marocaine)
  ice?: string | null
  inpe?: string | null
  // Coordonnées de contact publiques (affichées aux patients)
  whatsapp?: string | null
  public_email?: string | null
  has_secretary?: boolean
  prescription_favorites?: string[] | null
  // Constantes vitales suivies (null = défaut selon spécialité, [] = aucune)
  enabled_vitals?: string[] | null
  // Constantes personnalisées créées par le médecin (ex. HbA1c, INR, créatinine…)
  custom_vitals?: VitalDef[] | null
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
  birth_date?: string | null // date de naissance (YYYY-MM-DD) — âge précis + courbes
  sex?: 'M' | 'F' | null    // sexe (couloirs OMS des courbes de croissance)
  parent1_name?: string | null // parent / tuteur 1 (pédiatrie, facultatif)
  parent2_name?: string | null // parent / tuteur 2 (pédiatrie, facultatif)
  blood_group?: string | null // A+, A-, B+, … O-
  cin?: string | null       // carte d'identité nationale (Maroc)
  address?: string | null   // adresse postale (courriers, factures)
  mutuelle?: string | null  // CNSS / CNOPS / assurance privée…
  // Dossier médical enrichi (antécédents structurés)
  allergies?: string | null
  chronic_conditions?: string | null      // maladies chroniques
  surgeries?: string | null               // antécédents chirurgicaux
  current_treatments?: string | null      // traitements de fond
  vaccinations?: string | null            // vaccins / statut vaccinal (texte libre)
  vaccines?: Record<string, string> | null // calendrier vaccinal structuré (pédiatrie)
  milestones?: Record<string, { s: 'ok' | 'ko'; d: string }> | null // repères de développement (pédiatrie)
  notes?: string | null
  created_at: string
}

// Motif de consultation configurable par le médecin (durée propre)
export interface ConsultationType {
  id: string
  doctor_id: string
  name: string
  duration_minutes: number
  default_price?: number | null // tarif pré-rempli à l'encaissement
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
  signed_at?: string | null  // signée = verrouillée (non modifiable/supprimable)
  created_at: string
}

// Ordonnance imprimable
export interface Prescription {
  id: string
  doctor_id: string
  patient_id: string
  appointment_id?: string | null
  content: string
  created_at: string
}

// Certificat médical émis (contenu figé à l'émission — archive)
export interface Certificate {
  id: string
  doctor_id: string
  patient_id: string
  type: string
  title: string
  motif?: string | null
  content: string
  created_at: string
}

// Dépense / charge du cabinet
export interface Expense {
  id: string
  doctor_id: string
  date: string        // YYYY-MM-DD
  label: string
  category?: string | null
  amount: number
  created_at: string
}

// Facture d'avoir (annule/corrige une facture émise — conformité fiscale MA)
export interface CreditNote {
  id: string
  doctor_id: string
  appointment_id?: string | null
  credit_no?: string | null         // AV-AAAA-NNNN (attribué par trigger)
  original_invoice_no: string       // facture annulée
  patient_name?: string | null
  amount: number
  reason?: string | null
  created_at: string
}

// Rappel de suivi ("revenez dans X mois")
export type RecallStatus = 'pending' | 'sent' | 'done' | 'cancelled'
export interface Recall {
  id: string
  doctor_id: string
  patient_id: string
  due_date: string        // YYYY-MM-DD
  reason: string | null
  status: RecallStatus
  sent_at: string | null
  created_at: string
}

// Mesure de constantes vitales (valeurs flexibles en JSON)
export interface VitalSign {
  id: string
  doctor_id: string
  patient_id: string
  measured_at: string
  values: Record<string, number>
  created_at: string
}

// Catalogue des constantes disponibles
export interface VitalDef {
  key: string
  label: string
  unit: string
  step?: number
}

export const VITAL_DEFS: VitalDef[] = [
  { key: 'weight',             label: 'Poids',                unit: 'kg',   step: 0.1 },
  { key: 'height',             label: 'Taille',               unit: 'cm',   step: 0.5 },
  { key: 'temperature',        label: 'Température',          unit: '°C',   step: 0.1 },
  { key: 'systolic',           label: 'Tension systolique',  unit: 'mmHg', step: 1 },
  { key: 'diastolic',          label: 'Tension diastolique', unit: 'mmHg', step: 1 },
  { key: 'heart_rate',         label: 'Fréquence cardiaque', unit: 'bpm',  step: 1 },
  { key: 'respiratory_rate',   label: 'Fréquence respiratoire', unit: '/min', step: 1 },
  { key: 'spo2',               label: 'SpO₂',                 unit: '%',    step: 1 },
  { key: 'blood_glucose',      label: 'Glycémie',             unit: 'g/L',  step: 0.01 },
  { key: 'head_circumference', label: 'Périmètre crânien',   unit: 'cm',   step: 0.5 },
  { key: 'pain',               label: 'Douleur',              unit: '/10',  step: 1 },
]

// Constantes proposées par défaut selon la spécialité.
// Spécialité absente de la table → aucune constante par défaut (ex: dentiste,
// dermatologue, psychiatre…). Le médecin peut toujours les activer dans Réglages.
export const DEFAULT_VITALS_BY_SPECIALTY: Record<string, string[]> = {
  'Médecin généraliste':          ['weight', 'height', 'systolic', 'diastolic', 'heart_rate', 'temperature', 'spo2'],
  'Cardiologue':                  ['weight', 'height', 'systolic', 'diastolic', 'heart_rate', 'spo2'],
  'Pédiatre':                     ['weight', 'height', 'head_circumference', 'temperature'],
  'Pneumologue':                  ['spo2', 'respiratory_rate', 'heart_rate'],
  'Endocrinologue':               ['weight', 'height', 'blood_glucose', 'systolic', 'diastolic'],
  'Nutritionniste / Diététicien': ['weight', 'height'],
  'Médecin du sport':             ['weight', 'height', 'heart_rate', 'systolic', 'diastolic'],
  'Gériatre':                     ['weight', 'height', 'systolic', 'diastolic', 'heart_rate', 'spo2'],
  'Néphrologue':                  ['weight', 'systolic', 'diastolic'],
  'Médecin urgentiste':           ['systolic', 'diastolic', 'heart_rate', 'spo2', 'temperature', 'respiratory_rate'],
}

// Résout les constantes à afficher pour un médecin (config ou défaut spécialité)
export function resolveEnabledVitals(enabled: string[] | null | undefined, specialty?: string): string[] {
  if (enabled != null) return enabled
  return (specialty && DEFAULT_VITALS_BY_SPECIALTY[specialty]) || []
}

// Catalogue complet des constantes disponibles pour un médecin :
// les constantes standard + celles qu'il a créées lui-même.
export function allVitalDefs(custom?: VitalDef[] | null): VitalDef[] {
  return [...VITAL_DEFS, ...(custom ?? [])]
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
  specialty?: string | null     // spécialité choisie (médecin multi-spécialités)
  // Paiement
  amount_paid?: number | null   // total déjà encaissé
  amount_due?: number | null    // montant total attendu
  payment_method?: PaymentMethod | null
  invoice_no?: string | null    // n° de facture séquentiel (F-AAAA-NNNN)
  paid_at?: string | null
  consent_at?: string | null
  walk_in?: boolean | null      // patient sans RDV ajouté à la file du jour
  queue_status?: string | null  // salle d'attente : arrive | en_consultation | parti
  // Résumé de consultation (chargés pour l'agenda sur les RDV clôturés)
  consultation_summary?: string | null                              // note de consultation
  consultation_prescriptions?: { id: string; content: string }[]    // ordonnances du RDV
  consultation_certificates?: { id: string; title: string; motif: string | null }[] // certificats du RDV
  created_at: string
  // Relations jointes
  patient?: Patient
  consultation_type?: ConsultationType | null
}

export type PaymentMethod = 'especes' | 'carte' | 'cheque' | 'virement'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  especes:  'Espèces',
  carte:    'Carte',
  cheque:   'Chèque',
  virement: 'Virement',
}

// Document rattaché à un patient (analyses, radios, etc.)
export interface PatientDocument {
  id: string
  doctor_id: string
  patient_id: string
  file_path: string
  file_name: string
  file_type?: string | null
  file_size?: number | null   // octets (quota de stockage par médecin)
  created_at: string
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
  'Témara',
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

// ── Comptes secrétaire (personnel du cabinet) ───────────────────────────────
export interface StaffPermissions {
  // Agenda & accueil
  agenda: boolean               // voir l'agenda
  manage_appointments: boolean  // créer / modifier / annuler des RDV
  mark_attendance: boolean      // salle d'attente : arrivé / en consultation / parti
  patients_contact: boolean     // fiches patients (coordonnées, CIN, mutuelle) + création
  // Bloc médical
  patients_medical: boolean     // antécédents, allergies, traitements
  prescriptions_view: boolean   // afficher les ordonnances
  vitals_entry: boolean         // saisir les constantes (poids, tension…)
  // Bloc finances
  payments: boolean             // saisir les encaissements (espèces, chèque…)
  edit_prices: boolean          // modifier le prix d'un acte au moment de l'encaissement
  caisse_day: boolean           // voir le journal de caisse du jour
  view_revenue: boolean         // voir le chiffre d'affaires global (mois / année)
  factures: boolean             // accès aux factures
  // Bloc sécurité
  delete_patient: boolean       // supprimer un dossier patient
  export_patients: boolean      // exporter la base patients (Excel)
}

export interface CabinetStaff {
  id: string
  doctor_id: string
  email: string
  name: string
  permissions: StaffPermissions
  status: 'active' | 'disabled'
  created_at: string
}

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  agenda: true,
  manage_appointments: true,
  mark_attendance: true,
  patients_contact: true,
  patients_medical: false,
  prescriptions_view: false,
  vitals_entry: false,
  payments: false,
  edit_prices: false,
  caisse_day: false,
  view_revenue: false,
  factures: false,
  delete_patient: false,
  export_patients: false,
}

// Matrice de permissions groupée par bloc (page « Mon équipe »)
export const STAFF_PERMISSION_GROUPS: { title: string; items: { key: keyof StaffPermissions; label: string; hint: string }[] }[] = [
  {
    title: 'Agenda & accueil',
    items: [
      { key: 'agenda',              label: 'Voir l’agenda',                 hint: 'Consulter les rendez-vous du cabinet' },
      { key: 'manage_appointments', label: 'Gérer les rendez-vous',         hint: 'Ajouter, déplacer, annuler des RDV' },
      { key: 'mark_attendance',     label: 'Salle d’attente / présences',   hint: 'Arrivé, en consultation, parti' },
      { key: 'patients_contact',    label: 'Fiches patients (coordonnées)', hint: 'Créer des fiches : nom, téléphone, CIN, mutuelle' },
    ],
  },
  {
    title: 'Bloc médical',
    items: [
      { key: 'patients_medical',    label: 'Afficher les antécédents médicaux', hint: 'Allergies, maladies chroniques, traitements' },
      { key: 'prescriptions_view',  label: 'Afficher les ordonnances',          hint: 'Consultation des ordonnances émises' },
      { key: 'vitals_entry',        label: 'Saisir les constantes',             hint: 'Poids, tension, température…' },
    ],
  },
  {
    title: 'Bloc finances',
    items: [
      { key: 'payments',      label: 'Saisir les encaissements',    hint: 'Espèces, carte, chèque, virement' },
      { key: 'edit_prices',   label: 'Modifier le prix des actes',  hint: 'Ajuster le montant dû lors de l’encaissement' },
      { key: 'caisse_day',    label: 'Journal de caisse du jour',   hint: 'Total encaissé aujourd’hui, par mode de règlement' },
      { key: 'view_revenue',  label: 'Chiffre d’affaires global',   hint: 'Totaux du mois et de l’année' },
      { key: 'factures',      label: 'Factures',                    hint: 'Accès à la liste des factures' },
    ],
  },
  {
    title: 'Bloc sécurité',
    items: [
      { key: 'delete_patient',  label: 'Supprimer un dossier patient', hint: 'Suppression définitive — à réserver aux personnes de confiance' },
      { key: 'export_patients', label: 'Exporter la base patients',    hint: 'Téléchargement de la liste (Excel)' },
    ],
  },
]

// Liste à plat (compatibilité avec l'affichage compact des badges)
export const STAFF_PERMISSION_LABELS = STAFF_PERMISSION_GROUPS.flatMap((g) => g.items)

// Types de mutuelle courants au Maroc (fiche patient)
export const MUTUELLES_MAROC = ['CNSS (AMO)', 'CNOPS', 'FAR', 'Assurance privée', 'Aucune'] as const

// Groupes sanguins (fiche patient)
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

// Spécialités « pédiatriques » → active courbes de croissance + calendrier vaccinal
export function isPediatricDoctor(specialties: (string | null | undefined)[]): boolean {
  return specialties.some((s) => !!s && /p[ée]diatr/i.test(s))
}

// Spécialités « psy » (psychiatre, pédopsychiatre) → active la fiche de synthèse
// et le modèle de note structuré (Motif / Histoire / Évolution / Traitement / RDV)
export function isPsychiatricDoctor(specialties: (string | null | undefined)[]): boolean {
  return specialties.some((s) => !!s && /psychiatr|pédopsy|pedopsy/i.test(s))
}

// Modèle de note structuré (psychiatrie) — pré-remplit une note vierge
export const PSY_NOTE_TEMPLATE = `Motif :

Histoire :

Évolution :

Traitement :

Prochain RDV : `
