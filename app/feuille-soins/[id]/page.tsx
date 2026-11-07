// Feuille de soins imprimable.
//
// ACCÈS : le médecin propriétaire, forfait Cabinet complet. Comme tous les
// documents imprimables de l'application, elle ne s'ouvre pas depuis l'espace
// secrétaire : la feuille porte une attestation signée du praticien.
//
// Les données sont celles ENREGISTRÉES SUR LA FEUILLE (organisme, assuré,
// immatriculation), pas celles de la fiche patient aujourd'hui : rouvrir une
// feuille de mars ne doit pas la réécrire avec la couverture d'octobre.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { FEUILLE_FONCTION } from '@/lib/feuilles-soins-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { imprimeDisponible, organismePour, type Organisme } from '@/lib/organismes'
import { specialitesDu } from '@/types'
import { isDentalDoctor } from '@/lib/dental'
import { colonneAbsente } from '@/lib/migrations'
import { type LigneSoin } from './FeuilleDocument'
import FeuilleIndisponible from './FeuilleIndisponible'
import { type ActeImprime } from '@/lib/feuilles-soins'
import GabaritANAM from './GabaritANAM'
import GabaritCNSS from './GabaritCNSS'
import GabaritCNOPS from './GabaritCNOPS'
import GabaritFAR from './GabaritFAR'
import GabaritRMA from './GabaritRMA'
import GabaritCNSSMedecin from './GabaritCNSSMedecin'
import GabaritCNOPSMedecin from './GabaritCNOPSMedecin'
import GabaritRMAMedecin from './GabaritRMAMedecin'

export const dynamic = 'force-dynamic'

export default async function FeuilleSoinsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, specialties, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, FEUILLE_FONCTION)) redirect('/appointments')

  const { data: feuille } = await supabase
    .from('care_sheets')
    .select('*, items:care_sheet_items(tooth, code, label, amount, position), patient:patients(first_name, last_name, cin, birth_date, sex, mutuelle)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!feuille) notFound()

  // Pas de logo ici : un imprimé officiel n'en porte pas, et le cadre
  // « Cachet et signature » est fait pour le tampon du cabinet.
  const patient = (Array.isArray(feuille.patient) ? feuille.patient[0] : feuille.patient) as
    { first_name?: string; last_name?: string; cin?: string | null; birth_date?: string | null; sex?: string | null; mutuelle?: string | null } | null
  const patientNom = patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : ''
  // L'organisme du document.
  //
  // Celui ENREGISTRÉ SUR LA FEUILLE d'abord : rouvrir une feuille de mars ne
  // doit pas la réécrire avec la couverture d'octobre (v65). Mais quand la
  // feuille n'en porte AUCUN — elle a été établie avant que la case
  // « Mutuelle » ne soit remplie sur la fiche —, on prend celui du patient
  // aujourd'hui. Sans ce repli, ces feuilles-là sortaient en version neutre
  // pour toujours, alors que la caisse du patient était connue : le praticien
  // voyait « FAR » sur la fiche et recevait un imprimé MonRDV.
  // Une chaîne vide compte comme une absence : une feuille ancienne peut
  // porter '' là où une récente porte null.
  const organismeNom = String(feuille.insurer ?? '').trim() || patient?.mutuelle || null
  const organisme = organismePour(organismeNom)

  // ── Ce que la v95 ajoute, lu À PART ───────────────────────────────────────
  //
  // La nature de la feuille, les cases « Type de soins » et la cotation de
  // chaque acte. Requête séparée et tolérante : tant que la migration n'est
  // pas passée, cette lecture échoue proprement et la page retombe sur la
  // feuille neutre — celle d'avant, à agrafer au formulaire de l'organisme.
  //
  // Le garde-fou porte sur la MIGRATION, pas sur le contenu : sans ces
  // colonnes, l'écran n'a aucun moyen de coter un acte ni de distinguer une
  // demande d'accord d'une exécution, et le gabarit n'aurait rien à imprimer
  // dans la moitié de ses cases.
  //
  // Une cotation laissée vide par le praticien, elle, n'empêche pas d'imprimer
  // : la colonne sort vide, il la complète à la main. C'est l'écran qui
  // l'avertit au moment d'établir la feuille (lib/feuille-regles.ts).
  const { data: v95, error: errV95 } = await supabase
    .from('care_sheets')
    .select('nature, types_soins, entente_no, items:care_sheet_items(position, acte_date, lettre_cle, coefficient, valeur_cle)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (errV95 && !colonneAbsente(errV95.code)) {
    console.error('[Feuille de soins] cotation illisible :', errV95.message)
  }

  const gabaritDisponible = !!v95 && !errV95

  // ── DÉTIENT-ON SON IMPRIMÉ, POUR CE PRATICIEN-LÀ ? ───────────────────────
  //
  // Une caisse ne publie pas UN formulaire mais plusieurs, un par profession.
  // MonRDV détient aujourd'hui, scannés et remplissables :
  //
  //   · CNSS   — « Feuille de Soins Maladie » (ANAM 1.2.01.01) pour le médecin
  //              et « Feuille de soins dentaires » (1.2.03.01) pour le dentiste
  //   · CNOPS  — 1.1.01.01 (médecin) et 1.1.03.01 (dentiste)
  //   · RMA    — « Déclaration de maladie » FOR.GM-021 (médecin) et
  //              « Déclaration dentaire » FOR-GM-022 (dentiste)
  //   · FAR    — un carnet unique, commun à tout le corps de santé ; seule sa
  //              page 4 est celle du dentiste, et on la retire aux autres.
  //
  // Pour tout le reste — assurance privée, mutuelle saisie à la main, feuille
  // sans organisme — il n'y a rien à imprimer, et c'est ce qu'on dit. Le
  // logiciel sortait jusqu'ici une « feuille de soins MonRDV » à agrafer au
  // formulaire de la caisse : un papier qui ressemble à une feuille de soins
  // sans en être une se fait renvoyer. Un formulaire officiel se remplit, il
  // ne se dessine pas.
  const estDentiste = isDentalDoctor(specialitesDu(doctor))
  const aLImprime = imprimeDisponible(organisme, estDentiste)

  if (!organisme || !aLImprime || !gabaritDisponible || !v95) {
    return (
      <FeuilleIndisponible
        patientId={feuille.patient_id as string}
        organismeNom={organismeNom}
        raison={raisonIndisponible(organisme, estDentiste, gabaritDisponible)}
      />
    )
  }

  // L'identifiant fiscal arrive avec la même migration : on est ici, donc
  // elle est passée. Lu à part tout de même, pour ne pas alourdir la requête
  // du tronc commun d'une colonne dont six autres écrans n'ont que faire.
  const { data: fisc } = await supabase
    .from('doctors').select('identifiant_fiscal').eq('id', doctor.id).maybeSingle()

  const cotations = new Map<number, Record<string, unknown>>()
  for (const c of ((v95.items ?? []) as Record<string, unknown>[])) {
    cotations.set(Number(c.position ?? 0), c)
  }
  const actes: ActeImprime[] = ((feuille.items ?? []) as LigneSoin[]).map((it, i) => ({
    ...it,
    position: (it as unknown as { position?: number }).position ?? i,
    ...(cotations.get((it as unknown as { position?: number }).position ?? i) ?? {}),
  })) as ActeImprime[]

  // Tous les gabarits reçoivent exactement la même chose : seuls la trame et
  // l'ordre des blocs changent d'un imprimé à l'autre.
  const commun = {
    organisme,
    praticien: {
      nom: lignesEnTete(doctor).nom,
      specialite: doctor.specialty ?? null,
      adresse: lignesEnTete(doctor).adresse,
      telephone: lignesEnTete(doctor).telephone,
      inpe: doctor.inpe ?? null,
      ice: doctor.ice ?? null,
      identifiantFiscal: (fisc?.identifiant_fiscal as string | null) ?? null,
      ville: doctor.city ?? null,
    },
    patientId: feuille.patient_id as string,
    // Rien de l'assuré n'est transmis aux gabarits : sa partie du formulaire
    // s'imprime vierge, il la remplit de sa main et signe dessous.
    beneficiaire: {
      nom: patientNom,
      dateNaissance: patient?.birth_date ?? null,
      cin: patient?.cin ?? null,
      sexe: patient?.sex ?? null,
    },
    feuille: {
      jour: feuille.care_date as string,
      nature: (v95.nature === 'entente_prealable' ? 'entente_prealable' : 'execution') as 'execution' | 'entente_prealable',
      typesSoins: (v95.types_soins as string[] | null) ?? [],
      ententeNo: (v95.entente_no as string | null) ?? null,
      total: Number(feuille.total ?? 0),
    },
    actes,
  }

  // Le carnet des FAR est le seul imprimé commun aux deux professions : une
  // page en moins pour qui n'est pas dentiste, et c'est tout.
  if (organisme.gabarit === 'far') return <GabaritFAR {...commun} avecPageDentiste={estDentiste} />
  if (organisme.cle === 'rma') return estDentiste ? <GabaritRMA {...commun} /> : <GabaritRMAMedecin {...commun} />
  if (organisme.cle === 'cnops') return estDentiste ? <GabaritCNOPS {...commun} /> : <GabaritCNOPSMedecin {...commun} />
  if (organisme.cle === 'cnss') return estDentiste ? <GabaritCNSS {...commun} /> : <GabaritCNSSMedecin {...commun} />
  // Un organisme déclaré comme ayant un imprimé mais sans gabarit écrit : il
  // reste la reproduction HTML de l'ANAM, qui est dentaire. Pour un médecin,
  // on préfère le dire.
  if (estDentiste) return <GabaritANAM {...commun} />
  return (
    <FeuilleIndisponible
      patientId={feuille.patient_id as string}
      organismeNom={organismeNom}
      raison={`MonRDV n'a pas encore de gabarit « médecin » pour ${organisme.nom}.`}
    />
  )
}

/** Pourquoi aucune feuille ne sort, dans les mots de ce cas-là.
 *  « Indisponible » tout court laisse croire à une panne, et le praticien
 *  rappelle le cabinet. */
function raisonIndisponible(
  organisme: Organisme | null, estDentiste: boolean, migrationPassee: boolean,
): string {
  if (!organisme) {
    return "Cette feuille ne porte aucun organisme, et sans caisse il n'y a pas de formulaire à remplir. Inscrivez la mutuelle sur la fiche du patient, puis rétablissez la feuille."
  }
  if (!migrationPassee) {
    return `L'imprimé ${organisme.nom} existe dans MonRDV, mais il n'a pas pu être produit : la base de données n'est pas à jour (migration v95).`
  }
  if (organisme.imprimes.length === 0) {
    return `MonRDV ne détient pas le formulaire de ${organisme.nom}. Les imprimés remplis automatiquement sont pour l'instant ceux de la CNSS, du CNOPS, de RMA Watanya et de la Mutuelle des FAR.`
  }
  const detenu = organisme.imprimes.includes('dentaire') ? 'dentaire' : 'médecin'
  const manquant = estDentiste ? 'dentaire' : 'médecin'
  return `De ${organisme.nom}, MonRDV ne détient que l'imprimé ${detenu}. Celui du ${manquant} est un autre formulaire, et remettre l'un pour l'autre fait renvoyer le dossier.`
}
