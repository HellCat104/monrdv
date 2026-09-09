// API : profil du patient connecté (pour pré-remplir le formulaire de réservation)
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const adminDb = createAdminClient()

  // La fiche du TITULAIRE du compte, jamais celle d'un enfant.
  //
  // On prenait ici la fiche la plus récemment créée, sans distinction. Or
  // réserver « pour mon enfant » crée précisément une fiche enfant rattachée au
  // compte du parent : dès la deuxième réservation, l'onglet « Moi » se
  // pré-remplissait avec le prénom, le nom et l'âge de l'enfant. Le parent qui
  // ne corrigeait pas créait son rendez-vous — et son dossier médical — sous
  // l'identité de son fils.
  const { data: patient } = await adminDb
    .from('patients')
    .select('first_name, last_name, phone, email, age')
    .eq('user_id', user.id)
    .or('is_child.is.null,is_child.eq.false')
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
