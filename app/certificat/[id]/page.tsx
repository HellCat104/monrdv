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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patient = cert.patient as any

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 print:bg-white print:py-0">
      <PrintBar />

      {/* Feuille A4 */}
      <div className="max-w-2xl mx-auto bg-white shadow-sm rounded-lg p-10 print:shadow-none print:rounded-none print:p-0">
        {/* En-tête médecin */}
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dr. {doctor.name}</h1>
            <p className="text-sm text-gray-500">{doctor.specialty}</p>
            {doctor.address && <p className="text-sm text-gray-500 mt-1">{doctor.address}</p>}
            {doctor.city && <p className="text-sm text-gray-500">{doctor.city}</p>}
            {doctor.phone && <p className="text-sm text-gray-500 mt-1">Tél : {doctor.phone}</p>}
            {(doctor.ice || doctor.inpe) && (
              <p className="text-xs text-gray-400 mt-1">
                {doctor.inpe && <span>INPE : {doctor.inpe}</span>}
                {doctor.ice && doctor.inpe && <span> · </span>}
                {doctor.ice && <span>ICE : {doctor.ice}</span>}
              </p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-800 uppercase">{cert.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{formatDateFr(cert.created_at)}</p>
            {patient && (
              <p className="text-xs text-gray-400 mt-1">
                {patient.first_name} {patient.last_name}
              </p>
            )}
          </div>
        </div>

        {/* Corps du certificat */}
        <div className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap min-h-[16rem]">
          {cert.content}
        </div>

        {/* Signature */}
        <div className="mt-16 flex justify-end">
          <div className="text-center">
            <div className="w-48 border-t border-gray-300 pt-1">
              <p className="text-xs text-gray-400">Signature et cachet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
