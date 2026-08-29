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
  }

  const doctorPublic = { id: doctor.id, name: doctor.name, specialty: doctor.specialty, city: doctor.city }
  return { email: user.email, staff: staff as CabinetStaff, doctor: doctorPublic, permissions, confidential }
}
