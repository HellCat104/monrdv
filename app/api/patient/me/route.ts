// API : profil du patient connecté (pour pré-remplir le formulaire de réservation)
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const adminDb = createAdminClient()

  // Récupère la fiche patient la plus récente liée à ce compte (toutes spécialités)
  const { data: patient } = await adminDb
    .from('patients')
    .select('first_name, last_name, phone, email, age')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    email: user.email ?? patient?.email ?? '',
    first_name: patient?.first_name ?? '',
    last_name: patient?.last_name ?? '',
    phone: patient?.phone ?? '',
    age: patient?.age ?? null,
  })
}
