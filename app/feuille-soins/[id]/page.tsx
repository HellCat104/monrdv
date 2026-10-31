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
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { champsRenseignes, organismePour } from '@/lib/organismes'
import { colonneAbsente } from '@/lib/migrations'
import { FeuilleDocument, type LigneSoin } from './FeuilleDocument'
import GabaritANAM, { type ActeImprime } from './GabaritANAM'

export const dynamic = 'force-dynamic'

export default async function FeuilleSoinsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors').select(`id, plan, ${COLONNES_EN_TETE}`).eq('email', user.email).single()
  if (!doctor) notFound()
  if (!canAccess(doctor.plan, FEUILLE_FONCTION)) redirect('/appointments')

  const { data: feuille } = await supabase
    .from('care_sheets')
    .select('*, items:care_sheet_items(tooth, code, label, amount, position), patient:patients(first_name, last_name, cin, birth_date, sex)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!feuille) notFound()

  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)
  const patient = (Array.isArray(feuille.patient) ? feuille.patient[0] : feuille.patient) as
    { first_name?: string; last_name?: string; cin?: string | null; birth_date?: string | null; sex?: string | null } | null
  const patientNom = patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : ''
  const organisme = organismePour(feuille.insurer as string | null)

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
  if (gabaritDisponible && organisme && organisme.gabarit === 'anam') {
    // L'identifiant fiscal arrive avec la même migration : on est ici, donc
    // elle est passée. Lu à part tout de même, pour ne pas alourdir la requête
    // du tronc commun d'une colonne dont six autres écrans n'ont que faire.
    const { data: fisc } = await supabase
      .from('doctors').select('identifiant_fiscal').eq('id', doctor.id).maybeSingle()

    const cotations = new Map<number, Record<string, unknown>>()
    for (const c of (v95.items ?? []) as Record<string, unknown>[]) {
      cotations.set(Number(c.position ?? 0), c)
    }
    const actes: ActeImprime[] = ((feuille.items ?? []) as LigneSoin[]).map((it, i) => ({
      ...it,
      position: (it as unknown as { position?: number }).position ?? i,
      ...(cotations.get((it as unknown as { position?: number }).position ?? i) ?? {}),
    })) as ActeImprime[]

    return (
      <GabaritANAM
        organisme={organisme}
        praticien={{
          nom: lignesEnTete(doctor).nom,
          specialite: doctor.specialty ?? null,
          adresse: lignesEnTete(doctor).adresse,
          telephone: lignesEnTete(doctor).telephone,
          inpe: doctor.inpe ?? null,
          ice: doctor.ice ?? null,
          identifiantFiscal: (fisc?.identifiant_fiscal as string | null) ?? null,
          ville: doctor.city ?? null,
        }}
        patientId={feuille.patient_id as string}
        assure={(feuille.insurer_data as Record<string, string> | null) ?? {}}
        beneficiaire={{
          nom: patientNom,
          dateNaissance: patient?.birth_date ?? null,
          cin: patient?.cin ?? null,
          sexe: patient?.sex ?? null,
        }}
        feuille={{
          jour: feuille.care_date as string,
          nature: v95.nature === 'entente_prealable' ? 'entente_prealable' : 'execution',
          typesSoins: (v95.types_soins as string[] | null) ?? [],
          ententeNo: (v95.entente_no as string | null) ?? null,
          total: Number(feuille.total ?? 0),
        }}
        actes={actes}
      />
    )
  }

  return (
    <FeuilleDocument
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      ville={doctor.city ?? null}
      patientId={feuille.patient_id as string}
      patientNom={patientNom}
      patientCin={patient?.cin ?? null}
      organisme={(feuille.insurer as string | null) ?? null}
      // Les champs que CET organisme demande, dans son ordre (lib/organismes.ts).
      champsAssure={champsRenseignes(
        feuille.insurer as string | null,
        (feuille.insurer_data as Record<string, unknown> | null) ?? null,
      )}
      intituleOrganisme={organisme?.intitule ?? null}
      dateSoins={feuille.care_date as string}
      items={(feuille.items ?? []) as LigneSoin[]}
    />
  )
}
