// Certificat médical imprimable — réservé au médecin propriétaire.
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { formatDateFr } from '@/lib/utils'
import { PrintBar } from './PrintBar'
import { canAccess } from '@/lib/plan'
import { getCabinetLogoUrl } from '@/lib/cabinet-logo-server'
import { COLONNES_EN_TETE, lignesEnTete } from '@/lib/document-entete'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'

export const dynamic = 'force-dynamic'

export default async function CertificatPage({ params }: { params: { id: string } }) {
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
  if (!canAccess(doctor.plan, 'prescriptions')) redirect('/appointments')

  const { data: cert } = await supabase
    .from('certificates')
    .select('*, patient:patients(first_name, last_name, age, cin)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!cert) notFound()

  // Logo lu à part de la fiche (voir lib/cabinet-logo-server.ts) : sans la
  // migration v57, le certificat s'imprime sans logo au lieu de tomber.
  const logoUrl = await getCabinetLogoUrl(supabase, doctor.id)

  // Consentement : le patient signe, le praticien contresigne. On le reconnaît
  // à la clé du modèle (`consent_…`), ce qui évite une colonne de plus en base
  // et laisse intacts les certificats déjà émis.
  const estConsentement = String(cert.type ?? '').startsWith('consent_')
  const patientCert = (Array.isArray(cert.patient) ? cert.patient[0] : cert.patient) as
    { first_name?: string; last_name?: string } | null
  const nomPatient = patientCert
    ? `${patientCert.first_name ?? ''} ${patientCert.last_name ?? ''}`.trim()
    : ''

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <PrintBar />

      {/* Feuille A4 */}
      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg px-12 py-10 print:shadow-none print:rounded-none print:px-0 print:py-0">
        {/* En-tête commun (components/shared/EnTeteDocument.tsx), disposition
            centrée : la même que l'ordonnance, dont ce certificat recopiait
            déjà le balisage à la main. */}
        <EnTeteDocument lignes={lignesEnTete(doctor)} logoUrl={logoUrl} disposition="centree" />

        {/* Titre du document — centré avec filet */}
        <div className="text-center mb-6">
          <h2 className="inline-block text-sm font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1">
            {cert.title}
          </h2>
        </div>

        {/* Lieu et date — aligné à droite */}
        <p className="text-[13px] text-gray-600 text-right mb-8">
          {doctor.city ? `${doctor.city}, le ` : 'Le '}{formatDateFr(cert.created_at)}
        </p>

        {/* Corps du certificat */}
        <div className="text-[13px] text-gray-900 leading-relaxed whitespace-pre-wrap min-h-[14rem]">
          {cert.content}
        </div>

        {/* Signatures. Un certificat n'en porte qu'une — celle du praticien.
            Un consentement en porte DEUX, et c'est celle du patient qui compte :
            un document que personne n'a signé ne prouve rien le jour où l'on
            conteste avoir été informé. */}
        {estConsentement ? (
          <div className="mt-16 grid grid-cols-2 gap-10">
            <div>
              <p className="text-[12px] text-gray-700 mb-1">
                {nomPatient || 'Le patient'}
                <span className="text-gray-400"> — ou son représentant légal</span>
              </p>
              <p className="text-[11px] text-gray-500 mb-12">
                Porter la mention manuscrite « Lu et approuvé », puis dater et signer.
              </p>
              <div className="border-t border-gray-400 pt-1.5">
                <p className="text-xs text-gray-500">Date et signature</p>
              </div>
            </div>
            <div className="text-center self-end">
              <div className="border-t border-gray-400 pt-1.5">
                <p className="text-xs text-gray-500">Signature et cachet du praticien</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-20 flex justify-end">
            <div className="text-center">
              <div className="w-52 border-t border-gray-400 pt-1.5">
                <p className="text-xs text-gray-500">Signature et cachet</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
