import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PatientHeader from './PatientHeader'

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

  return (
    <div className="min-h-screen bg-gray-50">
      <PatientHeader userEmail={user.email ?? ''} userName={user.user_metadata?.full_name ?? ''} />
      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}
