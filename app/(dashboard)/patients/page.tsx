'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AppointmentList } from '@/components/dashboard/AppointmentList'
import type { Patient, Appointment } from '@/types'
import { getInitials, formatDateShort } from '@/lib/utils'
import { Users, Search, Phone, Calendar } from 'lucide-react'

interface PatientWithStats extends Patient {
  appointment_count: number
  last_appointment_date: string | null
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: doctor } = await supabase
        .from('doctors')
        .select('id')
        .eq('email', user.email)
        .single()

      if (!doctor) return

      // Récupère les patients avec le nombre de RDV
      const { data: pts } = await supabase
        .from('patients')
        .select(`
          *,
          appointments(count, date)
        `)
        .eq('doctor_id', doctor.id)
        .order('created_at', { ascending: false })

      // Transforme les données
      const enriched: PatientWithStats[] = (pts ?? []).map((p: any) => ({
        ...p,
        appointment_count: p.appointments?.length ?? 0,
        last_appointment_date: p.appointments?.sort((a: any, b: any) =>
          b.date.localeCompare(a.date)
        )?.[0]?.date ?? null,
      }))

      setPatients(enriched)
      setLoading(false)
    }
    load()
  }, [])

  async function openPatientHistory(patient: Patient) {
    setSelectedPatient(patient)
    setLoadingHistory(true)

    const { data } = await supabase
      .from('appointments')
      .select('*, patient:patients(*)')
      .eq('patient_id', patient.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })

    setPatientAppointments(data ?? [])
    setLoadingHistory(false)
  }

  const filtered = patients.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.phone.includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
        <p className="text-sm text-gray-500 mt-1">{patients.length} patient(s) enregistré(s)</p>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="pl-9"
        />
      </div>

      {/* Liste des patients */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search ? 'Aucun patient trouvé' : 'Aucun patient enregistré'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:border-primary-200 hover:shadow-sm transition-all"
              onClick={() => openPatientHistory(patient)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold shrink-0">
                    {getInitials(patient.first_name, patient.last_name)}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {patient.phone}
                      </span>
                      {patient.last_appointment_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Dernier RDV : {formatDateShort(patient.last_appointment_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge nb RDV */}
                  <Badge variant="secondary" className="shrink-0">
                    {patient.appointment_count} RDV
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modale historique patient */}
      <Dialog open={!!selectedPatient} onOpenChange={(o) => !o && setSelectedPatient(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedPatient && (
                <>
                  <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold text-sm">
                    {getInitials(selectedPatient.first_name, selectedPatient.last_name)}
                  </div>
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedPatient && (
            <div className="space-y-4">
              {/* Infos contact */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p className="flex items-center gap-2 text-gray-600">
                  <Phone className="h-3.5 w-3.5" />
                  {selectedPatient.phone}
                </p>
              </div>

              {/* Historique RDV */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Historique des rendez-vous ({patientAppointments.length})
                </h4>
                {loadingHistory ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <AppointmentList appointments={patientAppointments} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
