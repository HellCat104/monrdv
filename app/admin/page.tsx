'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials, formatDateShort } from '@/lib/utils'
import {
  CheckCircle2, XCircle, FileText, Clock, Users,
  ToggleLeft, ToggleRight, CalendarDays, LogOut, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface DoctorRow {
  id: string
  name: string
  email: string
  specialty: string
  phone: string
  slug: string
  status: 'pending' | 'approved' | 'rejected'
  subscription_status: 'actif' | 'inactif'
  date_expiration: string | null
  document_url: string | null
  rejection_reason: string | null
  created_at: string
}

const STATUS_CONFIG = {
  pending:  { label: 'En attente', icon: Clock },
  approved: { label: 'Approuvé',   icon: CheckCircle2 },
  rejected: { label: 'Refusé',     icon: XCircle },
} as const

type Filter    = 'all' | 'pending' | 'approved' | 'rejected'
type SubFilter = 'all' | 'actif' | 'inactif'

// ─── petit composant toast ────────────────────────────────────────────────────
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${
      type === 'success' ? 'bg-green-500' : 'bg-red-500'
    }`}>
      {message}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [doctors, setDoctors]     = useState<DoctorRow[]>([])
  const [counts, setCounts]       = useState({ pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<Filter>('pending')
  const [subFilter, setSubFilter] = useState<SubFilter>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast]         = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Dialogs
  const [rejectDialog, setRejectDialog]         = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  const [rejectReason, setRejectReason]         = useState('')
  const [expirationDialog, setExpirationDialog] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  const [newExpiration, setNewExpiration]       = useState('')

  // ── helpers ────────────────────────────────────────────────────────────────
  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function apiFetch(id: string, body: object): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/doctors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error || `Erreur ${res.status}`, 'error')
        return false
      }
      return true
    } catch {
      showToast('Erreur réseau — réessayez', 'error')
      return false
    }
  }

  // ── chargement ────────────────────────────────────────────────────────────
  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/doctors?counts=1')
      if (!res.ok) return
      const data = await res.json()
      setCounts({
        pending:  data.pending  ?? 0,
        approved: data.approved ?? 0,
        rejected: data.rejected ?? 0,
      })
    } catch { /* silencieux */ }
  }, [])

  const loadDoctors = useCallback(async (f: Filter) => {
    setLoading(true)
    try {
      const url = f === 'all' ? '/api/admin/doctors' : `/api/admin/doctors?status=${f}`
      const res = await fetch(url)
      if (!res.ok) {
        showToast('Impossible de charger les médecins', 'error')
        setDoctors([])
        return
      }
      const data: DoctorRow[] = await res.json()
      setDoctors(data)
    } catch {
      showToast('Erreur réseau', 'error')
      setDoctors([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCounts() }, [loadCounts])
  useEffect(() => { loadDoctors(filter) }, [filter, loadDoctors])

  async function refresh() {
    await Promise.all([loadDoctors(filter), loadCounts()])
  }

  // Médecins filtrés côté client (sub-filtre actif/inactif sur les approuvés)
  const visibleDoctors = filter === 'approved' && subFilter !== 'all'
    ? doctors.filter((d) => d.subscription_status === subFilter)
    : doctors

  // ── actions ───────────────────────────────────────────────────────────────
  async function handleApprove(id: string) {
    setActionLoading(id)
    const ok = await apiFetch(id, { action: 'approve' })
    if (ok) showToast('Médecin approuvé ✓', 'success')
    await refresh()
    setActionLoading(null)
  }

  async function handleReject() {
    const { id, name } = rejectDialog
    setActionLoading(id)
    const ok = await apiFetch(id, { action: 'reject', rejection_reason: rejectReason })
    if (ok) showToast(`Dr. ${name} refusé`, 'success')
    setRejectDialog({ open: false, id: '', name: '' })
    setRejectReason('')
    await refresh()
    setActionLoading(null)
  }

  async function handleToggle(id: string, name: string, currentStatus: string) {
    setActionLoading(id)
    const ok = await apiFetch(id, { action: 'toggle_subscription' })
    if (ok) {
      const next = currentStatus === 'actif' ? 'inactif' : 'actif'
      showToast(`Dr. ${name} → ${next}`, 'success')
    }
    await refresh()
    setActionLoading(null)
  }

  async function handleSetExpiration() {
    const { id, name } = expirationDialog
    setActionLoading(id)
    const ok = await apiFetch(id, { action: 'set_expiration', date_expiration: newExpiration || null })
    if (ok) showToast('Date d\'expiration enregistrée ✓', 'success')
    setExpirationDialog({ open: false, id: '', name: '' })
    setNewExpiration('')
    await refresh()
    setActionLoading(null)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des médecins</h1>
          <p className="text-gray-500 text-sm mt-1">Approuvez ou refusez les demandes d'inscription</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualiser
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Déconnexion
          </button>
        </div>
      </div>

      {/* Stats — cartes cliquables */}
      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={() => { setFilter('pending'); setSubFilter('all') }}
          className={`rounded-xl border p-4 text-center transition-all bg-yellow-50 border-yellow-200 text-yellow-700 ${filter === 'pending' ? 'ring-2 ring-offset-1 ring-yellow-300 shadow-sm' : 'hover:shadow-sm'}`}
        >
          <p className="text-2xl font-bold">{counts.pending}</p>
          <p className="text-xs font-medium mt-1">En attente</p>
        </button>

        {/* Carte verte — avec sub-filtres quand active */}
        <div className={`rounded-xl border bg-green-50 border-green-200 text-green-700 transition-all ${filter === 'approved' ? 'ring-2 ring-offset-1 ring-green-300 shadow-sm' : 'hover:shadow-sm'}`}>
          <button
            className="w-full p-4 text-center"
            onClick={() => { setFilter('approved'); setSubFilter('all') }}
          >
            <p className="text-2xl font-bold">{counts.approved}</p>
            <p className="text-xs font-medium mt-1">Approuvés</p>
          </button>
          {filter === 'approved' && (
            <div className="flex border-t border-green-200">
              {(['all', 'actif', 'inactif'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSubFilter(s)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors first:rounded-bl-xl last:rounded-br-xl ${
                    subFilter === s ? 'bg-green-600 text-white' : 'hover:bg-green-100'
                  }`}
                >
                  {s === 'all' ? 'Tous' : s === 'actif' ? 'Actifs' : 'Inactifs'}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => { setFilter('rejected'); setSubFilter('all') }}
          className={`rounded-xl border p-4 text-center transition-all bg-red-50 border-red-200 text-red-700 ${filter === 'rejected' ? 'ring-2 ring-offset-1 ring-red-300 shadow-sm' : 'hover:shadow-sm'}`}
        >
          <p className="text-2xl font-bold">{counts.rejected}</p>
          <p className="text-xs font-medium mt-1">Refusés</p>
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-xl animate-pulse border" />)}
        </div>
      ) : visibleDoctors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun médecin dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleDoctors.map((doctor) => {
            const config    = STATUS_CONFIG[doctor.status]
            const StatusIcon = config.icon
            const isLoading  = actionLoading === doctor.id

            return (
              <Card key={doctor.id} className="border border-gray-100 hover:shadow-sm transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {getInitials(doctor.name.split(' ')[0], doctor.name.split(' ')[1] || 'X')}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">Dr. {doctor.name}</span>

                        {/* Badge statut inscription */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          doctor.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
                          doctor.status === 'approved' ? 'bg-green-100 text-green-700'   :
                          'bg-red-100 text-red-700'
                        }`}>
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </span>

                        {/* Badge abonnement */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          doctor.subscription_status === 'actif'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {doctor.subscription_status === 'actif' ? '● Actif' : '○ Inactif'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-500 mt-0.5">
                        {doctor.specialty} · {doctor.email}
                        {doctor.phone ? ` · ${doctor.phone}` : ''}
                      </p>

                      <p className="text-xs text-gray-400 mt-0.5">
                        Inscrit le {formatDateShort(doctor.created_at.split('T')[0])}
                        {doctor.rejection_reason && (
                          <span className="ml-2 text-red-400">Motif : {doctor.rejection_reason}</span>
                        )}
                      </p>

                      {doctor.date_expiration && (
                        <p className={`text-xs mt-0.5 ${
                          new Date(doctor.date_expiration) < new Date() ? 'text-red-500' :
                          Math.ceil((new Date(doctor.date_expiration).getTime() - Date.now()) / 86400000) <= 7
                            ? 'text-orange-500' : 'text-gray-400'
                        }`}>
                          Expire le {new Date(doctor.date_expiration).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">

                      {/* Toggle actif/inactif */}
                      <button
                        disabled={isLoading}
                        onClick={() => handleToggle(doctor.id, doctor.name, doctor.subscription_status)}
                        title={doctor.subscription_status === 'actif' ? 'Désactiver' : 'Activer'}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                          doctor.subscription_status === 'actif'
                            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        {doctor.subscription_status === 'actif'
                          ? <><ToggleRight className="h-3.5 w-3.5" /> Actif</>
                          : <><ToggleLeft  className="h-3.5 w-3.5" /> Inactif</>
                        }
                      </button>

                      {/* Expiration */}
                      <button
                        disabled={isLoading}
                        onClick={() => {
                          setExpirationDialog({ open: true, id: doctor.id, name: doctor.name })
                          setNewExpiration(doctor.date_expiration ?? '')
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                        Expiration
                      </button>

                      {/* Document */}
                      {doctor.document_url && (
                        <a
                          href={doctor.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary-600 border border-primary-200 px-2.5 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Document
                        </a>
                      )}

                      {/* Approuver */}
                      {doctor.status !== 'approved' && (
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 h-8 text-xs px-3 disabled:opacity-50"
                          disabled={isLoading}
                          onClick={() => handleApprove(doctor.id)}
                        >
                          {isLoading
                            ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                            : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          }
                          Approuver
                        </Button>
                      )}

                      {/* Refuser */}
                      {doctor.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 border-red-200 hover:bg-red-50 h-8 text-xs px-3 disabled:opacity-50"
                          disabled={isLoading}
                          onClick={() => setRejectDialog({ open: true, id: doctor.id, name: doctor.name })}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Refuser
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog — date d'expiration */}
      <Dialog
        open={expirationDialog.open}
        onOpenChange={(o) => setExpirationDialog({ open: o, id: '', name: '' })}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Expiration — Dr. {expirationDialog.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Laissez vide pour aucune limite. Le médecin verra un avertissement à moins de 7 jours.
            </p>
            <div className="space-y-1.5">
              <Label>Date d&apos;expiration</Label>
              <Input
                type="date"
                value={newExpiration}
                onChange={(e) => setNewExpiration(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExpirationDialog({ open: false, id: '', name: '' })}>
              Annuler
            </Button>
            <Button onClick={handleSetExpiration} disabled={!!actionLoading}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — refus */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(o) => setRejectDialog({ open: o, id: '', name: '' })}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Refuser Dr. {rejectDialog.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Un email sera envoyé au médecin avec le motif du refus.
            </p>
            <div className="space-y-1.5">
              <Label>Motif du refus (optionnel)</Label>
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Document illisible, informations incorrectes…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, id: '', name: '' })}>
              Annuler
            </Button>
            <Button
              className="bg-red-500 hover:bg-red-600"
              onClick={handleReject}
              disabled={!!actionLoading}
            >
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
