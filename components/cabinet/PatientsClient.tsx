'use client'

// Fiches patients côté secrétaire : liste, création (CIN + mutuelle), détail
// (médical / ordonnances / constantes / devis selon permissions), export et
// suppression.
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDateFr, ageFromBirthDate, formatAge } from '@/lib/utils'
import { Users, UserPlus, Search, Download, Trash2, HeartPulse, Pill, Activity, Plus, CreditCard, ShieldPlus, Mail, AlertTriangle } from 'lucide-react'
import { MUTUELLES_MAROC, type StaffPermissions, type VitalDef } from '@/types'
import AlerteAdresseEmail from '@/components/shared/AlerteAdresseEmail'
// Le MÊME écran de devis que celui du médecin, en mode secrétaire : les calculs
// de lib/devis.ts (total, versé, reste dû) doivent donner le même chiffre des
// deux côtés du bureau — une copie finirait par en donner un autre.
import QuotesCard from '@/components/dashboard/QuotesCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export default function PatientsClient({ permissions }: { permissions: StaffPermissions }) {
  const [patients, setPatients] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Création
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', age: '', birth_date: '', cin: '', mutuelle: '' })
  const [mutuelleOther, setMutuelleOther] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Détail
  const [detail, setDetail] = useState<Row | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [savingVital, setSavingVital] = useState(false)
  const [detailErreur, setDetailErreur] = useState('')
  const [listeErreur, setListeErreur] = useState('')

  // Correction de l'adresse e-mail depuis la fiche. null = pas en cours
  // d'édition ; une chaîne (même vide) = champ ouvert.
  const [emailEdition, setEmailEdition] = useState<string | null>(null)
  const [emailErreur, setEmailErreur] = useState('')
  const [emailEnCours, setEmailEnCours] = useState(false)

  async function load() {
    const res = await fetch('/api/cabinet/patients').catch(() => null)
    if (res?.ok) {
      const d = await res.json()
      setPatients(d.patients ?? [])
      setListeErreur('')
    } else {
      // Sans ce message, une erreur de chargement s'affichait « Aucun patient ».
      setListeErreur('La liste des patients n’a pas pu être chargée. Rechargez la page.')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return patients
    return patients.filter((p) =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
      (p.phone ?? '').includes(q) ||
      (p.cin ?? '').toLowerCase().includes(q))
  }, [patients, search])

  async function createPatient(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    setSaving(true)
    try {
      const res = await fetch('/api/cabinet/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name, last_name: form.last_name, phone: form.phone,
          age: form.age ? parseInt(form.age, 10) : undefined,
          cin: form.cin || undefined, mutuelle: form.mutuelle || undefined,
          birth_date: form.birth_date || undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setAddError(d.error || 'Erreur'); return }
      setPatients((prev) => [d.patient, ...prev])
      setAddOpen(false)
      setForm({ first_name: '', last_name: '', phone: '', age: '', birth_date: '', cin: '', mutuelle: '' })
      setMutuelleOther(false)
    } finally {
      setSaving(false)
    }
  }

  async function removePatient(p: Row) {
    if (!confirm(`Supprimer définitivement la fiche de ${p.first_name} ${p.last_name} ?`)) return
    const res = await fetch(`/api/cabinet/patients?id=${p.id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Échec de la suppression'); return }
    setPatients((prev) => prev.filter((x) => x.id !== p.id))
    setDetail(null)
  }

  function exportCSV() {
    const esc = (v: unknown) => {
      let s = String(v ?? '')
      if (/^[=+\-@]/.test(s)) s = `'${s}`
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const headers = ['Prénom', 'Nom', 'Téléphone', 'Âge', 'CIN', 'Mutuelle']
    const rows = filtered.map((p) => [p.first_name, p.last_name, p.phone, p.age ?? '', p.cin ?? '', p.mutuelle ?? ''])
    const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `patients-cabinet-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  async function openDetail(p: Row) {
    setDetail({ patient: p })
    setDetailLoading(true)
    setDetailErreur('')
    setVitalInput({})
    setEmailEdition(null)
    setEmailErreur('')
    const res = await fetch(`/api/cabinet/patients/${p.id}`).catch(() => null)
    if (res?.ok) setDetail(await res.json())
    else setDetailErreur('La fiche n’a pas pu être chargée entièrement. Fermez-la et rouvrez-la.')
    setDetailLoading(false)
  }

  async function enregistrerEmail() {
    const id = detail?.patient?.id
    if (!id || emailEdition === null) return
    setEmailErreur('')
    setEmailEnCours(true)
    const res = await fetch(`/api/cabinet/patients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailEdition }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    setEmailEnCours(false)
    if (!res) { setEmailErreur('Pas de connexion. Vérifiez internet et réessayez.'); return }
    if (!res.ok || !d.patient) { setEmailErreur(d.error || 'L’adresse n’a pas pu être enregistrée. Réessayez.'); return }
    // La réponse du serveur fait foi : si l'adresse a changé, la base a
    // effacé le drapeau de rebond, et la liste perd son indicateur.
    setDetail((prev) => prev ? { ...prev, patient: { ...prev.patient, ...d.patient } } : prev)
    setPatients((prev) => prev.map((x) => x.id === id ? { ...x, email_bounce_reason: d.patient.email_bounce_reason } : x))
    setEmailEdition(null)
  }

  async function addVital() {
    if (!detail?.patient) return
    const values: Record<string, number> = {}
    for (const [k, v] of Object.entries(vitalInput)) {
      const n = parseFloat(v)
      if (Number.isFinite(n)) values[k] = n
    }
    if (Object.keys(values).length === 0) return
    setSavingVital(true)
    const res = await fetch(`/api/cabinet/patients/${detail.patient.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    })
    const d = await res.json().catch(() => ({}))
    setSavingVital(false)
    if (!res.ok) { alert(d.error || 'Échec'); return }
    setDetail((prev) => prev ? { ...prev, vitals: [d.vital, ...(prev.vitals ?? [])] } : prev)
    setVitalInput({})
  }

  const vitalDefs: VitalDef[] = detail?.vitalDefs ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary-500" /> Patients ({patients.length})
        </h1>
        <div className="flex items-center gap-2">
          {permissions.export_patients && (
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Exporter
            </Button>
          )}
          <Button size="sm" onClick={() => { setAddError(''); setAddOpen(true) }}>
            <UserPlus className="h-4 w-4 mr-1" /> Nouveau patient
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, téléphone ou CIN…" className="pl-9" />
      </div>

      {listeErreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{listeErreur}</p>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">Aucun patient.</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => openDetail(p)} className="w-full text-left flex items-center gap-3 p-3.5 hover:bg-gray-50/60">
              <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-semibold shrink-0">
                {(p.first_name?.[0] ?? '').toUpperCase()}{(p.last_name?.[0] ?? '').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.first_name} {p.last_name}{p.age != null ? ` · ${p.age} ans` : ''}</p>
                <p className="text-xs text-gray-500 truncate">
                  {p.phone}{p.cin ? ` · CIN ${p.cin}` : ''}{p.mutuelle ? ` · ${p.mutuelle}` : ''}
                </p>
                {/* Signalé dès la liste : la secrétaire qui a le patient au
                    téléphone doit pouvoir le voir sans ouvrir chaque fiche. */}
                {p.email_bounce_reason && (
                  <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> E-mail qui ne fonctionne pas — à corriger
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Dialog création */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau patient</DialogTitle></DialogHeader>
          <form onSubmit={createPatient} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p_first">Prénom *</Label>
                <Input id="p_first" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p_last">Nom *</Label>
                <Input id="p_last" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p_phone">Téléphone *</Label>
                <Input id="p_phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="06 12 34 56 78" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p_birth">Date de naissance</Label>
                <Input id="p_birth" type="date" max={new Date().toISOString().slice(0, 10)}
                  value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
                {formatAge(form.birth_date) && <p className="text-xs font-medium text-primary-600">👶 {formatAge(form.birth_date)}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p_age">Âge {form.birth_date && <span className="text-[11px] text-gray-400">(calculé)</span>}</Label>
                <Input id="p_age" type="number" min="0" max="120"
                  value={form.birth_date ? (ageFromBirthDate(form.birth_date) ?? '') : form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                  disabled={!!form.birth_date}
                  className={form.birth_date ? 'bg-gray-50 text-gray-500' : ''} />
              </div>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p_cin">CIN</Label>
                <Input id="p_cin" value={form.cin} onChange={(e) => setForm({ ...form, cin: e.target.value.toUpperCase() })} placeholder="AB123456" />
              </div>
              <div className="space-y-1.5">
                <Label>Mutuelle</Label>
                <Select
                  value={mutuelleOther ? 'Autre' : (form.mutuelle || undefined)}
                  onValueChange={(v) => {
                    if (v === 'Autre') { setMutuelleOther(true); setForm((f) => ({ ...f, mutuelle: '' })) }
                    else { setMutuelleOther(false); setForm((f) => ({ ...f, mutuelle: v })) }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {MUTUELLES_MAROC.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    <SelectItem value="Autre">Autre…</SelectItem>
                  </SelectContent>
                </Select>
                {mutuelleOther && (
                  <Input
                    value={form.mutuelle}
                    onChange={(e) => setForm({ ...form, mutuelle: e.target.value })}
                    placeholder="Précisez la mutuelle"
                    className="mt-1.5"
                  />
                )}
              </div>
            </div>
            {addError && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{addError}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Création…' : 'Créer la fiche'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog détail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.patient ? `${detail.patient.first_name} ${detail.patient.last_name}` : ''}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : detail && (
            <div className="space-y-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-gray-700">📞 {detail.patient.phone}{detail.patient.age != null ? ` · ${detail.patient.age} ans` : ''}</p>
                {detail.patient.cin && <p className="text-gray-600 flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> CIN : {detail.patient.cin}</p>}
                {detail.patient.mutuelle && <p className="text-gray-600 flex items-center gap-1.5"><ShieldPlus className="h-3.5 w-3.5" /> Mutuelle : {detail.patient.mutuelle}</p>}

                {/* E-mail : absent de la fiche tant que le détail n'est pas
                    chargé (la liste ne le lit pas) — on n'affiche donc rien
                    plutôt qu'un « pas d'e-mail » faux. */}
                {detail.patient.email !== undefined && (emailEdition === null ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-gray-600 flex items-center gap-1.5 min-w-0">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{detail.patient.email || <span className="text-gray-400">Pas d’e-mail</span>}</span>
                    </p>
                    <button type="button" onClick={() => { setEmailEdition(detail.patient.email ?? ''); setEmailErreur('') }}
                      className="text-xs font-medium text-primary-600 hover:underline shrink-0">
                      {detail.patient.email ? 'Modifier' : 'Ajouter'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="p_email_edit">Adresse e-mail</Label>
                    <Input id="p_email_edit" type="email" autoFocus value={emailEdition}
                      onChange={(e) => setEmailEdition(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') enregistrerEmail() }}
                      placeholder="exemple : nom@gmail.com" />
                    <p className="text-[11px] text-gray-400">Pour les confirmations et les rappels. Laissez vide si le patient n’a pas d’e-mail.</p>
                    {emailErreur && <p className="text-xs text-red-600">{emailErreur}</p>}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={enregistrerEmail} disabled={emailEnCours}>
                        {emailEnCours ? 'Enregistrement…' : 'Enregistrer'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={emailEnCours} onClick={() => { setEmailEdition(null); setEmailErreur('') }}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ))}
                {detail.patient.email_bounce_reason && emailEdition === null && (
                  <AlerteAdresseEmail raison={detail.patient.email_bounce_reason} depuis={detail.patient.email_bounced_at} cible="patient" compact>
                    <Button type="button" size="sm" onClick={() => { setEmailEdition(detail.patient.email ?? ''); setEmailErreur('') }}>
                      Corriger l’adresse
                    </Button>
                  </AlerteAdresseEmail>
                )}
              </div>
              {detailErreur && <p className="text-xs text-red-600">{detailErreur}</p>}

              {/* Parents / tuteurs (pédiatrie) — c'est le parent qu'on appelle, pas l'enfant */}
              {(detail.patient.parent1_name || detail.patient.parent2_name) && (
                <div className="bg-pink-50 border border-pink-100 rounded-lg p-3">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-1.5">
                    <Users className="h-4 w-4 text-pink-500" /> Parents / tuteurs
                  </h3>
                  {([1, 2] as const).map((n) => {
                    const name = n === 1 ? detail.patient.parent1_name : detail.patient.parent2_name
                    const tel  = n === 1 ? detail.patient.parent1_phone : detail.patient.parent2_phone
                    if (!name && !tel) return null
                    const isPrimary = detail.patient.primary_contact === `parent${n}`
                    return (
                      <p key={n} className="text-gray-700 flex items-center gap-1.5 flex-wrap">
                        {isPrimary && <span title="À prévenir en priorité" className="text-amber-500">★</span>}
                        <span className={isPrimary ? 'font-semibold' : ''}>{name || `Parent ${n}`}</span>
                        {tel && <a href={`tel:${tel}`} className="text-primary-600 hover:underline">📞 {tel}</a>}
                      </p>
                    )
                  })}
                </div>
              )}

              {/* Antécédents — seulement si permission médicale */}
              {detail.medical && (
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-1"><HeartPulse className="h-4 w-4 text-orange-400" /> Antécédents</h3>
                  {detail.medical.allergies && <p className="text-red-600"><b>Allergies :</b> {detail.medical.allergies}</p>}
                  {detail.medical.chronic_conditions && <p className="text-gray-700"><b>Maladies chroniques :</b> {detail.medical.chronic_conditions}</p>}
                  {detail.medical.current_treatments && <p className="text-gray-700"><b>Traitements :</b> {detail.medical.current_treatments}</p>}
                  {!detail.medical.allergies && !detail.medical.chronic_conditions && !detail.medical.current_treatments && <p className="text-gray-400">Aucun antécédent renseigné.</p>}
                </div>
              )}

              {/* Ordonnances — si permission */}
              {permissions.prescriptions_view && (
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-1"><Pill className="h-4 w-4 text-primary-500" /> Ordonnances ({(detail.prescriptions ?? []).length})</h3>
                  {(detail.prescriptions ?? []).length === 0 ? <p className="text-gray-400">Aucune.</p> : (
                    <div className="space-y-2">
                      {(detail.prescriptions as Row[]).map((pr) => (
                        <div key={pr.id} className="border border-gray-100 rounded-lg p-2.5">
                          <p className="text-[11px] text-gray-400 mb-1">{formatDateFr(pr.created_at)}</p>
                          <p className="whitespace-pre-wrap text-gray-700">{pr.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Constantes — saisie si permission */}
              {permissions.vitals_entry && (
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center gap-1.5 mb-2"><Activity className="h-4 w-4 text-primary-500" /> Constantes</h3>
                  {vitalDefs.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                        {vitalDefs.map((v) => (
                          <div key={v.key} className="relative">
                            <Input type="number" step={v.step ?? 'any'} inputMode="decimal"
                              value={vitalInput[v.key] ?? ''}
                              onChange={(e) => setVitalInput((prev) => ({ ...prev, [v.key]: e.target.value }))}
                              placeholder={v.label} className="pr-10 text-sm" aria-label={v.label} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{v.unit}</span>
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addVital} disabled={savingVital} className="mb-2">
                        <Plus className="h-4 w-4 mr-1" /> {savingVital ? 'Enregistrement…' : 'Enregistrer'}
                      </Button>
                    </>
                  )}
                  {(detail.vitals as Row[] ?? []).map((m) => (
                    <div key={m.id} className="bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
                      <p className="text-[11px] text-gray-400">{formatDateFr(m.measured_at)}</p>
                      <p className="text-gray-700">
                        {Object.entries(m.values as Record<string, number>).map(([k, val]) => `${vitalDefs.find((d) => d.key === k)?.label ?? k} : ${val} ${vitalDefs.find((d) => d.key === k)?.unit ?? ''}`).join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Devis — permission « Afficher les devis ». Le bouton
                  « Encaisser » n'apparaît qu'avec la permission d'encaissement,
                  et l'écran n'est ici qu'un confort : /api/cabinet/quotes refuse
                  la lecture sans la première, l'écriture sans la seconde, et
                  n'offre aucun autre verbe. `dental={false}` : la saisie d'un
                  acte (donc le champ « Dent ») n'existe pas en mode secrétaire. */}
              {permissions.quotes_view && detail.patient?.id && (
                <div className="border-t border-gray-100 pt-3">
                  <QuotesCard
                    patientId={detail.patient.id}
                    dental={false}
                    mode="secretaire"
                    canPay={permissions.quotes_payment}
                  />
                </div>
              )}

              {/* Suppression — permission sécurité */}
              {permissions.delete_patient && (
                <div className="border-t border-gray-100 pt-3 text-right">
                  <button onClick={() => removePatient(detail.patient)} className="text-xs text-gray-400 hover:text-red-500 inline-flex items-center gap-1">
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer cette fiche
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
