'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getNowInMaroc, formatDateFr, MAROC_TZ } from '@/lib/utils'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { fr } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import {
  BarChart3, Wallet, CalendarCheck, UserCheck, UserX, Timer, TrendingUp, Download,
} from 'lucide-react'
import type { Appointment } from '@/types'

interface Stats {
  revenueToday: number
  revenueMonth: number
  revenueTotal: number
  countToday: number
  countMonth: number
  countTotal: number
  present: number
  absent: number
  late: number
  revenueByMonth: { label: string; total: number }[]
}

// Une ligne de paiement pour l'export comptable
interface PaymentRow {
  date: string      // date de paiement (YYYY-MM-DD)
  patient: string
  motif: string
  amount: number
}

export default function StatistiquesPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: doctor } = await supabase
        .from('doctors').select('id').eq('email', user.email).single()
      if (!doctor) return

      // Tous les RDV non annulés (avec montant + date + patient + motif pour l'export)
      const { data: apts } = await supabase
        .from('appointments')
        .select('date, time, status, attendance, amount_paid, paid_at, duration_minutes, notes, patient:patients(first_name, last_name), consultation_type:consultation_types(name)')
        .eq('doctor_id', doctor.id)
        .neq('status', 'cancelled')

      const list = (apts ?? []) as unknown as Appointment[]
      const now = getNowInMaroc()
      const todayStr = format(now, 'yyyy-MM-dd')
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

      // Date de référence pour le CA = paid_at si présent, sinon date du RDV.
      // paid_at est stocké en UTC → conversion en date marocaine (GMT+1),
      // sinon un encaissement à 00h30 serait compté sur la veille.
      const payDate = (a: Appointment) =>
        a.paid_at ? formatInTimeZone(parseISO(a.paid_at), MAROC_TZ, 'yyyy-MM-dd') : a.date

      let revenueToday = 0, revenueMonth = 0, revenueTotal = 0
      let countToday = 0, countMonth = 0
      let present = 0, absent = 0, late = 0
      const byMonth = new Map<string, number>()
      const paymentRows: PaymentRow[] = []

      for (const a of list) {
        const amt = a.amount_paid ?? 0
        // amount_paid != null inclut les actes gratuits (0 DH) dans l'export
        // comptable — un acte tracé reste visible même sans encaissement.
        if (a.amount_paid != null) {
          const d = payDate(a)
          revenueTotal += amt
          if (d === todayStr) revenueToday += amt
          if (d >= monthStart && d <= monthEnd) revenueMonth += amt
          const mk = d.slice(0, 7) // YYYY-MM
          byMonth.set(mk, (byMonth.get(mk) ?? 0) + amt)
          paymentRows.push({
            date: d,
            patient: a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : '',
            motif: a.consultation_type?.name || a.notes || '',
            amount: amt,
          })
        }
        if (a.date === todayStr) countToday++
        if (a.date >= monthStart && a.date <= monthEnd) countMonth++
        if (a.attendance === 'present') present++
        else if (a.attendance === 'absent') absent++
        else if (a.attendance === 'late') late++
      }

      // Trié du plus récent au plus ancien pour l'export
      paymentRows.sort((x, y) => y.date.localeCompare(x.date))
      setPayments(paymentRows)

      // 6 derniers mois de CA (du plus ancien au plus récent)
      const revenueByMonth = Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([mk, total]) => {
          const [y, m] = mk.split('-')
          const label = format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy', { locale: fr })
          return { label, total }
        })

      setStats({
        revenueToday, revenueMonth, revenueTotal,
        countToday, countMonth, countTotal: list.length,
        present, absent, late,
        revenueByMonth,
      })
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Export comptable : télécharge tous les paiements en CSV (ouvrable dans Excel)
  function exportCSV() {
    const esc = (v: string | number) => {
      let s = String(v)
      // Anti-injection de formule Excel : neutralise les cellules commençant
      // par = + - @ (interprétées comme formules à l'ouverture)
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Date', 'Patient', 'Motif', 'Montant (DH)']
    const lines = payments.map((p) => [p.date, p.patient, p.motif, p.amount].map(esc).join(';'))
    const total = payments.reduce((sum, p) => sum + p.amount, 0)
    lines.push(['', '', 'TOTAL', total].map(esc).join(';'))
    // BOM UTF-8 pour qu'Excel affiche correctement les accents
    const csv = '﻿' + [header.join(';'), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `paiements-monrdv-${format(getNowInMaroc(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Statistiques</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const totalAttendance = stats.present + stats.absent + stats.late
  const presenceRate = totalAttendance > 0 ? Math.round((stats.present / totalAttendance) * 100) : 0
  const maxMonth = Math.max(1, ...stats.revenueByMonth.map((m) => m.total))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques du cabinet</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">{formatDateFr(getNowInMaroc())}</p>
        </div>
        <Button
          variant="outline"
          onClick={exportCSV}
          disabled={payments.length === 0}
          className="shrink-0"
          title={payments.length === 0 ? 'Aucun paiement à exporter' : 'Exporter les paiements en CSV'}
        >
          <Download className="h-4 w-4 mr-2" />
          Export comptable ({payments.length})
        </Button>
      </div>

      {/* Revenus */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <Wallet className="h-4 w-4" /> Aujourd&apos;hui
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.revenueToday} <span className="text-base font-medium text-gray-400">DH</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <Wallet className="h-4 w-4" /> Ce mois-ci
            </div>
            <p className="text-3xl font-bold text-primary-600 mt-2">{stats.revenueMonth} <span className="text-base font-medium text-gray-400">DH</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <TrendingUp className="h-4 w-4" /> Total encaissé
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.revenueTotal} <span className="text-base font-medium text-gray-400">DH</span></p>
          </CardContent>
        </Card>
      </div>

      {/* CA par mois */}
      {stats.revenueByMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary-500" /> Chiffre d&apos;affaires des derniers mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.revenueByMonth.map((m) => (
                <div key={m.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 shrink-0 capitalize">{m.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-primary-500 h-full rounded-full flex items-center justify-end px-2 transition-all"
                      style={{ width: `${Math.max(8, (m.total / maxMonth) * 100)}%` }}
                    >
                      <span className="text-[11px] font-semibold text-white whitespace-nowrap">{m.total} DH</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* RDV */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <CalendarCheck className="h-4 w-4" /> RDV aujourd&apos;hui
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.countToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <CalendarCheck className="h-4 w-4" /> RDV ce mois-ci
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.countMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
              <CalendarCheck className="h-4 w-4" /> RDV au total
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stats.countTotal}</p>
          </CardContent>
        </Card>
      </div>

      {/* Assiduité */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary-500" /> Assiduité des patients
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-gray-600">Taux de présence</span>
              <span className="font-bold text-green-600">{presenceRate}%</span>
            </div>
            <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="bg-green-500 h-full rounded-full" style={{ width: `${presenceRate}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <UserCheck className="h-4 w-4 text-green-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-green-700">{stats.present}</p>
              <p className="text-xs text-green-600">Présences</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <Timer className="h-4 w-4 text-orange-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-orange-700">{stats.late}</p>
              <p className="text-xs text-orange-600">Retards</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <UserX className="h-4 w-4 text-red-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-red-700">{stats.absent}</p>
              <p className="text-xs text-red-600">Absences</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
