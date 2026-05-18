'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials, formatDateShort } from '@/lib/utils'
import { CheckCircle2, XCircle, FileText, ExternalLink, Clock, Users } from 'lucide-react'

interface DoctorWithStatus {
  id: string
  name: string
  email: string
  specialty: string
  phone: string
  slug: string
  status: 'pending' | 'approved' | 'rejected'
  document_url: string | null
  rejection_reason: string | null
  created_at: string
}

const STATUS_CONFIG = {
  pending:  { label: 'En attente', color: 'warning',   icon: Clock },
  approved: { label: 'Approuvé',   color: 'success',   icon: CheckCircle2 },
  rejected: { label: 'Refusé',     color: 'destructive', icon: XCircle },
} as const

export default function AdminPage() {
  const [doctors, setDoctors] = useState<DoctorWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: string; name: string }>({
    open: false, id: '', name: '',
  })
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const supabase = createClient()

  async function loadDoctors() {
    setLoading(true)
    let query = supabase
      .from('doctors')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setDoctors(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadDoctors() }, [filter])

  async function handleApprove(id: string) {
    setActionLoading(id)
    try {
      await fetch(`/api/admin/doctors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      await loadDoctors()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject() {
    setActionLoading(rejectDialog.id)
    try {
      await fetch(`/api/admin/doctors/${rejectDialog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejection_reason: rejectReason }),
      })
      setRejectDialog({ open: false, id: '', name: '' })
      setRejectReason('')
      await loadDoctors()
    } finally {
      setActionLoading(null)
    }
  }

  const counts = {
    pending:  doctors.filter((d) => d.status === 'pending').length,
    approved: doctors.filter((d) => d.status === 'approved').length,
    rejected: doctors.filter((d) => d.status === 'rejected').length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestion des médecins</h1>
        <p className="text-gray-500 text-sm mt-1">Approuvez ou refusez les demandes d'inscription</p>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { key: 'pending',  label: 'En attente', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
          { key: 'approved', label: 'Approuvés',  color: 'bg-green-50  border-green-200  text-green-700'  },
          { key: 'rejected', label: 'Refusés',    color: 'bg-red-50    border-red-200    text-red-700'    },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`rounded-xl border p-4 text-center transition-all ${color} ${filter === key ? 'ring-2 ring-offset-1 ring-gray-300' : ''}`}
          >
            <p className="text-2xl font-bold">{counts[key as keyof typeof counts]}</p>
            <p className="text-xs font-medium mt-1">{label}</p>
          </button>
        ))}
      </div>

      {/* Filtre */}
      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvés' : 'Refusés'}
          </button>
        ))}
      </div>

      {/* Liste des médecins */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />)}
        </div>
      ) : doctors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun médecin dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-4">
          {doctors.map((doctor) => {
            const config = STATUS_CONFIG[doctor.status]
            const StatusIcon = config.icon
            return (
              <Card key={doctor.id} className="border border-gray-100">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold shrink-0">
                      {getInitials(doctor.name.split(' ')[0], doctor.name.split(' ')[1] || 'X')}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">Dr. {doctor.name}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          doctor.status === 'pending'  ? 'bg-yellow-100 text-yellow-700' :
                          doctor.status === 'approved' ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{doctor.specialty} · {doctor.email}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Inscrit le {formatDateShort(doctor.created_at.split('T')[0])}
                        {doctor.rejection_reason && (
                          <span className="ml-2 text-red-500">Motif : {doctor.rejection_reason}</span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {/* Voir le document */}
                      {doctor.document_url && (
                        <a
                          href={doctor.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary-600 hover:underline border border-primary-200 px-2 py-1.5 rounded-lg"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Document
                        </a>
                      )}

                      {/* Approuver */}
                      {doctor.status !== 'approved' && (
                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 h-8 text-xs px-3"
                          disabled={actionLoading === doctor.id}
                          onClick={() => handleApprove(doctor.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approuver
                        </Button>
                      )}

                      {/* Refuser */}
                      {doctor.status !== 'rejected' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 border-red-200 hover:bg-red-50 h-8 text-xs px-3"
                          disabled={actionLoading === doctor.id}
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

      {/* Dialog refus */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => setRejectDialog({ open: o, id: '', name: '' })}>
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
