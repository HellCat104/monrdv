// Résout le contexte « secrétaire » de l'utilisateur connecté.
// Une secrétaire n'est pas dans `doctors` : ses données passent par le client
// admin (service_role) après vérification de son appartenance à cabinet_staff.
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { CabinetStaff, StaffPermissions } from '@/types'

export interface StaffContext {
  email: string
  staff: CabinetStaff
  doctor: { id: string; name: string; specialty: string | null; city: string | null }
  permissions: StaffPermissions
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
    .select('id, name, specialty, city')
    .eq('id', staff.doctor_id)
    .single()
  if (!doctor) return null

  return { email: user.email, staff: staff as CabinetStaff, doctor, permissions: (staff.permissions ?? {}) as StaffPermissions }
}
