'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getNowInMaroc, MAROC_TZ } from '@/lib/utils'
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Search, Download, Printer, Receipt, Undo2, ListChecks } from 'lucide-react'
import { PAYMENT_METHOD_LABELS } from '@/types'

type Period = 'month' | 'lastmonth' | 'quarter' | 'year' | 'all'
const PERIOD_LABELS: Record<Period, string> = {
  month: 'Ce mois-ci', lastmonth: 'Mois dernier', quarter: 'Ce trimestre', year: 'Cette année', all: 'Tout',
}
function periodRange(p: Period, now: Date): { start: string; end: string } {
  if (p === 'all') return { start: '0000-01-01', end: '9999-12-31' }
  if (p === 'lastmonth') { const d = subMonths(now, 1); return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') } }
  if (p === 'quarter') return { start: format(startOfQuarter(now), 'yyyy-MM-dd'), end: format(endOfQuarter(now), 'yyyy-MM-dd') }
  if (p === 'year') return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') }
  return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') }
}

interface FactureRow {
  id: string; date: string; paid_at: string | null; invoice_no: string | null
  amount_paid: number | null; amount_due: number | null; payment_method: string | null
  patient: { first_name: string; last_name: string } | null
}
interface AvoirRow {
  id: string; credit_no: string | null; original_invoice_no: string; patient_name: string | null; amount: number; created_at: string
}

export default function FacturesPage() {
  const [factures, setFactures] = useState<FactureRow[]>([])
  const [avoirs, setAvoirs] = useState<AvoirRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<Period>('all')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: doctor } = await supabase.from('doctors').select('id').eq('email', user.email).single()
      if (!doctor) return
      const [fRes, aRes] = await Promise.all([
        supabase.from('appointments')
          .select('id, date, paid_at, invoice_no, amount_paid, amount_due, payment_method, patient:patients(first_name, last_name)')
          .eq('doctor_id', doctor.id).not('amount_paid', 'is', null),
        supabase.from('credit_notes').select('id, credit_no, original_invoice_no, patient_name, amount, created_at').eq('doctor_id', doctor.id),
      ])
      setFactures((fRes.data ?? []) as unknown as FactureRow[])
      setAvoirs((aRes.data ?? []) as AvoirRow[])
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fDate = (f: FactureRow) => f.paid_at ? formatInTimeZone(parseISO(f.paid_at), MAROC_TZ, 'yyyy-MM-dd') : f.date

  const rows = useMemo(() => {
    const { start, end } = periodRange(period, getNowInMaroc())
    const q = search.trim().toLowerCase()
    return factures
      .map((f) => ({ ...f, _date: fDate(f), _patient: f.patient ? `${f.patient.first_name} ${f.patient.last_name}` : '' }))
      .filter((f) => f._date >= start && f._date <= end)
      .filter((f) => !q || f._patient.toLowerCase().includes(q) || (f.invoice_no ?? '').toLowerCase().includes(q))
      .sort((a, b) => b._date.localeCompare(a._date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factures, period, search])

  const total = rows.reduce((s, f) => s + (f.amount_paid ?? 0), 0)

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  // Coche / décoche toutes les factures actuellement affichées
  const allVisibleSelected = rows.length > 0 && rows.every((f) => selectedIds.has(f.id))
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (allVisibleSelected) rows.forEach((f) => n.delete(f.id))
      else rows.forEach((f) => n.add(f.id))
      return n
    })
  }
  function exitSelection() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  function downloadCSV(list: typeof rows, filename: string) {
    const esc = (v: string | number) => {
      let s = String(v)
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const sum = list.reduce((s, f) => s + (f.amount_paid ?? 0), 0)
    const headers = ['Date', 'N° facture', 'Patient', 'Montant payé (DH)', 'Total dû (DH)', 'Mode']
    const data = list.map((f) => [f._date, f.invoice_no ?? '', f._patient, f.amount_paid ?? 0, f.amount_due ?? '', f.payment_method ? (PAYMENT_METHOD_LABELS[f.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? f.payment_method) : ''])
    data.push(['', '', '', sum, '', 'TOTAL'])
    const csv = '﻿' + [headers, ...data].map((r) => r.map(esc).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
  }

  function exportCSV() {
    downloadCSV(rows, `factures-monrdv-${period}-${format(getNowInMaroc(), 'yyyy-MM-dd')}.csv`)
  }
  function exportSelected() {
    const sel = rows.filter((f) => selectedIds.has(f.id))
    if (sel.length === 0) return
    downloadCSV(sel, `factures-selection-${format(getNowInMaroc(), 'yyyy-MM-dd')}.csv`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Factures</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} facture(s) · {total.toLocaleString('fr-FR')} DH encaissés</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectionMode ? (
            <Button variant="outline" size="sm" onClick={exitSelection}>
              Terminer
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)} disabled={rows.length === 0}>
              <ListChecks className="h-4 w-4 mr-1.5" /> Sélectionner
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Tout exporter
          </Button>
        </div>
      </div>

      {/* Barre d'actions groupées (mode sélection) */}
      {selectionMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-primary-50 border border-primary-100 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-primary-700">{selectedIds.size} facture(s) sélectionnée(s)</span>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportSelected} disabled={selectedIds.size === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Télécharger la sélection (Excel)
            </Button>
            <button onClick={exitSelection} className="text-xs text-gray-400 hover:text-gray-600 px-1">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par patient ou n° de facture…" className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Aucune facture pour cette période. Les factures apparaissent dès qu&apos;un rendez-vous est encaissé.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                    {selectionMode && (
                      <th className="py-2.5 pl-4 pr-1 w-8">
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 cursor-pointer"
                          aria-label="Tout sélectionner" />
                      </th>
                    )}
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">N° facture</th>
                    <th className="py-2.5 px-4 font-medium">Patient</th>
                    <th className="py-2.5 px-4 font-medium text-right">Montant</th>
                    <th className="py-2.5 px-4 font-medium">Mode</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${selectionMode && selectedIds.has(f.id) ? 'bg-primary-50/40' : ''}`}>
                      {selectionMode && (
                        <td className="py-2.5 pl-4 pr-1">
                          <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 cursor-pointer"
                            aria-label={`Sélectionner la facture ${f.invoice_no ?? ''}`} />
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{f._date}</td>
                      <td className="py-2.5 px-4 font-medium text-gray-900 whitespace-nowrap">{f.invoice_no ?? '—'}</td>
                      <td className="py-2.5 px-4 text-gray-700">{f._patient || '—'}</td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap text-gray-900">
                        {f.amount_paid} DH{f.amount_due && f.amount_due > (f.amount_paid ?? 0) ? <span className="text-orange-500 text-xs"> /{f.amount_due}</span> : ''}
                      </td>
                      <td className="py-2.5 px-4 text-gray-500">{f.payment_method ? (PAYMENT_METHOD_LABELS[f.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ?? f.payment_method) : '—'}</td>
                      <td className="py-2.5 px-4 text-right">
                        <a href={`/facture/${f.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
                          <Printer className="h-3.5 w-3.5" /> Voir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {avoirs.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-2 flex items-center gap-2"><Undo2 className="h-4 w-4 text-red-500" /> Avoirs émis ({avoirs.length})</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                      <th className="py-2.5 px-4 font-medium">N° avoir</th>
                      <th className="py-2.5 px-4 font-medium">Facture annulée</th>
                      <th className="py-2.5 px-4 font-medium">Patient</th>
                      <th className="py-2.5 px-4 font-medium text-right">Montant</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avoirs.map((a) => (
                      <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2.5 px-4 font-medium text-gray-900 whitespace-nowrap">{a.credit_no ?? '—'}</td>
                        <td className="py-2.5 px-4 text-gray-600">{a.original_invoice_no}</td>
                        <td className="py-2.5 px-4 text-gray-700">{a.patient_name || '—'}</td>
                        <td className="py-2.5 px-4 text-right text-red-600 whitespace-nowrap">− {a.amount} DH</td>
                        <td className="py-2.5 px-4 text-right">
                          <a href={`/avoir/${a.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
                            <Printer className="h-3.5 w-3.5" /> Voir
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
