// Espace secrétaire — accessible uniquement aux membres actifs de cabinet_staff.
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/cabinet'
import CabinetShell from '@/components/cabinet/CabinetShell'

export const dynamic = 'force-dynamic'

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getStaffContext()
  if (!ctx) redirect('/login')

  return (
    <CabinetShell staffName={ctx.staff.name} doctorName={ctx.doctor.name} permissions={ctx.permissions}>
      {children}
    </CabinetShell>
  )
}
