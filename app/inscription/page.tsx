'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Stethoscope, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SPECIALITES_LIST, VILLES_MAROC } from '@/types'

export default function InscriptionPage() {
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Une seule case, qui porte les deux engagements : les CGU et le stockage
  // des données de santé. Elles étaient séparées, mais personne ne cochait
  // l'une sans l'autre — l'inscription s'arrêtait là tant que les deux
  // n'étaient pas cochées, et deux pavés gris et bleu de suite se lisent moins
  // qu'un seul. Le texte des deux engagements est conservé mot pour mot.
  const [consentement, setConsentement] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    specialty: '',
    phone: '',
    city: '',
  })

  // Le forfait n'est pas choisi ici : tout compte démarre en « Agenda ».
  // Le passage au Cabinet complet se demande ensuite depuis Abonnement.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.specialty) {
      setError('Veuillez choisir votre spécialité')
      return
    }

    if (!form.city) {
      setError('Veuillez choisir votre ville')
      return
    }

    if (!consentement) {
      setError('Vous devez accepter les CGU et le stockage des données pour continuer')
      return
    }

    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    setLoading(true)

    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => formData.append(k, v))

      const res = await fetch('/api/doctors/register', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erreur lors de l\'inscription')

      setStep('success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl border-0 text-center">
          <CardContent className="p-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-gray-900">Demande envoyée !</h2>
            <p className="text-gray-600">
              Votre dossier est en cours de vérification. Vous recevrez un email de confirmation
              sous <strong>24 à 48h</strong> après validation par notre équipe.
            </p>
            <Link href="/" className="block text-primary-500 text-sm hover:underline mt-4">
              Retour à l'accueil
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary-500 rounded-2xl mb-3 shadow-lg">
            <Stethoscope className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Inscription médecin</h1>
          <p className="text-gray-500 text-sm mt-1">Rejoignez MonRDV et gérez vos rendez-vous</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm">
            <span className="text-gray-500">Vous avez déjà un compte ?</span>
            <Link href="/login" className="text-primary-600 hover:underline font-semibold">
              Se connecter
            </Link>
          </div>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Créer votre compte</CardTitle>
            <CardDescription>
              Votre compte sera vérifié par notre équipe avant activation (24-48h).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nom */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom complet *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Hassan Alami"
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email professionnel *</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="dr.hassan@exemple.ma"
                  required
                />
              </div>

              {/* Mot de passe */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Minimum 8 caractères"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Spécialité + Téléphone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Spécialité *</Label>
                  <Select
                    value={form.specialty}
                    onValueChange={(v) => setForm({ ...form, specialty: v })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPECIALITES_LIST.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Téléphone (optionnel)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="05 22 XX XX XX"
                  />
                </div>
              </div>

              {/* Ville */}
              <div className="space-y-1.5">
                <Label>Ville *</Label>
                <Select
                  value={form.city}
                  onValueChange={(v) => setForm({ ...form, city: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une ville…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VILLES_MAROC.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Les deux engagements en une case : CGU et données de santé.
                  Loi 09-08 — le texte reste explicite sur ce qui est stocké. */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentement}
                    onChange={(e) => setConsentement(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 shrink-0"
                  />
                  <span className="text-xs text-blue-800 leading-relaxed">
                    J&apos;ai lu et j&apos;accepte les{' '}
                    <a href="/cgu" target="_blank" className="underline hover:text-primary-600">
                      Conditions Générales d&apos;Utilisation
                    </a>{' '}
                    de MonRDV, et le stockage de mes données professionnelles et des données
                    médicales de mes patients, conformément à la{' '}
                    <a href="/politique-confidentialite" target="_blank" className="underline hover:text-primary-600">
                      politique de confidentialité
                    </a>. *
                  </span>
                </label>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Envoi en cours…
                  </span>
                ) : (
                  'Soumettre ma demande'
                )}
              </Button>

              <p className="text-center text-sm text-gray-500">
                Déjà inscrit ?{' '}
                <Link href="/login" className="text-primary-500 hover:underline font-medium">
                  Se connecter
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
