'use client'

// Note : les pages 'use client' ne peuvent pas exporter metadata directement.
// Le metadata est géré par app/recherche/layout.tsx
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, MapPin, Clock, Stethoscope, ArrowLeft, Calendar } from 'lucide-react'
import { Suspense } from 'react'

interface Doctor {
  id: string
  name: string
  specialty: string
  slug: string
  phone: string
  city: string
  appointment_duration: number
}

function RechercheContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [city, setCity] = useState(searchParams.get('ville') || '')

  useEffect(() => {
    const q = searchParams.get('q') || ''
    const ville = searchParams.get('ville') || ''
    setQuery(q)
    setCity(ville)
    fetchDoctors(q, ville)
  }, [searchParams])

  async function fetchDoctors(q: string, ville: string) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (ville) params.set('ville', ville)

      const res = await fetch(`/api/search?${params}`)
      const text = await res.text()
      const data = text ? JSON.parse(text) : null

      if (!res.ok) {
        throw new Error(data?.error || 'Erreur recherche')
      }

      setDoctors(Array.isArray(data) ? data : [])
    } catch {
      setDoctors([])
      setError('La recherche ne fonctionne pas pour le moment. Réessayez dans quelques instants ou contactez-nous sur WhatsApp.')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (city) params.set('ville', city)
    router.push(`/recherche?${params}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header avec recherche */}
      <header className="bg-primary-500 text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/" className="text-white/80 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <span className="font-bold text-lg">MonRDV</span>
          </div>
          <form onSubmit={handleSearch} className="bg-white rounded-xl p-1.5 flex gap-2">
            <div className="flex items-center gap-2 flex-1 px-3">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Spécialité, médecin…"
                className="flex-1 text-gray-800 text-sm outline-none placeholder-gray-400"
              />
            </div>
            <button
              type="submit"
              className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold"
            >
              OK
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Résultats */}
        <p className="text-sm text-gray-500 mb-4">
          {loading ? 'Recherche…' : `${doctors.length} médecin(s) trouvé(s)`}
          {query && ` pour "${query}"`}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 mb-4 text-sm leading-relaxed">
            <p className="font-semibold">Recherche indisponible</p>
            <p className="mt-1">{error}</p>
            <a
              href="https://wa.me/32465383121"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-red-800 underline underline-offset-2 font-medium"
            >
              Contacter sur WhatsApp
            </a>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center py-16">
            <Stethoscope className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Aucun médecin trouvé</p>
            <p className="text-gray-400 text-sm mt-1">Essayez avec un autre terme</p>
          </div>
        ) : (
          <div className="space-y-4">
            {doctors.map((doctor) => (
              <div
                key={doctor.id}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:border-primary-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center shrink-0">
                    <Stethoscope className="h-7 w-7 text-primary-500" />
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900">Dr. {doctor.name}</h3>
                    <p className="text-primary-600 text-sm font-medium">{doctor.specialty}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Consultation {doctor.appointment_duration} min
                      </span>
                      {doctor.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {doctor.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bouton RDV */}
                  <Link
                    href={`/${doctor.slug}`}
                    className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Prendre RDV</span>
                    <span className="sm:hidden">RDV</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default function RecherchePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Chargement…</div>}>
      <RechercheContent />
    </Suspense>
  )
}
