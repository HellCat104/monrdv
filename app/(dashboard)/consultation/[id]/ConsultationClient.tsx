'use client'

// Poste de consultation : 3 colonnes (dossier / actes+note+constantes / actions).
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateFr, formatAge, getNowInMaroc } from '@/lib/utils'
import { NOTE_TEMPLATE, PSY_NOTE_TEMPLATE, type VitalDef } from '@/types'
import DentalChart from '@/components/dashboard/DentalChart'
import FeuilleSoinsCard, { type ActeSuggere } from '@/components/dashboard/FeuilleSoinsCard'
import LabWorksCard from '@/components/dashboard/LabWorksCard'
import OrthoCard from '@/components/dashboard/OrthoCard'
import PerioCard from '@/components/dashboard/PerioCard'
import ActesDuJourCard from './ActesDuJourCard'
import {
  ArrowLeft, HeartPulse, Pill, Activity, Check, Save, FileText, Wallet, Printer,
  AlertTriangle, CheckCircle2, Plus, ChevronDown, RotateCcw, CalendarPlus, CalendarClock, BellRing,
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
  patient, recentNotes, recentPrescriptions, consultationPrescriptions, consultationCertificates, recentVitals,
  consultationTypeId = null, queueStatus = null, reprogrammerJours = null, v76 = false,
  prochainRdv = null,
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
  /** Certificats établis pendant CETTE consultation (titre + motif + date). */
  consultationCertificates: Row[]
  /** Motif du RDV en cours : repris par défaut pour le rendez-vous suivant. */
  consultationTypeId?: string | null
  /** État de file à l'ouverture : sert à ne prévenir l'accueil qu'une fois. */
  queueStatus?: string | null
  /** Délai déjà demandé à l'accueil, s'il y en a un (v76). */
  reprogrammerJours?: number | null
  /** Rendez-vous déjà donné à ce patient après celui-ci, s'il existe. */
  prochainRdv?: { date: string; time: string } | null
  /** La migration v76 est passée. Sinon les deux liens vers l'accueil
   *  n'existent pas — la règle de la maison : pas de migration, pas de
   *  fonctionnalité, mais jamais d'erreur. */
  v76?: boolean
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

  // Trame de la note vierge, selon la profession.
  //
  // Le psychiatre avait déjà la sienne. Le généraliste et les spécialités
  // cliniques retapaient « Motif / Examen / Diagnostic / Conduite à tenir » à
  // chaque consultation. Le dentiste n'en reçoit pas : sa note accompagne le
  // schéma dentaire et les actes du jour, elle ne suit pas ce plan-là.
  //
  // Pré-remplir ne coûte rien : une trame non modifiée n'est jamais
  // enregistrée (voir saveNote), donc une consultation sans note ne laisse pas
  // quatre titres vides dans le dossier.
  const trameNote = isPsy ? PSY_NOTE_TEMPLATE : isDental ? '' : NOTE_TEMPLATE
  const estTrameVierge = (t: string) => t === PSY_NOTE_TEMPLATE || t === NOTE_TEMPLATE
  const [note, setNote] = useState(existingNote || trameNote)
  const [noteId, setNoteId] = useState<string | null>(existingNoteId)
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Ordonnance à reconduire : la plus récente du patient qui n'a PAS été
  // écrite pendant cette consultation. `recentPrescriptions` est trié du plus
  // récent au plus ancien et inclut celles du jour, d'où le filtre.
  const idsDuJour = new Set(consultationPrescriptions.map((p) => p.id))
  const derniereOrdonnanceAnterieure = recentPrescriptions.find((p) => !idsDuJour.has(p.id)) ?? null

  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [vitals, setVitals] = useState<Row[]>(recentVitals)
  const [savingVital, setSavingVital] = useState(false)

  // Dernière valeur connue POUR CHAQUE constante, avec sa date.
  //
  // Pas simplement `vitals[0]` : d'une visite à l'autre on ne relève pas les
  // mêmes constantes, et la dernière mesure peut ne contenir que le poids. On
  // descend donc l'historique jusqu'à trouver une valeur pour chaque clé.
  //
  // On NE préremplit PAS les champs, et ce n'est pas un oubli : une constante
  // enregistrée dit « mesurée aujourd'hui ». Recopier d'office une tension
  // vieille de trois mois écrirait dans le dossier une mesure qui n'a pas eu
  // lieu. La valeur est donc montrée à côté du champ — ce qui donne en plus la
  // comparaison qu'on cherche (« il était à 78 ») — et c'est le praticien qui
  // la reprend, d'un clic, quand elle tient encore : la taille d'un adulte,
  // typiquement.
  const dernieresValeurs: Record<string, { valeur: number; date: string }> = {}
  for (const m of vitals) {
    for (const [cle, valeur] of Object.entries((m.values ?? {}) as Record<string, number>)) {
      if (dernieresValeurs[cle] == null && typeof valeur === 'number') {
        dernieresValeurs[cle] = { valeur, date: m.measured_at }
      }
    }
  }

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
  // Bloc parodonte / labo / ortho : fermé par défaut, voir plus bas.
  const [suiviOuvert, setSuiviOuvert] = useState(false)

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

  // Renouvellement : on recopie le texte dans une ordonnance NEUVE rattachée à
  // la consultation en cours. `reprendre` suffit à forcer la création côté
  // serveur, `new=1` est là pour que l'URL se lise seule.
  const lienRenouveler = (prescriptionId: string) =>
    `/ordonnance/${appointmentId}?new=1&reprendre=${prescriptionId}` +
    `&back=${encodeURIComponent(`/consultation/${appointmentId}`)}`

  const ligneOrdonnance = (p: Row) => (
    <div key={p.id} className="mb-1.5 border-l-2 border-gray-100 hover:border-primary-300 pl-2 group">
      <button
        onClick={() => goTo(`/ordonnance/p/${p.id}?back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
        className="block w-full text-left text-xs text-gray-600 hover:text-primary-600"
        title="Modifier cette ordonnance"
      >
        <span className="text-gray-400">{formatDateFr(p.created_at)} · modifier</span>
        <span className="block line-clamp-1 whitespace-pre-wrap">{p.content}</span>
      </button>
      {/* Renouveler CELLE-CI, et pas seulement la dernière : un chronique a
          souvent deux ordonnances qui alternent (traitement de fond, épisode
          aigu), et la plus récente n'est pas toujours celle qu'on reconduit. */}
      <button
        onClick={() => goTo(lienRenouveler(p.id))}
        className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 hover:underline"
        title="Repartir de cette ordonnance pour en écrire une nouvelle"
      >
        <RotateCcw className="h-3 w-3" /> Renouveler
      </button>
    </div>
  )

  // ── Prochain rendez-vous, pris depuis la consultation ──────────────────
  //
  // « Revenez dans dix jours » est la dernière phrase d'une consultation sur
  // deux. Il fallait clôturer, retourner à l'agenda, retrouver la date et
  // créer le rendez-vous — donc, le plus souvent, ne rien faire et compter sur
  // le patient pour rappeler. Les délais proposés sont ceux qu'un praticien
  // prononce ; la date reste modifiable pour tout le reste.
  //
  // On passe par /api/appointments, comme l'agenda : les créneaux, les
  // chevauchements et les jours fermés y sont vérifiés. Créer la ligne
  // directement en base ici aurait permis de poser deux patients à la même
  // heure.
  const [rdvOuvert, setRdvOuvert] = useState(false)
  const [rdvDate, setRdvDate] = useState('')
  const [rdvHeure, setRdvHeure] = useState('')
  const [rdvCreneaux, setRdvCreneaux] = useState<string[]>([])
  const [rdvChargement, setRdvChargement] = useState(false)
  const [rdvEnCours, setRdvEnCours] = useState(false)
  const [rdvErreur, setRdvErreur] = useState('')
  // Relu en base à chaque ouverture, et non gardé seulement en mémoire d'écran :
  // sortir faire un certificat et revenir effaçait la confirmation, et le
  // bouton réapparaissait comme si aucun rendez-vous n'avait été donné.
  const [rdvCree, setRdvCree] = useState<string | null>(
    prochainRdv ? `${formatDateFr(prochainRdv.date)} à ${String(prochainRdv.time).slice(0, 5)}` : null,
  )

  function dansJours(n: number): string {
    const d = getNowInMaroc()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // Créneaux libres du jour choisi. Une journée fermée renvoie une liste vide,
  // ce que l'écran dit explicitement au lieu de laisser un menu vide.
  useEffect(() => {
    if (!rdvOuvert || !rdvDate) { setRdvCreneaux([]); return }
    setRdvChargement(true)
    setRdvHeure('')
    const motif = consultationTypeId ? `&consultation_type_id=${consultationTypeId}` : ''
    fetch(`/api/slots?doctor_id=${doctorId}&date=${rdvDate}${motif}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots?: { time: string; available: boolean }[] }) => {
        setRdvCreneaux((d.slots ?? []).filter((s) => s.available).map((s) => s.time))
      })
      .catch(() => setRdvCreneaux([]))
      .finally(() => setRdvChargement(false))
  }, [rdvOuvert, rdvDate, doctorId, consultationTypeId])

  async function creerProchainRdv() {
    if (!rdvDate || !rdvHeure) { setRdvErreur('Choisissez une date et une heure.'); return }
    setRdvEnCours(true)
    setRdvErreur('')
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctorId,
          patient_id: patient.id,
          date: rdvDate,
          time: rdvHeure,
          consultation_type_id: consultationTypeId ?? undefined,
          public: false,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as { error?: string }))
        throw new Error(d.error || `Création impossible (${res.status})`)
      }
      setRdvCree(`${formatDateFr(rdvDate)} à ${rdvHeure}`)
      setRdvOuvert(false)
      setRdvDate(''); setRdvHeure('')
    } catch (e) {
      setRdvErreur(e instanceof Error ? e.message : 'Création impossible.')
    } finally {
      setRdvEnCours(false)
    }
  }

  // ── Ouvrir la consultation le dit à l'accueil ─────────────────────────
  //
  // La secrétaire cochait « En consultation » à la main, en devinant, pendant
  // que le médecin travaillait déjà. Son tableau mentait donc la moitié du
  // temps. L'ouverture de cet écran EST l'entrée en consultation : autant que
  // ce soit elle qui le dise.
  //
  // Une seule fois, et jamais sur un rendez-vous déjà clôturé — rouvrir un
  // dossier pour relire une note ne doit pas remettre le patient dans la file.
  // L'heure est posée par la base (déclencheur v76), pas ici.
  const fileSignalee = useRef(false)
  useEffect(() => {
    if (fileSignalee.current) return
    if (queueStatus === 'en_consultation' || queueStatus === 'parti') return
    fileSignalee.current = true
    supabase
      .from('appointments')
      .update({ queue_status: 'en_consultation' })
      .eq('id', appointmentId)
      .then(({ error }) => {
        // Échec sans conséquence clinique : l'accueil garde l'état précédent.
        if (error) console.error('[Consultation] file d\'attente non mise à jour :', error.message)
      })
  }, [appointmentId, queueStatus, supabase])

  // ── Ce que le médecin transmet à l'accueil ────────────────────────────
  const [reprog, setReprog] = useState<number | null>(reprogrammerJours)
  const [reprogOuvert, setReprogOuvert] = useState(false)
  const [appelEnvoye, setAppelEnvoye] = useState(false)

  async function demanderReprogrammation(jours: number | null) {
    const { error } = await supabase
      .from('appointments')
      .update({ reprogrammer_jours: jours })
      .eq('id', appointmentId)
    if (error) { alert("La consigne n'a pas pu être transmise à l'accueil."); return }
    setReprog(jours)
    setReprogOuvert(false)
  }

  async function appelerSuivant() {
    const { error } = await supabase
      .from('appointments')
      .update({ appel_suivant_le: new Date().toISOString() })
      .eq('id', appointmentId)
    if (error) { alert("L'appel n'a pas pu être envoyé à l'accueil."); return }
    setAppelEnvoye(true)
    // Le signal est fugace côté accueil ; ici on relâche le bouton au bout
    // d'un moment pour qu'un second appel reste possible.
    setTimeout(() => setAppelEnvoye(false), 60000)
  }

  const savingRef = useRef(false)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveNote = useCallback(async () => {
    // Rien à enregistrer si vide, si c'est le modèle non modifié, ou si la note
    // est signée (verrouillée en base : l'écriture échouerait silencieusement).
    if (noteSigned || !note.trim() || estTrameVierge(note) || savingRef.current) return
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
    if (!note.trim() || estTrameVierge(note)) return
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
    //
    // SAUF quand la séance est réglée sur le devis (verrou v54) : le rendez-vous
    // ne PEUT PAS porter son propre `amount_paid`, c'est le logiciel qui l'a
    // interdit. Avertir « aucun encaissement n'a été saisi » serait alors faux,
    // et inquiéter le praticien pour de l'argent qui est bien enregistré.
    if (paidAmount == null && !actesSurDevis) {
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
                {/* Remettre la trame après l'avoir effacée, pour qui en veut
                    une — donc pas chez le dentiste, qui n'en a pas. */}
                {!noteSigned && trameNote && !note.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setNote(trameNote)}>
                    <FileText className="h-4 w-4 mr-1" /> Modèle
                  </Button>
                )}
                {!noteSigned && (
                  <Button variant="outline" size="sm" onClick={saveNote} disabled={noteState === 'saving' || !note.trim() || estTrameVierge(note)}>
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
                {vitalDefs.map((v) => {
                  const precedent = dernieresValeurs[v.key]
                  return (
                    <div key={v.key}>
                      <div className="relative">
                        <Input
                          type="number" step={v.step ?? 'any'} inputMode="decimal"
                          value={vitalInput[v.key] ?? ''}
                          onChange={(e) => setVitalInput((prev) => ({ ...prev, [v.key]: e.target.value }))}
                          placeholder={v.label} className="pr-10 text-sm" aria-label={v.label}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">{v.unit}</span>
                      </div>
                      {precedent && (
                        <button
                          type="button"
                          onClick={() => setVitalInput((prev) => ({ ...prev, [v.key]: String(precedent.valeur) }))}
                          className="mt-0.5 text-[10px] text-gray-400 hover:text-primary-600 hover:underline"
                          title={`${v.label} : ${precedent.valeur} ${v.unit} le ${formatDateFr(precedent.date)} — cliquer pour reprendre cette valeur`}
                        >
                          dernière : {precedent.valeur}
                        </button>
                      )}
                    </div>
                  )
                })}
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
            <div className={`flex items-center justify-between gap-2 flex-wrap ${consultationPrescriptions.length > 0 ? 'mb-2' : ''}`}>
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Pill className="h-4 w-4 shrink-0 text-primary-500" /> Ordonnances de la consultation ({consultationPrescriptions.length})
              </h3>
              <div className="flex items-center gap-2">
                {/* La dernière ordonnance du patient, hors celles écrites
                    aujourd'hui : sans ce filtre, « Renouveler la dernière »
                    recopierait l'ordonnance qu'on vient tout juste de rédiger. */}
                {derniereOrdonnanceAnterieure && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => goTo(lienRenouveler(derniereOrdonnanceAnterieure.id))}
                    title={`Repartir de l'ordonnance du ${formatDateFr(derniereOrdonnanceAnterieure.created_at)}`}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> Renouveler
                  </Button>
                )}
                <Button
                  variant="outline" size="sm"
                  onClick={() => goTo(`/ordonnance/${appointmentId}?new=1&back=${encodeURIComponent(`/consultation/${appointmentId}`)}`)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Nouvelle
                </Button>
              </div>
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

          {/* Certificats établis pendant cette consultation.
              La carte n'existe QUE s'il y en a : un généraliste en établit
              plusieurs par jour, mais pas à chaque patient, et une carte vide
              de plus sur l'écran de consultation ne dit rien. Le bouton
              « Certificat » du panneau de droite reste le chemin pour en
              créer un — on n'en ajoute pas un deuxième. */}
          {consultationCertificates.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                <FileText className="h-4 w-4 text-primary-500" /> Certificats de la consultation ({consultationCertificates.length})
              </h3>
              <div className="space-y-1.5">
                {consultationCertificates.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => goTo(`/certificat/${c.id}`)}
                    className="w-full text-left flex items-start gap-2 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50/40 p-2.5 transition-colors"
                    title="Ouvrir ce certificat pour le relire ou l'imprimer"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-600 text-[11px] font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-800">{c.title}</span>
                      {c.motif && <span className="block text-[11px] text-gray-500">{c.motif}</span>}
                      <span className="block text-[11px] text-primary-500 mt-0.5">Ouvrir / imprimer</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parodonte, laboratoire, orthodontie — des actes qui se font AU
              FAUTEUIL, et qu'il fallait pourtant aller saisir dans la fiche
              patient : on sortait de la consultation pour noter une poche ou
              pour vérifier si la couronne était revenue du labo.
              
              REPLIÉS, et c'est volontaire : la plupart des séances ne touchent
              à aucun des trois. Les déplier d'office rendrait l'écran illisible
              pour le soin courant, alors qu'un clic suffit le jour où on en a
              besoin. Rien n'est chargé tant que le bloc n'est pas ouvert. */}
          {isDental && (
            <div className="bg-white border border-gray-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSuiviOuvert((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
                aria-expanded={suiviOuvert}
              >
                <span className="text-sm font-semibold text-gray-700">Parodonte, laboratoire, orthodontie</span>
                <span className="ml-auto text-[11px] text-gray-400">{suiviOuvert ? 'Masquer' : 'Afficher'}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${suiviOuvert ? 'rotate-180' : ''}`} />
              </button>
              {suiviOuvert && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
                  <OrthoCard patientId={patient.id} />
                  <PerioCard patientId={patient.id} />
                  <LabWorksCard patientId={patient.id} />
                </div>
              )}
            </div>
          )}

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

            {/* ── Vers l'accueil ─────────────────────────────────────────
                Deux consignes qui se perdaient entre la porte du bureau et le
                comptoir. Elles n'existent qu'avec la v76 : sans la migration,
                les boutons ne s'affichent pas, et rien ne tombe en erreur. */}
            {v76 && (
              <>
                <button
                  onClick={appelerSuivant}
                  disabled={appelEnvoye}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-colors ${appelEnvoye ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 text-gray-700 hover:border-primary-300 hover:bg-primary-50'}`}
                >
                  {appelEnvoye
                    ? <><Check className="h-4 w-4" /> L&apos;accueil est prévenu</>
                    : <><BellRing className="h-4 w-4 text-primary-500" /> Faites entrer le suivant</>}
                </button>

                {reprog ? (
                  <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
                    <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="flex-1">
                      L&apos;accueil doit le revoir dans <strong>{reprog} jours</strong>.
                      <button onClick={() => demanderReprogrammation(null)} className="block text-[11px] underline hover:no-underline mt-0.5">
                        Retirer la consigne
                      </button>
                    </span>
                  </div>
                ) : reprogOuvert ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-700">L&apos;accueil le reprogramme dans…</p>
                    <div className="flex flex-wrap gap-1">
                      {([['1 sem.', 7], ['2 sem.', 14], ['1 mois', 30], ['3 mois', 90], ['6 mois', 180]] as const).map(([label, n]) => (
                        <button key={n} onClick={() => demanderReprogrammation(n)}
                          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:border-amber-400">
                          {label}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setReprogOuvert(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Annuler</button>
                  </div>
                ) : (
                  <button onClick={() => setReprogOuvert(true)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                    <CalendarClock className="h-4 w-4 text-primary-500" /> Faire reprogrammer à l&apos;accueil
                  </button>
                )}
              </>
            )}

            {/* Prochain rendez-vous — pris ici, sans quitter la consultation */}
            {rdvCree ? (
              <div className="px-3 py-2.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="flex-1">
                  Prochain RDV : <strong>{rdvCree}</strong>
                  {/* Jamais d'impasse : un patient peut avoir besoin de deux
                      rendez-vous (contrôle, puis bilan). */}
                  <button
                    onClick={() => { setRdvCree(null); setRdvOuvert(true); setRdvErreur('') }}
                    className="block text-[11px] underline hover:no-underline mt-0.5"
                  >
                    En donner un autre
                  </button>
                </span>
              </div>
            ) : !rdvOuvert ? (
              <button onClick={() => { setRdvOuvert(true); setRdvErreur('') }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-300 hover:bg-primary-50 transition-colors">
                <CalendarPlus className="h-4 w-4 text-primary-500" /> Prochain rendez-vous
              </button>
            ) : (
              <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Revoir {patient.first_name} dans…</p>
                {/* Les délais qu'un praticien prononce. La date reste libre
                    juste en dessous pour tous les autres cas. */}
                <div className="flex flex-wrap gap-1">
                  {([['1 sem.', 7], ['2 sem.', 14], ['1 mois', 30], ['3 mois', 90], ['6 mois', 180]] as const).map(([label, n]) => (
                    <button
                      key={n}
                      onClick={() => setRdvDate(dansJours(n))}
                      className={`text-[11px] px-2 py-1 rounded-md border transition ${rdvDate === dansJours(n) ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Input type="date" value={rdvDate} min={dansJours(0)} onChange={(e) => setRdvDate(e.target.value)} className="text-sm" />

                {rdvDate && (
                  rdvChargement ? (
                    <p className="text-[11px] text-gray-400">Recherche des créneaux…</p>
                  ) : rdvCreneaux.length === 0 ? (
                    <p className="text-[11px] text-amber-700">Aucun créneau libre ce jour-là. Choisissez une autre date.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                      {rdvCreneaux.map((h) => (
                        <button
                          key={h}
                          onClick={() => setRdvHeure(h)}
                          className={`text-[11px] px-2 py-1 rounded-md border transition ${rdvHeure === h ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'}`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  )
                )}

                {rdvErreur && <p role="alert" className="text-[11px] text-red-600">{rdvErreur}</p>}

                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => { setRdvOuvert(false); setRdvErreur('') }}>
                    Annuler
                  </Button>
                  <Button size="sm" className="flex-1 text-xs" onClick={creerProchainRdv} disabled={rdvEnCours || !rdvDate || !rdvHeure}>
                    {rdvEnCours ? '…' : 'Donner le RDV'}
                  </Button>
                </div>
              </div>
            )}

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
