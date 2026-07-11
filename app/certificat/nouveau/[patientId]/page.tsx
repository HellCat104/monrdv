// Nouveau certificat sur une page dédiée (revient d'où on vient via ?back).
// Évite de renvoyer le médecin dans la fiche/agenda pendant une consultation.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewCertificate from './NewCertificate'

export const dynamic = 'force-dynamic'

function safeBack(back?: string): string {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return '/patients'
}

export default async function NewCertificatePage({ params, searchParams }: { params: { patientId: string }; searchParams: { back?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase.from('doctors').select('id, name').eq('email', user.email).single()
  if (!doctor) notFound()

  const { data: patient } = await supabase
    .from('patients')
    .select('id, first_name, last_name, age, cin')
    .eq('id', params.patientId)
    .eq('doctor_id', doctor.id)
    .single()
  if (!patient) notFound()

  return (
    <NewCertificate
      doctorId={doctor.id}
      doctorName={doctor.name}
      patient={patient}
      backHref={safeBack(searchParams.back)}
    />
  )
}
