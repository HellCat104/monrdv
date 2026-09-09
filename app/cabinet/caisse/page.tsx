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

// L'argent du cabinet entre par DEUX portes depuis la v54 : l'encaissement
// d'un rendez-vous (appointments.amount_paid) et le versement sur un devis
// (quote_payments). La caisse doit les additionner, et jamais compter deux fois
// la même somme — ce que garantit le verrou posé en base : un rendez-vous
// rattaché à un devis ne peut pas porter son propre amount_paid.
// On ramène donc les deux origines à cette forme commune, une fois pour toutes.
interface Encaissement {
  id: string
  /** Date comptable, en heure marocaine (yyyy-MM-dd) */
  date: string
  /** Heure affichée dans le journal du jour */
  heure: string
  patient: string
  method: string | null
  amount: number
  /** Vrai pour un versement de devis : la ligne le signale au lecteur. */
  devis: boolean
}

const nomPatient = (p: { first_name?: string; last_name?: string } | null | undefined): string =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Patient' : 'Patient'

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
  const [aptRes, devisRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, date, time, paid_at, amount_paid, payment_method, patient:patients(first_name, last_name)')
      .eq('doctor_id', ctx.doctor.id)
      .not('amount_paid', 'is', null)
      .gte('date', yearStart),
    // Versements de devis : la date comptable est paid_at, pas une date de RDV
    // — un devis n'a pas de créneau dans l'agenda.
    admin
      .from('quote_payments')
      .select('id, amount, payment_method, paid_at, patient:patients(first_name, last_name)')
      .eq('doctor_id', ctx.doctor.id)
      .gte('paid_at', `${yearStart}T00:00:00`),
  ])

  const encaissements: Encaissement[] = [
    ...((aptRes.data ?? []) as Apt[]).map((a) => ({
      id: `apt-${a.id}`,
      date: payDate(a),
      heure: a.time ? formatTime(a.time) : '—',
      patient: nomPatient(a.patient),
      method: a.payment_method ?? null,
      amount: Number(a.amount_paid ?? 0),
      devis: false,
    })),
    ...((devisRes.data ?? []) as Apt[]).map((p) => ({
      id: `dev-${p.id}`,
      date: formatInTimeZone(new Date(p.paid_at), MAROC_TZ, 'yyyy-MM-dd'),
      heure: formatInTimeZone(new Date(p.paid_at), MAROC_TZ, 'HH:mm'),
      patient: nomPatient(p.patient),
      method: p.payment_method ?? null,
      amount: Number(p.amount ?? 0),
      devis: true,
    })),
  ]

  const todayRows = encaissements.filter((e) => e.date === today).sort((a, b) => a.heure.localeCompare(b.heure))
  const todayTotal = todayRows.reduce((s, e) => s + e.amount, 0)
  const byMethod = new Map<string, number>()
  for (const e of todayRows) {
    const m = e.method ?? 'autre'
    byMethod.set(m, (byMethod.get(m) ?? 0) + e.amount)
  }

  const monthTotal = encaissements.filter((e) => e.date >= monthStart).reduce((s, e) => s + e.amount, 0)
  const yearTotal = encaissements.filter((e) => e.date >= yearStart).reduce((s, e) => s + e.amount, 0)

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
              {todayRows.map((e) => (
                <div key={e.id} className="flex items-center gap-3 p-3">
                  <span className="text-sm font-semibold text-gray-900 w-14 shrink-0">{e.heure}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">
                    {e.patient}
                    {/* Le lecteur doit pouvoir rapprocher la ligne du document
                        d'origine : un versement de devis n'a pas de RDV en face. */}
                    {e.devis && <span className="ml-1.5 text-[10px] font-medium text-primary-600 bg-primary-50 rounded px-1.5 py-0.5">devis</span>}
                  </span>
                  <span className="text-xs text-gray-400">{e.method ? (PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS] ?? e.method) : ''}</span>
                  <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{e.amount} DH</span>
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
