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
import type { Doctor, WorkingHours, DaySchedule, ConsultationType } from '@/types'
import { DAY_NAMES_FR, DAY_ORDER, DEFAULT_WORKING_HOURS, SPECIALITES_LIST, VILLES_MAROC, VITAL_DEFS, resolveEnabledVitals, type VitalDef } from '@/types'
import { Settings, Clock, Copy, Check, ExternalLink, Camera, MapPin, CalendarOff, Plus, Trash2, ListChecks, Activity } from 'lucide-react'
import type { BlockedDate } from '@/types'

export default function SettingsPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    public_email: '',
    specialty: '',
    city: '',
    address: '',
    bio: '',
    ice: '',
    inpe: '',
    appointment_duration: 30,
    working_hours: DEFAULT_WORKING_HOURS as WorkingHours,
  })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([])
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockEndDate, setNewBlockEndDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')
  const [blockLoading, setBlockLoading] = useState(false)
  // Motifs de consultation (durées variables)
  const [consultTypes, setConsultTypes] = useState<ConsultationType[]>([])
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeDuration, setNewTypeDuration] = useState('30')
  const [newTypePrice, setNewTypePrice] = useState('')
  const [typeLoading, setTypeLoading] = useState(false)
  // Constantes vitales suivies (clés VITAL_DEFS)
  const [enabledVitals, setEnabledVitals] = useState<string[]>([])
  // Constantes personnalisées créées par le médecin
  const [customVitals, setCustomVitals] = useState<VitalDef[]>([])
  const [newVitalLabel, setNewVitalLabel] = useState('')
  const [newVitalUnit, setNewVitalUnit] = useState('')
  // Spécialités additionnelles (en plus de la principale)
  const [extraSpecs, setExtraSpecs] = useState<string[]>([])
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
        setPhotoUrl(data.photo_url ?? null)
        setForm({
          name: data.name,
          phone: data.phone ?? '',
          whatsapp: data.whatsapp ?? '',
          public_email: data.public_email ?? '',
          specialty: data.specialty ?? '',
          city: data.city ?? '',
          address: data.address ?? '',
          bio: data.bio ?? '',
          ice: data.ice ?? '',
          inpe: data.inpe ?? '',
          appointment_duration: data.appointment_duration,
          working_hours: data.working_hours ?? DEFAULT_WORKING_HOURS,
        })
        setEnabledVitals(resolveEnabledVitals(data.enabled_vitals, data.specialty))
        setCustomVitals(((data.custom_vitals as VitalDef[] | null) ?? []))
        setExtraSpecs(((data.specialties as string[] | null) ?? [data.specialty]).filter((s) => s && s !== data.specialty))

        // Charge les dates bloquées
        const { data: blocked } = await supabase
          .from('blocked_dates')
          .select('*')
          .eq('doctor_id', data.id)
          .order('date', { ascending: true })
        setBlockedDates(blocked ?? [])

        // Charge les motifs de consultation
        const { data: types } = await supabase
          .from('consultation_types')
          .select('*')
          .eq('doctor_id', data.id)
          .eq('active', true)
          .order('created_at', { ascending: true })
        setConsultTypes(types ?? [])
      }
    }
    load()
  }, [])

  async function handleAddConsultType() {
    if (!doctor || !newTypeName.trim()) return
    setTypeLoading(true)
    const priceNum = parseFloat(newTypePrice.replace(',', '.'))
    const { data, error } = await supabase
      .from('consultation_types')
      .insert({
        doctor_id: doctor.id,
        name: newTypeName.trim().substring(0, 80),
        duration_minutes: parseInt(newTypeDuration, 10) || 30,
        default_price: !isNaN(priceNum) && priceNum >= 0 ? priceNum : null,
      })
      .select()
      .single()
    setTypeLoading(false)
    if (!error && data) {
      setConsultTypes((prev) => [...prev, data])
      setNewTypeName('')
      setNewTypeDuration('30')
      setNewTypePrice('')
    }
  }

  async function handleRemoveConsultType(id: string) {
    // Désactivation (pas de suppression) : les anciens RDV gardent leur motif
    await supabase.from('consultation_types').update({ active: false }).eq('id', id)
    setConsultTypes((prev) => prev.filter((t) => t.id !== id))
  }

  function updateDaySchedule(day: keyof WorkingHours, field: keyof DaySchedule, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        [day]: { ...prev.working_hours[day], [field]: value },
      },
    }))
  }

  // Récupère les pauses d'un jour (nouveau format breaks[] + ancien breakStart/breakEnd)
  function getBreaks(day: keyof WorkingHours): { start: string; end: string }[] {
    const d = form.working_hours[day]
    if (d.breaks && d.breaks.length > 0) return d.breaks
    if (d.breakStart && d.breakEnd) return [{ start: d.breakStart, end: d.breakEnd }]
    return []
  }

  function setBreaks(day: keyof WorkingHours, breaks: { start: string; end: string }[]) {
    setForm((prev) => {
      const d = { ...prev.working_hours[day], breaks }
      // Nettoie l'ancien format pour éviter toute ambiguïté
      delete (d as { breakStart?: string }).breakStart
      delete (d as { breakEnd?: string }).breakEnd
      return { ...prev, working_hours: { ...prev.working_hours, [day]: d } }
    })
  }

  function addBreak(day: keyof WorkingHours) {
    setBreaks(day, [...getBreaks(day), { start: '13:00', end: '15:00' }])
  }

  function removeBreak(day: keyof WorkingHours, index: number) {
    setBreaks(day, getBreaks(day).filter((_, i) => i !== index))
  }

  function updateBreak(day: keyof WorkingHours, index: number, field: 'start' | 'end', value: string) {
    setBreaks(day, getBreaks(day).map((b, i) => (i === index ? { ...b, [field]: value } : b)))
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
          whatsapp: form.whatsapp.trim() || null,
          public_email: form.public_email.trim() || null,
          specialty: form.specialty,
          specialties: Array.from(new Set([form.specialty, ...extraSpecs])).filter(Boolean),
          city: form.city,
          address: form.address,
          bio: form.bio || null,
          ice: form.ice.trim() || null,
          inpe: form.inpe.trim() || null,
          enabled_vitals: enabledVitals,
          custom_vitals: customVitals,
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

  async function handleAddBlockedDate() {
    if (!newBlockDate || !doctor) return
    setBlockLoading(true)

    // Construit la liste des dates entre début et fin (incluses).
    // Si pas de date de fin, on bloque juste un seul jour.
    const start = newBlockDate
    const end = newBlockEndDate && newBlockEndDate >= newBlockDate ? newBlockEndDate : newBlockDate
    const dates: string[] = []
    const cur = new Date(start + 'T00:00:00')
    const last = new Date(end + 'T00:00:00')
    while (cur <= last) {
      dates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }

    // Évite les doublons avec les dates déjà bloquées
    const already = new Set(blockedDates.map((b) => b.date))
    const toInsert = dates
      .filter((d) => !already.has(d))
      .map((d) => ({ doctor_id: doctor.id, date: d, reason: newBlockReason || null }))

    if (toInsert.length === 0) {
      setBlockLoading(false)
      setNewBlockDate(''); setNewBlockEndDate(''); setNewBlockReason('')
      return
    }

    const { data, error } = await supabase
      .from('blocked_dates')
      .insert(toInsert)
      .select()

    setBlockLoading(false)
    if (!error && data) {
      setBlockedDates((prev) => [...prev, ...data].sort((a, b) => a.date.localeCompare(b.date)))
      setNewBlockDate('')
      setNewBlockEndDate('')
      setNewBlockReason('')
    }
  }

  async function handleRemoveBlockedDate(id: string) {
    await supabase.from('blocked_dates').delete().eq('id', id)
    setBlockedDates((prev) => prev.filter((d) => d.id !== id))
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !doctor) return

    // Validation côté client
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image (JPG, PNG, WebP)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('L\'image ne doit pas dépasser 2 Mo')
      return
    }

    setPhotoUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${doctor.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('doctor-photos')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('doctor-photos')
        .getPublicUrl(path)

      // Ajoute un timestamp pour invalider le cache (stocké en base aussi,
      // sinon l'ancienne photo reste affichée partout via le cache CDN)
      const urlWithTs = `${publicUrl}?t=${Date.now()}`

      await supabase.from('doctors').update({ photo_url: urlWithTs }).eq('id', doctor.id)
      setPhotoUrl(urlWithTs)
    } catch {
      alert('Erreur lors de l\'upload. Réessayez.')
    } finally {
      setPhotoUploading(false)
      e.target.value = ''
    }
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
          <p className="text-sm text-gray-500 mt-1">Configurez votre cabinet</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" form="settings-form" disabled={loading}>
            {loading ? 'Sauvegarde…' : '💾 Enregistrer'}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" /> Sauvegardé !
            </span>
          )}
        </div>
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

      <form id="settings-form" onSubmit={handleSave} className="space-y-6">
        {/* Informations du cabinet */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary-500" />
              Informations du cabinet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email de connexion (lecture seule) */}
            <div className="space-y-1.5">
              <Label>Email de connexion</Label>
              <Input value={doctor?.email ?? ''} disabled className="bg-gray-50 text-gray-500" />
              <p className="text-xs text-gray-400">
                C&apos;est votre identifiant de connexion. Pour le modifier, contactez-nous à{' '}
                <a href="mailto:asmaadouach@gmail.com?subject=Changement%20d%27email%20MonRDV" className="text-primary-500 hover:underline">
                  asmaadouach@gmail.com
                </a>
              </p>
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Spécialité principale</Label>
                <Select
                  value={form.specialty}
                  onValueChange={(v) => { setForm({ ...form, specialty: v }); setExtraSpecs((prev) => prev.filter((s) => s !== v)) }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALITES_LIST.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_phone">Téléphone (pour appeler)</Label>
                <Input
                  id="s_phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="05 22 XX XX XX"
                />
              </div>
            </div>

            {/* Contact affiché aux patients sur la page publique */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s_whatsapp">WhatsApp (optionnel)</Label>
                <Input
                  id="s_whatsapp"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="06 XX XX XX XX"
                />
                <p className="text-xs text-gray-400">Un bouton « WhatsApp » apparaîtra sur votre page.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_public_email">E-mail de contact (optionnel)</Label>
                <Input
                  id="s_public_email"
                  type="email"
                  value={form.public_email}
                  onChange={(e) => setForm({ ...form, public_email: e.target.value })}
                  placeholder="cabinet@exemple.ma"
                />
                <p className="text-xs text-gray-400">Peut être identique ou différent de votre e-mail de connexion. Affiché aux patients.</p>
              </div>
            </div>

            {/* Spécialités additionnelles (médecin multi-spécialités) */}
            <div className="space-y-1.5">
              <Label>Autres spécialités (optionnel)</Label>
              <p className="text-xs text-gray-400">
                Si vous exercez plusieurs activités (ex : généraliste <strong>et</strong> esthétique),
                ajoutez-les ici : vous apparaîtrez dans la recherche sous chacune, et le patient
                choisira la spécialité à la réservation.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {SPECIALITES_LIST.filter((s) => s !== form.specialty && s !== 'Autre').map((s) => {
                  const on = extraSpecs.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setExtraSpecs((prev) => on ? prev.filter((x) => x !== s) : [...prev, s])}
                      className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                        on ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200 hover:border-primary-300'
                      }`}
                    >
                      {on ? '✓ ' : '+ '}{s}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Ville</Label>
              <Select
                value={form.city}
                onValueChange={(v) => setForm({ ...form, city: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une ville…" />
                </SelectTrigger>
                <SelectContent>
                  {VILLES_MAROC.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Adresse du cabinet */}
            <div className="space-y-1.5">
              <Label htmlFor="s_address" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                Adresse du cabinet
              </Label>
              <Input
                id="s_address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Rue Mohammed V, Casablanca"
              />
              <p className="text-xs text-gray-400">Affichée sur votre page de réservation publique</p>
            </div>

            {/* Bio */}
            <div className="space-y-1.5">
              <Label htmlFor="s_bio">Présentation (optionnel)</Label>
              <textarea
                id="s_bio"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Ex : Spécialisé en cardiologie interventionnelle, diplômé de la faculté de médecine de Casablanca…"
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
              <p className="text-xs text-gray-400">{form.bio.length}/500 caractères · Affichée sur votre page publique</p>
            </div>

            {/* Identifiants légaux (facture) */}
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="s_ice">ICE (optionnel)</Label>
                <Input
                  id="s_ice"
                  value={form.ice}
                  onChange={(e) => setForm({ ...form, ice: e.target.value })}
                  placeholder="Identifiant Commun de l'Entreprise"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s_inpe">INPE (optionnel)</Label>
                <Input
                  id="s_inpe"
                  value={form.inpe}
                  onChange={(e) => setForm({ ...form, inpe: e.target.value })}
                  placeholder="N° professionnel de santé"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-2">
              Ces identifiants apparaîtront sur les factures/reçus imprimés.
            </p>
          </CardContent>
        </Card>

        {/* Photo de profil */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary-500" />
              Photo de profil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-5">
              {/* Aperçu */}
              <div className="shrink-0">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Photo de profil"
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold border-2 border-gray-200">
                    {form.name.charAt(0).toUpperCase() || 'D'}
                  </div>
                )}
              </div>
              {/* Upload */}
              <div className="space-y-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={photoUploading}
                  />
                  <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium transition-colors
                    ${photoUploading ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50 bg-white cursor-pointer'}`}>
                    <Camera className="h-4 w-4 text-gray-500" />
                    {photoUploading ? 'Upload en cours…' : photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
                  </span>
                </label>
                <p className="text-xs text-gray-400">JPG, PNG ou WebP · Max 2 Mo</p>
              </div>
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

        {/* Motifs de consultation (durées variables) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary-500" />
              Motifs de consultation
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              Optionnel — si vous définissez des motifs, le patient choisit le sien à la réservation
              et la durée du créneau s&apos;adapte automatiquement (ex : Première consultation 45 min, Suivi 15 min).
              Sans motif, la durée par défaut ci-dessus s&apos;applique.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Liste des motifs */}
            {consultTypes.length > 0 && (
              <div className="space-y-2">
                {consultTypes.map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{t.name}</span>
                      <span className="text-xs text-primary-600 bg-primary-50 rounded-full px-2 py-0.5 shrink-0">
                        {t.duration_minutes} min
                      </span>
                      {t.default_price != null && (
                        <span className="text-xs text-green-700 bg-green-50 rounded-full px-2 py-0.5 shrink-0">
                          {t.default_price} DH
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveConsultType(t.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      title="Supprimer ce motif"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Ajout d'un motif */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Ex : Première consultation"
                className="flex-1"
              />
              <Select value={newTypeDuration} onValueChange={setNewTypeDuration}>
                <SelectTrigger className="w-32 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="20">20 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 heure</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-28 shrink-0">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={newTypePrice}
                  onChange={(e) => setNewTypePrice(e.target.value)}
                  placeholder="Tarif"
                  className="pr-9"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">DH</span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddConsultType}
                disabled={!newTypeName.trim() || typeLoading}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                {typeLoading ? 'Ajout…' : 'Ajouter'}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              Le tarif est optionnel — s&apos;il est renseigné, le montant sera pré-rempli à l&apos;encaissement.
            </p>
          </CardContent>
        </Card>

        {/* Constantes vitales suivies */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary-500" />
              Constantes suivies
            </CardTitle>
            <p className="text-xs text-gray-400 mt-1">
              Cochez les constantes utiles à votre pratique — elles apparaîtront dans la fiche patient.
              Les valeurs proposées par défaut dépendent de votre spécialité ; un dentiste, par exemple,
              n&apos;en a généralement aucune.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VITAL_DEFS.map((v) => {
                const on = enabledVitals.includes(v.key)
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setEnabledVitals((prev) => on ? prev.filter((k) => k !== v.key) : [...prev, v.key])}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
                      on ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-primary-500 border-primary-500' : 'border-gray-300'}`}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="truncate">{v.label}</span>
                  </button>
                )
              })}
              {/* Constantes personnalisées du médecin */}
              {customVitals.map((v) => {
                const on = enabledVitals.includes(v.key)
                return (
                  <div key={v.key} className={`flex items-center gap-1 px-2 py-2 rounded-lg border text-sm transition-colors ${
                    on ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setEnabledVitals((prev) => on ? prev.filter((k) => k !== v.key) : [...prev, v.key])}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-primary-500 border-primary-500' : 'border-gray-300'}`}>
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="truncate">{v.label}{v.unit ? ` (${v.unit})` : ''}</span>
                    </button>
                    <button
                      type="button"
                      title="Supprimer cette constante"
                      onClick={() => {
                        setCustomVitals((prev) => prev.filter((x) => x.key !== v.key))
                        setEnabledVitals((prev) => prev.filter((k) => k !== v.key))
                      }}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Ajouter une constante personnalisée */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={newVitalLabel}
                onChange={(e) => setNewVitalLabel(e.target.value)}
                placeholder="Nouvelle constante (ex. HbA1c)"
                className="flex-1 min-w-[160px] h-9 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-vital-btn')?.click() } }}
              />
              <Input
                value={newVitalUnit}
                onChange={(e) => setNewVitalUnit(e.target.value)}
                placeholder="Unité (ex. %)"
                className="w-28 h-9 text-sm"
              />
              <button
                id="add-vital-btn"
                type="button"
                onClick={() => {
                  const label = newVitalLabel.trim()
                  if (!label) return
                  const slug = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)
                  const key = `c_${slug || 'v'}_${Math.random().toString(36).slice(2, 6)}`
                  setCustomVitals((prev) => [...prev, { key, label, unit: newVitalUnit.trim() }])
                  setEnabledVitals((prev) => [...prev, key])
                  setNewVitalLabel('')
                  setNewVitalUnit('')
                }}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Créez vos propres constantes (ex. cardiologue : HbA1c, bilan lipidique, créatinine, INR, TP…). Elles s&apos;ajoutent à la saisie dans la fiche patient.
            </p>

            {enabledVitals.length === 0 && (
              <p className="text-xs text-gray-400 mt-3">Aucune constante suivie — la section n&apos;apparaîtra pas dans les fiches patient.</p>
            )}
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
                  <div className="flex items-start gap-4">
                    {/* Activer/désactiver le jour */}
                    <div className="flex items-center gap-2 w-32 shrink-0 pt-1.5">
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
                      <div className="space-y-2">
                        {/* Horaire d'ouverture */}
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
                        {/* Pauses (multiples) */}
                        {getBreaks(day).map((br, i) => (
                          <div key={i} className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400 w-16">Pause :</span>
                            <Input
                              type="time"
                              value={br.start}
                              onChange={(e) => updateBreak(day, i, 'start', e.target.value)}
                              className="w-28 text-sm"
                            />
                            <span className="text-gray-400 text-sm">—</span>
                            <Input
                              type="time"
                              value={br.end}
                              onChange={(e) => updateBreak(day, i, 'end', e.target.value)}
                              className="w-28 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeBreak(day, i)}
                              className="text-gray-400 hover:text-red-500"
                              aria-label="Retirer cette pause"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        {/* Bouton ajouter une pause */}
                        <button
                          type="button"
                          onClick={() => addBreak(day)}
                          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          <Plus className="h-3.5 w-3.5" /> Ajouter une pause
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 pt-1.5">Fermé</span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Dates bloquées */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-primary-500" />
              Dates bloquées (congés / absences)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">
              Aucun créneau ne sera disponible pour les patients ces jours-là. Pour des vacances, indiquez une date de fin.
            </p>

            {/* Ajouter une date ou une période */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-400">Du</span>
              <Input
                type="date"
                value={newBlockDate}
                onChange={(e) => setNewBlockDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-40"
              />
              <span className="text-xs text-gray-400">au (optionnel)</span>
              <Input
                type="date"
                value={newBlockEndDate}
                onChange={(e) => setNewBlockEndDate(e.target.value)}
                min={newBlockDate || new Date().toISOString().split('T')[0]}
                className="w-40"
              />
              <Input
                value={newBlockReason}
                onChange={(e) => setNewBlockReason(e.target.value)}
                placeholder="Message affiché aux patients (ex : En congé, retour le 21 juin)"
                className="flex-1 min-w-[140px]"
              />
              <Button
                type="button"
                onClick={handleAddBlockedDate}
                disabled={!newBlockDate || blockLoading}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                {blockLoading ? 'Enregistrement…' : 'Confirmer le congé'}
              </Button>
            </div>

            {/* Liste des dates bloquées */}
            {blockedDates.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Aucune date bloquée</p>
            ) : (
              <div className="space-y-2">
                {blockedDates.map((bd) => (
                  <div key={bd.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-gray-800">
                        {new Date(bd.date + 'T00:00:00').toLocaleDateString('fr-MA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      {bd.reason && (
                        <span className="text-xs text-gray-400 ml-2">— {bd.reason}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveBlockedDate(bd.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
