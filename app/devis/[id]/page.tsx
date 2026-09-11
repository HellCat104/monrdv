// Devis imprimable — le plan de traitement chiffré que le praticien remet au
// patient. C'est le document central du parcours dentaire : le patient le
// rapporte chez lui, réfléchit, revient l'accepter. Il doit donc se suffire à
// lui-même : qui propose, à qui, quels actes sur quelles dents, pour combien,
// selon quel échéancier, jusqu'à quand — et où signer.
//
// ── UN DEVIS N'EST PAS UNE FACTURE ──────────────────────────────────────────
//
// Voir l'en-tête de supabase/migration_v54_devis.sql : le devis dit ce qui est
// PROPOSÉ, il ne produit aucune recette et ne porte aucun numéro de la série
// F-AAAA-NNNN — ce numéro naît à l'encaissement, sur chaque versement, qui a sa
// propre facture (app/facture/devis/[id]). Un patient, un fiduciaire ou un
// contrôleur ne doit pas pouvoir prendre cette page pour une facture. D'où :
//   - AUCUN numéro. Pas même une référence dérivée de l'identifiant : la
//     facture sans numéro officiel affiche déjà « F-XXXXXXXX » (8 caractères
//     de l'identifiant), et « D-XXXXXXXX » en serait le sosie. Le devis se
//     reconnaît à son patient, sa date et son intitulé ;
//   - la requête ne lit des versements que leur MONTANT, jamais leur numéro
//     de facture : ce qui n'est pas chargé ne peut pas s'imprimer par erreur ;
//   - la disposition centrée des documents de soins (ordonnance, certificat),
//     et non celle des factures avec son cartouche « FACTURE · N° · date » ;
//   - la mention, en pied, qu'il ne s'agit ni d'une facture ni d'un reçu ;
//   - l'échéancier est titré PRÉVISIONNEL et dit en toutes lettres qu'il ne
//     s'agit ni de sommes dues à ce jour ni de paiements reçus.
//
// ── DATE D'ÉMISSION ─────────────────────────────────────────────────────────
//
// La date de remise au patient (`proposed_at`, posée quand le médecin passe
// le devis en « Proposé au patient »), à défaut la date de création. Jamais la
// date d'impression : réimprimer le devis un mois plus tard ne doit pas
// décaler la date à partir de laquelle court « Valable 3 mois ». La date
// d'impression figure à part, en pied de page, sous ce nom.
//
// ── ACCÈS ───────────────────────────────────────────────────────────────────
//
// Le médecin propriétaire du devis, avec le forfait qui ouvre les devis
// (DEVIS_FONCTION, lib/devis-server.ts — la même règle que les routes
// /api/quotes). La secrétaire, même autorisée à consulter les devis
// (`quotes_view`), ne l'imprime pas : remettre un devis au patient, c'est lui
// présenter un plan de traitement et s'engager sur un prix, au nom et sous
// l'en-tête du praticien — y compris un brouillon que celui-ci n'a pas fini de
// chiffrer. C'est aussi la règle de tous les documents imprimables de
// l'application : aucun ne s'ouvre depuis l'espace secrétaire.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { DEVIS_FONCTION } from '@/lib/devis-server'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { DevisDocument, type LigneDevis, type EcheanceDevis } from './DevisDocument'
import type { QuoteStatus } from '@/types'

interface Props { params: { id: string } }

export const dynamic = 'force-dynamic'

export default async function DevisPage({ params }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select(`id, plan, ${COLONNES_EN_TETE}`)
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  // Le forfait se contrôle ici aussi : la page est atteignable par son URL,
  // même quand l'interface n'affiche plus le lien qui y mène.
  if (!canAccess(doctor.plan, DEVIS_FONCTION)) redirect('/appointments')

  // Propriété vérifiée dans la requête même (`doctor_id`), la RLS v54 en
  // second rempart. Un devis d'un autre cabinet répond 404, comme les routes.
  // Versements : le montant SEUL (voir en tête de fichier). `*` sur le devis
  // plutôt que la liste des colonnes : sans la migration v58, nommer
  // `validity_text` ferait échouer la requête et le devis tomberait en 404 ;
  // avec `*`, la colonne est simplement absente et la ligne ne s'imprime pas.
  const { data: quote } = await supabase
    .from('quotes')
    .select(`*, patient:patients(first_name, last_name),
      items:quote_items(tooth, label, unit_price, quantity, position, created_at),
      payments:quote_payments(amount),
      installments:quote_installments(due_date, amount, label)`)
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .maybeSingle()
  if (!quote) notFound()

  // Logo lu à part de la fiche (lib/cabinet-logo-server.ts) : sans la
  // migration v57, le devis s'imprime sans logo au lieu de tomber.
  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)

  const patient = (Array.isArray(quote.patient) ? quote.patient[0] : quote.patient) as
    { first_name?: string; last_name?: string } | null

  return (
    <DevisDocument
      lignes={lignesEnTete(doctor)}
      logoUrl={logoUrl}
      ville={doctor.city ?? null}
      patientId={quote.patient_id as string}
      patientNom={patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : ''}
      intitule={(quote.label as string | null) ?? null}
      statut={quote.status as QuoteStatus}
      // Date de remise au patient, à défaut de création — jamais d'impression
      // (voir « DATE D'ÉMISSION » en tête de fichier).
      emission={(quote.proposed_at as string | null) ?? (quote.created_at as string)}
      validite={(quote.validity_text as string | null | undefined) ?? null}
      items={(quote.items ?? []) as LigneDevis[]}
      versements={(quote.payments ?? []) as { amount: number }[]}
      echeances={(quote.installments ?? []) as EcheanceDevis[]}
    />
  )
}
