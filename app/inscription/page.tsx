'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Stethoscope, CheckCircle2, Eye, EyeOff, Hash } from 'lucide-react'
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
  const [consentCGU, setConsentCGU] = useState(false)
  const [consentMedical, setConsentMedical] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    specialty: '',
    phone: '',
    city: '',
    slug: '',
    cnom_number: '',
  })

  // Le forfait n'est pas choisi ici : tout compte démarre en « Agenda ».
  // Le passage au Cabinet complet se demande ensuite depuis Abonnement.

  // Code du délégué qui a amené le médecin (facultatif)
  const [referralCode, setReferralCode] = useState('')

  // Secrétaire médicale (facultatif — crée un second compte lié au cabinet)
  const [hasSecretary, setHasSecretary] = useState<'oui' | 'non'>('non')
  const [secretary, setSecretary] = useState({ name: '', email: '', password: '' })
  const [showSecPassword, setShowSecPassword] = useState(false)

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

    if (!form.specialty) {
      setError('Veuillez choisir votre spécialité')
      return
    }

    if (!form.city) {
      setError('Veuillez choisir votre ville')
      return
    }

    if (!consentCGU) {
      setError('Vous devez accepter les CGU pour continuer')
      return
    }

    if (!consentMedical) {
      setError('Vous devez accepter le stockage de vos données médicales pour continuer')
      return
    }

    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    if (hasSecretary === 'oui') {
      if (!secretary.name.trim() || !secretary.email.trim()) {
        setError('Renseignez le nom et l\'e-mail de votre secrétaire (ou répondez « Non »)')
        return
      }
      if (secretary.password.length < 8) {
        setError('Le mot de passe de la secrétaire doit contenir au moins 8 caractères')
        return
      }
      if (secretary.email.trim().toLowerCase() === form.email.trim().toLowerCase()) {
        setError('La secrétaire doit avoir une adresse e-mail différente de la vôtre')
        return
      }
    }

    setLoading(true)

    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => formData.append(k, v))
      if (referralCode.trim()) formData.append('referral_code', referralCode.trim())
      if (hasSecretary === 'oui') {
        formData.append('secretary_name', secretary.name.trim())
        formData.append('secretary_email', secretary.email.trim())
        formData.append('secretary_password', secretary.password)
      }

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

              {/* Slug */}
              <div className="space-y-1.5">
                <Label htmlFor="slug">URL de votre page *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 shrink-0">monrdv.co.ma/</span>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="hassan-alami"
                    required
                  />
                </div>
              </div>

              {/* Numéro CNOM */}
              <div className="space-y-1.5">
                <Label htmlFor="cnom_number">Numéro CNOM (optionnel)</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="cnom_number"
                    value={form.cnom_number}
                    onChange={(e) => setForm({ ...form, cnom_number: e.target.value })}
                    placeholder="Ex : 12345"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-gray-400">Numéro d&apos;inscription à l&apos;Ordre des Médecins. À laisser vide si votre profession n&apos;en délivre pas (psychologue, kinésithérapeute…).</p>
              </div>

              {/* Code délégué — facultatif, sert au suivi commercial */}
              <div className="space-y-1.5">
                <Label htmlFor="referral_code">Code délégué (optionnel)</Label>
                <Input
                  id="referral_code"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="Ex : ADHAM01"
                  maxLength={20}
                />
                <p className="text-xs text-gray-400">
                  Si un conseiller MonRDV vous a accompagné, saisissez son code. Sinon, laissez vide.
                </p>
              </div>

              {/* Secrétaire médicale — crée un second compte lié au cabinet */}
              <div className="space-y-2">
                <Label>Avez-vous une secrétaire médicale ?</Label>
                <div className="flex gap-2">
                  {(['non', 'oui'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setHasSecretary(v)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${hasSecretary === v ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      {v === 'oui' ? 'Oui' : 'Non'}
                    </button>
                  ))}
                </div>
                {hasSecretary === 'non' && (
                  <p className="text-xs text-gray-400">Pas de souci — vous pourrez l&apos;ajouter plus tard dans Paramètres.</p>
                )}
                {hasSecretary === 'oui' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-gray-500">Son compte sera créé avec le vôtre : elle aura ses propres identifiants et un accès limité (agenda, accueil — jamais le dossier médical sans votre accord).</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="sec_name">Nom et prénom de la secrétaire *</Label>
                      <Input id="sec_name" value={secretary.name} onChange={(e) => setSecretary({ ...secretary, name: e.target.value })} placeholder="Salma Bennani" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sec_email">Son e-mail de connexion *</Label>
                      <Input id="sec_email" type="email" value={secretary.email} onChange={(e) => setSecretary({ ...secretary, email: e.target.value })} placeholder="salma@exemple.ma" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sec_password">Son mot de passe *</Label>
                      <div className="relative">
                        <Input
                          id="sec_password"
                          type={showSecPassword ? 'text' : 'password'}
                          value={secretary.password}
                          onChange={(e) => setSecretary({ ...secretary, password: e.target.value })}
                          placeholder="Minimum 8 caractères"
                          className="pr-10"
                        />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowSecPassword(!showSecPassword)}>
                          {showSecPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">Elle pourra le changer dans « Mon compte » après sa première connexion.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Case CGU — séparée du consentement médical */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentCGU}
                    onChange={(e) => setConsentCGU(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 shrink-0"
                  />
                  <span className="text-xs text-gray-700 leading-relaxed">
                    J&apos;ai lu et j&apos;accepte les{' '}
                    <a href="/cgu" target="_blank" className="underline text-primary-600 hover:text-primary-700">
                      Conditions Générales d&apos;Utilisation
                    </a>{' '}
                    de MonRDV. *
                  </span>
                </label>
              </div>

              {/* Consentement données médicales — obligatoire loi 09-08 */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentMedical}
                    onChange={(e) => setConsentMedical(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 shrink-0"
                  />
                  <span className="text-xs text-blue-800 leading-relaxed">
                    J&apos;accepte le stockage de mes données professionnelles et des données médicales de mes patients
                    sur MonRDV, conformément à la{' '}
                    <a href="/politique-confidentialite" target="_blank" className="underline hover:text-primary-600">
                      politique de confidentialité
                    </a>{' '}
                    et aux{' '}
                    <a href="/cgu" target="_blank" className="underline hover:text-primary-600">
                      CGU
                    </a>.
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
