'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { getNowInMaroc, formatDateFr, formatDateShort, MAROC_TZ } from '@/lib/utils'
import {
  format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, parseISO,
} from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { fr } from 'date-fns/locale'
import {
  BarChart3, Wallet, UserCheck, UserX, Timer, TrendingUp, Download, Plus, Trash2, Banknote, Receipt,
} from 'lucide-react'
import type { Appointment, Expense, CreditNote } from '@/types'

type Period = 'month' | 'lastmonth' | 'quarter' | 'year' | 'all'
const PERIOD_LABELS: Record<Period, string> = {
  month: 'Ce mois-ci', lastmonth: 'Mois dernier', quarter: 'Ce trimestre', year: 'Cette année', all: 'Tout',
}
const PM_LABELS: Record<string, string> = { especes: 'Espèces', carte: 'Carte', cheque: 'Chèque', virement: 'Virement' }

function periodRange(p: Period, now: Date): { start: string; end: string } {
  if (p === 'all') return { start: '0000-01-01', end: '9999-12-31' }
  if (p === 'lastmonth') { const d = subMonths(now, 1); return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') } }
  if (p === 'quarter') return { start: format(startOfQuarter(now), 'yyyy-MM-dd'), end: format(endOfQuarter(now), 'yyyy-MM-dd') }
  if (p === 'year') return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') }
  return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') }
}

export default function StatistiquesPage() {
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [appts, setAppts] = useState<Appointment[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [credits, setCredits] = useState<CreditNote[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('month')
  const [exp, setExp] = useState({ date: format(getNowInMaroc(), 'yyyy-MM-dd'), label: '', amount: '' })
  const [addingExp, setAddingExp] = useState(false)
  const supabase = createClient()

  async function loadAll(docId: string) {
    const [aptRes, expRes, creditRes] = await Promise.all([
      supabase.from('appointments')
        .select('date, time, status, attendance, amount_paid, amount_due, payment_method, invoice_no, paid_at, notes, patient:patients(first_name, last_name), consultation_type:consultation_types(name)')
        .eq('doctor_id', docId).neq('status', 'cancelled'),
      supabase.from('expenses').select('*').eq('doctor_id', docId).order('date', { ascending: false }),
      supabase.from('credit_notes').select('*').eq('doctor_id', docId).order('created_at', { ascending: false }),
    ])
    setAppts((aptRes.data ?? []) as unknown as Appointment[])
    setExpenses((expRes.data ?? []) as Expense[])
    setCredits((creditRes.data ?? []) as CreditNote[])
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: doctor } = await supabase.from('doctors').select('id').eq('email', user.email).single()
      if (!doctor) return
      setDoctorId(doctor.id)
      await loadAll(doctor.id)
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const payDate = (a: Appointment) =>
    a.paid_at ? formatInTimeZone(parseISO(a.paid_at), MAROC_TZ, 'yyyy-MM-dd') : a.date

  const d = useMemo(() => {
    const now = getNowInMaroc()
    const { start, end } = periodRange(period, now)
    const inRange = (date: string) => date >= start && date <= end

    let recettes = 0, present = 0, absent = 0, late = 0, rdvCount = 0
    const caisse: Record<string, number> = { especes: 0, carte: 0, cheque: 0, virement: 0, autre: 0 }
    const rows: { date: string; invoice: string; patient: string; motif: string; mode: string; amount: number }[] = []
    const byMonth = new Map<string, number>()

    for (const a of appts) {
      if (a.amount_paid != null) {
        const pd = payDate(a)
        const amt = a.amount_paid
        const mk = pd.slice(0, 7)
        byMonth.set(mk, (byMonth.get(mk) ?? 0) + amt)
        if (inRange(pd)) {
          recettes += amt
          caisse[a.payment_method && caisse[a.payment_method] !== undefined ? a.payment_method : 'autre'] += amt
          rows.push({
            date: pd, invoice: a.invoice_no || '',
            patient: a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : '',
            motif: a.consultation_type?.name || a.notes || '',
            mode: a.payment_method ? (PM_LABELS[a.payment_method] || a.payment_method) : '',
            amount: amt,
          })
        }
      }
      if (inRange(a.date)) {
        rdvCount++
        if (a.attendance === 'present') present++
        else if (a.attendance === 'absent') absent++
        else if (a.attendance === 'late') late++
      }
    }
    rows.sort((x, y) => y.date.localeCompare(x.date))

    const expenseRows = expenses.filter((e) => inRange(e.date)).sort((a, b) => b.date.localeCompare(a.date))
    const depenses = expenseRows.reduce((s, e) => s + Number(e.amount), 0)

    // Avoirs émis dans la période (date = date d'émission, en heure marocaine)
    const creditRows = credits
      .map((c) => ({ ...c, _date: formatInTimeZone(parseISO(c.created_at), MAROC_TZ, 'yyyy-MM-dd') }))
      .filter((c) => inRange(c._date))
      .sort((a, b) => b._date.localeCompare(a._date))
    const avoirs = creditRows.reduce((s, c) => s + Number(c.amount), 0)

    const revenueByMonth = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([mk, total]) => { const [y, m] = mk.split('-'); return { label: format(new Date(+y, +m - 1, 1), 'MMM yyyy', { locale: fr }), total } })

    const totAtt = present + absent + late
    return {
      recettes, depenses, avoirs, net: recettes - avoirs - depenses, caisse, rows, expenseRows, creditRows, rdvCount,
      present, absent, late, presenceRate: totAtt > 0 ? Math.round((present / totAtt) * 100) : 0,
      revenueByMonth,
    }
  }, [appts, expenses, credits, period])

  async function addExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!doctorId || !exp.label.trim()) return
    const amount = parseFloat(exp.amount.replace(',', '.'))
    if (isNaN(amount) || amount < 0) return
    setAddingExp(true)
    const { data, error } = await supabase.from('expenses')
      .insert({ doctor_id: doctorId, date: exp.date, label: exp.label.trim().substring(0, 120), amount })
      .select().single()
    setAddingExp(false)
    if (!error && data) {
      setExpenses((prev) => [data as Expense, ...prev])
      setExp({ date: format(getNowInMaroc(), 'yyyy-MM-dd'), label: '', amount: '' })
    } else { alert('Échec de l\'ajout de la dépense.') }
  }

  async function deleteExpense(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { alert('Échec de la suppression.'); return }
    setExpenses((prev) => prev.filter((x) => x.id !== id))
  }

  function downloadCSV(kind: string, headers: string[], rows: (string | number)[][]) {
    const esc = (v: string | number) => {
      let s = String(v)
      if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${kind}-monrdv-${period}-${format(getNowInMaroc(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  // Recettes (détail des encaissements)
  function exportRecettes() {
    const rows: (string | number)[][] = d.rows.map((r) => [r.date, r.invoice, r.patient, r.motif, r.mode, r.amount])
    rows.push(['', '', '', '', 'TOTAL RECETTES', d.recettes])
    downloadCSV('recettes', ['Date', 'N° facture', 'Patient', 'Motif', 'Mode', 'Montant (DH)'], rows)
  }

  // Dépenses (détail)
  function exportDepenses() {
    const rows: (string | number)[][] = d.expenseRows.map((e) => [e.date, e.label, Number(e.amount)])
    rows.push(['', 'TOTAL DÉPENSES', d.depenses])
    downloadCSV('depenses', ['Date', 'Libellé', 'Montant (DH)'], rows)
  }

  // Avoirs (détail)
  function exportAvoirs() {
    const rows: (string | number)[][] = d.creditRows.map((c) => [c._date, c.credit_no || '', c.original_invoice_no, c.patient_name || '', c.reason || '', Number(c.amount)])
    rows.push(['', '', '', '', 'TOTAL AVOIRS', d.avoirs])
    downloadCSV('avoirs', ['Date', 'N° avoir', 'Facture annulée', 'Patient', 'Motif', 'Montant (DH)'], rows)
  }

  // Journal complet : recettes + avoirs + dépenses, triés par date (chronologique)
  function exportJournal() {
    const entries = [
      ...d.rows.map((r) => ({ date: r.date, type: 'Recette', desc: [r.patient, r.motif].filter(Boolean).join(' · '), mode: r.mode, recette: r.amount, depense: 0 })),
      ...d.creditRows.map((c) => ({ date: c._date, type: 'Avoir', desc: `Avoir ${c.credit_no || ''} sur ${c.original_invoice_no}${c.reason ? ' · ' + c.reason : ''}`, mode: '', recette: -Number(c.amount), depense: 0 })),
      ...d.expenseRows.map((e) => ({ date: e.date, type: 'Dépense', desc: e.label, mode: '', recette: 0, depense: Number(e.amount) })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const rows: (string | number)[][] = entries.map((x) => [x.date, x.type, x.desc, x.mode, x.recette || '', x.depense || ''])
    rows.push(['', '', '', 'TOTAL RECETTES', d.recettes, ''])
    rows.push(['', '', '', 'TOTAL AVOIRS', -d.avoirs, ''])
    rows.push(['', '', '', 'TOTAL DÉPENSES', '', d.depenses])
    rows.push(['', '', '', 'NET', d.net, ''])
    downloadCSV('journal', ['Date', 'Type', 'Détail', 'Mode', 'Recette (DH)', 'Dépense (DH)'], rows)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Statistiques</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  const maxMonth = Math.max(1, ...d.revenueByMonth.map((m) => m.total))
  const caisseEntries = (['especes', 'carte', 'cheque', 'virement', 'autre'] as const).filter((k) => d.caisse[k] > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statistiques &amp; comptabilité</h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">{formatDateFr(getNowInMaroc())}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportRecettes} disabled={d.rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Recettes
          </Button>
          <Button variant="outline" size="sm" onClick={exportDepenses} disabled={d.expenseRows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Dépenses
          </Button>
          <Button variant="outline" size="sm" onClick={exportAvoirs} disabled={d.creditRows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Avoirs
          </Button>
          <Button variant="outline" size="sm" onClick={exportJournal} disabled={d.rows.length === 0 && d.expenseRows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Journal
          </Button>
        </div>
      </div>

      {/* Recettes / Dépenses / Net — période */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide"><Wallet className="h-4 w-4" /> Recettes · {PERIOD_LABELS[period]}</div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{d.recettes.toLocaleString('fr-FR')} <span className="text-base font-medium text-gray-400">DH</span></p>
          {d.avoirs > 0 && (
            <p className="text-xs text-red-500 mt-1">− {d.avoirs.toLocaleString('fr-FR')} DH d&apos;avoirs émis</p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide"><Receipt className="h-4 w-4" /> Dépenses</div>
          <p className="text-3xl font-bold text-orange-600 mt-2">{d.depenses.toLocaleString('fr-FR')} <span className="text-base font-medium text-gray-400">DH</span></p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide"><TrendingUp className="h-4 w-4" /> Résultat net</div>
          <p className={`text-3xl font-bold mt-2 ${d.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{d.net.toLocaleString('fr-FR')} <span className="text-base font-medium text-gray-400">DH</span></p>
        </CardContent></Card>
      </div>

      {/* Caisse — ventilation par mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4 text-primary-500" /> Caisse — {PERIOD_LABELS[period]} (par mode de règlement)</CardTitle>
        </CardHeader>
        <CardContent>
          {caisseEntries.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun encaissement sur la période.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {caisseEntries.map((k) => (
                <div key={k} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{k === 'autre' ? 'Non précisé' : PM_LABELS[k]}</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{d.caisse[k].toLocaleString('fr-FR')} DH</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dépenses */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary-500" /> Dépenses du cabinet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={addExpense} className="flex flex-col sm:flex-row gap-2">
            <Input type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} className="sm:w-40" />
            <Input value={exp.label} onChange={(e) => setExp({ ...exp, label: e.target.value })} placeholder="Ex : Loyer, fournitures…" className="flex-1" />
            <div className="relative sm:w-32">
              <Input type="number" min="0" step="any" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} placeholder="Montant" className="pr-9" />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">DH</span>
            </div>
            <Button type="submit" variant="outline" disabled={addingExp || !exp.label.trim() || !exp.amount} className="shrink-0">
              <Plus className="h-4 w-4 mr-1" /> {addingExp ? 'Ajout…' : 'Ajouter'}
            </Button>
          </form>
          {d.expenseRows.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune dépense sur la période.</p>
          ) : (
            <div className="space-y-1.5">
              {d.expenseRows.map((e) => (
                <div key={e.id} className="group flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-gray-400 w-20 shrink-0">{formatDateShort(e.date)}</span>
                    <span className="text-gray-700 truncate">{e.label}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-orange-600">{Number(e.amount).toLocaleString('fr-FR')} DH</span>
                    <button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CA par mois */}
      {d.revenueByMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary-500" /> Chiffre d&apos;affaires des derniers mois</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {d.revenueByMonth.map((m) => (
                <div key={m.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-20 shrink-0 capitalize">{m.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div className="bg-primary-500 h-full rounded-full flex items-center justify-end px-2 transition-all" style={{ width: `${Math.max(8, (m.total / maxMonth) * 100)}%` }}>
                      <span className="text-[11px] font-semibold text-white whitespace-nowrap">{m.total.toLocaleString('fr-FR')} DH</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assiduité */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4 text-primary-500" /> Assiduité — {PERIOD_LABELS[period]}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5"><span className="text-gray-600">Taux de présence</span><span className="font-bold text-green-600">{d.presenceRate}%</span></div>
            <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden"><div className="bg-green-500 h-full rounded-full" style={{ width: `${d.presenceRate}%` }} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 rounded-lg p-3 text-center"><UserCheck className="h-4 w-4 text-green-600 mx-auto mb-1" /><p className="text-xl font-bold text-green-700">{d.present}</p><p className="text-xs text-green-600">Présences</p></div>
            <div className="bg-orange-50 rounded-lg p-3 text-center"><Timer className="h-4 w-4 text-orange-600 mx-auto mb-1" /><p className="text-xl font-bold text-orange-700">{d.late}</p><p className="text-xs text-orange-600">Retards</p></div>
            <div className="bg-red-50 rounded-lg p-3 text-center"><UserX className="h-4 w-4 text-red-600 mx-auto mb-1" /><p className="text-xl font-bold text-red-700">{d.absent}</p><p className="text-xs text-red-600">Absences</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
