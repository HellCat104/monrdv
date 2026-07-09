// Réglages du compte de la secrétaire : infos + changement de mot de passe.
import { getStaffContext } from '@/lib/cabinet'
import AccountClient from '@/components/cabinet/AccountClient'

export const dynamic = 'force-dynamic'

export default async function CabinetComptePage() {
  const ctx = await getStaffContext()
  if (!ctx) return null

  return <AccountClient email={ctx.email} name={ctx.staff.name} doctorName={ctx.doctor.name} />
}
