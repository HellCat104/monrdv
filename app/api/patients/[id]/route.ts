// Suppression encadrée d'un dossier : la décision et la trace sont côté serveur.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const { data: doctor } = await supabase.from('doctors').select('id').eq('email', user.email).maybeSingle()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  const { error } = await supabase.rpc('delete_patient_safely', { p_doctor_id: doctor.id, p_patient_id: params.id, p_actor: user.id })
  if (error) return NextResponse.json({ error: error.message.includes('Patient avec') ? error.message : 'Suppression impossible' }, { status: 409 })
  return NextResponse.json({ success: true })
}
