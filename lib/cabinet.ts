// Résout le contexte « secrétaire » de l'utilisateur connecté.
// Une secrétaire n'est pas dans `doctors` : ses données passent par le client
// admin (service_role) après vérification de son appartenance à cabinet_staff.
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_STAFF_PERMISSIONS, type CabinetStaff, type StaffPermissions } from '@/types'
import { canAccess } from '@/lib/plan'

export interface StaffContext {
  email: string
  staff: CabinetStaff
  doctor: { id: string; name: string; specialty: string | null; city: string | null }
  permissions: StaffPermissions
  /** Mode confidentiel du médecin : masque tout le contenu clinique à la secrétaire. */
  confidential: boolean
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const admin = createAdminClient()
  const { data: staff } = await admin
    .from('cabinet_staff')
    .select('*')
    .eq('email', user.email.toLowerCase())
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!staff) return null

  const { data: doctor } = await admin
    .from('doctors')
    .select('id, name, specialty, city, confidential_mode, plan')
    .eq('id', staff.doctor_id)
    .single()
  if (!doctor) return null

  // Fusion avec les défauts : les permissions ajoutées après l'invitation
  // d'une secrétaire existante prennent leur valeur par défaut.
  const permissions = { ...DEFAULT_STAFF_PERMISSIONS, ...((staff.permissions ?? {}) as Partial<StaffPermissions>) }

  // Mode confidentiel : quelles que soient les permissions accordées, on coupe
  // l'accès au clinique (antécédents + ordonnances). Le motif et le type de
  // consultation sont retirés côté route agenda.
  // Forfait du praticien : une secrétaire n'hérite jamais de plus de droits que
  // le cabinet n'en possède. Neutraliser ici plutôt que route par route garantit
  // que TOUT chemin cabinet en hérite, y compris ceux écrits plus tard — c'est
  // déjà le principe retenu pour le mode confidentiel juste en dessous.
  if (!canAccess(doctor.plan, 'records')) {
    permissions.patients_medical = false
    permissions.vitals_entry = false
    // Les devis (v54) suivent la même règle : un plan de traitement chiffré est
    // une pièce du dossier de soins. Dans le forfait Agenda il n'existe pas du
    // tout — la secrétaire ne peut donc ni le lire ni encaisser dessus.
    permissions.quotes_view = false
    permissions.quotes_payment = false
  }
  if (!canAccess(doctor.plan, 'prescriptions')) permissions.prescriptions_view = false
  if (!canAccess(doctor.plan, 'invoicing')) permissions.factures = false

  const confidential = doctor.confidential_mode === true
  if (confidential) {
    // Mode confidentiel = la secrétaire ne voit RIEN de clinique. On coupe donc
    // aussi les constantes (poids/tension…), qui sont des données de santé au même
    // titre que les antécédents et les ordonnances — sinon elles fuyaient malgré
    // le mode confidentiel (détail patient + saisie).
    permissions.patients_medical = false
    permissions.prescriptions_view = false
    permissions.vitals_entry = false
    // Les devis tombent aussi, LECTURE ET ENCAISSEMENT. Un devis énumère les
    // actes et les dents : « extraction 36, couronne 16 » en dit davantage sur
    // le patient que le motif de rendez-vous, que ce mode masque déjà. On aurait
    // pu n'effacer que les libellés et laisser encaisser à l'aveugle, mais le
    // médecin qui active ce mode attend un rideau, pas un filtre : un demi-accès
    // lui ferait croire le clinique coupé alors qu'il resterait devinable
    // (montants, nombre d'actes, dates). Conséquence assumée : dans un cabinet
    // en mode confidentiel, les versements de devis se saisissent par le
    // médecin. C'est le prix du mode, et il est réversible d'un clic.
    permissions.quotes_view = false
    permissions.quotes_payment = false
  }

  const doctorPublic = { id: doctor.id, name: doctor.name, specialty: doctor.specialty, city: doctor.city }
  return { email: user.email, staff: staff as CabinetStaff, doctor: doctorPublic, permissions, confidential }
}
