// Consultation structurée — BRANCHE MÉDECINE GÉNÉRALE.
//
// Même formulaire que la gastro-entérologie et la dentisterie (un seul
// composant partagé), avec les rubriques et les trames du généraliste. Ce qui
// diffère ici, c'est ce qui l'entoure.
//
// ── POURQUOI LE DOSSIER EST AUTOUR, ET PAS À CÔTÉ ───────────────────────────
//
// Le généraliste consulte et documente dans le même mouvement : il lit un
// traitement de fond, relit la consultation de mars, et repart avec une
// ordonnance, un arrêt et un courrier au confrère. L'écran ne montrait que le
// formulaire ; tout le reste demandait de quitter la page, donc de perdre ce
// qui n'était pas encore enregistré. En pratique on ouvrait le dossier dans
// un second onglet et on recopiait.
//
// Le dossier est donc rangé AUTOUR du formulaire, en rubriques (état civil,
// allergies et antécédents, traitements, rappels, consultations passées,
// résultats, constantes, vaccins, documents à établir). Le formulaire ne se
// démonte jamais : changer de rubrique ne coûte pas une ligne de saisie.
//
// ── CE QUI EST LU ICI, ET CE QUI NE L'EST PAS ───────────────────────────────
//
// Tout est lu une fois, côté serveur, en parallèle. Les rubriques sont en
// LECTURE SEULE : modifier un antécédent ou importer un résultat reste le
// travail du dossier, qui sait le faire et le consigne. Une table absente
// (migration pas passée) rend une liste vide, jamais une erreur.
//
// ── LE RÉSUMÉ RESTE EN TÊTE ─────────────────────────────────────────────────
//
// Au-dessus de tout, pleine largeur : c'est lui qui porte « à vérifier
// aujourd'hui » — tension haute deux fois de suite, bilan qui date, rappel
// échu. Rangé dans une rubrique, il arriverait après la décision.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { isGeneralDoctor, VITAL_DEFS, specialitesDu, RECALL_OUVERTS } from '@/types'
import { formatDateFr, getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import ConsultationStructuree from '@/components/consultation/ConsultationStructuree'
import DossierDeConsultation, { type DonneesDossier } from '@/components/consultation/DossierDeConsultation'
import ResumePatient from '@/components/dashboard/ResumePatient'
import { preparerUn } from '@/lib/preparation-serveur'
import { RUBRIQUES_GENERALISTE, TRAMES_GENERALISTE, COLONNES_FACULTATIVES_GENERALISTE } from '@/lib/generaliste'

/** D'où l'on vient. Une adresse du site, jamais une URL externe : un `back`
 *  venu de la barre d'adresse ne doit pas pouvoir servir de tremplin. */
function retourSur(back?: string): string | null {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return null
}

export const dynamic = 'force-dynamic'

export default async function PageConsultationGeneraliste({
  params, searchParams,
}: {
  params: { patientId: string }
  searchParams: { apt?: string; id?: string; back?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, plan, specialty, specialties')
    .eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, 'records')) redirect('/appointments')
  if (!isGeneralDoctor(specialitesDu(doctor))) redirect('/appointments')

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, birth_date, sex, cin, phone, email, address, mutuelle, blood_group, allergies, chronic_conditions, surgeries, current_treatments, family_history')
    .eq('id', params.patientId).eq('doctor_id', doctor.id).single()
  if (!patient) notFound()

  let aptId: string | null = null
  if (searchParams.apt) {
    const { data: apt } = await supabase.from('appointments').select('id')
      .eq('id', searchParams.apt).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    aptId = apt?.id ?? null
  }

  // La consultation qu'on reprend.
  //
  // Par son identifiant quand on l'a — on vient de la liste du dossier. Sinon
  // par le RENDEZ-VOUS : le praticien qui écrit, retourne encaisser, puis
  // rouvre « Consultation » repartait d'une page blanche et laissait deux
  // consultations du même jour dans le dossier.
  let existant = null
  if (searchParams.id) {
    const { data } = await supabase.from('consultations').select('*')
      .eq('id', searchParams.id).eq('doctor_id', doctor.id).eq('patient_id', patient.id).maybeSingle()
    existant = data
  } else if (aptId) {
    const { data } = await supabase.from('consultations').select('*')
      .eq('appointment_id', aptId).eq('doctor_id', doctor.id).eq('patient_id', patient.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    existant = data
  }
  // Validée, elle ne se modifie plus : on montre le compte rendu, en gardant
  // le chemin du retour s'il y en a un.
  if (existant && existant.statut === 'validee') {
    const suite = searchParams.back ? `?back=${encodeURIComponent(searchParams.back)}` : ''
    redirect(`/generaliste/consultation/cr/${existant.id}${suite}`)
  }

  const aujourdhui = format(getNowInMaroc(), 'yyyy-MM-dd')

  // Tout le dossier en une fois. Les colonnes de v72 (`conditions`) et v87
  // (`anamnese_maj`) sont lues À PART : sur une base pas à jour, leur absence
  // viderait sinon toute la fiche patient.
  const [recentes, urgence, cst, rappels, consultations, documents, vaccins, ordonnances] = await Promise.all([
    supabase.from('patients').select('conditions, anamnese_maj').eq('id', patient.id).eq('doctor_id', doctor.id).maybeSingle(),
    // Encore à part, et pas avec les précédentes : la v97 peut être passée
    // sans la v72, ou l'inverse. Groupées, l'absence d'une colonne viderait
    // l'autre.
    supabase.from('patients').select('emergency_contact, emergency_phone').eq('id', patient.id).eq('doctor_id', doctor.id).maybeSingle(),
    supabase.from('vital_signs').select('values, measured_at')
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
      .order('measured_at', { ascending: false }).limit(2),
    supabase.from('recalls').select('id, due_date, reason')
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id).in('status', RECALL_OUVERTS)
      .order('due_date', { ascending: true }),
    supabase.from('consultations').select('id, date_consultation, motif, diagnostic, statut')
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
      .order('date_consultation', { ascending: false }).limit(15),
    supabase.from('patient_documents').select('id, file_name, file_path, categorie, created_at')
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('vaccinations').select('id, libelle, administre_le, rappel_le')
      .eq('patient_id', patient.id).order('administre_le', { ascending: false }),
    supabase.from('prescriptions').select('id, content, created_at')
      .eq('doctor_id', doctor.id).eq('patient_id', patient.id)
      .order('created_at', { ascending: false }).limit(3),
  ])

  // Dernières constantes, proposées et non imposées : le médecin les corrige
  // s'il remesure. Chez le généraliste c'est la TENSION qui compte le plus —
  // on affiche donc l'écart avec la prise précédente pour elle aussi, pas
  // seulement pour le poids.
  const valeurs = (cst.data?.[0]?.values ?? null) as Record<string, number> | null
  const precedentes = (cst.data?.[1]?.values ?? null) as Record<string, number> | null
  const lignes = valeurs
    ? VITAL_DEFS.filter((d) => typeof valeurs[d.key] === 'number')
        .map((d) => {
          const base = `${d.label} : ${valeurs[d.key]} ${d.unit}`
          // Un report de deux mesures, pas une interprétation : on affiche
          // l'écart, on ne le qualifie pas.
          const suivies = ['weight', 'systolic', 'diastolic']
          if (!suivies.includes(d.key) || typeof precedentes?.[d.key] !== 'number' || !cst.data?.[1]) return base
          const delta = Math.round((valeurs[d.key] - precedentes[d.key]) * 10) / 10
          if (delta === 0) return `${base} (stable depuis le ${formatDateFr(cst.data[1].measured_at)})`
          return `${base} (${delta > 0 ? '+' : ''}${delta} depuis le ${formatDateFr(cst.data[1].measured_at)})`
        })
    : []

  const antecedents = [
    (patient.chronic_conditions ?? '').trim(),
    (patient.surgeries ?? '').trim() ? `Chirurgicaux : ${(patient.surgeries ?? '').trim()}` : '',
    (patient.current_treatments ?? '').trim() ? `Traitement en cours : ${(patient.current_treatments ?? '').trim()}` : '',
    (patient.family_history ?? '').trim() ? `Familiaux : ${(patient.family_history ?? '').trim()}` : '',
  ].filter(Boolean).join('\n')

  const preparation = await preparerUn(supabase, doctor.id, patient.id, aujourdhui)

  // L'ADMINISTRATIF, en quatre listes. Seulement ce qui est renseigné : une
  // ligne « Mutuelle : — » occupe autant de place qu'une vraie et n'apprend
  // rien.
  //
  // Le groupe sanguin n'est pas ici : c'est une donnée de santé, elle se lit
  // avec les antécédents. L'état civil et la mutuelle, eux, ne disent rien
  // de ce que le patient a.
  const renseignes = (champs: { label: string; valeur: string }[]) =>
    champs.filter((c) => c.valeur.trim())

  const identite = renseignes([
    { label: 'Nom', valeur: `${patient.last_name ?? ''} ${patient.first_name ?? ''}`.trim() },
    { label: 'Né(e) le', valeur: patient.birth_date ? formatDateFr(patient.birth_date) : '' },
    { label: 'Âge', valeur: patient.age != null ? `${patient.age} ans` : '' },
    { label: 'Sexe', valeur: patient.sex === 'M' ? 'Masculin' : patient.sex === 'F' ? 'Féminin' : '' },
    { label: 'CIN', valeur: patient.cin ?? '' },
  ])
  const contact = renseignes([
    { label: 'Téléphone', valeur: patient.phone ?? '' },
    { label: 'E-mail', valeur: patient.email ?? '' },
    { label: 'Adresse', valeur: patient.address ?? '' },
  ])
  const contactUrgence = renseignes([
    { label: 'Personne', valeur: (urgence.data?.emergency_contact as string | null) ?? '' },
    { label: 'Téléphone', valeur: (urgence.data?.emergency_phone as string | null) ?? '' },
  ])
  const couverture = renseignes([
    { label: 'Mutuelle', valeur: patient.mutuelle ?? '' },
  ])

  const donnees: DonneesDossier = {
    identite,
    contact,
    urgence: contactUrgence,
    couverture,
    allergies: (patient.allergies ?? '').trim(),
    etiquettes: ((recentes.data?.conditions ?? []) as string[]).filter((e) => typeof e === 'string' && e.trim()),
    groupeSanguin: (patient.blood_group ?? '').trim(),
    chroniques: (patient.chronic_conditions ?? '').trim(),
    chirurgies: (patient.surgeries ?? '').trim(),
    familiaux: (patient.family_history ?? '').trim(),
    anamneseMaj: (recentes.data?.anamnese_maj as string | null) ?? null,
    traitements: (patient.current_treatments ?? '').trim(),
    ordonnances: (ordonnances.data ?? []) as DonneesDossier['ordonnances'],
    rappels: (rappels.data ?? []) as DonneesDossier['rappels'],
    // Celle qu'on est en train d'écrire n'a rien à faire dans l'historique.
    consultations: ((consultations.data ?? []) as DonneesDossier['consultations'])
      .filter((c) => c.id !== (existant?.id ?? null)),
    documents: (documents.data ?? []) as DonneesDossier['documents'],
    vaccins: (vaccins.data ?? []) as DonneesDossier['vaccins'],
    constantes: cst.data?.[0] ? { mesureLe: cst.data[0].measured_at, lignes } : null,
    aujourdhui,
  }

  // La gouttière est posée ICI : le gabarit racine ne met aucun retrait, et
  // sans elle le rail et les zones de saisie touchent le bord de l'écran —
  // insupportable sur un téléphone.
  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      {preparation && (
        <ResumePatient preparation={preparation} titre="Avant de commencer" compact />
      )}
      <DossierDeConsultation
        patient={patient}
        donnees={donnees}
        retourCr="/generaliste/consultation/cr"
      >
        <ConsultationStructuree
          doctorId={doctor.id}
          patient={patient}
          appointmentId={aptId}
          existant={existant}
          dossier={{ antecedents, allergies: (patient.allergies ?? '').trim(), mesures: lignes.join('\n') }}
          rubriques={RUBRIQUES_GENERALISTE}
          trames={TRAMES_GENERALISTE}
          colonnesFacultatives={COLONNES_FACULTATIVES_GENERALISTE}
          retourCr="/generaliste/consultation/cr"
          retour={retourSur(searchParams.back)}
          pleineLargeur
        />
      </DossierDeConsultation>
    </div>
  )
}
