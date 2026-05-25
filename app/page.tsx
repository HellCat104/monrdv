'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, MapPin, User, Stethoscope, Clock, Shield, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const SPECIALITES = [
  { label: 'Médecin généraliste', emoji: '🩺', color: 'bg-blue-50' },
  { label: 'Cardiologue',          emoji: '❤️', color: 'bg-red-50' },
  { label: 'Dermatologue',         emoji: '🔬', color: 'bg-orange-50' },
  { label: 'Pédiatre',             emoji: '👶', color: 'bg-pink-50' },
  { label: 'Ophtalmologue',        emoji: '👁️', color: 'bg-cyan-50' },
  { label: 'Dentiste',             emoji: '🦷', color: 'bg-teal-50' },
  { label: 'Neurologue',           emoji: '🧠', color: 'bg-indigo-50' },
  { label: 'Pneumologue',          emoji: '🫁', color: 'bg-sky-50' },
  { label: 'Psychiatre',           emoji: '🧘', color: 'bg-violet-50' },
  { label: 'Rhumatologue',         emoji: '🦴', color: 'bg-yellow-50' },
  { label: 'Urologue',             emoji: '🔬', color: 'bg-green-50' },
  { label: 'Gastro-entérologue',   emoji: '🩻', color: 'bg-orange-50' },
]

export default function HomePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [patientName, setPatientName] = useState<string | null>(null)
  const [dashboardUrl, setDashboardUrl] = useState('/patient/dashboard')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const name = user.user_metadata?.full_name || user.email?.split('@')[0] || null
        setPatientName(name)

        // Vérifie si c'est un médecin → bon lien dashboard
        const { data: doctor } = await supabase
          .from('doctors')
          .select('id')
          .eq('email', user.email)
          .single()

        setDashboardUrl(doctor ? '/dashboard' : '/patient/dashboard')
      }
    })
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (city) params.set('ville', city)
    router.push(`/recherche?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 bg-primary-500 rounded-xl flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-xl">MonRDV</span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/inscription"
              className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-full text-sm font-semibold transition-colors"
            >
              <Stethoscope className="h-4 w-4" />
              <span className="hidden sm:inline">Vous êtes soignant ?</span>
              <span className="sm:hidden">Soignant</span>
            </Link>
            {patientName ? (
              <Link
                href={dashboardUrl}
                className="flex items-center gap-2 text-gray-700 hover:text-primary-600 text-sm font-medium transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                  {patientName.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline">{patientName.split(' ')[0]}</span>
              </Link>
            ) : (
              <Link
                href="/choisir"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Se connecter</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-primary-500 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-bold mb-3 leading-tight">
            Vivez en meilleure santé
          </h1>
          <p className="text-primary-100 text-lg mb-10">
            Trouvez un médecin et prenez rendez-vous en ligne au Maroc
          </p>

          {/* Barre de recherche */}
          <form onSubmit={handleSearch} className="bg-white rounded-2xl p-2 flex flex-col sm:flex-row gap-2 shadow-2xl max-w-3xl mx-auto">
            <div className="flex items-center gap-3 flex-1 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
              <Search className="h-5 w-5 text-gray-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, spécialité, établissement…"
                className="flex-1 text-gray-800 placeholder-gray-400 outline-none text-sm bg-transparent"
              />
            </div>
            <div className="w-px bg-gray-200 hidden sm:block" />
            <div className="flex items-center gap-3 flex-1 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
              <MapPin className="h-5 w-5 text-gray-400 shrink-0" />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ville (ex: Casablanca)"
                className="flex-1 text-gray-800 placeholder-gray-400 outline-none text-sm bg-transparent"
              />
            </div>
            <button
              type="submit"
              className="bg-primary-500 hover:bg-primary-600 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-sm shrink-0"
            >
              Rechercher
            </button>
          </form>

          {/* Suggestions rapides */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {['Médecin généraliste', 'Cardiologue', 'Dermatologue', 'Pédiatre', 'Neurologue'].map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); router.push(`/recherche?q=${encodeURIComponent(s)}`) }}
                className="bg-white/20 hover:bg-white/30 text-white text-xs px-4 py-1.5 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Spécialités */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Trouvez un médecin par spécialité
          </h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            Cliquez sur une spécialité pour voir les médecins disponibles
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {SPECIALITES.map(({ label, emoji, color }) => (
              <button
                key={label}
                onClick={() => router.push(`/recherche?q=${encodeURIComponent(label)}`)}
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-transparent hover:border-primary-200 hover:shadow-md transition-all group ${color}`}
              >
                <span className="text-3xl">{emoji}</span>
                <span className="text-sm font-semibold text-gray-800 group-hover:text-primary-600 text-center leading-tight">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-gray-100 py-8 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-3xl font-bold text-primary-500">500+</p>
            <p className="text-sm text-gray-500 mt-1">Médecins inscrits</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary-500">10k+</p>
            <p className="text-sm text-gray-500 mt-1">RDV pris</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary-500">20+</p>
            <p className="text-sm text-gray-500 mt-1">Villes au Maroc</p>
          </div>
        </div>
      </section>

      {/* Avantages */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
            Pourquoi choisir MonRDV ?
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="h-7 w-7 text-primary-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Rapide et simple</h3>
              <p className="text-sm text-gray-500">Prenez rendez-vous en moins de 2 minutes, 24h/24 et 7j/7.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="h-7 w-7 text-green-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Confirmation SMS</h3>
              <p className="text-sm text-gray-500">Recevez une confirmation et un rappel par SMS avant votre RDV.</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Star className="h-7 w-7 text-orange-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Médecins vérifiés</h3>
              <p className="text-sm text-gray-500">Tous nos médecins sont enregistrés et vérifiés au Maroc.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Médecin */}
      <section className="py-16 px-4 bg-primary-500 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <Stethoscope className="h-12 w-12 mx-auto mb-4 opacity-80" />
          <h2 className="text-2xl font-bold mb-3">Vous êtes médecin ?</h2>
          <p className="text-primary-100 mb-8">
            Rejoignez MonRDV et gérez vos rendez-vous facilement depuis votre téléphone.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/inscription"
              className="inline-block bg-white text-primary-600 font-bold px-8 py-3 rounded-xl hover:bg-primary-50 transition-colors"
            >
              S'inscrire gratuitement
            </Link>
            <Link
              href="/login"
              className="inline-block bg-primary-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-primary-700 transition-colors border border-white/30"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-4 text-center text-sm">
        <p>© 2026 MonRDV — Prise de rendez-vous médicaux au Maroc 🇲🇦</p>
        <p className="mt-2">
          <Link href="/politique-confidentialite" className="hover:text-gray-300 transition-colors underline underline-offset-2">
            Politique de confidentialité
          </Link>
        </p>
        <div className="flex items-center justify-center gap-4 mt-4">
          <a
            href="mailto:asmaadouach@gmail.com"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            Contact
          </a>
          <a
            href="https://wa.me/32465383121"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-400 hover:text-green-400 transition-colors"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
        </div>
      </footer>
    </div>
  )
}
