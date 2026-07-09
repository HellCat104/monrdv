'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  CreditCard,
  BarChart3,
  Receipt,
  Users2,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard',     label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/appointments',  label: 'Rendez-vous',      icon: Calendar },
  { href: '/patients',      label: 'Patients',          icon: Users },
  { href: '/factures',      label: 'Factures',          icon: Receipt },
  { href: '/statistiques',  label: 'Statistiques',      icon: BarChart3 },
  { href: '/equipe',        label: 'Mon équipe',        icon: Users2 },
  { href: '/settings',      label: 'Paramètres',        icon: Settings },
  { href: '/abonnement',    label: 'Abonnement',        icon: CreditCard },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const NavLinks = () => (
    <>
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              ? 'bg-primary-500 text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {label}
        </Link>
      ))}
    </>
  )

  return (
    <>
      {/* Bouton menu mobile */}
      <button
        className="fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-100">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <span className="font-bold text-gray-900 text-lg">MonRDV</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>

        {/* Déconnexion */}
        <div className="px-4 py-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  )
}
