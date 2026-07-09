'use client'

// Coquille de l'espace secrétaire : barre du haut + navigation filtrée par permissions.
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Users, LogOut, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StaffPermissions } from '@/types'

export default function CabinetShell({
  staffName, doctorName, permissions, children,
}: {
  staffName: string
  doctorName: string
  permissions: StaffPermissions
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const nav = [
    permissions.agenda && { href: '/cabinet', label: 'Agenda', icon: Calendar },
    permissions.patients_contact && { href: '/cabinet/patients', label: 'Patients', icon: Users },
    // Toujours visible : chacun gère son propre compte (mot de passe…)
    { href: '/cabinet/compte', label: 'Mon compte', icon: Settings },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Calendar }[]

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-bold text-primary-600">MonRDV</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Espace cabinet · Dr. {doctorName}</span>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
                  pathname === href ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100')}>
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
            <button onClick={logout} title="Déconnexion" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-red-500">
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        <p className="text-sm text-gray-500 mb-4">Bonjour {staffName} 👋</p>
        {children}
      </main>
    </div>
  )
}
