'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, MapPin, User, Stethoscope, Clock, Shield, Star } from 'lucide-react'

const SPECIALITES = [
  { label: 'Médecin généraliste', emoji: '🩺', color: 'bg-blue-50' },
  { label: 'Cardiologue',          emoji: '❤️', color: 'bg-red-50' },
  { label: 'Dermatologue',         emoji: '🔬', color: 'bg-orange-50' },
  { label: 'Pédiatre',             emoji: '👶', color: 'bg-pink-50' },
  { label: 'Gynécologue',          emoji: '🌸', color: 'bg-purple-50' },
  { label: 'Ophtalmologue',        emoji: '👁️', color: 'bg-cyan-50' },
  { label: 'Dentiste',             emoji: '🦷', color: 'bg-teal-50' },
  { label: 'Orthopédiste',         emoji: '🦴', color: 'bg-yellow-50' },
  { label: 'Neurologue',           emoji: '🧠', color: 'bg-indigo-50' },
  { label: 'Pneumologue',          emoji: '🫁', color: 'bg-sky-50' },
  { label: 'Endocrinologue',       emoji: '⚗️', color: 'bg-lime-50' },
  { label: 'Psychiatre',           emoji: '🧘', color: 'bg-violet-50' },
]

export default function HomePage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')

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
            <Link
              href="/login"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Se connecter</span>
            </Link>
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
            {['Médecin généraliste', 'Cardiologue', 'Dermatologue', 'Pédiatre', 'Gynécologue'].map((s) => (
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
      </footer>
    </div>
  )
}
