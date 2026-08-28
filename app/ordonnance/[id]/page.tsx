// Ordonnance imprimable liée à un rendez-vous.
// Accessible uniquement par le médecin propriétaire du RDV.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRecentPrescriptionLines } from '@/lib/ordonnance'
import { OrdonnanceEditor } from './OrdonnanceEditor'
import { canAccess } from '@/lib/plan'

interface Props {
  params: { id: string }
  searchParams: { back?: string; new?: string }
}

export const dynamic = 'force-dynamic'

export default async function OrdonnancePage({ params, searchParams }: Props) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, name, specialty, address, city, phone, ice, inpe, cnom_number, prescription_favorites, plan')
    .eq('email', user.email)
    .single()

  if (!doctor) notFound()

  // Le forfait se contrôle ici aussi : la page est atteignable par son URL,
  // même quand l'interface n'affiche plus le lien qui y mène.
  if (!canAccess(doctor.plan, 'prescriptions')) redirect('/appointments')

  // RDV + patient (revérifie l'appartenance au médecin)
  const { data: apt } = await supabase
    .from('appointments')
    .select('id, date, patient:patients(id, first_name, last_name, age, allergies)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()

  if (!apt || !apt.patient) notFound()

  const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient

  // ?new=1 → forcer une NOUVELLE ordonnance (plusieurs par consultation).
  // Sinon, on édite la plus récente de ce RDV.
  const forceNew = searchParams.new === '1'
  const { data: existing } = forceNew
    ? { data: null }
    : await supabase
        .from('prescriptions')
        .select('id, content')
        .eq('appointment_id', apt.id)
        .eq('doctor_id', doctor.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

  const favorites = ((doctor.prescription_favorites as string[] | null) ?? []).filter((f) => typeof f === 'string')
  const recentLines = await getRecentPrescriptionLines(supabase, doctor.id, favorites)

  return (
    <OrdonnanceEditor
      doctor={doctor}
      patient={patient}
      appointmentId={apt.id}
      appointmentDate={apt.date}
      existingId={existing?.id ?? null}
      existingContent={existing?.content ?? ''}
      favorites={favorites}
      recentLines={recentLines}
      backHref={safeBack(searchParams.back)}
    />
  )
}

// N'accepte qu'un chemin interne (évite les redirections ouvertes)
function safeBack(back?: string): string | undefined {
  if (back && back.startsWith('/') && !back.startsWith('//')) return back
  return undefined
}
