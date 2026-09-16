import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'
import ServiceIndisponible from '@/components/ServiceIndisponible'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirige vers login si non authentifié
  if (!user) {
    redirect('/login')
  }

  // Vérifie que l'utilisateur est bien un médecin approuvé.
  //
  // `maybeSingle` et non `single` : l'absence de ligne est ici un cas NORMAL
  // (une secrétaire, un patient) et ne doit pas être signalée comme une erreur,
  // sans quoi on ne saurait plus distinguer « pas médecin » d'une vraie panne.
  const { data: doctor, error: errDoctor } = await supabase
    .from('doctors')
    .select('id, status')
    .eq('email', user.email)
    .maybeSingle()

  // Une lecture en ÉCHEC n'est pas une absence de droits. Traiter les deux
  // pareil renvoyait une secrétaire autorisée vers /patient/dashboard — ou,
  // par l'espace cabinet, vers /login qui la renvoyait ici : une page qui
  // charge sans fin. On s'arrête et on l'explique.
  if (errDoctor) return <ServiceIndisponible detail={errDoctor.message} />

  if (!doctor) {
    // Pas médecin : est-ce une secrétaire ? (accès à l'espace cabinet)
    const { data: staff, error: errStaff } = await supabase
      .from('cabinet_staff').select('id').eq('email', (user.email ?? '').toLowerCase()).eq('status', 'active').limit(1).maybeSingle()
    if (errStaff) return <ServiceIndisponible detail={errStaff.message} />
    if (staff) redirect('/cabinet')
    redirect('/patient/dashboard')
  }

  if (doctor.status !== 'approved') {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      {/* Contenu principal avec marge pour la sidebar */}
      <main className="lg:pl-64 min-h-screen">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  )
}
