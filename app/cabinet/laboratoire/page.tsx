// Suivi des travaux de laboratoire — espace cabinet (permission `lab_works`).
import { getStaffContext } from '@/lib/cabinet'
import LaboClient from '@/components/cabinet/LaboClient'

export const dynamic = 'force-dynamic'

export default async function CabinetLaboPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.lab_works) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès au suivi du laboratoire. Demandez au médecin d’activer cette permission.</p>
  }
  return <LaboClient />
}
