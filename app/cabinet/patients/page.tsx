// Fiches patients côté secrétaire — interactif (création CIN/mutuelle, détail
// selon permissions, export, suppression).
import { getStaffContext } from '@/lib/cabinet'
import PatientsClient from '@/components/cabinet/PatientsClient'

export const dynamic = 'force-dynamic'

export default async function CabinetPatientsPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.patients_contact) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès aux fiches patients.</p>
  }

  return <PatientsClient permissions={ctx.permissions} />
}
