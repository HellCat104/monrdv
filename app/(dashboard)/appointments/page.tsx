'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppointmentList } from '@/components/dashboard/AppointmentList'
import { AddAppointmentDialog } from '@/components/dashboard/AddAppointmentDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Appointment, Doctor, AppointmentStatus } from '@/types'
import { Plus, Search, Calendar } from 'lucide-react'
import { format, startOfWeek, endOfWeek, addDays, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getNowInMaroc } from '@/lib/utils'

type ViewMode = 'day' | 'week' | 'all'

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [currentDate, setCurrentDate] = useState(getNowInMaroc())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')

  const supabase = createClient()

  // Charge le médecin connecté
  useEffect(() => {
    async function loadDoctor() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('doctors')
        .select('*')
        .eq('email', user.email)
        .single()
      setDoctor(data)
    }
    loadDoctor()
  }, [])

  // Charge les rendez-vous selon la vue
  const loadAppointments = useCallback(async () => {
    if (!doctor) return
    setLoading(true)

    try {
      let query = supabase
        .from('appointments')
        .select('*, patient:patients(*)')
        .eq('doctor_id', doctor.id)
        .order('date', { ascending: true })
        .order('time', { ascending: true })

      if (viewMode === 'day') {
        const dateStr = format(currentDate, 'yyyy-MM-dd')
        query = query.eq('date', dateStr)
      } else if (viewMode === 'week') {
        const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        const weekEnd = format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        query = query.gte('date', weekStart).lte('date', weekEnd)
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data } = await query
      setAppointments(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [doctor, viewMode, currentDate, statusFilter])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Filtre par recherche côté client
  const filtered = appointments.filter((apt) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const patient = apt.patient
    if (!patient) return false
    return (
      patient.first_name.toLowerCase().includes(q) ||
      patient.last_name.toLowerCase().includes(q) ||
      patient.phone.includes(q)
    )
  })

  async function handleStatusChange(id: string, status: AppointmentStatus) {
    await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await loadAppointments()
  }

  // Navigation dates
  function navigate(direction: 'prev' | 'next') {
    if (viewMode === 'day') {
      setCurrentDate(direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1))
    } else {
      setCurrentDate(direction === 'next' ? addDays(currentDate, 7) : subDays(currentDate, 7))
    }
  }

  const dateLabel = viewMode === 'day'
    ? format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })
    : `Semaine du ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM', { locale: fr })} au ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: fr })}`

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rendez-vous</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} RDV affichés</p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={!doctor}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau RDV
        </Button>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Vue et navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden">
              {(['day', 'week', 'all'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode === 'day' ? 'Jour' : mode === 'week' ? 'Semaine' : 'Tous'}
                </button>
              ))}
            </div>

            {viewMode !== 'all' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate('prev')}>←</Button>
                <span className="text-sm font-medium text-gray-700 capitalize min-w-[200px] text-center">
                  {dateLabel}
                </span>
                <Button variant="outline" size="sm" onClick={() => navigate('next')}>→</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentDate(getNowInMaroc())}
                  className="text-primary-500"
                >
                  Aujourd&apos;hui
                </Button>
              </div>
            )}
          </div>

          {/* Recherche + filtre statut */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un patient…"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as AppointmentStatus | 'all')}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="confirmed">Confirmé</SelectItem>
                <SelectItem value="cancelled">Annulé</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary-500" />
            {loading ? 'Chargement…' : `${filtered.length} rendez-vous`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <AppointmentList appointments={filtered} onStatusChange={handleStatusChange} />
          )}
        </CardContent>
      </Card>

      {/* Dialog ajout */}
      {doctor && (
        <AddAppointmentDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          doctor={doctor}
          onSuccess={loadAppointments}
        />
      )}
    </div>
  )
}
