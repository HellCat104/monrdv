// Salle d'attente — file du jour : arrivé / en consultation / parti.
import { getStaffContext } from '@/lib/cabinet'
import WaitingRoomClient from '@/components/cabinet/WaitingRoomClient'

export const dynamic = 'force-dynamic'

export default async function CabinetAttentePage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.mark_attendance) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès à la salle d’attente. Demandez au médecin d’activer cette permission.</p>
  }

  return <WaitingRoomClient />
}
