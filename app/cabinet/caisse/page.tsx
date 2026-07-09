// Caisse — journal du jour (permission caisse_day) et chiffre d'affaires
// global mois/année (permission view_revenue).
import { getStaffContext } from '@/lib/cabinet'
import { createAdminClient } from '@/lib/supabase/server'
import { getNowInMaroc, formatTime, MAROC_TZ } from '@/lib/utils'
import { format, startOfMonth, startOfYear } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Banknote, TrendingUp } from 'lucide-react'
import { PAYMENT_METHOD_LABELS } from '@/types'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

// Date comptable d'un paiement : paid_at (heure marocaine), sinon date du RDV
const payDate = (a: Apt): string =>
  a.paid_at ? formatInTimeZone(new Date(a.paid_at), MAROC_TZ, 'yyyy-MM-dd') : a.date

export default async function CabinetCaissePage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  const { caisse_day, view_revenue } = ctx.permissions
  if (!caisse_day && !view_revenue) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès à la caisse. Demandez au médecin d’activer cette permission.</p>
  }

  const now = getNowInMaroc()
  const today = format(now, 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const yearStart = format(startOfYear(now), 'yyyy-MM-dd')

  const admin = createAdminClient()
  const { data } = await admin
    .from('appointments')
    .select('id, date, time, paid_at, amount_paid, payment_method, patient:patients(first_name, last_name)')
    .eq('doctor_id', ctx.doctor.id)
    .not('amount_paid', 'is', null)
    .gte('date', format(startOfYear(now), 'yyyy-MM-dd'))
  const paid = (data ?? []) as Apt[]

  const todayRows = paid.filter((a) => payDate(a) === today).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const todayTotal = todayRows.reduce((s, a) => s + (a.amount_paid ?? 0), 0)
  const byMethod = new Map<string, number>()
  for (const a of todayRows) {
    const m = a.payment_method ?? 'autre'
    byMethod.set(m, (byMethod.get(m) ?? 0) + (a.amount_paid ?? 0))
  }

  const monthTotal = paid.filter((a) => payDate(a) >= monthStart).reduce((s, a) => s + (a.amount_paid ?? 0), 0)
  const yearTotal = paid.filter((a) => payDate(a) >= yearStart).reduce((s, a) => s + (a.amount_paid ?? 0), 0)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Banknote className="h-5 w-5 text-primary-500" /> Caisse
      </h1>

      {caisse_day && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Journal du jour</h2>
            <span className="text-sm font-bold text-gray-900">{todayTotal.toLocaleString('fr-FR')} DH</span>
          </div>

          {byMethod.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from(byMethod.entries()).map(([m, total]) => (
                <span key={m} className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1">
                  {PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m} : <b>{total.toLocaleString('fr-FR')} DH</b>
                </span>
              ))}
            </div>
          )}

          {todayRows.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl p-8 text-center text-gray-400 text-sm">Aucun encaissement aujourd&apos;hui.</div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
              {todayRows.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3">
                  <span className="text-sm font-semibold text-gray-900 w-14 shrink-0">{a.time ? formatTime(a.time) : '—'}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}</span>
                  <span className="text-xs text-gray-400">{a.payment_method ? (PAYMENT_METHOD_LABELS[a.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.payment_method) : ''}</span>
                  <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{a.amount_paid} DH</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view_revenue && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary-500" /> Chiffre d&apos;affaires</h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-400">Ce mois-ci</p>
              <p className="text-lg font-bold text-gray-900">{monthTotal.toLocaleString('fr-FR')} DH</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-400">Cette année</p>
              <p className="text-lg font-bold text-gray-900">{yearTotal.toLocaleString('fr-FR')} DH</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
