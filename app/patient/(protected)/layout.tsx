import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PatientHeader from './PatientHeader'

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/patient/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PatientHeader userEmail={user.email ?? ''} userName={user.user_metadata?.full_name ?? ''} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
