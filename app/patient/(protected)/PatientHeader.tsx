'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Stethoscope, LogOut, Search, Shield, FolderHeart } from 'lucide-react'
import { LogoMonRDV } from '@/components/shared/LogoMonRDV'

interface PatientHeaderProps {
  userEmail: string
  userName: string
}

export default function PatientHeader({ userEmail, userName }: PatientHeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const displayName = userName || userEmail.split('@')[0]

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <LogoMonRDV taille={32} />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Trouver un médecin</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {displayName}
            </span>
          </div>

          <Link
            href="/patient/mon-dossier"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-500 transition-colors"
          >
            <FolderHeart className="h-4 w-4" />
            <span className="hidden sm:inline">Mon dossier</span>
          </Link>

          <Link
            href="/patient/mes-donnees"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-500 transition-colors"
          >
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Mes données</span>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </nav>
      </div>
    </header>
  )
}
