'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { Doctor, WorkingHours, DaySchedule } from '@/types'
import { DAY_NAMES_FR, DAY_ORDER, DEFAULT_WORKING_HOURS } from '@/types'
import { Settings, Clock, Copy, Check, ExternalLink } from 'lucide-react'

export default function SettingsPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    specialty: '',
    city: '',
    appointment_duration: 30,
    working_hours: DEFAULT_WORKING_HOURS as WorkingHours,
  })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('doctors')
        .select('*')
        .eq('email', user.email)
        .single()
      if (data) {
        setDoctor(data)
        setForm({
          name: data.name,
          phone: data.phone ?? '',
          specialty: data.specialty ?? '',
          city: data.city ?? '',
          appointment_duration: data.appointment_duration,
          working_hours: data.working_hours ?? DEFAULT_WORKING_HOURS,
        })
      }
    }
    load()
  }, [])

  function updateDaySchedule(day: keyof WorkingHours, field: keyof DaySchedule, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        [day]: { ...prev.working_hours[day], [field]: value },
      },
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!doctor) return
    setLoading(true)

    try {
      const { error } = await supabase
        .from('doctors')
        .update({
          name: form.name,
          phone: form.phone,
          specialty: form.specialty,
          city: form.city,
          appointment_duration: form.appointment_duration,
          working_hours: form.working_hours,
        })
        .eq('id', doctor.id)

      if (!error) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } finally {
      setLoading(false)
    }
  }

  const bookingUrl = doctor
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/dr-${doctor.slug}`
    : ''

  async function copyUrl() {
    await navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!doctor) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-1">Configurez votre cabinet</p>
      </div>

      {/* Lien de réservation */}
      <Card className="border-primary-100 bg-primary-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-primary-800">
            Votre lien de réservation public
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white rounded-lg px-3 py-2 text-sm text-primary-700 border border-primary-200 truncate">
              {bookingUrl}
            </code>
            <Button size="sm" variant="outline" onClick={copyUrl} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="outline" asChild className="shrink-0">
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-primary-600">
            Partagez ce lien avec vos patients pour qu&apos;ils puissent réserver en ligne.
          </p>
        </CardContent>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Informations du cabinet */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary-500" />
              Informations du cabinet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="s_name">Nom complet *</Label>
              <Input
                id="s_name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Dr. Hassan Alami"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s_specialty">Spécialité</Label>
                <Input
                  id="s_specialty"
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  placeholder="Médecin généraliste"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_phone">Téléphone</Label>
                <Input
                  id="s_phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="05 22 XX XX XX"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s_city">Ville</Label>
              <Input
                id="s_city"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Casablanca"
              />
            </div>
          </CardContent>
        </Card>

        {/* Durée des RDV */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-500" />
              Durée d&apos;un rendez-vous
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Select
                value={String(form.appointment_duration)}
                onValueChange={(v) => setForm({ ...form, appointment_duration: Number(v) })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 heure</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">par consultation</p>
            </div>
          </CardContent>
        </Card>

        {/* Horaires d'ouverture */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-500" />
              Horaires d&apos;ouverture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DAY_ORDER.map((day, idx) => {
              const schedule = form.working_hours[day]
              return (
                <div key={day}>
                  {idx > 0 && <Separator className="mb-3" />}
                  <div className="flex items-center gap-4">
                    {/* Activer/désactiver le jour */}
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <Switch
                        checked={schedule.enabled}
                        onCheckedChange={(v) => updateDaySchedule(day, 'enabled', v)}
                      />
                      <span className={`text-sm font-medium ${schedule.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                        {DAY_NAMES_FR[day]}
                      </span>
                    </div>

                    {/* Horaires si activé */}
                    {schedule.enabled ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={schedule.start}
                          onChange={(e) => updateDaySchedule(day, 'start', e.target.value)}
                          className="w-28 text-sm"
                        />
                        <span className="text-gray-400 text-sm">—</span>
                        <Input
                          type="time"
                          value={schedule.end}
                          onChange={(e) => updateDaySchedule(day, 'end', e.target.value)}
                          className="w-28 text-sm"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Fermé</span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Bouton sauvegarde */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? 'Sauvegarde…' : 'Enregistrer les modifications'}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" /> Sauvegardé !
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
