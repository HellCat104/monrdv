'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Stethoscope, Mail, Phone, ChevronRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'home' | 'email' | 'phone' | 'phone-otp'

export default function PatientLoginPage() {
  const [mode, setMode] = useState<Mode>('home')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const supabase = createClient()

  async function handleGoogleLogin() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/patient/dashboard`,
      },
    })
  }

  async function handleAppleLogin() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/patient/dashboard`,
      },
    })
  }

  async function handleEmailMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/patient/dashboard`,
      },
    })
    setLoading(false)
    if (error) {
      setMessage({ type: 'error', text: 'Erreur lors de l\'envoi. Vérifiez votre adresse email.' })
    } else {
      setMessage({ type: 'success', text: `Un lien de connexion a été envoyé à ${email}. Vérifiez votre boîte mail !` })
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const formatted = phone.startsWith('+') ? phone : `+212${phone.replace(/^0/, '')}`
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    setLoading(false)
    if (error) {
      setMessage({ type: 'error', text: 'Numéro invalide ou service indisponible.' })
    } else {
      setMode('phone-otp')
      setMessage({ type: 'success', text: `Code envoyé au ${formatted}` })
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    const formatted = phone.startsWith('+') ? phone : `+212${phone.replace(/^0/, '')}`
    const { error } = await supabase.auth.verifyOtp({ phone: formatted, token: otp, type: 'sms' })
    setLoading(false)
    if (error) {
      setMessage({ type: 'error', text: 'Code incorrect ou expiré. Réessayez.' })
    } else {
      window.location.href = '/patient/dashboard'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-12 h-12 bg-primary-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Stethoscope className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">MonRDV</span>
          </Link>
          <p className="text-gray-600 font-semibold mt-3">Espace patient</p>
          <p className="text-gray-400 text-sm">Connectez-vous pour gérer vos rendez-vous</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {/* Back button */}
          {mode !== 'home' && (
            <button
              onClick={() => { setMode('home'); setMessage(null) }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
          )}

          {/* ---- HOME mode ---- */}
          {mode === 'home' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Se connecter avec…</h2>

              {/* Google */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center gap-3 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl px-4 py-3.5 transition-all font-medium text-gray-700 text-sm"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuer avec Google
                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>

              {/* Apple */}
              <button
                onClick={handleAppleLogin}
                disabled={loading}
                className="w-full flex items-center gap-3 bg-black hover:bg-gray-900 rounded-xl px-4 py-3.5 transition-all font-medium text-white text-sm"
              >
                <svg className="h-5 w-5 shrink-0 fill-white" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Continuer avec Apple
                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs text-gray-400">ou</span>
                </div>
              </div>

              {/* Email */}
              <button
                onClick={() => setMode('email')}
                className="w-full flex items-center gap-3 border-2 border-gray-200 hover:border-primary-300 hover:bg-primary-50 rounded-xl px-4 py-3.5 transition-all font-medium text-gray-700 text-sm"
              >
                <Mail className="h-5 w-5 text-primary-500 shrink-0" />
                Continuer avec Email
                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>

              {/* Phone */}
              <button
                onClick={() => setMode('phone')}
                className="w-full flex items-center gap-3 border-2 border-gray-200 hover:border-primary-300 hover:bg-primary-50 rounded-xl px-4 py-3.5 transition-all font-medium text-gray-700 text-sm"
              >
                <Phone className="h-5 w-5 text-primary-500 shrink-0" />
                Continuer avec Téléphone
                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>
            </div>
          )}

          {/* ---- EMAIL mode ---- */}
          {mode === 'email' && (
            <form onSubmit={handleEmailMagicLink} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Connexion par email</h2>
              <p className="text-sm text-gray-500">Entrez votre adresse email — nous vous enverrons un lien de connexion instantané, sans mot de passe.</p>
              <div className="space-y-1.5">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.ma"
                  required
                  autoFocus
                />
              </div>
              {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                  {message.text}
                </div>
              )}
              {!message?.type.includes('success') && (
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? 'Envoi…' : 'Envoyer le lien de connexion'}
                </Button>
              )}
            </form>
          )}

          {/* ---- PHONE mode ---- */}
          {mode === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Connexion par téléphone</h2>
              <p className="text-sm text-gray-500">Entrez votre numéro marocain — nous vous enverrons un code SMS.</p>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Numéro de téléphone</Label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600 font-medium shrink-0">🇲🇦 +212</span>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="06 12 34 56 78"
                    required
                    autoFocus
                  />
                </div>
              </div>
              {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {message.text}
                </div>
              )}
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer le code SMS'}
              </Button>
            </form>
          )}

          {/* ---- PHONE OTP mode ---- */}
          {mode === 'phone-otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Entrez le code reçu</h2>
              <p className="text-sm text-gray-500">Un code à 6 chiffres a été envoyé par SMS.</p>
              <div className="space-y-1.5">
                <Label htmlFor="otp">Code SMS</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  autoFocus
                  className="text-center text-2xl tracking-widest font-bold"
                />
              </div>
              {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {message.text}
                </div>
              )}
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Vérification…' : 'Se connecter'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link href="/choisir" className="hover:underline">← Retour au choix</Link>
          {' · '}
          <Link href="/" className="hover:underline">Page d'accueil</Link>
        </p>
      </div>
    </div>
  )
}
