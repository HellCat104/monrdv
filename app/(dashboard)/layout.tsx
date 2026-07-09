import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'

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

  // Vérifie que l'utilisateur est bien un médecin approuvé
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, status')
    .eq('email', user.email)
    .single()

  if (!doctor) {
    // Pas médecin : est-ce une secrétaire ? (accès à l'espace cabinet)
    const { data: staff } = await supabase
      .from('cabinet_staff').select('id').eq('email', (user.email ?? '').toLowerCase()).eq('status', 'active').limit(1).maybeSingle()
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
