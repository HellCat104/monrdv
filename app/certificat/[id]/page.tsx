// Certificat médical imprimable — réservé au médecin propriétaire.
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { formatDateFr } from '@/lib/utils'
import { PrintBar } from './PrintBar'

export const dynamic = 'force-dynamic'

export default async function CertificatPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, ice, inpe')
    .eq('email', user.email)
    .single()
  if (!doctor) notFound()

  const { data: cert } = await supabase
    .from('certificates')
    .select('*, patient:patients(first_name, last_name, age, cin)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()
  if (!cert) notFound()

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <PrintBar />

      {/* Feuille A4 */}
      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg px-12 py-10 print:shadow-none print:rounded-none print:px-0 print:py-0">
        {/* En-tête médecin — centré */}
        <header className="text-center border-b-2 border-gray-800 pb-4 mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dr. {doctor.name}</h1>
          {doctor.specialty && <p className="text-sm text-gray-600 mt-0.5">{doctor.specialty}</p>}
          <p className="text-xs text-gray-500 mt-2">
            {[doctor.address, doctor.city].filter(Boolean).join(', ')}
            {doctor.phone && `${(doctor.address || doctor.city) ? ' · ' : ''}Tél : ${doctor.phone}`}
          </p>
          {(doctor.ice || doctor.inpe) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {doctor.inpe && <span>INPE : {doctor.inpe}</span>}
              {doctor.ice && doctor.inpe && <span> · </span>}
              {doctor.ice && <span>ICE : {doctor.ice}</span>}
            </p>
          )}
        </header>

        {/* Titre du document — centré avec filet */}
        <div className="text-center mb-6">
          <h2 className="inline-block text-lg font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1">
            {cert.title}
          </h2>
        </div>

        {/* Lieu et date — aligné à droite */}
        <p className="text-sm text-gray-600 text-right mb-8">
          {doctor.city ? `${doctor.city}, le ` : 'Le '}{formatDateFr(cert.created_at)}
        </p>

        {/* Corps du certificat */}
        <div className="text-[15px] text-gray-900 leading-loose whitespace-pre-wrap min-h-[14rem]">
          {cert.content}
        </div>

        {/* Signature */}
        <div className="mt-20 flex justify-end">
          <div className="text-center">
            <div className="w-52 border-t border-gray-400 pt-1.5">
              <p className="text-xs text-gray-500">Signature et cachet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
