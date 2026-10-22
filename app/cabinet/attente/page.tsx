// Salle d'attente — file du jour : arrivé / en consultation / parti.
import { getStaffContext } from '@/lib/cabinet'
import WaitingRoomClient from '@/components/cabinet/WaitingRoomClient'

export const dynamic = 'force-dynamic'

export default async function CabinetAttentePage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  // L'encaissement vit désormais ICI et nulle part ailleurs. Réserver l'écran
  // à la seule permission « présences » rendait donc la permission
  // « encaissements » inutilisable toute seule : le médecin la cochait, et
  // aucun bouton n'apparaissait nulle part.
  if (!ctx.permissions.mark_attendance && !ctx.permissions.payments) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès à la salle d’attente. Demandez au médecin d’activer cette permission.</p>
  }

  return <WaitingRoomClient />
}
