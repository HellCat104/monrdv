'use client'

// Fiche patient « forfait Agenda » — volontairement minimale (CNDP) :
// nom, prénom, téléphone et notes libres. Aucune donnée de santé ni champ
// d'identité étendu (naissance, CIN, mutuelle…) : tout cela relève du
// forfait Cabinet complet (voir PatientDossier.tsx).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getInitials, formatDateFr, formatDateShort, getNowInMaroc } from '@/lib/utils'
import { STATUS_LABELS, type Patient, type AppointmentStatus, type Recall } from '@/types'
import { ArrowLeft, Phone, Save, Check, Calendar, Wallet, BellRing, Plus, X } from 'lucide-react'
import AlerteAdresseEmail, { memeAdresse } from '@/components/shared/AlerteAdresseEmail'

interface LiteAppointment {
  id: string
  date: string
  time: string
  status: AppointmentStatus
  notes: string | null
  amount_due: number | null
  amount_paid: number | null
  invoice_no: string | null
}

export default function PatientDossierLite({ initialPatient }: { initialPatient: Patient }) {
  const supabase = createClient()
  const router = useRouter()
  const patient = initialPatient

  const [editFirstName, setEditFirstName] = useState(patient.first_name ?? '')
  const [editLastName, setEditLastName] = useState(patient.last_name ?? '')
  const [editPhone, setEditPhone] = useState(patient.phone ?? '')
  const [editNotes, setEditNotes] = useState(patient.notes ?? '')
  // L'e-mail manquait à cet écran. Ce n'est pas une donnée de santé — c'est une
  // coordonnée, au même titre que le téléphone — et sans lui le rappel de suivi
  // ci-dessous ne part jamais : la tâche planifiée marque la ligne « traitée »
  // et passe au suivant, sans rien dire à personne.
  const [editEmail, setEditEmail] = useState(patient.email ?? '')
  // Rebond connu (webhook Resend, v59) sur l'adresse ENREGISTRÉE — même règle
  // que le dossier complet (PatientDossier.tsx) : effacé dès qu'une autre
  // adresse est enregistrée, comme le fait la base.
  const [rebond, setRebond] = useState(patient.email_bounce_reason
    ? { raison: patient.email_bounce_reason, depuis: patient.email_bounced_at ?? null, adresse: patient.email ?? '' }
    : null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [appointments, setAppointments] = useState<LiteAppointment[]>([])

  // Rappel de suivi : « revenez dans 6 mois ». Il manquait à cet écran alors
  // que tout le mécanisme existe (table recalls, e-mail, tâche planifiée
  // quotidienne) — un cabinet en forfait Agenda ne pouvait en programmer aucun.
  // Ce n'est pas une donnée de santé : une date et un motif libre, au même
  // titre que le champ Notes que ce forfait possède déjà.
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [recallDate, setRecallDate] = useState('')
  const [recallReason, setRecallReason] = useState('')
  const [addingRecall, setAddingRecall] = useState(false)
  const maintenant = getNowInMaroc()
  const todayStr = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`

  useEffect(() => {
    supabase
      .from('appointments')
      .select('id, date, time, status, notes, amount_due, amount_paid, invoice_no')
      .eq('patient_id', patient.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(50)
      .then(({ data }) => setAppointments((data ?? []) as LiteAppointment[]))
    supabase
      .from('recalls')
      .select('*')
      .eq('patient_id', patient.id)
      .order('due_date', { ascending: true })
      .then(({ data }) => setRecalls((data ?? []) as Recall[]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id])

  // Ce que le patient doit encore, consultation par consultation.
  const impayes = appointments
    .map((a) => ({ ...a, reste: Number(a.amount_due ?? 0) - Number(a.amount_paid ?? 0) }))
    .filter((a) => a.reste > 0)
  const totalDu = impayes.reduce((s, a) => s + a.reste, 0)

  async function handleSave() {
    if (!editFirstName.trim() || !editLastName.trim() || !editPhone.trim()) return
    setSaving(true)
    setSaveError('')
    const email = editEmail.trim() || null
    const { error } = await supabase
      .from('patients')
      .update({
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim(),
        email,
        notes: editNotes.trim() || null,
      })
      .eq('id', patient.id)
    setSaving(false)
    // Un échec était muet : le bouton revenait à « Enregistrer » et le
    // praticien croyait l'adresse corrigée alors que l'ancienne — celle qui
    // rebondit — restait en base.
    if (error) {
      setSaveError('L’enregistrement a échoué. Vérifiez votre connexion et réessayez.')
      return
    }
    if (rebond && !memeAdresse(email, rebond.adresse)) setRebond(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  async function addRecall() {
    if (!recallDate) return
    setAddingRecall(true)
    const { data, error } = await supabase
      .from('recalls')
      .insert({
        doctor_id: patient.doctor_id,
        patient_id: patient.id,
        due_date: recallDate,
        reason: recallReason.trim() || null,
      })
      .select()
      .single()
    setAddingRecall(false)
    // Un échec silencieux laisserait croire le rappel programmé : on n'ajoute
    // la ligne à l'écran que si la base l'a réellement acceptée.
    if (error || !data) return
    setRecalls((prev) => [...prev, data as Recall].sort((a, b) => a.due_date.localeCompare(b.due_date)))
    setRecallDate('')
    setRecallReason('')
  }

  async function cancelRecall(id: string) {
    const { error } = await supabase.from('recalls').delete().eq('id', id)
    if (error) return
    setRecalls((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => router.push('/patients')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux patients
      </button>

      {/* Identité */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg">
            {getInitials(patient.first_name ?? '', patient.last_name ?? '')}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {patient.first_name} {patient.last_name}
            </h1>
            {patient.phone && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {patient.phone}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="lite-first">Prénom *</Label>
            <Input id="lite-first" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="lite-last">Nom *</Label>
            <Input id="lite-last" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lite-phone">Téléphone *</Label>
            <Input id="lite-phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lite-email">E-mail</Label>
            <Input id="lite-email" type="email" value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Pour les confirmations et les rappels"
              className={rebond && memeAdresse(editEmail, rebond.adresse) ? 'border-red-300' : ''} />
            {rebond && (memeAdresse(editEmail, rebond.adresse)
              ? <AlerteAdresseEmail raison={rebond.raison} depuis={rebond.depuis} cible="patient" />
              : <p className="text-xs text-amber-700">Nouvelle adresse : cliquez sur « Enregistrer » pour qu&apos;elle remplace l&apos;ancienne.</p>)}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lite-notes">Notes</Label>
            <textarea
              id="lite-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={4}
              placeholder="Ex. préfère le matin, à rappeler pour confirmer…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <Button onClick={handleSave} disabled={saving}>
            {saved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {saved ? 'Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      {/* Reste dû — visible dès l'ouverture de la fiche, sinon le praticien
          ne découvre l'impayé qu'en fouillant l'historique. */}
      {totalDu > 0 && (
        <div className="bg-orange-50 rounded-2xl border-2 border-orange-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <Wallet className="h-5 w-5 text-orange-600 shrink-0" />
              <div>
                <p className="font-bold text-orange-800">
                  Reste à payer : {totalDu.toLocaleString('fr-FR')} DH
                </p>
                <p className="text-xs text-orange-700 mt-0.5">
                  {impayes.length} consultation{impayes.length > 1 ? 's' : ''} non soldée{impayes.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="text-xs text-orange-700 space-y-0.5 text-right">
              {impayes.slice(0, 3).map((a) => (
                <p key={a.id}>
                  {formatDateFr(a.date)}
                  {a.invoice_no ? ` · ${a.invoice_no}` : ''} — <b>{a.reste.toLocaleString('fr-FR')} DH</b>
                </p>
              ))}
              {impayes.length > 3 && <p className="italic">+ {impayes.length - 3} autre{impayes.length - 3 > 1 ? 's' : ''}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Rappel de suivi — avant l'historique : il regarde vers l'avant,
          les rendez-vous passés regardent en arrière. */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <BellRing className="h-4 w-4 text-primary-600" /> Rappel de suivi
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Un e-mail « il est temps de reprendre rendez-vous » part automatiquement à la date choisie.
        </p>

        {recalls.filter((r) => r.status !== 'cancelled').length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {recalls.filter((r) => r.status !== 'cancelled').map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700">
                  {formatDateShort(r.due_date)}{r.reason ? ` — ${r.reason}` : ''}
                  {r.status === 'sent' && <span className="text-xs text-green-600 ml-2">envoyé</span>}
                </span>
                {r.status === 'pending' && (
                  <button onClick={() => cancelRecall(r.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Annuler ce rappel">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!editEmail.trim() && (
          <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Ce patient n&apos;a pas d&apos;e-mail : le rappel serait enregistré mais
            <strong> aucun message ne partirait</strong>. Renseignez son adresse ci-dessus.
          </p>
        )}
        {/* Même avertissement, pour l'adresse qui existe mais ne reçoit rien :
            sans lui, ce bloc prévenait du cas « pas d'e-mail » et se taisait
            sur le cas « e-mail qui rebondit », qui a le même effet. */}
        {editEmail.trim() && rebond && memeAdresse(editEmail, rebond.adresse) && (
          <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            L&apos;adresse e-mail de ce patient ne fonctionne pas : le rappel
            <strong> ne lui parviendrait pas</strong>. Corrigez-la ci-dessus.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Input type="date" value={recallDate} min={todayStr}
            onChange={(e) => setRecallDate(e.target.value)} className="sm:w-44" />
          <Input value={recallReason} onChange={(e) => setRecallReason(e.target.value)}
            placeholder="Motif (facultatif) — ex. contrôle annuel" className="flex-1" />
          <Button type="button" variant="outline" onClick={addRecall}
            disabled={!recallDate || addingRecall} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" /> Programmer
          </Button>
        </div>
      </div>

      {/* Historique des rendez-vous (sans contenu médical) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary-600" /> Rendez-vous
        </h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun rendez-vous pour ce patient.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {appointments.map((apt) => (
              <li key={apt.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-900">
                  {formatDateFr(apt.date)} · {apt.time?.slice(0, 5)}
                </span>
                <span className="text-gray-500 truncate flex-1">{apt.notes ?? ''}</span>
                <span className="text-xs font-medium text-gray-500 shrink-0">
                  {STATUS_LABELS[apt.status] ?? apt.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
