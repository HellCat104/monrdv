'use client'

// Dossier patient pleine page.
//
// L'écran montrait tout en même temps : identité modifiable, antécédents,
// documents, fusion, suppression, historique, devis, forfaits, journal d'accès,
// ordonnances, certificats, schéma dentaire, constantes, rappels, encaissements
// et notes — quinze cartes à lire avant d'en trouver une. Il se consulte
// maintenant par onglets, et la modification de la fiche est un mode à part :
// on consulte, ou on modifie, jamais les deux à la fois.
import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppointmentList, type PaymentPayload } from '@/components/dashboard/AppointmentList'
import GrowthChart from '@/components/dashboard/GrowthChart'
import VaccinationCard from '@/components/dashboard/VaccinationCard'
import MilestonesCard from '@/components/dashboard/MilestonesCard'
import DentalChart from '@/components/dashboard/DentalChart'
import ImagerieDentaire from '@/components/dashboard/ImagerieDentaire'
import { dentsAvecImage as calculerDentsAvecImage, type ImageDentaire } from '@/lib/imagerie'
import AnamneseDentaire from '@/components/dashboard/AnamneseDentaire'
import BandeauRisques from '@/components/dashboard/BandeauRisques'
import { risquesActifs, aVerifier, anamneseRemplie, anamneseAncienne, type Anamnese } from '@/lib/anamnese'
import QuotesCard from '@/components/dashboard/QuotesCard'
import MenuDocuments from '@/components/dashboard/MenuDocuments'
import BlocGastro from '@/components/gastro/BlocGastro'
import BlocConsultationsDentaires from '@/components/dashboard/BlocConsultationsDentaires'
import SuiviPoids from '@/components/gastro/SuiviPoids'
import SynthesePathologie from '@/components/gastro/SynthesePathologie'
import FeuilleSoinsCard from '@/components/dashboard/FeuilleSoinsCard'
import LabWorksCard from '@/components/dashboard/LabWorksCard'
import PerioCard from '@/components/dashboard/PerioCard'
import OrthoCard from '@/components/dashboard/OrthoCard'
import VitalsTrend from '@/components/dashboard/VitalsTrend'
import { organismePour } from '@/lib/organismes'
import AlerteAdresseEmail, { memeAdresse } from '@/components/shared/AlerteAdresseEmail'
import { isDentalDoctor } from '@/lib/dental'
import { isNonPrescriber } from '@/lib/profession'
import { nettoyerEtiquettes, normaliserEtiquette, dejaPosee, suggestions } from '@/lib/pathologies'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getInitials, formatDateFr, formatDateShort, formatDateTimeFr, getNowInMaroc, ageFromBirthDate, formatAge, isValidPhoneMaroc } from '@/lib/utils'
import { withConsultationSummary } from '@/lib/consultation-summary'
import { construireChronologie, type Evenement } from '@/lib/chronologie'
import { BLOOD_GROUPS, MUTUELLES_MAROC, PAYMENT_METHOD_LABELS, RECALL_OUVERTS, isGeneralDoctor, isGastroDoctor, isPediatricDoctor, isPsychiatricDoctor, PSY_NOTE_TEMPLATE, CATEGORIES_DOCUMENT, type CategorieDocument,
  type PaymentMethod,
  type Patient, type Appointment, type AppointmentStatus, type AppointmentAttendance, type ConsultationNote, type Prescription, type Recall, type PatientDocument, type VitalSign, type VitalDef, type SessionPackage } from '@/types'
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, ShieldCheck, Save, Check, Plus, X, BellRing,
  Pill, FileText, Paperclip, Download, Trash2, Activity, HeartPulse, Printer, RefreshCw, Calendar, Users, Ticket,
  Pencil, Wallet, AlertTriangle, History } from 'lucide-react'
import { messageQuota } from '@/lib/stockage'
import { motsRecherche, filtreMot } from '@/lib/recherche-patient'

const DOC_BUCKET = 'patient-documents'

type Onglet = 'suivi' | 'soins' | 'argent' | 'dossier' | 'chronologie'

// Une couleur par nature d'événement : la chronologie se parcourt à l'œil
// avant de se lire, et c'est la pastille qui guide.
const COULEUR_EVENEMENT: Record<string, string> = {
  consultation: 'bg-primary-500',
  ordonnance:   'bg-violet-500',
  certificat:   'bg-sky-500',
  document:     'bg-gray-400',
  constantes:   'bg-emerald-500',
  rappel:       'bg-amber-500',
  endoscopie:   'bg-rose-500',
}

// Le journal stocke des codes ; l'écran doit parler français.
const ACTIONS_LISIBLES: Record<string, string> = {"dossier_consulte": "Dossier consulté", "dossier_imprime": "Version imprimable ouverte", "dossier_exporte": "Dossier exporté", "patients_exportes": "Export groupé", "patient_fusionne": "Fiche fusionnée"}

export default function PatientDossier({
  doctorId, doctorName, doctorSlug, specialties, enabledVitals, vitalDefsAll, initialPatient,
  doctorInpe = null,
}: {
  doctorId: string
  doctorName: string
  doctorSlug: string
  specialties: string[]
  enabledVitals: string[]
  vitalDefsAll: VitalDef[]
  initialPatient: Patient
  /** L'INPE du praticien : obligatoire sur tout imprimé de l'assurance
   *  maladie obligatoire, et donc vérifié avant d'établir une feuille. */
  doctorInpe?: string | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const patient = initialPatient
  // Onglet affiché, et bascule consultation / modification de la fiche.
  const [onglet, setOnglet] = useState<Onglet>('suivi')
  const [edition, setEdition] = useState(false)
  const isPsy = isPsychiatricDoctor(specialties)
  // Psychologue, kinésithérapeute… : ni ordonnances, ni titre de « Docteur »
  const nonPrescriber = isNonPrescriber(specialties)

  // Champs éditables de la fiche
  // Nom, prénom et téléphone : ils s'affichaient en texte au milieu d'un
  // formulaire, donc on les croyait verrouillés. Un prénom mal orthographié au
  // guichet ou un patient qui change de numéro n'avaient aucune autre issue que
  // de créer une seconde fiche — c'est-à-dire un doublon, avec son historique
  // coupé en deux.
  const [editFirstName, setEditFirstName] = useState(patient.first_name)
  const [editLastName, setEditLastName] = useState(patient.last_name)
  const [editPhone, setEditPhone] = useState(patient.phone ?? '')
  const [editAge, setEditAge] = useState(patient.age != null ? String(patient.age) : '')
  const [editBirthDate, setEditBirthDate] = useState(patient.birth_date ?? '')
  const [editSex, setEditSex] = useState<'M' | 'F' | ''>(patient.sex ?? '')
  const [editGestWeeks, setEditGestWeeks] = useState(patient.gestational_age_weeks != null ? String(patient.gestational_age_weeks) : '')
  const [editParent1, setEditParent1] = useState(patient.parent1_name ?? '')
  const [editParent2, setEditParent2] = useState(patient.parent2_name ?? '')
  const [editParent1Phone, setEditParent1Phone] = useState(patient.parent1_phone ?? '')
  const [editParent2Phone, setEditParent2Phone] = useState(patient.parent2_phone ?? '')
  const [editPrimary, setEditPrimary] = useState<'parent1' | 'parent2' | ''>(patient.primary_contact ?? '')

  // Fratrie : les enfants d'une même famille partagent family_id
  const [familyId, setFamilyId] = useState<string | null>(patient.family_id ?? null)
  const [siblings, setSiblings] = useState<{ id: string; first_name: string; last_name: string; birth_date: string | null }[]>([])
  const [sibSearch, setSibSearch] = useState('')
  const [sibResults, setSibResults] = useState<{ id: string; first_name: string; last_name: string; birth_date: string | null }[]>([])
  // Recherche de doublon à fusionner
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeResults, setMergeResults] = useState<{ id: string; first_name: string; last_name: string; phone: string | null }[]>([])
  const [editBloodGroup, setEditBloodGroup] = useState(patient.blood_group ?? '')
  const [editCin, setEditCin] = useState(patient.cin ?? '')
  const [editEmail, setEditEmail] = useState(patient.email ?? '')
  // Rebond connu (webhook Resend, v59) sur l'adresse ENREGISTRÉE. La base
  // efface le drapeau dès que l'adresse change ; l'écran fait de même après
  // un enregistrement réussi, sans attendre un rechargement.
  const [rebond, setRebond] = useState(patient.email_bounce_reason
    ? { raison: patient.email_bounce_reason, depuis: patient.email_bounced_at ?? null, adresse: patient.email ?? '' }
    : null)
  const [editAddress, setEditAddress] = useState(patient.address ?? '')
  const [editMutuelle, setEditMutuelle] = useState(patient.mutuelle ?? '')
  // L'assuré n'est pas toujours le patient : un enfant est soigné sous le
  // numéro de son père ou de sa mère. Les champs demandés dépendent de
  // l'organisme (lib/organismes.ts), d'où un objet plutôt que des colonnes.
  const [assureData, setAssureData] = useState<Record<string, string>>(
    ((patient as { insurer_data?: Record<string, string> | null }).insurer_data ?? {}) as Record<string, string>,
  )
  const [mutuelleOther, setMutuelleOther] = useState(!!patient.mutuelle && !(MUTUELLES_MAROC as readonly string[]).includes(patient.mutuelle))
  const [editAllergies, setEditAllergies] = useState(patient.allergies ?? '')
  // L'anamnèse structurée (v87), tenue ici : la bannière du haut et celle de
  // l'odontogramme lisent la même valeur et doivent changer ensemble.
  const [editAnamnese, setEditAnamnese] = useState<Anamnese>((patient.anamnese ?? {}) as Anamnese)
  const [editAnamneseMaj, setEditAnamneseMaj] = useState<string | null>(patient.anamnese_maj ?? null)
  // Les clichés du patient (v94), chargés par le bloc d'imagerie et partagés
  // avec l'odontogramme, qui en tire ses repères.
  const [imagerie, setImagerie] = useState<ImageDentaire[]>([])
  const [ouvrirAnamnese, setOuvrirAnamnese] = useState(false)
  const [editChronic, setEditChronic] = useState(patient.chronic_conditions ?? '')
  // Étiquettes de pathologie (v72). Elles ne doublent pas le texte libre
  // ci-dessus : celui-ci porte la nuance (« déséquilibré depuis mars »),
  // l'étiquette sert à RETROUVER le patient dans « tous mes diabétiques ».
  const [editConditions, setEditConditions] = useState<string[]>(nettoyerEtiquettes(patient.conditions))
  const [saisieEtiquette, setSaisieEtiquette] = useState('')
  const [saisieActive, setSaisieActive] = useState(false)
  // Étiquettes déjà posées ailleurs dans la patientèle : c'est à la deuxième
  // fiche qu'un praticien ne doit plus retaper « Lupus » lui-même.
  const [etiquettesConnues, setEtiquettesConnues] = useState<string[]>([])
  // DÉGRADATION PROPRE — tant que la v72 n'est pas passée, la colonne n'existe
  // pas. La fiche est lue en `select('*')` : la clé est alors tout simplement
  // ABSENTE de la ligne, alors qu'elle vaut toujours un tableau une fois la
  // migration faite (NOT NULL DEFAULT '{}'). Ce test suffit donc, sans
  // interroger le schéma — et il évite d'afficher un sélecteur dont la saisie
  // serait perdue au premier enregistrement.
  // Colonnes dont dépend l'enregistrement : présentes sur la fiche LUE, donc
  // présentes en base. C'est le seul test fiable côté navigateur.
  const couvertureDisponible = (patient as { insurer_data?: unknown }).insurer_data !== undefined
  const etiquettesDisponibles = Array.isArray(patient.conditions)
  // Antécédents FAMILIAUX (v80). Distincts des maladies du patient : les
  // écrire dans « maladies chroniques » revenait à lui prêter celle de son
  // père — et en gastro-entérologie, c'est cette ligne qui avance la première
  // coloscopie de dix ans.
  const [editFamily, setEditFamily] = useState((patient as { family_history?: string | null }).family_history ?? '')
  const [editSurgeries, setEditSurgeries] = useState(patient.surgeries ?? '')
  const [editTreatments, setEditTreatments] = useState(patient.current_treatments ?? '')
  const [editVaccinations, setEditVaccinations] = useState(patient.vaccinations ?? '')
  const [editNotes, setEditNotes] = useState(patient.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Données liées
  const [appts, setAppts] = useState<Appointment[]>([])
  const [consultNotes, setConsultNotes] = useState<ConsultationNote[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [certificates, setCertificates] = useState<{ id: string; type: string | null; title: string; motif: string | null; created_at: string }[]>([])
  const [recalls, setRecalls] = useState<Recall[]>([])
  const [documents, setDocuments] = useState<PatientDocument[]>([])
  const [vitals, setVitals] = useState<VitalSign[]>([])
  const [packages, setPackages] = useState<SessionPackage[]>([])
  // Actes de la branche gastro, pour la chronologie. Chargés à part : leurs
  // tables peuvent ne pas exister (migration non passée), et le dossier ne
  // doit pas tomber pour autant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [actesGastro, setActesGastro] = useState<{ consultations: any[]; endoscopies: any[] }>({ consultations: [], endoscopies: [] })
  // Solder un reste dû sans rouvrir le rendez-vous : le patient qui passe à
  // l'accueil pour régler une ancienne consultation n'a pas de RDV du jour.
  const [soldeId, setSoldeId] = useState<string | null>(null)
  const [soldeMontant, setSoldeMontant] = useState('')
  const [soldeMode, setSoldeMode] = useState<PaymentMethod>('especes')
  const [soldeEnCours, setSoldeEnCours] = useState(false)

  // Forfait de séances : déplié à la demande quand le patient n'en a aucun
  // (voir le commentaire devant le bloc, dans l'onglet Paiements).
  const [forfaitDeplie, setForfaitDeplie] = useState(false)
  // Journal des séances : un seul forfait déplié à la fois.
  const [journalOuvert, setJournalOuvert] = useState<string | null>(null)
  const [journal, setJournal] = useState<{ id: string; delta: number; used_at: string; note: string | null }[]>([])
  const [journalDispo, setJournalDispo] = useState(true)
  // Historique des accès : chargé seulement si le médecin l'ouvre. Il n'a pas
  // sa place dans le chargement initial du dossier, qu'il ralentirait pour
  // une information consultée une fois sur cent.
  const [acces, setAcces] = useState<{ id: string; action: string; metadata: Record<string, unknown>; created_at: string }[] | null>(null)
  const [accesCharge, setAccesCharge] = useState(false)
  const [loading, setLoading] = useState(true)

  // Ajouts
  const [newNote, setNewNote] = useState(isPsy ? PSY_NOTE_TEMPLATE : '')
  const [addingNote, setAddingNote] = useState(false)
  const [recallDate, setRecallDate] = useState('')
  const [recallReason, setRecallReason] = useState('')
  const [addingRecall, setAddingRecall] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  // La nature du prochain document importé : choisie AVANT de prendre le
  // fichier, parce qu'une boîte de dialogue qui s'ouvre après l'envoi se fait
  // valider sans être lue.
  const [categorieImport, setCategorieImport] = useState<CategorieDocument>('biologie')
  const [filtreCategorie, setFiltreCategorie] = useState<CategorieDocument | 'tout'>('tout')
  const [vitalInput, setVitalInput] = useState<Record<string, string>>({})
  const [savingVital, setSavingVital] = useState(false)
  const [pkgTotal, setPkgTotal] = useState('10')
  const [pkgAmount, setPkgAmount] = useState('')
  const [pkgLabel, setPkgLabel] = useState('')
  const [savingPkg, setSavingPkg] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [aptRes, notesRes, presRes, recallsRes, docsRes, vitalsRes, certsRes, pkgRes] = await Promise.all([
      supabase.from('appointments').select('*, patient:patients(*)').eq('patient_id', patient.id).order('date', { ascending: false }).order('time', { ascending: false }),
      supabase.from('consultation_notes').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('prescriptions').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('recalls').select('*').eq('patient_id', patient.id).order('due_date', { ascending: true }),
      supabase.from('patient_documents').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('vital_signs').select('*').eq('patient_id', patient.id).order('measured_at', { ascending: false }),
      supabase.from('certificates').select('id, type, title, motif, created_at').eq('patient_id', patient.id).order('created_at', { ascending: false }),
      supabase.from('session_packages').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    ])
    // Résumé des consultations clôturées (sinon les cartes affichent « Aucune note »)
    setAppts(await withConsultationSummary(supabase, aptRes.data ?? []))
    setConsultNotes(notesRes.data ?? [])
    setPrescriptions(presRes.data ?? [])
    setRecalls(recallsRes.data ?? [])
    setDocuments(docsRes.data ?? [])
    setVitals(vitalsRes.data ?? [])
    setCertificates(certsRes.data ?? [])
    setPackages(pkgRes.data ?? [])

    // Branche gastro : les actes structurés, pour la chronologie. Requête
    // séparée et silencieuse — pas de migration, pas de ligne, mais jamais de
    // dossier cassé.
    // Les actes structurés des branches qui en ont. Le dentiste n'a pas
    // d'endoscopie : la requête retourne vide, elle ne coûte rien et évite un
    // second chemin de code.
    if (isGastroDoctor(specialties) || isDentalDoctor(specialties)) {
      const [consRes, endoRes] = await Promise.all([
        supabase.from('consultations').select('id, date_consultation, motif, statut').eq('patient_id', patient.id),
        supabase.from('endoscopies').select('id, date_examen, type_examen, conclusion, statut').eq('patient_id', patient.id),
      ])
      setActesGastro({ consultations: consRes.data ?? [], endoscopies: endoRes.data ?? [] })
    }
    setLoading(false)
  }, [patient.id, supabase])
  useEffect(() => { load() }, [load])

  // Les étiquettes déjà employées par ce médecin, pour les proposer à la
  // frappe. Lue seulement à l'ouverture du mode modification : la consulter à
  // chaque dossier ouvert serait une requête sur toute la patientèle pour un
  // écran qui, la plupart du temps, ne sert qu'à lire.
  useEffect(() => {
    if (!edition || !etiquettesDisponibles) return
    let annule = false
    supabase.from('patients').select('conditions').eq('doctor_id', doctorId)
      .then(({ data }) => {
        if (annule) return
        const brutes = (data ?? []).flatMap((p) => (p.conditions ?? []) as string[])
        // Dédoublonnage par la forme normalisée, et SANS passer par
        // nettoyerEtiquettes : sa borne de 20 vaut pour une fiche, pas pour le
        // vocabulaire d'un cabinet entier — elle amputerait les propositions.
        setEtiquettesConnues(Array.from(new Set(
          brutes.map((e) => normaliserEtiquette(e)).filter((e): e is string => !!e),
        )))
      })
    return () => { annule = true }
  }, [edition, etiquettesDisponibles, doctorId, supabase])

  // Frères et sœurs (même family_id)
  useEffect(() => {
    if (!familyId) { setSiblings([]); return }
    supabase.from('patients')
      .select('id, first_name, last_name, birth_date')
      .eq('doctor_id', doctorId).eq('family_id', familyId).neq('id', patient.id)
      .then(({ data }) => setSiblings(data ?? []))
  }, [familyId, doctorId, patient.id, supabase])

  // Recherche d'un enfant à lier (dans la patientèle du médecin)
  useEffect(() => {
    const q = sibSearch.trim()
    if (q.length < 2) { setSibResults([]); return }
    const t = setTimeout(async () => {
      const mots = motsRecherche(q)
      if (mots.length === 0) { setSibResults([]); return }
      let req = supabase.from('patients')
        .select('id, first_name, last_name, birth_date')
        .eq('doctor_id', doctorId).neq('id', patient.id)
      for (const mot of mots) req = req.or(filtreMot(mot))
      const { data } = await req.limit(6)
      setSibResults((data ?? []).filter((p) => !siblings.some((s) => s.id === p.id)))
    }, 300)
    return () => clearTimeout(t)
  }, [sibSearch, doctorId, patient.id, siblings, supabase])

  // Recherche d'un doublon à fusionner (dans la patientèle du médecin)
  useEffect(() => {
    const q = mergeSearch.trim()
    if (q.length < 2) { setMergeResults([]); return }
    const t = setTimeout(async () => {
      const mots = motsRecherche(q)
      if (mots.length === 0) { setMergeResults([]); return }
      let req = supabase.from('patients')
        .select('id, first_name, last_name, phone')
        .eq('doctor_id', doctorId).neq('id', patient.id)
      for (const mot of mots) req = req.or(filtreMot(mot))
      const { data } = await req.limit(6)
      setMergeResults(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [mergeSearch, doctorId, patient.id, supabase])

  async function chargerAcces() {
    if (accesCharge) return
    setAccesCharge(true)
    const res = await fetch(`/api/audit/patient/${patient.id}`)
    const d = await res.json().catch(() => ({}))
    setAcces(d.acces ?? [])
  }

  async function linkSibling(p: { id: string }) {
    const fid = familyId ?? crypto.randomUUID()
    const { error } = await supabase.from('patients').update({ family_id: fid }).in('id', [patient.id, p.id])
    if (error) { alert('Impossible de lier — lancez la migration v34 si ce n\'est pas fait.'); return }
    setFamilyId(fid); setSibSearch(''); setSibResults([])
  }

  async function unlinkSibling(id: string) {
    const { error } = await supabase.from('patients').update({ family_id: null }).eq('id', id)
    if (!error) setSiblings((prev) => prev.filter((s) => s.id !== id))
  }

  // Pose une étiquette sur la fiche. Tout passe par normaliserEtiquette :
  // « hypertension arterielle » tapé à la hâte doit rejoindre la cohorte
  // « Hypertension artérielle » déjà constituée, pas en créer une deuxième.
  function poserEtiquette(brut: string) {
    const e = normaliserEtiquette(brut)
    if (!e) return
    setSaisieEtiquette('')
    if (dejaPosee(editConditions, e)) return
    setEditConditions((prev) => nettoyerEtiquettes([...prev, e]))
  }
  function retirerEtiquette(e: string) {
    setEditConditions((prev) => prev.filter((x) => x !== e))
  }

  async function saveIdentity() {
    setSaving(true)
    // Une étiquette TAPÉE mais pas encore validée est une étiquette voulue.
    // Le champ ne la posait qu'à la touche Entrée ou au clic sur une
    // proposition : taper « Parodontite » puis cliquer « Enregistrer la fiche »
    // la perdait sans un mot. C'est le geste naturel, et la perte était
    // silencieuse — on la récupère ici plutôt que d'exiger le bon réflexe.
    const enAttente = normaliserEtiquette(saisieEtiquette)
    const etiquettes = enAttente && !dejaPosee(editConditions, enAttente)
      ? nettoyerEtiquettes([...editConditions, enAttente])
      : nettoyerEtiquettes(editConditions)
    // Ces trois-là sont obligatoires en base : les vider ferait échouer tout
    // l'enregistrement, allergies comprises, avec pour seul message
    // « L'enregistrement a échoué ». On arrête avant, en disant quoi.
    if (!editFirstName.trim() || !editLastName.trim() || !editPhone.trim()) {
      setSaving(false)
      alert('Le prénom, le nom et le téléphone sont obligatoires : une fiche sans eux ne se retrouve plus.')
      return
    }
    const updates = {
      first_name: editFirstName.trim(),
      last_name: editLastName.trim(),
      phone: editPhone.trim(),
      age: ageFromBirthDate(editBirthDate) ?? (editAge ? Number(editAge) : null),
      birth_date: editBirthDate || null,
      sex: editSex || null,
      gestational_age_weeks: editGestWeeks ? Math.min(43, Math.max(22, Number(editGestWeeks))) : null,
      parent1_name: editParent1.trim() || null,
      parent2_name: editParent2.trim() || null,
      parent1_phone: editParent1Phone.trim() || null,
      parent2_phone: editParent2Phone.trim() || null,
      primary_contact: editPrimary || null,
      blood_group: editBloodGroup || null,
      cin: editCin.trim() ? editCin.trim().toUpperCase() : null,
      email: editEmail.trim() || null,
      address: editAddress.trim() || null,
      mutuelle: editMutuelle.trim() || null,
      // Couverture (v65) : même règle que les étiquettes ci-dessous. Écrite en
      // dur, cette clé faisait échouer TOUT l'enregistrement d'une fiche sur
      // une base où la migration n'est pas passée — allergies comprises, et
      // avec pour seul message « L'enregistrement a échoué ».
      ...(couvertureDisponible ? {
        insurer_data: Object.fromEntries(
          Object.entries(assureData).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v !== ''),
        ),
      } : {}),
      notes: editNotes || null,
      allergies: editAllergies || null,
      chronic_conditions: editChronic || null,
      surgeries: editSurgeries || null,
      family_history: editFamily || null,
      current_treatments: editTreatments || null,
      vaccinations: editVaccinations || null,
      // Étiquettes : seulement si la colonne existe (v72). Écrire une clé
      // inconnue ferait échouer TOUT l'enregistrement — allergies et
      // antécédents compris — et la perte serait silencieuse pour le médecin.
      ...(etiquettesDisponibles ? { conditions: etiquettes } : {}),
    }
    let { error } = await supabase.from('patients').update(updates).eq('id', patient.id)
    // Ceinture et bretelles : le cache de schéma de PostgREST peut encore
    // ignorer la colonne juste après la migration (PGRST204), ou la connaître
    // alors que la fiche avait été lue avant (42703). Plutôt que de refuser
    // l'enregistrement entier, on réécrit sans les étiquettes et on le DIT.
    if (error && (error.code === '42703' || error.code === 'PGRST204')) {
      // On retire les colonnes des migrations récentes — étiquettes (v72) ET
      // couverture (v65) — plutôt que les étiquettes seules : le premier essai
      // ne dit pas LAQUELLE manque, et réessayer avec la mauvaise échouait
      // une seconde fois. Le dossier clinique passe, le médecin est averti.
      const sansRecentes = { ...updates } as Record<string, unknown>
      delete sansRecentes.conditions
      delete sansRecentes.insurer_data
      delete sansRecentes.family_history
      const retry = await supabase.from('patients').update(sansRecentes).eq('id', patient.id)
      error = retry.error
      if (!error) {
        alert("Fiche enregistrée, sauf les étiquettes de pathologie, les informations d'assuré et les antécédents familiaux : une migration n'est pas encore passée sur cette base.")
      }
    }
    setSaving(false)
    if (error) { alert('L\'enregistrement a échoué. Réessayez.'); return }
    // Même règle que le trigger v59 : une autre adresse n'a pas rebondi.
    if (rebond && !memeAdresse(updates.email, rebond.adresse)) setRebond(null)
    // L'étiquette récupérée de la saisie en cours devient une pastille : sans
    // ça le champ garde son texte, et le praticien croit qu'elle n'est pas prise.
    setEditConditions(etiquettes); setSaisieEtiquette('')
    // Le titre de la page, la liste des patients et les rendez-vous affichent
    // le nom lu côté serveur : sans ce rafraîchissement, on corrigeait un
    // prénom et l'en-tête gardait l'ancien, comme si rien n'avait été pris.
    router.refresh()
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  async function addConsultNote() {
    if (!newNote.trim() || newNote === PSY_NOTE_TEMPLATE) return
    setAddingNote(true)
    const { data, error } = await supabase.from('consultation_notes')
      .insert({ doctor_id: doctorId, patient_id: patient.id, note: newNote.trim() }).select().single()
    setAddingNote(false)
    if (!error && data) { setConsultNotes((prev) => [data, ...prev]); setNewNote(isPsy ? PSY_NOTE_TEMPLATE : '') }
  }

  // Fusion d'un doublon (deux fiches du même patient) dans celle-ci
  async function mergeDuplicate(dupId: string, dupLabel: string) {
    if (!confirm(`Fusionner « ${dupLabel} » dans cette fiche ?\n\nSes RDV, notes, ordonnances, certificats et documents seront déplacés ici, puis le doublon sera supprimé. Action définitive.`)) return
    const res = await fetch('/api/patients/merge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId: patient.id, mergeId: dupId }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Échec de la fusion.'); return }
    setMergeSearch(''); setMergeResults([])
    await load()
  }

  // Signer (verrouiller définitivement) une note de consultation
  async function signNote(id: string) {
    if (!confirm('Signer cette note ? Elle sera définitivement verrouillée et ne pourra plus être modifiée ni supprimée.')) return
    const signedAt = new Date().toISOString()
    const { error } = await supabase.from('consultation_notes').update({ signed_at: signedAt }).eq('id', id)
    if (error) { alert('La signature a échoué.'); return }
    setConsultNotes((prev) => prev.map((n) => (n.id === id ? { ...n, signed_at: signedAt } : n)))
  }
  // Supprimer une note (impossible si elle est signée — protégé aussi en base)
  async function deleteNote(id: string) {
    if (!confirm('Supprimer cette note ?')) return
    const { error } = await supabase.from('consultation_notes').delete().eq('id', id)
    if (error) { alert('La suppression a échoué (une note signée ne peut pas être supprimée).'); return }
    setConsultNotes((prev) => prev.filter((n) => n.id !== id))
  }

  // ── Forfaits de séances prépayées ────────────────────────────────────────
  async function addPackage() {
    const total = Number(pkgTotal)
    if (!Number.isFinite(total) || total < 1) { alert('Indiquez un nombre de séances valide.'); return }
    setSavingPkg(true)
    const { data, error } = await supabase.from('session_packages').insert({
      doctor_id: doctorId,
      patient_id: patient.id,
      label: pkgLabel.trim() || null,
      total_sessions: total,
      amount: pkgAmount ? Number(pkgAmount) : null,
    }).select().single()
    setSavingPkg(false)
    if (error || !data) { alert("Le forfait n'a pas pu être créé."); return }
    setPackages((prev) => [data, ...prev])
    setPkgLabel(''); setPkgAmount(''); setPkgTotal('10')
  }

  // Consomme (ou rend) une séance. Tout passe par /api/packages/[id] : le
  // compteur et sa trace doivent partir du même geste, et la borne est relue
  // sur la base — deux clics rapides ne décomptent plus deux séances.
  async function useSession(pkg: SessionPackage, delta: 1 | -1) {
    const res = await fetch(`/api/packages/${pkg.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || "La mise à jour du forfait a échoué."); return }
    setPackages((prev) => prev.map((p) => (p.id === pkg.id ? data.package : p)))
    // Le journal est rouvert s'il était affiché : la séance qu'on vient de
    // pointer doit y apparaître tout de suite.
    if (journalOuvert === pkg.id) chargerJournal(pkg.id)
  }

  /** Annuler un forfait : il disparaît de la liste active sans être effacé —
   *  les séances déjà consommées restent au journal. */
  async function cancelPackage(pkg: SessionPackage) {
    const reste = pkg.total_sessions - pkg.used_sessions
    if (!confirm(`Annuler ce forfait ? ${reste} séance${reste > 1 ? 's' : ''} non utilisée${reste > 1 ? 's' : ''} ne seront plus décomptées. Les séances déjà faites restent enregistrées.`)) return
    const res = await fetch(`/api/packages/${pkg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'annule' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || "Le forfait n'a pas pu être annulé."); return }
    setPackages((prev) => prev.map((p) => (p.id === pkg.id ? data.package : p)))
  }

  /** Journal des séances d'un forfait : quand chacune a été pointée. */
  async function chargerJournal(id: string) {
    setJournalOuvert(id)
    const res = await fetch(`/api/packages/${id}`)
    const data = await res.json().catch(() => ({}))
    setJournal(res.ok ? (data.uses ?? []) : [])
    setJournalDispo(res.ok ? data.journal !== false : false)
  }

  async function addRecall() {
    if (!recallDate) return
    setAddingRecall(true)
    const { data, error } = await supabase.from('recalls')
      .insert({ doctor_id: doctorId, patient_id: patient.id, due_date: recallDate, reason: recallReason.trim() || null }).select().single()
    setAddingRecall(false)
    if (!error && data) { setRecalls((prev) => [...prev, data].sort((a, b) => a.due_date.localeCompare(b.due_date))); setRecallDate(''); setRecallReason('') }
  }
  async function cancelRecall(id: string) {
    const { error } = await supabase.from('recalls').delete().eq('id', id)
    if (!error) setRecalls((prev) => prev.filter((r) => r.id !== id))
  }

  async function handlePayment(id: string, payload: PaymentPayload) {
    const res = await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Échec du paiement') }
    const updated = await res.json().catch(() => null)
    setAppts((prev) => prev.map((a) => a.id === id ? { ...a, amount_paid: payload.amount_paid, amount_due: payload.amount_due, payment_method: payload.payment_method, paid_at: updated?.paid_at ?? (payload.amount_paid !== null ? new Date().toISOString() : null) } : a))
  }
  /** Ouvre la saisie pour un rendez-vous, le montant pré-rempli au reste dû :
   *  dans la très grande majorité des cas le patient solde tout. */
  function ouvrirSolde(aptId: string, reste: number) {
    setSoldeId(aptId)
    setSoldeMontant(String(reste))
    setSoldeMode('especes')
  }

  /** Encaisse un versement sur un rendez-vous déjà facturé. On envoie le
   *  TOTAL payé (ancien + versement) : c'est ce que la colonne `amount_paid`
   *  représente, et le serveur refuse un total supérieur au dû. */
  async function solder(a: Appointment) {
    const verse = Number(String(soldeMontant).replace(',', '.'))
    const reste = (a.amount_due ?? 0) - (a.amount_paid ?? 0)
    if (!Number.isFinite(verse) || verse <= 0) { alert('Indiquez le montant reçu.'); return }
    if (verse > reste) { alert(`Le reste dû est de ${reste} DH.`); return }
    setSoldeEnCours(true)
    try {
      await handlePayment(a.id, {
        amount_paid: (a.amount_paid ?? 0) + verse,
        amount_due: a.amount_due ?? null,
        payment_method: soldeMode,
      })
      setSoldeId(null); setSoldeMontant('')
    } catch (e) {
      alert(e instanceof Error ? e.message : "L'encaissement a échoué.")
    } finally {
      setSoldeEnCours(false)
    }
  }

  async function handleReschedule(id: string, date: string, time: string) {
    const res = await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, time }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Échec du déplacement') }
    await load()
  }
  async function handleStatusChange(id: string, status: AppointmentStatus) {
    await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    await load()
  }
  async function handleAttendance(id: string, attendance: AppointmentAttendance) {
    await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendance }) })
    setAppts((prev) => prev.map((a) => a.id === id ? { ...a, attendance } : a))
  }

  // Renouvellement : on OUVRE l'éditeur pré-rempli, on n'enregistre rien.
  //
  // Avant, le clic insérait la copie immédiatement, puis ouvrait l'ordonnance
  // créée. Deux conséquences : un médecin qui cliquait par erreur, ou qui
  // refermait l'onglet après avoir vu qu'il fallait changer la posologie,
  // laissait dans le dossier du patient une ordonnance qu'il n'avait ni relue
  // ni remise — et le dossier est ce qu'on produit en cas de litige. Ensuite,
  // la copie était toujours « hors RDV », donc invisible dans les ordonnances
  // de la consultation en cours.
  //
  // L'éditeur enregistre quand le praticien clique « Enregistrer », comme pour
  // n'importe quelle ordonnance. Même chemin que le bouton « Renouveler » de
  // l'écran de consultation : un seul comportement à connaître.
  function renewPrescription(p: Prescription) {
    const back = encodeURIComponent(`/patients/${patient.id}`)
    window.open(`/ordonnance/patient/${patient.id}?reprendre=${p.id}&back=${back}`, '_blank')
  }

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('Le fichier ne doit pas dépasser 10 Mo.'); e.target.value = ''; return }
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (['.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.exe', '.sh', '.bat'].includes(ext)) {
      alert('Ce type de fichier n\'est pas autorisé : joignez un PDF ou une image.'); e.target.value = ''; return
    }
    setUploadingDoc(true)
    try {
      const safeName = file.name.replace(/[^\w.\-]/g, '_').substring(0, 120)
      const path = `${doctorId}/${patient.id}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (upErr) throw upErr
      const { data, error: insErr } = await supabase.from('patient_documents')
        .insert({ doctor_id: doctorId, patient_id: patient.id, file_path: path, file_name: file.name.substring(0, 200),
                  file_type: file.type || null, file_size: file.size,
                  // Seule la gastro classe ses documents pour l'instant : chez
                  // les autres, la colonne reste vide et la liste ne change pas.
                  ...(estGastro ? { categorie: categorieImport } : {}) }).select().single()
      // L'enregistrement peut échouer APRÈS l'envoi du fichier : quota du
      // cabinet atteint (trigger v63), coupure réseau… Sans ce nettoyage, le
      // fichier resterait dans le stockage sans aucune ligne pour le désigner :
      // invisible dans le dossier, mais décompté du quota.
      if (insErr) {
        await supabase.storage.from(DOC_BUCKET).remove([path])
        throw insErr
      }
      setDocuments((prev) => [data, ...prev])
    } catch (e) {
      alert(messageQuota(e) ?? 'Échec de l\'envoi du document.')
    } finally { setUploadingDoc(false); e.target.value = '' }
  }
  async function downloadDocument(doc: PatientDocument) {
    const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(doc.file_path, 120)
    if (error || !data) { alert('Impossible d\'ouvrir le document.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function addVital() {
    const values: Record<string, number> = {}
    for (const key of enabledVitals) {
      const raw = vitalInput[key]
      if (raw != null && raw !== '') { const n = parseFloat(String(raw).replace(',', '.')); if (!isNaN(n)) values[key] = n }
    }
    if (Object.keys(values).length === 0) return
    setSavingVital(true)
    const { data, error } = await supabase.from('vital_signs').insert({ doctor_id: doctorId, patient_id: patient.id, values }).select().single()
    setSavingVital(false)
    if (!error && data) { setVitals((prev) => [data, ...prev]); setVitalInput({}) }
  }

  async function deletePatient() {
    if (!confirm('Supprimer définitivement ce patient et tout son dossier ? Action irréversible.')) return
    const { error } = await supabase.from('patients').delete().eq('id', patient.id)
    if (error) { alert(error.message || 'La suppression a échoué.'); return }
    router.push('/patients')
  }

  // ── Dérivés (colonne droite) ──
  const now = getNowInMaroc()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const nextApt = appts.filter((a) => a.date >= todayStr && a.status !== 'cancelled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0]
  const totalPaid = appts.reduce((s, a) => s + (a.amount_paid ?? 0), 0)
  const totalDue = appts.reduce((s, a) => s + (a.amount_due != null && (a.amount_paid ?? 0) < a.amount_due ? a.amount_due - (a.amount_paid ?? 0) : 0), 0)
  const billed = appts.filter((a) => a.amount_paid != null || a.amount_due != null)
  const vLabel = (k: string) => vitalDefsAll.find((v) => v.key === k)?.label || k
  const vUnit = (k: string) => vitalDefsAll.find((v) => v.key === k)?.unit || ''

  const sec = 'bg-white border border-gray-100 rounded-xl p-4'
  const secTitle = 'text-sm font-semibold text-primary-600 mb-3 flex items-center justify-between'

  // Âge lisible : la date de naissance prime, sinon l'âge saisi à la main.
  const ageLisible = editBirthDate
    ? (formatAge(editBirthDate) || (ageFromBirthDate(editBirthDate) != null ? `${ageFromBirthDate(editBirthDate)} ans` : ''))
    : (editAge ? `${editAge} ans` : '')

  // L'onglet « soins » n'existe que s'il a quelque chose à montrer : inutile de
  // proposer un onglet vide à un praticien dont la spécialité n'en relève pas.
  // Courbes, vaccins et repères de développement : ils suivent désormais
  // l'ÂGE DU PATIENT, et non la spécialité du médecin. Un généraliste qui suit
  // les enfants d'une famille y a droit — tout existait déjà, seule une
  // condition d'affichage l'en privait. Les couloirs OMS du composant
  // s'arrêtent à 15 ans (taille/IMC), d'où la borne.
  const ageDuPatient = ageFromBirthDate(editBirthDate)
  const estEnfant = !!editBirthDate && ageDuPatient != null && ageDuPatient < 16
  const suiviEnfant = !!editBirthDate && (isPediatricDoctor(specialties) || estEnfant)
  // Les repères de développement n'ont de sens que chez le tout-petit.
  const suiviDevelopppement = suiviEnfant && (ageDuPatient == null || ageDuPatient < 6)

  // Même raisonnement que ci-dessus, appliqué aux PARENTS : ils étaient réservés
  // au pédiatre. Or un patient mineur a un représentant légal quelle que soit la
  // spécialité du praticien, et c'est LUI qui signe l'autorisation de soins —
  // un dentiste qui soigne un enfant de 8 ans n'avait donc nulle part où noter
  // son nom, et devait le réécrire à la main sur chaque document.
  // L'âge saisi à la main compte autant que la date de naissance : beaucoup de
  // fiches n'ont que lui.
  const ageSaisi = editAge ? Number(editAge) : null
  const ageConnu = ageDuPatient ?? (Number.isFinite(ageSaisi) ? ageSaisi : null)
  const patientMineur = ageConnu != null && ageConnu < 18

  const estDentiste = isDentalDoctor(specialties)
  const estPediatre = isPediatricDoctor(specialties)
  const estGastro = isGastroDoctor(specialties)

  // La chronologie ne coûte aucune requête : elle remet en ordre ce que le
  // dossier a déjà chargé pour ses autres onglets.
  // Chronologie : gastro ET dentisterie. Un traitement orthodontique de deux
  // ans ou une réhabilitation en six séances se lisent dans l'ordre, comme un
  // suivi de MICI — le besoin n'appartient pas à une spécialité.
  const avecChronologie = estGastro || estDentiste
  const chronologie = avecChronologie
    ? construireChronologie({
        notes: consultNotes, prescriptions, certificates,
        documents, vitals, recalls, aujourdhui: todayStr,
        consultations: actesGastro.consultations.map((c) => ({
          id: c.id, jour: c.date_consultation, detail: c.motif,
          titre: 'Consultation', brouillon: c.statut === 'brouillon',
        })),
        endoscopies: actesGastro.endoscopies.map((e) => ({
          id: e.id, jour: e.date_examen,
          titre: e.type_examen === 'coloscopie' ? 'Coloscopie' : 'Gastroscopie',
          detail: e.conclusion ? String(e.conclusion).split('\n')[0] : null,
          brouillon: e.statut === 'brouillon',
        })),
      })
    : []
  const aSoins = estDentiste || estPediatre || (!isPsy && enabledVitals.length > 0)
  const onglets: { cle: Onglet; titre: string; icone: ReactNode }[] = [
    { cle: 'suivi', titre: 'Consultations', icone: <Calendar className="h-4 w-4" /> },
    ...(aSoins
      ? [{
          cle: 'soins' as Onglet,
          titre: estDentiste ? 'Schéma dentaire' : estPediatre ? 'Croissance' : 'Constantes',
          icone: <Activity className="h-4 w-4" />,
        }]
      : []),
    { cle: 'argent', titre: 'Paiements', icone: <Wallet className="h-4 w-4" /> },
    { cle: 'dossier', titre: 'Documents', icone: <Paperclip className="h-4 w-4" /> },
    // Le dossier range chaque chose dans son tiroir, ce qui est commode pour
    // saisir et inutilisable pour comprendre : « que s'est-il passé en mars ? »
    // obligeait à ouvrir quatre onglets et à recoller les dates de tête.
    ...(avecChronologie ? [{ cle: 'chronologie' as Onglet, titre: 'Chronologie', icone: <History className="h-4 w-4" /> }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* En-tête : qui est ce patient, et le seul bouton qui change sa fiche.
          Tout le reste de l'écran se consulte ; on ne bascule en modification
          que lorsqu'on le demande. */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/patients')} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50" title="Retour à la liste"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{patient.first_name} {patient.last_name}</h1>
          <p className="text-sm text-gray-500 truncate">
            {ageLisible && <span>{ageLisible}</span>}
            {ageLisible && patient.phone && <span className="text-gray-300"> · </span>}
            {patient.phone}
            {editMutuelle && <span className="ml-2 inline-block bg-green-100 text-green-700 text-[11px] font-medium px-2 py-0.5 rounded-full align-middle">{editMutuelle}</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {edition ? (
            <>
              <Button variant="outline" onClick={() => setEdition(false)}>Fermer</Button>
              <Button onClick={saveIdentity} disabled={saving} className="shadow-sm">
                {saved ? <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Enregistré !</span> : <span className="flex items-center gap-1.5"><Save className="h-4 w-4" /> {saving ? 'Sauvegarde…' : 'Enregistrer la fiche'}</span>}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEdition(true)}><Pencil className="h-4 w-4 mr-1.5" /> Modifier la fiche</Button>
          )}
        </div>
      </div>

      {/* L'allergie ne se range pas dans un onglet : elle reste sous les yeux.
          Chez le dentiste, la même place porte TOUT ce qui change un geste —
          anticoagulant, valve, bisphosphonates — et dit explicitement quand
          rien n'a été demandé. Ailleurs, l'encadré d'allergies est inchangé. */}
      {isDentalDoctor(specialties) ? (
        <BandeauRisques
          risques={risquesActifs({ anamnese: editAnamnese, allergies: editAllergies })}
          verifier={aVerifier(editAnamnese)}
          remplie={anamneseRemplie(editAnamnese)}
          ancienne={anamneseAncienne(editAnamneseMaj)}
          maj={editAnamneseMaj}
          onOuvrir={() => {
            // Le questionnaire vit dans l'onglet des soins : sans ce passage
            // d'onglet, le lien promettait une action et ne faisait rien —
            // l'élément visé n'était même pas rendu. On change d'onglet, PUIS
            // on fait défiler, une fois le bloc à l'écran.
            setOuvrirAnamnese(true)
            setOnglet('soins')
            requestAnimationFrame(() => {
              document.getElementById('bloc-anamnese')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
          }}
        />
      ) : editAllergies.trim() ? (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm"><b>Allergies :</b> {editAllergies}</p>
        </div>
      ) : null}

      {edition ? (
        /* Mode modification : le formulaire, et rien d'autre. */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className={sec}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold shrink-0">{getInitials(editFirstName || patient.first_name, editLastName || patient.last_name)}</div>
              <div className="min-w-0 flex-1 grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Prénom</Label><Input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Nom</Label><Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="h-9" /></div>
              </div>
            </div>
            {editMutuelle && <span className="inline-block bg-green-100 text-green-700 text-[11px] font-medium px-2 py-0.5 rounded-full mb-3">{editMutuelle}</span>}

            <div className="space-y-2.5 text-sm">
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400 flex items-center gap-1"><Phone className="h-3 w-3" /> Téléphone</Label>
                <Input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-9" />
                {/* Averti, pas bloqué : beaucoup de fiches anciennes portent un
                    numéro incomplet, et refuser l'enregistrement empêcherait de
                    corriger une allergie sur ces fiches-là. */}
                {editPhone.trim() && !isValidPhoneMaroc(editPhone) && (
                  <p className="text-[11px] text-amber-600">Ce numéro n'a pas la forme d'un numéro marocain. Il sera enregistré tel quel, mais les rappels risquent de ne pas partir.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-400">Âge {editBirthDate && <span className="text-gray-300">(calculé)</span>}</Label>
                  <Input type="number"
                    value={editBirthDate ? (ageFromBirthDate(editBirthDate) ?? '') : editAge}
                    onChange={(e) => setEditAge(e.target.value)}
                    disabled={!!editBirthDate}
                    className={`h-9 ${editBirthDate ? 'bg-gray-50 text-gray-500' : ''}`} />
                </div>
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Naissance</Label><Input type="date" value={editBirthDate} max={todayStr} onChange={(e) => setEditBirthDate(e.target.value)} className="h-9" />
                  {formatAge(editBirthDate) && <p className="text-[11px] font-medium text-primary-600">👶 {formatAge(editBirthDate)}</p>}</div>
              </div>
              {isPediatricDoctor(specialties) && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-400">Sexe (couloirs OMS)</Label>
                      <div className="flex gap-1.5">
                        {([['M', 'Garçon'], ['F', 'Fille']] as const).map(([v, lbl]) => (
                          <button key={v} type="button" onClick={() => setEditSex(editSex === v ? '' : v)}
                            className={`flex-1 text-xs px-2 py-1.5 rounded-lg border transition ${editSex === v ? 'bg-primary-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-gray-400" title="Si né(e) avant 37 SA, la courbe utilise l'âge corrigé jusqu'à 24 mois">Terme (SA) — préma</Label>
                      <Input type="number" min={22} max={43} value={editGestWeeks} onChange={(e) => setEditGestWeeks(e.target.value)} placeholder="Ex : 34" className="h-9" />
                    </div>
                  </div>
                </>
              )}
              {/* Parents / tuteurs : au pédiatre toujours, et à tout praticien
                  dès que le patient est mineur. */}
              {(isPediatricDoctor(specialties) || patientMineur) && ([
                    ['parent1', 'Parent / tuteur 1', editParent1, setEditParent1, editParent1Phone, setEditParent1Phone, 'Ex : Fatima Alami (mère)'],
                    ['parent2', 'Parent / tuteur 2', editParent2, setEditParent2, editParent2Phone, setEditParent2Phone, 'Ex : Karim Alami (père)'],
                  ] as const).map(([key, lbl, name, setName, phone, setPhone, ph]) => (
                    <div key={key} className="space-y-1 rounded-lg border border-gray-100 p-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-gray-400">{lbl} (optionnel)</Label>
                        <button type="button"
                          onClick={() => setEditPrimary(editPrimary === key ? '' : key)}
                          title="Contact à prévenir en priorité (rappels, urgences)"
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border transition ${editPrimary === key ? 'bg-amber-400 text-white border-transparent' : 'text-gray-400 border-gray-200 hover:border-amber-300'}`}>
                          {editPrimary === key ? '★ Prioritaire' : '☆ Prioritaire'}
                        </button>
                      </div>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={ph} className="h-9" />
                      <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" className="h-9" />
                    </div>
                  ))}
              <div className="space-y-1"><Label className="text-[11px] text-gray-400 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="patient@email.com" className={`h-9 ${rebond && memeAdresse(editEmail, rebond.adresse) ? 'border-red-300' : ''}`} />
                {/* Tant que le champ contient l'adresse qui a rebondi, on le
                    dit ; dès qu'il en contient une autre, on rappelle qu'elle
                    n'est prise en compte qu'une fois la fiche enregistrée. */}
                {rebond && (memeAdresse(editEmail, rebond.adresse)
                  ? <AlerteAdresseEmail raison={rebond.raison} depuis={rebond.depuis} cible="patient" compact />
                  : <p className="text-[11px] text-amber-700">Nouvelle adresse : cliquez sur « Enregistrer la fiche » pour qu&apos;elle remplace l&apos;ancienne.</p>)}
              </div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Adresse</Label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Quartier, ville" className="h-9" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400 flex items-center gap-1"><CreditCard className="h-3 w-3" /> CIN</Label><Input value={editCin} onChange={(e) => setEditCin(e.target.value.toUpperCase())} placeholder="AB123456" className="h-9" /></div>
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Mutuelle</Label>
                <Select value={mutuelleOther ? 'Autre' : (editMutuelle || undefined)} onValueChange={(v) => { if (v === 'Autre') { setMutuelleOther(true); setEditMutuelle('') } else { setMutuelleOther(false); setEditMutuelle(v) } }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>{MUTUELLES_MAROC.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}<SelectItem value="Autre">Autre…</SelectItem></SelectContent>
                </Select>
                {mutuelleOther && <Input value={editMutuelle} onChange={(e) => setEditMutuelle(e.target.value)} placeholder="Précisez" className="h-9 mt-1.5" />}
              </div>
              {/* Couverture — les champs demandés par CET organisme, dans son
                  ordre. Un patient sans mutuelle n'a rien à saisir ici. */}
              {(() => {
                const org = organismePour(editMutuelle)
                if (!org) return null
                return (
                  <div className="space-y-2 bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[11px] font-semibold text-gray-500">{org.intitule}</p>
                    {org.champs.map((c) => (
                      <div key={c.cle} className="space-y-1">
                        <Label className="text-[11px] text-gray-400">{c.label}</Label>
                        {/* Le lien de parenté n'est pas un champ libre sur les
                            formulaires : c'est une case à cocher parmi deux ou
                            trois. « Épouse » écrit à la main dans une case
                            « Conjoint » fait revenir le dossier. */}
                        {c.cle === 'lien' && org.liens.length > 0 ? (
                          <Select
                            value={assureData[c.cle] || undefined}
                            onValueChange={(v) => setAssureData((prev) => ({ ...prev, [c.cle]: v === '—' ? '' : v }))}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="—">—</SelectItem>
                              {org.liens.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={assureData[c.cle] ?? ''}
                            onChange={(e) => setAssureData((prev) => ({ ...prev, [c.cle]: e.target.value }))}
                            className="h-9"
                          />
                        )}
                        {c.aide && <p className="text-[10px] text-gray-400">{c.aide}</p>}
                      </div>
                    ))}
                  </div>
                )
              })()}
              {!isPsy && (
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Groupe sanguin</Label>
                  <Select value={editBloodGroup || undefined} onValueChange={setEditBloodGroup}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
          {/* Antécédents */}
          <div className={sec}>
            <div className={secTitle}><span className="flex items-center gap-1.5"><HeartPulse className="h-4 w-4" /> Antécédents</span></div>
            <div className="space-y-2.5">
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Allergies</Label><textarea value={editAllergies} onChange={(e) => setEditAllergies(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Maladies chroniques</Label><textarea value={editChronic} onChange={(e) => setEditChronic(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              {/* Étiquettes — juste sous le texte libre qu'elles complètent,
                  parce que c'est en écrivant « diabète type 2 déséquilibré »
                  qu'on pense à poser l'étiquette qui retrouvera la fiche.
                  Gris uni, une seule couleur : une pathologie n'est pas plus
                  grave qu'une autre, et vingt pastilles colorées rendraient la
                  carte illisible. */}
              {etiquettesDisponibles && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-400">Étiquettes de suivi</Label>
                  {editConditions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-0.5">
                      {editConditions.map((e) => (
                        <span key={e} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full pl-2.5 pr-1 py-1">
                          {e}
                          <button type="button" onClick={() => retirerEtiquette(e)} title={`Retirer « ${e} »`} className="text-gray-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Input
                      value={saisieEtiquette}
                      onChange={(ev) => setSaisieEtiquette(ev.target.value)}
                      onFocus={() => setSaisieActive(true)}
                      onBlur={() => setSaisieActive(false)}
                      // Entrée valide la saisie telle quelle : c'est ce qui
                      // garde la liste OUVERTE. Une pathologie absente de
                      // lib/pathologies.ts s'ajoute sans rien demander.
                      onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); poserEtiquette(saisieEtiquette) } }}
                      placeholder="Diabète, hypertension…"
                      className="h-9"
                    />
                    {saisieActive && (() => {
                      // Huit propositions au plus : au-delà, la liste masque la
                      // moitié du formulaire pour aider deux fois moins.
                      const props = suggestions(saisieEtiquette, editConditions, etiquettesConnues).slice(0, 8)
                      if (props.length === 0) return null
                      return (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
                          {props.map((p) => (
                            // onMouseDown empêche le blur de fermer la liste
                            // AVANT que le clic n'arrive : sans lui, cliquer
                            // une proposition ne fait rien.
                            <button
                              key={p}
                              type="button"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => poserEtiquette(p)}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50"
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                  <p className="text-[11px] text-gray-400">Pour retrouver ce patient dans « tous mes diabétiques ». Le détail clinique reste dans le champ au-dessus.</p>
                </div>
              )}
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Antécédents chirurgicaux</Label><textarea value={editSurgeries} onChange={(e) => setEditSurgeries(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              {/* Les antécédents FAMILIAUX décident de la conduite en
                  gastro-entérologie : un cancer colorectal chez un parent du
                  premier degré avance la première coloscopie de dix ans. */}
              {estGastro && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-gray-400">Antécédents familiaux</Label>
                  <textarea value={editFamily} onChange={(e) => setEditFamily(e.target.value)} rows={2}
                    placeholder="Ex : père — cancer du côlon à 58 ans ; sœur — maladie de Crohn"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
              )}
              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Traitements de fond</Label><textarea value={editTreatments} onChange={(e) => setEditTreatments(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              {!isPsy && (
                <div className="space-y-1"><Label className="text-[11px] text-gray-400">Vaccins</Label><textarea value={editVaccinations} onChange={(e) => setEditVaccinations(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300" /></div>
              )}
            </div>
          </div>
          {/* Famille / fratrie (pédiatrie) */}
          {isPediatricDoctor(specialties) && (
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5">👨‍👩‍👧 Famille</span></div>
              {siblings.length > 0 && (
                <ul className="space-y-1.5 mb-2">
                  {siblings.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <button onClick={() => router.push(`/patients/${s.id}`)} className="text-sm text-primary-600 hover:underline text-left truncate">
                        {s.first_name} {s.last_name}
                        {s.birth_date && <span className="text-gray-400"> · {new Date(s.birth_date).getFullYear()}</span>}
                      </button>
                      <button onClick={() => unlinkSibling(s.id)} title="Retirer de la famille" className="text-gray-300 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="relative">
                <Input value={sibSearch} onChange={(e) => setSibSearch(e.target.value)} placeholder="Lier un frère / une sœur…" className="h-9" />
                {sibResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md overflow-hidden">
                    {sibResults.map((p) => (
                      <button key={p.id} onClick={() => linkSibling(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50">
                        {p.first_name} {p.last_name}{p.birth_date && <span className="text-gray-400"> · {new Date(p.birth_date).getFullYear()}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Reliez les enfants d&apos;une même famille : leurs dossiers deviennent accessibles en un clic.</p>
            </div>
          )}
          </div>
        </div>
      ) : (
        <>
          {/* Quatre onglets, des mots du quotidien du cabinet. Un praticien qui
              ouvre un dossier cherche une chose à la fois : ce qu'il a fait,
              ce qu'il soigne, ce qui est payé, ce qui est rangé. Quinze cartes
              empilées obligeaient à lire tout l'écran pour en trouver une. */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {onglets.map((o) => (
              <button
                key={o.cle}
                onClick={() => setOnglet(o.cle)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap border transition ${onglet === o.cle ? 'bg-primary-500 text-white border-transparent shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}
              >
                {o.icone} {o.titre}
              </button>
            ))}
          </div>

          {onglet === 'suivi' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
              <div className="space-y-4 min-w-0">
            {/* BRANCHE GASTRO-ENTÉROLOGIE : par où l'on crée, et ce qui a déjà
                été fait. En tête de l'onglet, parce que c'est le premier geste
                de la consultation. */}
            {estGastro && <BlocGastro patientId={patient.id} doctorId={doctorId} />}

            {/* Dentisterie : par où l'on crée une consultation, et où on les
                retrouve. En tête de l'onglet, parce que c'est le premier geste
                de la séance. */}
            {estDentiste && <BlocConsultationsDentaires patientId={patient.id} />}

            {/* La synthèse des maladies suivies et le poids : les deux choses
                qu'on veut voir AVANT de lire l'historique. Sur un Crohn ou une
                cirrhose, elles répondent aux trois questions de l'ouverture du
                dossier — depuis quand, sous quoi, où en est-on — et à celle
                qui change la conduite : a-t-il maigri ? */}
            {estGastro && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_260px] gap-4 items-start">
                <SynthesePathologie
                  patientId={patient.id}
                  doctorId={doctorId}
                  actes={{
                    consultations: actesGastro.consultations.map((c) => String(c.date_consultation)),
                    endoscopies: actesGastro.endoscopies.map((e) => ({
                      jour: String(e.date_examen),
                      titre: e.type_examen === 'coloscopie' ? 'Coloscopie' : 'Gastroscopie',
                    })),
                  }}
                />
                <SuiviPoids vitals={vitals} />
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {/* BRANCHE GÉNÉRALISTE : un seul bouton « Documents » pour les
                  cinq choses qu'il remet au patient. Le dentiste et le
                  pédiatre gardent leurs deux boutons — leurs documents ne sont
                  pas les mêmes, et cette liste n'a pas été pensée pour eux. */}
              {isGeneralDoctor(specialties) ? (
                <MenuDocuments patientId={patient.id} backHref={`/patients/${patient.id}`} />
              ) : (
                <>
                  <a href={`/ordonnance/patient/${patient.id}?back=${encodeURIComponent(`/patients/${patient.id}`)}`} className="flex items-center gap-1.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-3 py-2"><Pill className="h-4 w-4" /> Nouvelle ordonnance</a>
                  <a href={`/certificat/nouveau/${patient.id}?back=${encodeURIComponent(`/patients/${patient.id}`)}`} className="flex items-center gap-1.5 text-sm font-medium text-primary-600 border border-primary-200 rounded-lg px-3 py-2 hover:bg-primary-50"><FileText className="h-4 w-4" /> Nouveau certificat</a>
                </>
              )}
              <a href={`/dossier/${patient.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"><Printer className="h-4 w-4" /> Imprimer</a>
            </div>
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Historique des rendez-vous ({appts.length})</span></div>
              {loading ? <p className="text-sm text-gray-400">Chargement…</p> : appts.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Aucun rendez-vous pour ce patient.</p>
              ) : (
                <AppointmentList
                  appointments={appts}
                  onPayment={handlePayment}
                  onReschedule={handleReschedule}
                  onStatusChange={handleStatusChange}
                  onAttendanceChange={handleAttendance}
                />
              )}
            </div>
            {/* Ordonnances — masquées pour les professions non prescriptrices */}
            {!nonPrescriber && prescriptions.length > 0 && (
              <div className={sec}>
                <div className={secTitle}><span className="flex items-center gap-1.5"><Pill className="h-4 w-4" /> Ordonnances ({prescriptions.length})</span></div>
                <ul className="space-y-1.5">
                  {prescriptions.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <button onClick={() => window.open(`/ordonnance/p/${p.id}`, '_blank')} className="text-gray-700 hover:text-primary-600 truncate text-left flex-1">
                        <span className="text-gray-400">{formatDateShort(p.created_at)} · </span>{(p.content ?? '').split('\n').filter(Boolean)[0] || 'Ordonnance'}
                      </button>
                      <button onClick={() => renewPrescription(p)} title="Repartir de cette ordonnance pour en écrire une nouvelle" className="text-primary-500 hover:text-primary-700 shrink-0"><RefreshCw className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Certificats — l'écran de création promet qu'ils apparaissent ici */}
            {certificates.length > 0 && (
              <div className={sec}>
                <div className={secTitle}><span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> Certificats et consentements ({certificates.length})</span></div>
                <ul className="space-y-1.5">
                  {certificates.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => window.open(`/certificat/${c.id}`, '_blank')} className="text-sm text-gray-700 hover:text-primary-600 truncate text-left w-full">
                        <span className="text-gray-400">{formatDateShort(c.created_at)} · </span>
                      {/* Un consentement se repère dans la liste : c'est la
                          pièce qu'on cherche quand un patient conteste. */}
                      {String(c.type ?? '').startsWith('consent_') && (
                        <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 rounded px-1.5 py-0.5 mr-1.5">Consentement</span>
                      )}
                      {c.title}
                        {c.motif && <span className="text-gray-400"> — {c.motif}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
              </div>
              <div className="space-y-4">
                {/* Antécédents en lecture : on les voit sans pouvoir les
                    effacer d'un clic malheureux ; « Modifier » ouvre la fiche. */}
                {(editAllergies || editChronic || editSurgeries || editTreatments || editConditions.length > 0) && (
                  <div className={sec}>
                    <div className={secTitle}>
                      <span className="flex items-center gap-1.5"><HeartPulse className="h-4 w-4" /> Antécédents</span>
                      <button onClick={() => setEdition(true)} className="text-[11px] font-medium text-gray-500 hover:text-primary-600">Modifier</button>
                    </div>
                    <div className="space-y-2 text-sm">
                      {/* Les étiquettes se LISENT hors du mode modification :
                          c'est une information clinique, pas un réglage. En
                          tête de carte, parce qu'elles disent en trois mots ce
                          qu'on suit chez ce patient. Rien du tout quand il n'y
                          en a pas : pas de libellé vide, pas de place prise. */}
                      {editConditions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {editConditions.map((e) => (
                            <span key={e} className="bg-gray-100 text-gray-600 text-[11px] rounded-full px-2 py-0.5">{e}</span>
                          ))}
                        </div>
                      )}
                      {editChronic && <div><p className="text-[11px] text-gray-400">Maladies chroniques</p><p className="text-gray-700 whitespace-pre-wrap">{editChronic}</p></div>}
                      {editTreatments && <div><p className="text-[11px] text-gray-400">Traitements de fond</p><p className="text-gray-700 whitespace-pre-wrap">{editTreatments}</p></div>}
                      {editSurgeries && <div><p className="text-[11px] text-gray-400">Antécédents chirurgicaux</p><p className="text-gray-700 whitespace-pre-wrap">{editSurgeries}</p></div>}
                      {!isPsy && editVaccinations && <div><p className="text-[11px] text-gray-400">Vaccins</p><p className="text-gray-700 whitespace-pre-wrap">{editVaccinations}</p></div>}
                    </div>
                  </div>
                )}
            {/* Prochaine visite */}
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Prochaine visite</span></div>
              {nextApt ? (
                <div className="text-sm text-gray-700">
                  <p className="font-medium capitalize">{nextApt.date === todayStr ? "Aujourd'hui" : formatDateFr(nextApt.date)}</p>
                  <p className="text-gray-500">{String(nextApt.time).substring(0, 5)}{(nextApt as { consultation_type?: { name?: string } }).consultation_type?.name ? ` · ${(nextApt as { consultation_type?: { name?: string } }).consultation_type!.name}` : ''}</p>
                </div>
              ) : <p className="text-sm text-gray-400 italic">Aucun RDV planifié.</p>}

              {/* Programmer un rappel */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[11px] text-gray-400 mb-1.5 flex items-center gap-1"><BellRing className="h-3 w-3" /> Rappel de suivi</p>
                {recalls.filter((r) => r.status !== 'cancelled').map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 mb-1.5">
                    <span className="text-xs text-gray-700">{formatDateShort(r.due_date)}{r.reason ? ` — ${r.reason}` : ''}</span>
                    {RECALL_OUVERTS.includes(r.status) && <button onClick={() => cancelRecall(r.id)} className="text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input type="date" value={recallDate} min={todayStr} onChange={(e) => setRecallDate(e.target.value)} className="h-9 text-xs" />
                  <Button type="button" variant="outline" size="sm" onClick={addRecall} disabled={!recallDate || addingRecall} className="shrink-0"><Plus className="h-4 w-4" /></Button>
                </div>
                <Input value={recallReason} onChange={(e) => setRecallReason(e.target.value)} placeholder="Motif (optionnel)" className="h-9 text-xs mt-1.5" />
              </div>
            </div>
            {/* Notes */}
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> Notes ({consultNotes.length})</span></div>
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={isPsy ? 6 : 3}
                placeholder={isPsy ? 'Motif / Histoire / Évolution / Traitement / Prochain RDV…' : 'Ajouter une note datée…'}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 mb-2" />
              <Button size="sm" onClick={addConsultNote} disabled={addingNote || !newNote.trim() || newNote === PSY_NOTE_TEMPLATE} className="w-full"><Plus className="h-4 w-4 mr-1" /> Ajouter la note</Button>
              <div className="space-y-2 mt-3">
                {consultNotes.slice(0, 8).map((n) => (
                  <div key={n.id} className={`rounded-lg p-2.5 ${n.signed_at ? 'bg-green-50/70 border border-green-100' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="text-[11px] font-medium text-gray-500">Note du {formatDateTimeFr(n.created_at)}</p>
                      {n.signed_at ? (
                        <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5"><Check className="h-3 w-3" /> Signée</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <button onClick={() => signNote(n.id)} className="text-[10px] text-primary-600 hover:underline">Signer</button>
                          <button onClick={() => deleteNote(n.id)} className="text-gray-300 hover:text-red-500" title="Supprimer"><X className="h-3 w-3" /></button>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{n.note}</p>
                  </div>
                ))}
              </div>
            </div>
              </div>
            </div>
          )}

          {onglet === 'soins' && (
            <div className="space-y-4">
              {/* Orthodontie — dentistes. Un traitement se mesure en mois,
                  pas en séances : l'écran répond d'abord à « où en est-on ». */}
              {isDentalDoctor(specialties) && <OrthoCard patientId={patient.id} />}

              {/* Parodonte — dentistes. Un relevé par date, jamais écrasé :
                  c'est l'écart entre deux dates qui soigne, pas le chiffre. */}
              {isDentalDoctor(specialties) && <PerioCard patientId={patient.id} />}

              {/* Travaux de laboratoire — dentistes. La couronne qui n'est pas
                  revenue le jour de la pose est le premier rendez-vous perdu
                  d'un cabinet dentaire ; elle se suit donc dans le dossier. */}
              {isDentalDoctor(specialties) && (
                <LabWorksCard
                  patientId={patient.id}
                  rdvs={appts
                    .filter((a) => a.date >= todayStr && a.status !== 'cancelled')
                    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                    .slice(0, 12)
                    .map((a) => ({ id: a.id, date: a.date, time: String(a.time) }))}
                />
              )}
          {/* Sections spécialité */}
          {isDentalDoctor(specialties) && (
            <div id="bloc-anamnese" className="space-y-3">
              <AnamneseDentaire
                key={`an-${patient.id}`}
                patientId={patient.id}
                valeur={editAnamnese}
                maj={editAnamneseMaj}
                ouvertParDefaut={ouvrirAnamnese}
                onEnregistre={(a, jour) => { setEditAnamnese(a); setEditAnamneseMaj(jour) }}
              />
              {/* La même bannière, en une ligne, JUSTE au-dessus de l'arcade :
                  celle du haut de page est à plusieurs écrans de la dent sur
                  laquelle on va cliquer. */}
              <BandeauRisques
                compact
                risques={risquesActifs({ anamnese: editAnamnese, allergies: editAllergies })}
                verifier={aVerifier(editAnamnese)}
                remplie={anamneseRemplie(editAnamnese)}
                ancienne={anamneseAncienne(editAnamneseMaj)}
                maj={editAnamneseMaj}
              />
              {/* L'odontogramme reçoit les dents qui portent un cliché : le
                  repère se lit en balayant l'arcade, sans ouvrir quoi que ce
                  soit. Les images sont chargées UNE fois, par le bloc
                  d'imagerie ci-dessous, et remontées ici — deux requêtes
                  finiraient par afficher deux vérités sur la même arcade. */}
              <DentalChart key={patient.id} patientId={patient.id} doctorId={doctorId}
                dentsAvecImage={calculerDentsAvecImage(imagerie)} />
              <ImagerieDentaire patientId={patient.id} doctorId={doctorId} onImages={setImagerie} />
            </div>
          )}
          {suiviEnfant && (
            <div className="space-y-4">
              <GrowthChart key={`g-${patient.id}`} birthDate={editBirthDate} vitals={vitals} sex={editSex || null} gestationalWeeks={editGestWeeks ? Number(editGestWeeks) : null} />
              <VaccinationCard key={`v-${patient.id}`} patientId={patient.id} birthDate={editBirthDate} initial={patient.vaccines ?? {}} />
              {suiviDevelopppement && (
                <MilestonesCard key={`ms-${patient.id}`} patientId={patient.id} birthDate={editBirthDate} initial={patient.milestones ?? {}} />
              )}
            </div>
          )}
          {isPediatricDoctor(specialties) && !editBirthDate && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              📅 Renseignez la <b>date de naissance</b> (colonne de gauche) pour activer la courbe de croissance, le calendrier vaccinal et les repères de développement.
            </p>
          )}
          {/* Évolution des constantes — la liste de mesures ne permettait pas
              de suivre un hypertendu ou un diabétique sur un an. Le composant
              s'efface tout seul tant qu'il n'y a pas deux mesures. */}
          {!isPsy && vitals.length > 1 && (
            <VitalsTrend vitals={vitals as unknown as { id: string; measured_at: string; values: Record<string, number> }[]} vitalDefs={vitalDefsAll} />
          )}

          {/* Constantes (hors psy) */}
          {!isPsy && enabledVitals.length > 0 && (
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Activity className="h-4 w-4" /> Constantes ({vitals.length})</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                {enabledVitals.map((k) => (
                  <div key={k} className="relative">
                    <Input type="number" inputMode="decimal" value={vitalInput[k] ?? ''} onChange={(e) => setVitalInput((prev) => ({ ...prev, [k]: e.target.value }))} placeholder={vLabel(k)} className="pr-10 text-sm" />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">{vUnit(k)}</span>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addVital} disabled={savingVital}><Plus className="h-4 w-4 mr-1" /> {savingVital ? '…' : 'Enregistrer la mesure'}</Button>
              {vitals.length > 0 && (
                <div className="space-y-2 mt-3">
                  {vitals.map((m) => (
                    <div key={m.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-[11px] text-gray-400 mb-1 capitalize">{formatDateFr(m.measured_at)}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-700">
                        {Object.keys(m.values).map((k) => <span key={k}><b className="font-medium">{vLabel(k)}</b> {m.values[k]} {vUnit(k)}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
            </div>
          )}

          {onglet === 'argent' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
              <div className="space-y-4 min-w-0">
            {/* Devis / plan de traitement chiffré.
                Affiché pour toutes les spécialités : chiffrer un plan et le faire
                régler en plusieurs fois n'a rien de propre à la dentisterie.
                Seule la colonne « dent » est réservée aux dentistes, sinon elle
                n'aurait aucun sens pour un kinésithérapeute. */}
            <QuotesCard
              key={`dev-${patient.id}`}
              patientId={patient.id}
              dental={isDentalDoctor(specialties)}
              // Rendez-vous à venir : une séance du plan s'y rattache en un clic.
              rdvs={appts
                .filter((a) => a.date >= todayStr && a.status !== 'cancelled')
                .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                .slice(0, 12)
                .map((a) => ({ id: a.id, date: a.date, time: String(a.time) }))}
            />

            {/* Feuille de soins — seulement si le patient a une couverture :
                sans organisme, il n'y a rien à faire rembourser. */}
            {editMutuelle && editMutuelle !== 'Aucune' && (
              <FeuilleSoinsCard
                patientId={patient.id}
                dental={isDentalDoctor(specialties)}
                mutuelle={editMutuelle}
                inpe={doctorInpe}
                // L'imagerie sert à vérifier la règle des six mois de l'ANAM :
                // une radio « avant » plus ancienne que six mois ne justifie
                // plus l'acte, et celui-ci n'est pas remboursé.
                images={imagerie}
              />
            )}
            {/* Forfaits de séances prépayées.

                Même règle que le devis juste au-dessus : tant qu'il n'y a rien
                dedans, le bloc se réduit à une ligne. Dix séances de
                rééducation payées d'avance, un suivi psychologique réglé en
                bloc — c'est réel chez le kinésithérapeute et le psychologue,
                et ça n'existe pas chez un généraliste, payé à la consultation.
                Lui montrer un formulaire ouvert à chaque fiche patient, c'est
                lui faire lire trois fois par jour une proposition qu'il
                déclinera toujours.

                Pas d'exception pour le dentiste ici, contrairement au devis :
                le forfait n'est pas son outil, le devis l'est. */}
            {packages.filter((p) => p.status !== 'annule').length === 0 && !forfaitDeplie ? (
              <button
                type="button"
                onClick={() => setForfaitDeplie(true)}
                className="w-full flex items-center gap-1.5 text-left text-xs text-gray-400 hover:text-primary-600 border border-dashed border-gray-200 hover:border-primary-200 rounded-xl px-4 py-2.5 transition-colors"
              >
                <Ticket className="h-3.5 w-3.5 shrink-0" /> Créer un forfait de séances prépayées
              </button>
            ) : (
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Ticket className="h-4 w-4" /> Forfait séances</span></div>

              {packages.filter((p) => p.status !== 'annule').length === 0 ? (
                <p className="text-xs text-gray-400 italic mb-2">Aucun forfait. Créez-en un pour suivre les séances prépayées.</p>
              ) : (
                <ul className="space-y-2 mb-3">
                  {packages.filter((p) => p.status !== 'annule').map((p) => {
                    const left = p.total_sessions - p.used_sessions
                    const pct = Math.round((p.used_sessions / p.total_sessions) * 100)
                    const done = p.status === 'termine'
                    return (
                      <li key={p.id} className={`rounded-lg p-2.5 ${done ? 'bg-gray-50' : 'bg-primary-50/60'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {p.label || `Forfait ${p.total_sessions} séances`}
                          </span>
                          <span className={`text-[11px] font-semibold shrink-0 ${done ? 'text-gray-400' : 'text-primary-600'}`}>
                            {done ? 'Terminé' : `${left} restante${left > 1 ? 's' : ''}`}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-200 mt-2 overflow-hidden">
                          <div className={`h-full rounded-full ${done ? 'bg-gray-400' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          <span className="text-[11px] text-gray-500">
                            {p.used_sessions}/{p.total_sessions} utilisées
                            {/* Le prix d'UNE séance : c'est ce qu'on cherche quand
                                le patient demande ce que vaut la séance qu'il
                                vient de faire, ou ce qu'on lui rembourse. */}
                            {p.amount != null && <> · {p.amount} DH <span className="text-gray-400">({Math.round(Number(p.amount) / p.total_sessions)} DH la séance)</span></>}
                          </span>
                          <span className="flex items-center gap-1">
                            <button onClick={() => useSession(p, -1)} disabled={p.used_sessions === 0}
                              className="text-[11px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-30" title="Retirer une séance">−</button>
                            <button onClick={() => useSession(p, 1)} disabled={left === 0}
                              className="text-[11px] px-2 py-0.5 rounded bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-30">Utiliser</button>
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          <button
                            onClick={() => (journalOuvert === p.id ? setJournalOuvert(null) : chargerJournal(p.id))}
                            className="text-[11px] text-gray-500 hover:text-primary-600"
                          >
                            {journalOuvert === p.id ? 'Masquer les séances' : 'Voir les séances'}
                          </button>
                          <button onClick={() => cancelPackage(p)} className="text-[11px] text-gray-400 hover:text-red-500">
                            Annuler le forfait
                          </button>
                        </div>

                        {journalOuvert === p.id && (
                          <div className="mt-2 border-t border-white/70 pt-2">
                            {!journalDispo ? (
                              <p className="text-[11px] text-amber-700">Le journal des séances n&apos;est pas encore activé sur cette base (migration v64).</p>
                            ) : journal.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic">Aucune séance pointée depuis l&apos;activation du journal.</p>
                            ) : (
                              <ul className="space-y-1">
                                {journal.map((u) => (
                                  <li key={u.id} className="flex items-center justify-between text-[11px]">
                                    <span className={u.delta === 1 ? 'text-gray-600' : 'text-gray-400'}>
                                      {u.delta === 1 ? 'Séance utilisée' : 'Séance rendue'}
                                    </span>
                                    <span className="text-gray-400 tabular-nums">{formatDateTimeFr(u.used_at)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <input value={pkgLabel} onChange={(e) => setPkgLabel(e.target.value)} placeholder="Intitulé (optionnel)"
                  className="flex-1 min-w-[110px] text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
                <input value={pkgTotal} onChange={(e) => setPkgTotal(e.target.value)} type="number" min="1" placeholder="Nb"
                  className="w-14 text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
                <input value={pkgAmount} onChange={(e) => setPkgAmount(e.target.value)} type="number" min="0" placeholder="DH"
                  className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
                <Button size="sm" onClick={addPackage} disabled={savingPkg} className="h-[30px] text-xs">
                  {savingPkg ? '…' : 'Créer'}
                </Button>
              </div>
            </div>
            )}
              </div>
              <div className="space-y-4">
            {/* Encaissements */}
            <div className={sec}>
              <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                <span className="text-primary-600">{totalPaid} DH encaissés</span>
                {totalDue > 0 && <><span className="text-gray-300">·</span><span className="text-red-500">reste {totalDue} DH</span></>}
              </div>
              {billed.length === 0 ? <p className="text-xs text-gray-400 italic">Aucun encaissement.</p> : (
                <div className="divide-y divide-gray-50">
                  {billed.map((a) => {
                    const due = a.amount_due != null && (a.amount_paid ?? 0) < a.amount_due ? a.amount_due - (a.amount_paid ?? 0) : 0
                    return (
                      <div key={a.id} className="py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-gray-500">{formatDateShort(a.date)}</span>
                          {due > 0 ? (
                            <span className="flex items-center gap-2">
                              <span className="text-red-500 font-semibold">reste {due} DH</span>
                              <button
                                onClick={() => (soldeId === a.id ? setSoldeId(null) : ouvrirSolde(a.id, due))}
                                className="text-[11px] font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg px-2 py-1"
                              >
                                {soldeId === a.id ? 'Fermer' : 'Encaisser'}
                              </button>
                            </span>
                          ) : (
                            <span className="text-green-600 font-semibold">{a.amount_paid ?? 0} DH</span>
                          )}
                        </div>

                        {soldeId === a.id && due > 0 && (
                          <div className="mt-2 bg-gray-50 rounded-lg p-2 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Input type="number" min="1" max={due} value={soldeMontant}
                                onChange={(e) => setSoldeMontant(e.target.value)}
                                className="h-9 text-sm" aria-label="Montant reçu" />
                              <span className="text-xs text-gray-400">DH</span>
                            </div>
                            <select value={soldeMode} onChange={(e) => setSoldeMode(e.target.value as PaymentMethod)}
                              className="w-full h-9 text-sm border border-gray-200 rounded-lg px-2 bg-white">
                              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                              ))}
                            </select>
                            <Button size="sm" className="w-full" onClick={() => solder(a)} disabled={soldeEnCours}>
                              {soldeEnCours ? 'Encaissement…' : `Encaisser ${soldeMontant || 0} DH`}
                            </Button>
                            <p className="text-[11px] text-gray-400">
                              Un versement partiel est accepté : le reste suit le patient.
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
              </div>
            </div>
          )}

          {/* ── CHRONOLOGIE ────────────────────────────────────────────────
              Un seul fil, du plus récent au plus ancien, où se lit
              l'enchaînement : le compte rendu, l'anapath qui a suivi, le
              traitement qui en est sorti, le contrôle programmé. Les suivis
              encore à venir sont en tête — c'est ce qu'on perd de vue. */}
          {onglet === 'chronologie' && (
            <div className={sec}>
              {chronologie.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Ce dossier ne contient encore aucun événement.</p>
              ) : (
                <ol className="relative border-l border-gray-100 ml-2">
                  {chronologie.map((e: Evenement) => (
                    <li key={e.id} className="ml-4 pb-4 last:pb-0">
                      <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${COULEUR_EVENEMENT[e.nature]} ${e.futur ? 'ring-2 ring-amber-200' : ''}`} />
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <time className="text-[11px] font-medium text-gray-400 w-28 shrink-0">{formatDateFr(e.jour)}</time>
                        <span className="text-sm font-medium text-gray-900">{e.titre}</span>
                        {e.futur && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">à venir</span>}
                      </div>
                      {e.detail && <p className="text-xs text-gray-500 ml-[7.5rem] truncate">{e.detail}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {onglet === 'dossier' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className="space-y-4">
            {/* Documents */}
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Paperclip className="h-4 w-4" /> Documents ({documents.length})</span>
                <label className="text-xs font-medium text-primary-600 cursor-pointer hover:text-primary-700">{uploadingDoc ? '…' : '＋ Ajouter'}<input type="file" className="hidden" onChange={uploadDocument} disabled={uploadingDoc} /></label>
              </div>

              {/* La nature se choisit AVANT de prendre le fichier : une boîte
                  de dialogue qui s'ouvre après l'envoi se fait valider sans
                  être lue, et tout finit dans « Autre ». */}
              {estGastro && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {CATEGORIES_DOCUMENT.map((c) => (
                    <button key={c.cle} type="button" onClick={() => setCategorieImport(c.cle)}
                      className={`text-[11px] px-2 py-1 rounded-lg border transition ${categorieImport === c.cle ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {c.label}
                    </button>
                  ))}
                  <span className="text-[11px] text-gray-400 w-full">Nature du prochain document ajouté.</span>
                </div>
              )}

              {estGastro && documents.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2 pt-2 border-t border-gray-50">
                  {([['tout', 'Tout'], ...CATEGORIES_DOCUMENT.map((c) => [c.cle, c.label] as const)] as const).map(([cle, label]) => (
                    <button key={cle} type="button" onClick={() => setFiltreCategorie(cle as CategorieDocument | 'tout')}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition ${filtreCategorie === cle ? 'bg-gray-800 border-gray-800 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {documents.length === 0 ? <p className="text-xs text-gray-400 italic">Analyses, radios, ordonnances scannées… (max 10 Mo)</p> : (
                <ul className="space-y-1.5">
                  {documents
                    .filter((d) => !estGastro || filtreCategorie === 'tout' || (d.categorie ?? 'autre') === filtreCategorie)
                    .map((d) => (
                    <li key={d.id}>
                      <button onClick={() => downloadDocument(d)} className="text-sm text-primary-600 hover:underline truncate flex items-center gap-1.5 w-full text-left"><Download className="h-3.5 w-3.5 shrink-0" /> {d.file_name}</button>
                      {estGastro && d.categorie && (
                        <span className="text-[10px] text-gray-400 ml-5">{CATEGORIES_DOCUMENT.find((c) => c.cle === d.categorie)?.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Fusionner un doublon */}
            <div className={sec}>
              <div className={secTitle}><span className="flex items-center gap-1.5"><Users className="h-4 w-4" /> Fusionner un doublon</span></div>
              <p className="text-[11px] text-gray-400 mb-1.5">Deux fiches pour le même patient ? Recherchez l&apos;autre fiche pour tout regrouper ici.</p>
              <Input value={mergeSearch} onChange={(e) => setMergeSearch(e.target.value)} placeholder="Nom du doublon…" className="h-9" />
              {mergeResults.length > 0 && (
                <div className="mt-1.5 border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {mergeResults.map((p) => (
                    <button key={p.id} onClick={() => mergeDuplicate(p.id, `${p.first_name} ${p.last_name}`)}
                      className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-50 flex items-center justify-between gap-2">
                      <span>{p.first_name} {p.last_name}{p.phone ? ` · ${p.phone}` : ''}</span>
                      <span className="text-primary-600 font-medium shrink-0">Fusionner</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          <button onClick={deletePatient} className="w-full text-xs text-gray-400 hover:text-red-500 flex items-center justify-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Supprimer ce patient</button>
              </div>
              <div className="space-y-4">
            {/* Qui a consulté ce dossier */}
            <div className={sec}>
              <div className={secTitle}>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Accès au dossier</span>
                {!accesCharge && (
                  <button onClick={chargerAcces} className="text-[11px] font-medium text-gray-500 hover:text-primary-600">
                    Afficher
                  </button>
                )}
              </div>

              {!accesCharge ? (
                <p className="text-xs text-gray-400 italic">
                  Qui a ouvert ce dossier, et quand. Conservé pour vous permettre de répondre
                  si un patient s&apos;en inquiète.
                </p>
              ) : acces === null ? (
                <p className="text-xs text-gray-400">Chargement…</p>
              ) : acces.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Aucun accès enregistré pour l&apos;instant.</p>
              ) : (
                <ul className="space-y-1.5">
                  {acces.map((a) => {
                    const role = String((a.metadata as Record<string, unknown>)?.role ?? '')
                    const email = String((a.metadata as Record<string, unknown>)?.email ?? '')
                    return (
                      <li key={a.id} className="flex items-start justify-between gap-3 text-xs">
                        <span className="min-w-0">
                          <span className="text-gray-700">{ACTIONS_LISIBLES[a.action] ?? a.action}</span>
                          <span className="block text-gray-400 truncate">
                            {role === 'secretaire' ? 'Secrétaire' : 'Vous'}{email ? ` · ${email}` : ''}
                          </span>
                        </span>
                        <span className="text-gray-400 shrink-0 tabular-nums">
                          {new Date(a.created_at).toLocaleString('fr-FR', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
