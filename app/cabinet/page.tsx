// Agenda de la secrétaire — interactif : création de RDV, présences,
// encaissements et annulations selon les permissions accordées par le médecin.
import { getStaffContext } from '@/lib/cabinet'
import AgendaClient from '@/components/cabinet/AgendaClient'
import ConversationsAReprendre from '@/components/dashboard/ConversationsAReprendre'

export const dynamic = 'force-dynamic'

export default async function CabinetAgendaPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.agenda) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès à l’agenda. Demandez au médecin d’activer cette permission.</p>
  }

  // L'encart WhatsApp passe AVANT l'agenda : il ne s'affiche que lorsqu'une
  // personne attend une réponse, et dans ce cas c'est la première chose à
  // traiter en arrivant au poste. Il relève de la permission « agenda », comme
  // le reste de cet écran — c'est le poste d'accueil qui décroche.
  return (
    <div className="space-y-4">
      <ConversationsAReprendre />
      <AgendaClient permissions={ctx.permissions} doctorName={ctx.doctor.name} />
    </div>
  )
}
