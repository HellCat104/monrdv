'use client'

// Poste de consultation : 3 colonnes (dossier / actes+note+constantes / actions).
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateFr, formatAge } from '@/lib/utils'
import { PSY_NOTE_TEMPLATE, type VitalDef } from '@/types'
import DentalChart from '@/components/dashboard/DentalChart'
import FeuilleSoinsCard, { type ActeSuggere } from '@/components/dashboard/FeuilleSoinsCard'
import ActesDuJourCard from './ActesDuJourCard'
import {
  ArrowLeft, HeartPulse, Pill, Activity, Check, Save, FileText, Wallet, Printer,
  AlertTriangle, CheckCircle2, Plus,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

/**
 * Historique replié de la colonne gauche.
 *
 * Les trois cartes du dossier (constantes, notes, ordonnances) affichaient
 * chacune leurs trois dernières entrées, soit une dizaine de lignes de passé
 * en permanence. Pendant la consultation, ce qui compte est la DERNIÈRE : le
 * reste sert une fois sur dix, et toujours sur décision du praticien. On le
 * laisse donc à un clic plutôt qu'à l'écran — c'est la place rendue à l'encart
 * « Actes du jour », qui lui est utile à chaque séance.
 *
 * `<details>` et non un état React : l'ouverture d'un historique n'a aucune
 * conséquence et ne mérite pas de rendu, et la carte reste dépliable même si
 * le JavaScript n'a pas fini de charger.
 */
function HistoriqueReplie({ n, libelle, children }: { n: number; libelle: string; children: ReactNode }) {
  if (n <= 0) return null
  return (
    <details className="mt-1">
      <summary className="list-none cursor-pointer select-none text-[11px] text-gray-400 hover:text-primary-600">
        + {n} {libelle}
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  )
}
interface Patient { id: string; first_name: string; last_name: string; age?: number | null; birth_date?: string | null; blood_group?: string | null; phone?: string | null; cin?: string | null; mutuelle?: string | null; allergies?: string | null; chronic_conditions?: string | null; surgeries?: string | null; current_treatments?: string | null; vaccinations?: string | null }

export default function ConsultationClient({
  doctorId, appointmentId, appointmentPaid, amountPaid, amountDue, defaultPrice,
  patient, recentNotes, recentPrescriptions, consultationPrescriptions, recentVitals,
  existingNoteId, existingNote, noteSigned = false, vitalDefs, vitalDefsAll, isPsy = false,
  isDental = false, mutuelle = null, suggestionsFeuille = [], regleSurDevis = false,
}: {
  doctorId: string
  appointmentId: string
  appointmentPaid: boolean
  /** Ce rendez-vous porte déjà un `quote_id` : son argent se saisit sur le
   *  devis. Lu sur le rendez-vous, et non déduit des clics de la séance en
   *  cours — sinon l'avertissement disparaissait au moindre rechargement. */
  regleSurDevis?: boolean
  amountPaid: number | null
  amountDue?: number | null
  defaultPrice: number | null
  patient: Patient
  recentNotes: Row[]
  recentPrescriptions: Row[]
  consultationPrescriptions: Row[]
  recentVitals: Row[]
  existingNoteId: string | null
  existingNote: string
  noteSigned?: boolean
  vitalDefs: VitalDef[]
  vitalDefsAll: VitalDef[]
  isPsy?: boolean
  isDental?: boolean
  mutuelle?: string | null
  suggestionsFeuille?: ActeSuggere[]
}) {
  const supabase = createClient()
  const router = useRouter()

  // Psychiatrie : une note vierge démarre pré-structurée (Motif/Histoire/…)
  const [note, setNote] = useState(existingNote || (isPsy ? PSY_NOTE_TEMPLATE : ''))
  const [noteId, setNoteId] = useState<string | null>(existingNoteId)
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [vitals, setVitals] = useState<Row[]>(recentVitals)
  const [savingVital, setSavingVital] = useState(false)

  const [paid, setPaid] = useState(appointmentPaid)
  const [paidAmount, setPaidAmount] = useState<number | null>(amountPaid)
  const [paidDue, setPaidDue] = useState<number | null>(amountDue ?? null)
  const [payDue, setPayDue] = useState<string>(defaultPrice != null ? String(defaultPrice) : '')
  const [payPaid, setPayPaid] = useState<string>(defaultPrice != null ? String(defaultPrice) : '')
  const [payMethod, setPayMethod] = useState<string>('especes')
  const [payingNow, setPayingNow] = useState(false)
  const [finishing, setFinishing] = useState(false)
  // Un acte du plan de traitement a été rattaché à cette séance : son argent se
  // saisit désormais sur le devis (verrou v54). On le dit AVANT que le praticien
  // remplisse le formulaire d'encaissement, plutôt que de le lui apprendre par
  // un refus du serveur après avoir tapé le montant.
  //
  // Ne redescend jamais à false, et c'est exact : décocher un acte vide bien
  // son `appointment_id`, mais le `quote_id` posé sur le rendez-vous y reste
  // (PATCH /api/quotes/[id]/items/[itemId] ne le retire pas). Le rendez-vous
  // demeure donc « réglé via le devis » ; masquer l'avertissement promettrait
  // un encaissement que le serveur refusera encore.
  //
  // L'état PART de ce que porte le rendez-vous : cocher un acte puis recharger
  // l'écran (retour d'une ordonnance, F5) faisait réapparaître le formulaire
  // d'encaissement comme si de rien n'était, et le praticien n'apprenait le
  // verrou qu'en se voyant refuser le montant qu'il venait de taper.
  const [actesSurDevis, setActesSurDevis] = useState(regleSurDevis)

  const vLabel = (k: string) => vitalDefsAll.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefsAll.find((v) => v.key === k)?.unit || ''

  // Les notes du patient moins celle de CETTE consultation : elle est déjà
  // ouverte au centre, la relire à gauche ferait croire à un doublon.
  const notesPrecedentes = recentNotes.filter((n) => n.id !== noteId).slice(0, 3)

  /** Une mesure sur une ligne. Extraite parce qu'elle sert deux fois : la plus
   *  récente, visible, et les précédentes dans l'historique replié. */
  const ligneMesure = (m: Row) => (
    <div key={m.id} className="text-xs text-gray-600 mb-1.5">
      <span className="text-gray-400">{formatDateFr(m.measured_at)} — </span>
      {Object.entries((m.values ?? {}) as Record<string, number>).map(([k, val]) => `${vLabel(k)} ${val}${vUnit(k) ? ' ' + vUnit(k) : ''}`).join(' · ')}
    </div>
  )

  const ligneNote = (n: Row) => (
    <div key={n.id} className="text-xs text-gray-600 mb-2 border-l-2 border-gray-100 pl-2">
      <p className="text-gray-400">{formatDateFr(n.created_at)}</p>
      <p className="line-clamp-3 whitespace-pre-wrap">{n.note}</p>
    </div>
  )

  const ligneOrdonnance = (p: Row) => (
    <button
      key={p.id}
      onClick={() => goTo(`/ordonnance/p/${p.id}?back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
      className="block w-full text-left text-xs text-gray-600 hover:text-primary-600 mb-1.5 border-l-2 border-gray-100 hover:border-primary-300 pl-2"
      title="Modifier cette ordonnance"
    >
      <span className="text-gray-400">{formatDateFr(p.created_at)} · modifier</span>
      <span className="block line-clamp-1 whitespace-pre-wrap">{p.content}</span>
    </button>
  )

  const savingRef = useRef(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveNote = useCallback(async () => {
    // Rien à enregistrer si vide, si c'est le modèle non modifié, ou si la note
    // est signée (verrouillée en base : l'écriture échouerait silencieusement).
    if (noteSigned || !note.trim() || note === PSY_NOTE_TEMPLATE || savingRef.current) return
    savingRef.current = true
    setNoteState('saving')
    try {
      if (noteId) {
        await supabase.from('consultation_notes').update({ note }).eq('id', noteId)
      } else {
        const { data } = await supabase
          .from('consultation_notes')
          .insert({ doctor_id: doctorId, patient_id: patient.id, appointment_id: appointmentId, note })
          .select('id').single()
        if (data) setNoteId(data.id)
      }
      setNoteState('saved')
      setTimeout(() => setNoteState((s) => (s === 'saved' ? 'idle' : s)), 2000)
    } finally {
      savingRef.current = false
    }
  }, [note, noteId, appointmentId, patient.id, doctorId, supabase, noteSigned])

  // Enregistrement automatique : 1,5 s après la dernière frappe → rien n'est perdu
  useEffect(() => {
    if (!note.trim() || note === PSY_NOTE_TEMPLATE) return
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => { saveNote() }, 1500)
    return () => { if (noteTimer.current) clearTimeout(noteTimer.current) }
  }, [note, saveNote])

  // Enregistre la note AVANT de quitter vers une autre action (ordonnance…)
  async function goTo(url: string) {
    if (noteTimer.current) clearTimeout(noteTimer.current)
    if (note.trim()) await saveNote()
    router.push(url)
  }

  async function saveVitals() {
    const values: Record<string, number> = {}
    for (const [k, v] of Object.entries(vitalInput)) {
      const n = parseFloat(v.replace(',', '.'))
      if (Number.isFinite(n)) values[k] = n
    }
    if (Object.keys(values).length === 0) return
    setSavingVital(true)
    const { data } = await supabase
      .from('vital_signs')
      // Rattachée à ce RDV : la mesure remonte dans le résumé de consultation.
      .insert({ doctor_id: doctorId, patient_id: patient.id, appointment_id: appointmentId, values })
      .select('id, values, measured_at').single()
    setSavingVital(false)
    if (data) { setVitals((prev) => [data, ...prev]); setVitalInput({}) }
  }

  async function encaisser() {
    const paidVal = parseFloat(payPaid.replace(',', '.'))
    if (!Number.isFinite(paidVal) || paidVal < 0) { alert('Entrez un montant encaissé valide.'); return }
    const dueVal = payDue.trim() === '' ? paidVal : parseFloat(payDue.replace(',', '.'))
    if (!Number.isFinite(dueVal) || dueVal < 0) { alert('Total dû invalide.'); return }
    setPayingNow(true)
    // Passe par l'API comme l'agenda et le dossier patient : plafonds, cohérence
    // payé ≤ dû, modes de règlement autorisés et verrous comptables y sont vérifiés.
    // (L'écriture directe en base court-circuitait toutes ces validations.)
    const res = await fetch(`/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_paid: paidVal, amount_due: dueVal, payment_method: payMethod }),
    })
    setPayingNow(false)
    if (res.ok) {
      setPaid(true); setPaidAmount(paidVal); setPaidDue(dueVal)
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'L\'encaissement a échoué. Réessayez.')
    }
  }

  // Clôture le RDV : note enregistrée, patient marqué présent et « parti »
  async function terminer() {
    // Une fois clôturé, le RDV quitte la file du jour : si rien n'a été encaissé,
    // la recette se perd facilement. On demande confirmation explicite.
    if (paidAmount == null) {
      if (!confirm('Aucun encaissement n\'a été saisi pour cette consultation.\n\nTerminer quand même ? Vous pourrez encaisser plus tard depuis l\'agenda.')) return
    }
    setFinishing(true)
    try {
      if (note.trim()) await saveNote()
      await supabase
        .from('appointments')
        .update({ attendance: 'present', queue_status: 'parti' })
        .eq('id', appointmentId)
      router.push('/appointments')
      router.refresh()
    } catch {
      setFinishing(false)
      alert('La clôture a échoué. Réessayez.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Barre du haut */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/appointments')} className="text-gray-400 hover:text-gray-600" title="Retour à l'agenda">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {patient.first_name} {patient.last_name}
              {(formatAge(patient.birth_date) ?? (patient.age != null ? `${patient.age} ans` : null)) &&
                <span className="text-gray-400 font-normal text-base"> · {formatAge(patient.birth_date) ?? `${patient.age} ans`}</span>}
            </h1>
            <p className="text-xs text-gray-500">Consultation en cours</p>
          </div>
        </div>
        <Button onClick={terminer} disabled={finishing}>
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> {finishing ? 'Clôture…' : 'Terminer la consultation'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── Colonne gauche : dossier ─────────────────────────────── */}
        <aside className="lg:col-span-4 space-y-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4 text-sm space-y-2">
            <p className="text-gray-600">📞 {patient.phone || '—'}</p>
            {patient.blood_group && <p className="text-gray-700 text-xs"><b>Groupe sanguin :</b> <span className="text-red-600 font-semibold">{patient.blood_group}</span></p>}
            {patient.cin && <p className="text-gray-500 text-xs">CIN : {patient.cin}</p>}
            {patient.mutuelle && <p className="text-gray-500 text-xs">Mutuelle : {patient.mutuelle}</p>}
            {patient.allergies && (
              <p className="text-red-600 flex items-start gap-1.5 bg-red-50 rounded-lg px-2.5 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span><b>Allergies :</b> {patient.allergies}</span>
              </p>
            )}
            {patient.chronic_conditions && <p className="text-gray-700"><b>Maladies chroniques :</b> {patient.chronic_conditions}</p>}
            {patient.surgeries && <p className="text-gray-700"><b>Chirurgies :</b> {patient.surgeries}</p>}
            {patient.current_treatments && <p className="text-gray-700"><b>Traitements de fond :</b> {patient.current_treatments}</p>}
            {patient.vaccinations && <p className="text-gray-700"><b>Vaccins :</b> {patient.vaccinations}</p>}
          </div>

          {vitals.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Dernières constantes</h3>
              {ligneMesure(vitals[0])}
              <HistoriqueReplie n={Math.min(vitals.length, 3) - 1} libelle="mesure(s) plus ancienne(s)">
                {vitals.slice(1, 3).map((m) => ligneMesure(m))}
              </HistoriqueReplie>
            </div>
          )}

          {notesPrecedentes.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><HeartPulse className="h-3.5 w-3.5" /> Notes précédentes</h3>
              {ligneNote(notesPrecedentes[0])}
              <HistoriqueReplie n={notesPrecedentes.length - 1} libelle="note(s) plus ancienne(s)">
                {notesPrecedentes.slice(1).map((n) => ligneNote(n))}
              </HistoriqueReplie>
            </div>
          )}

          {recentPrescriptions.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Ordonnances récentes</h3>
              {ligneOrdonnance(recentPrescriptions[0])}
              <HistoriqueReplie n={recentPrescriptions.length - 1} libelle="ordonnance(s) plus ancienne(s)">
                {recentPrescriptions.slice(1).map((p) => ligneOrdonnance(p))}
              </HistoriqueReplie>
            </div>
          )}
        </aside>

        {/* ── Colonne centrale ──────────────────────────────────────────
            ORDRE DES BLOCS, et pourquoi celui-là.

            Actes du jour · Note · Constantes · Schéma dentaire · Ordonnances ·
            Feuille de soins. UN SEUL ordre pour toutes les spécialités : deux
            ordres, c'est deux écrans à maintenir, et un médecin à la fois
            généraliste et dentiste (ça existe, `specialties` est une liste)
            tomberait de toute façon dans l'un des deux au hasard.

            Ce qui le rend possible : « Constantes du jour » ne s'affiche que si
            la spécialité en déclare (la table par défaut n'en attribue AUCUNE au
            dentiste). Le bloc remonté sert donc le généraliste, qui prend la
            tension avant d'écrire et l'avait jusqu'ici tout en bas — quinze
            défilements par jour ; et il s'efface chez le dentiste, chez qui le
            schéma dentaire reste collé sous la note, là où il doit être.

            « Actes du jour » passe AU-DESSUS de la note, pas entre les deux :
            c'est le programme de la séance, qu'on lit avant d'écrire, et le
            glisser sous la note décollerait le schéma dentaire de celle-ci. */}
        <section className="lg:col-span-5 space-y-3">
          {/* Dentistes seulement : l'encart vient d'un plan de traitement chiffré,
              un objet dentaire. Chez les autres spécialités il n'y a rien à
              cocher, et on évite en plus une lecture de devis à chaque
              consultation d'un généraliste qui n'en fait jamais. */}
          {isDental && (
            <ActesDuJourCard
              patientId={patient.id}
              appointmentId={appointmentId}
              appointmentPaid={paid}
              onRattachement={() => setActesSurDevis(true)}
            />
          )}

          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Note de consultation</h3>
              <div className="flex items-center gap-2">
                {noteSigned && <span className="text-xs text-gray-500 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Signée · verrouillée</span>}
                {!noteSigned && noteState === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Enregistrée</span>}
                {!noteSigned && isPsy && !note.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setNote(PSY_NOTE_TEMPLATE)}>
                    <FileText className="h-4 w-4 mr-1" /> Modèle
                  </Button>
                )}
                {!noteSigned && (
                  <Button variant="outline" size="sm" onClick={saveNote} disabled={noteState === 'saving' || !note.trim() || note === PSY_NOTE_TEMPLATE}>
                    <Save className="h-4 w-4 mr-1" /> {noteState === 'saving' ? '…' : 'Enregistrer'}
                  </Button>
                )}
              </div>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              readOnly={noteSigned}
              placeholder={isPsy ? 'Motif / Histoire / Évolution / Traitement / Prochain RDV…' : 'Motif, examen clinique, diagnostic, conduite à tenir…'}
              rows={9}
              className={`w-full text-sm text-gray-800 leading-relaxed border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 ${noteSigned ? 'bg-gray-50 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Constantes du jour — juste sous la note : la tension se prend au
              début de la consultation, et les valeurs restent sous les yeux
              pendant que la note s'écrit. Rendu seulement si la spécialité
              déclare des constantes, ce qui est ce qui permet au schéma
              dentaire de rester collé à la note chez le dentiste (voir
              l'en-tête de cette colonne). */}
          {vitalDefs.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Activity className="h-4 w-4 text-primary-500" /> Constantes du jour</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {vitalDefs.map((v) => (
                  <div key={v.key} className="relative">
                    <Input
                      type="number" step={v.step ?? 'any'} inputMode="decimal"
                      value={vitalInput[v.key] ?? ''}
                      onChange={(e) => setVitalInput((prev) => ({ ...prev, [v.key]: e.target.value }))}
                      placeholder={v.label} className="pr-10 text-sm" aria-label={v.label}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{v.unit}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={saveVitals} disabled={savingVital}>
                <Plus className="h-4 w-4 mr-1" /> {savingVital ? 'Enregistrement…' : 'Enregistrer les constantes'}
              </Button>
            </div>
          )}

          {/* Schéma dentaire — le même composant que dans la fiche patient, donc
              le même enregistrement (auto, via /api/dental) et le même journal
              dent par dent. Le dentiste note ce qu'il voit pendant qu'il le voit,
              sans quitter la consultation. Le filet de séparation du composant
              est retiré ici : il est déjà dans sa propre carte. */}
          {isDental && (
            <div className="bg-white border border-gray-100 rounded-xl p-4 [&>div]:border-t-0 [&>div]:pt-0">
              <DentalChart key={patient.id} patientId={patient.id} doctorId={doctorId} />
            </div>
          )}

          {/* Ordonnances de cette consultation (plusieurs possibles) */}
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className={`flex items-center justify-between ${consultationPrescriptions.length > 0 ? 'mb-2' : ''}`}>
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-primary-500" /> Ordonnances de la consultation ({consultationPrescriptions.length})
              </h3>
              <Button
                variant="outline" size="sm"
                onClick={() => goTo(`/ordonnance/${appointmentId}?new=1&back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
              >
                <Plus className="h-4 w-4 mr-1" /> Nouvelle
              </Button>
            </div>
            {/* Pas d'ordonnance : la carte se réduit à son titre et à son
                bouton. La phrase « Aucune ordonnance. Cliquez Nouvelle… » qui
                tenait ici n'apprenait rien que le bouton ne dise déjà, et
                occupait une ligne sur un écran qu'on veut lisible d'un coup
                d'œil. Le compteur (0) dit l'état. */}
            {consultationPrescriptions.length > 0 && (
              <div className="space-y-1.5">
                {consultationPrescriptions.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => goTo(`/ordonnance/p/${p.id}?back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
                    className="w-full text-left flex items-start gap-2 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50/40 p-2.5 transition-colors"
                    title="Modifier cette ordonnance"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[11px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-800 line-clamp-2 whitespace-pre-wrap">{p.content}</span>
                      <span className="block text-[11px] text-primary-500 mt-0.5">Modifier</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Feuille de soins — seulement si le patient a une couverture.
              Les actes du jour y sont déjà inscrits : il reste à vérifier les
              codes, et à imprimer. */}
          {mutuelle && mutuelle !== 'Aucune' && (
            <FeuilleSoinsCard
              patientId={patient.id}
              appointmentId={appointmentId}
              dental={isDental}
              mutuelle={mutuelle}
              suggestions={suggestionsFeuille}
            />
          )}

        </section>

        {/* ── Colonne droite : actions ─────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-2">
          <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-2 sticky top-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Actions</p>

            {/* Pas de « Nouvelle ordonnance » ici : le même bouton existe dans
                la carte « Ordonnances de la consultation », qui montre en plus
                celles déjà rédigées. Deux boutons identiques à deux endroits
                font hésiter sans rien apporter. */}
            <button onClick={() => goTo(`/certificat/nouveau/${patient.id}?apt=${appointmentId}&back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
              <FileText className="h-4 w-4 text-primary-500" /> Certificat
            </button>

            {paid ? (
              <>
                {(() => {
                  // Paiement partiel : ne pas afficher « Encaissé ✓ » alors qu'il
                  // reste un solde — le médecin doit pouvoir encaisser le reste ici.
                  const reste = paidDue != null && paidAmount != null
                    ? Math.round((paidDue - paidAmount) * 100) / 100 : 0
                  if (reste > 0) {
                    return (
                      <div className="px-3 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-sm">
                        <p className="text-orange-700 font-medium">{paidAmount}/{paidDue} DH · reste {reste} DH</p>
                        <button type="button" onClick={() => { setPaid(false); setPayDue(String(paidDue)); setPayPaid(String(paidDue)) }}
                          className="mt-1 text-xs font-medium text-green-700 underline">Encaisser le reste</button>
                      </div>
                    )
                  }
                  return (
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                      <Check className="h-4 w-4" /> Encaissé{paidAmount != null ? ` · ${paidAmount} DH` : ''}
                    </div>
                  )
                })()}
                <a href={`/facture/${appointmentId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                  <Printer className="h-4 w-4 text-primary-500" /> Facture
                </a>
              </>
            ) : (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-green-500" /> Encaisser</p>
                {/* Des actes du plan ont été rattachés à cette séance : le
                    serveur refusera un encaissement ici, et il a raison — la
                    somme serait comptée deux fois (une fois sur le devis, une
                    fois sur le rendez-vous). Dit ici plutôt qu'en erreur après
                    la saisie du montant. */}
                {actesSurDevis && (
                  <p className="text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                    Actes du plan de traitement rattachés à cette séance : le versement se saisit sur le devis, dans le dossier du patient.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500">Total dû</label>
                    <div className="relative">
                      <Input type="number" inputMode="decimal" min="0" step="any" value={payDue}
                        onChange={(e) => setPayDue(e.target.value)} placeholder="0" className="pr-8 text-sm" aria-label="Total dû" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">DH</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-gray-500">Encaissé</label>
                    <div className="relative">
                      <Input type="number" inputMode="decimal" min="0" step="any" value={payPaid}
                        onChange={(e) => setPayPaid(e.target.value)} placeholder="0" className="pr-8 text-sm" aria-label="Encaissé" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">DH</span>
                    </div>
                  </div>
                </div>

                {/* Reste à payer + solder */}
                {(() => {
                  const due = parseFloat(payDue.replace(',', '.'))
                  const paid = parseFloat(payPaid.replace(',', '.'))
                  const reste = Math.round((due - paid) * 100) / 100
                  if (Number.isFinite(due) && Number.isFinite(paid) && reste > 0) {
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-orange-600 font-medium">Reste : {reste} DH</span>
                        <button type="button" onClick={() => setPayPaid(payDue)} className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 hover:bg-green-100">
                          Solder
                        </button>
                      </div>
                    )
                  }
                  return null
                })()}

                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400"
                >
                  <option value="especes">Espèces</option>
                  <option value="carte">Carte</option>
                  <option value="cheque">Chèque</option>
                  <option value="virement">Virement</option>
                </select>
                <Button size="sm" className="w-full bg-green-600 hover:bg-green-700" onClick={encaisser} disabled={payingNow || !payPaid}>
                  {payingNow ? 'Enregistrement…' : 'Valider l\'encaissement'}
                </Button>
              </div>
            )}

            <p className="text-[11px] text-gray-400 px-1 pt-1">Pour un acompte, mettez « Encaissé » inférieur au « Total dû ».</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
