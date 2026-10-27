'use client'

import Link from 'next/link'
import { isGastroDoctor, specialitesDu } from '@/types'
import { isDentalDoctor } from '@/lib/dental'
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
  BellRing,
  ClipboardList,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard',     label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/appointments',  label: 'Rendez-vous',      icon: Calendar },
  { href: '/patients',      label: 'Patients',          icon: Users },
  { href: '/factures',      label: 'Factures',          icon: Receipt },
  { href: '/statistiques',  label: 'Statistiques',      icon: BarChart3 },
  { href: '/gastro/suivis', label: 'Suivis et résultats', icon: BellRing, branche: 'gastro' },
  // Les modèles d'ordonnance ne sont plus un objet de gastro-entérologie :
  // la table est commune, et un dentiste qui rédige « après extraction »
  // trois fois par jour a le même besoin.
  { href: '/modeles',       label: 'Mes modèles',       icon: ClipboardList, branches: ['gastro', 'dentaire'] },
  { href: '/equipe',        label: 'Mon équipe',        icon: Users2 },
  { href: '/settings',      label: 'Paramètres',        icon: Settings },
  { href: '/abonnement',    label: 'Abonnement',        icon: CreditCard },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  // « Mon équipe » est TOUJOURS dans le menu. Avant, il n'apparaissait qu'une
  // fois la secrétaire déclarée — le médecin qui avait répondu « non » à
  // l'inscription, ou qui embauchait six mois plus tard, n'avait plus aucun
  // chemin visible vers cette page et devait deviner qu'elle s'ouvrait depuis
  // une case des Paramètres. La page sait se présenter quand il n'y a encore
  // personne, et propose elle-même de l'activer.
  // Forfait : en 'agenda', les Factures sont masquées.
  // Défaut 'agenda' : on n'affiche qu'après confirmation.
  const [plan, setPlan] = useState<'agenda' | 'complet'>('agenda')
  // Branche du médecin : null tant qu'on ne sait pas, pour ne pas faire
  // clignoter une entrée qui va disparaître.
  const [branche, setBranche] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('doctors').select('plan, specialty, specialties').eq('email', user.email).single()
        .then(({ data }) => {
          setPlan(data?.plan === 'complet' ? 'complet' : 'agenda')
          // Les entrées de branche ne s'affichent que chez la spécialité
          // concernée : je ne veux pas retrouver « Suivis » chez une
          // psychologue, dont la branche n'existe pas encore.
          const specs = specialitesDu(data ?? {})
          setBranche(isGastroDoctor(specs) ? 'gastro' : isDentalDoctor(specs) ? 'dentaire' : null)
        })
    })
  }, [pathname]) // re-vérifie après un passage dans Paramètres / Mon équipe / Abonnement

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // En forfait Agenda, les statistiques restent accessibles (activité, caisse) ;
  // seules les factures conformes sont réservées au Cabinet complet.
  // (Patients reste visible : fiche réduite nom/prénom/tél/notes en mode agenda.)
  // En forfait Agenda, les écrans de branche n'existent pas : leurs pages
  // redirigent déjà côté serveur, le menu ne doit pas y mener.
  const planHidden = plan === 'agenda' ? ['/factures', '/gastro/suivis', '/modeles'] : []
  const visibleItems = navItems.filter((i) => {
    if (planHidden.includes(i.href)) return false
    // Une entrée sans branche est commune ; sinon elle n'apparaît que chez les
    // spécialités concernées. Tant que la branche est inconnue (null), on ne
    // montre rien de spécifique : mieux vaut une entrée qui arrive qu'une
    // entrée qui disparaît sous les yeux.
    const branches = (i as { branche?: string; branches?: string[] }).branches
      ?? ((i as { branche?: string }).branche ? [(i as { branche?: string }).branche as string] : null)
    return !branches || (branche != null && branches.includes(branche))
  })

  const NavLinks = () => (
    <>
      {visibleItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          // Sans cela, Next.js précharge les 7 entrées du menu en rendant
          // chaque page côté serveur — soit une quinzaine d'appels
          // d'authentification à chaque affichage.
          prefetch={false}
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
