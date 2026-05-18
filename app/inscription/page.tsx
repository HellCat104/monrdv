'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Stethoscope, Upload, CheckCircle2, Eye, EyeOff, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function InscriptionPage() {
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    specialty: '',
    phone: '',
    slug: '',
  })

  // Génère automatiquement un slug à partir du nom
  function handleNameChange(name: string) {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
    setForm({ ...form, name, slug })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!file) {
      setError('Veuillez uploader votre diplôme ou carte professionnelle')
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
      formData.append('document', file)

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
                  onChange={(e) => handleNameChange(e.target.value)}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="specialty">Spécialité *</Label>
                  <Input
                    id="specialty"
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                    placeholder="Généraliste"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="05 22 XX XX XX"
                  />
                </div>
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <Label htmlFor="slug">URL de votre page *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 shrink-0">monrdv.ma/</span>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="hassan-alami"
                    required
                  />
                </div>
              </div>

              {/* Upload document */}
              <div className="space-y-1.5">
                <Label>Diplôme ou carte professionnelle *</Label>
                <label
                  htmlFor="document"
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${
                    file
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50'
                  }`}
                >
                  {file ? (
                    <>
                      <FileText className="h-8 w-8 text-green-500" />
                      <p className="text-sm font-medium text-green-700">{file.name}</p>
                      <p className="text-xs text-green-500">Cliquez pour changer</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400" />
                      <p className="text-sm text-gray-600 font-medium">Cliquez pour uploader</p>
                      <p className="text-xs text-gray-400">PDF, JPG, PNG (max 5 MB)</p>
                    </>
                  )}
                  <input
                    id="document"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
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
