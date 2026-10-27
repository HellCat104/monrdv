// Le stock — espace cabinet (permission `stock`).
import { getStaffContext } from '@/lib/cabinet'
import StockCabinetClient from '@/components/cabinet/StockCabinetClient'

export const dynamic = 'force-dynamic'

export default async function CabinetStockPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.stock) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès au stock. Demandez au médecin d’activer cette permission.</p>
  }
  return <StockCabinetClient />
}
