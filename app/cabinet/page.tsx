// Agenda de la secrétaire — interactif : création de RDV, présences,
// encaissements et annulations selon les permissions accordées par le médecin.
import { getStaffContext } from '@/lib/cabinet'
import AgendaClient from '@/components/cabinet/AgendaClient'

export const dynamic = 'force-dynamic'

export default async function CabinetAgendaPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.agenda) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès à l’agenda. Demandez au médecin d’activer cette permission.</p>
  }

  return <AgendaClient permissions={ctx.permissions} doctorName={ctx.doctor.name} />
}
