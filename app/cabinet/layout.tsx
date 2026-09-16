// Espace secrétaire — accessible uniquement aux membres actifs de cabinet_staff.
import { redirect } from 'next/navigation'
import { getStaffContext, BaseInjoignable } from '@/lib/cabinet'
import CabinetShell from '@/components/cabinet/CabinetShell'
import ServiceIndisponible from '@/components/ServiceIndisponible'

export const dynamic = 'force-dynamic'

export default async function CabinetLayout({ children }: { children: React.ReactNode }) {
  let ctx
  try {
    ctx = await getStaffContext()
  } catch (e) {
    // La base n'a pas répondu : renvoyer vers /login ferait rebondir une
    // secrétaire autorisée entre la connexion et cet espace, sans fin.
    if (e instanceof BaseInjoignable) {
      console.error('[espace cabinet] contrôle d\'accès impossible :', e.detail)
      return <ServiceIndisponible detail={e.detail} />
    }
    throw e
  }
  if (!ctx) redirect('/login')

  return (
    <CabinetShell staffName={ctx.staff.name} doctorName={ctx.doctor.name} permissions={ctx.permissions}>
      {children}
    </CabinetShell>
  )
}
