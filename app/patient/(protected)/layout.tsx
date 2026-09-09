import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import PatientHeader from './PatientHeader'

/**
 * Rattache au compte les fiches créées lors d'une réservation EN INVITÉ.
 *
 * Le problème : réserver ne demande jamais de compte, donc le parcours normal
 * est « invité d'abord ». La fiche naissait alors avec `user_id = null`, et le
 * contrôle anti-appropriation de /api/appointments — qui refuse à juste titre
 * de rattacher une fiche préexistante sur la seule foi d'un nom et d'un
 * téléphone auto-déclarés — l'y laissait pour toujours. Résultat : un espace
 * patient vide à vie, alors que le formulaire promet « voir tous vos
 * rendez-vous en un seul endroit ».
 *
 * La preuve exigée ici est d'une autre nature, et elle est solide : l'adresse
 * du compte doit être VÉRIFIÉE par Supabase, et la fiche doit porter exactement
 * cette adresse. Contrôler cette boîte, c'est déjà recevoir les confirmations,
 * les rappels et le lien d'annulation de ces rendez-vous — il n'y a rien à
 * s'approprier qu'on ne reçoive déjà. Sans vérification de l'adresse, on ne
 * rattache rien : s'inscrire avec l'e-mail d'autrui ne doit donner aucun droit.
 *
 * On ne touche JAMAIS une fiche déjà rattachée à un autre compte.
 */
async function rattacherFichesInvite(userId: string, email: string | undefined, verifie: boolean) {
  if (!verifie || !email) return
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('patients')
      .update({ user_id: userId })
      .is('user_id', null)
      .ilike('email', email)
    if (error) console.error('[espace patient] rattachement impossible :', error.message)
  } catch (e) {
    // Un échec ne doit jamais empêcher l'accès à l'espace : au pire, la page
    // reste vide comme avant et la tentative se répétera à la visite suivante.
    console.error('[espace patient] rattachement impossible :', e)
  }
}

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/patient/login')
  }

  // Si c'est un médecin → renvoyer vers son dashboard médecin
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('email', user.email)
    .single()

  if (doctor) {
    redirect('/dashboard')
  }

  // Si c'est une secrétaire → renvoyer vers l'espace cabinet
  const { data: staff } = await supabase
    .from('cabinet_staff')
    .select('id')
    .eq('email', (user.email ?? '').toLowerCase())
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (staff) {
    redirect('/cabinet')
  }

  // Après les redirections : un médecin ou une secrétaire n'a rien à récupérer ici.
  await rattacherFichesInvite(user.id, user.email, !!user.email_confirmed_at)

  return (
    <div className="min-h-screen bg-gray-50">
      <PatientHeader userEmail={user.email ?? ''} userName={user.user_metadata?.full_name ?? ''} />
      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
