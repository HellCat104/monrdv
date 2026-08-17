'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Stethoscope, Mail, ChevronRight, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'home' | 'email-login' | 'email-signup' | 'forgot'

export default function PatientLoginPage() {
  const router = useRouter()
  const [mode, setMode]         = useState<Mode>('home')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [consentCGU, setConsentCGU] = useState(false)
  const [consentMedical, setConsentMedical] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState<string | null>(null)

  function reset() {
    setError(null); setSuccess(null); setLoading(false)
  }

  // Traduit les messages d'erreur Supabase (anglais, parfois vides) en français.
  // Sans ce filtre, un échec d'envoi d'e-mail s'affichait au patient sous la
  // forme « {} » — le corps de la réponse d'erreur, vide.
  function messageErreur(brut?: string | null): string {
    const m = (brut ?? '').toLowerCase().trim()
    if (!m || m === '{}') return "La création du compte a échoué. Merci de réessayer dans quelques minutes."
    if (m.includes('already registered') || m.includes('already been registered'))
      return 'Cet email est déjà utilisé. Connectez-vous.'
    if (m.includes('sending confirmation email') || m.includes('sending email'))
      return "Impossible d'envoyer l'email de confirmation pour le moment. Réessayez dans quelques minutes."
    if (m.includes('rate limit') || m.includes('too many'))
      return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
    if (m.includes('invalid email') || m.includes('invalid format'))
      return "Cette adresse email n'est pas valide."
    if (m.includes('password')) return 'Le mot de passe doit contenir au moins 6 caractères.'
    if (m.includes('invalid login')) return 'Email ou mot de passe incorrect.'
    return "Une erreur est survenue. Merci de réessayer."
  }

  function goBack() {
    setMode('home'); reset()
    setPassword(''); setConfirm('')
  }

  // ── Google ──────────────────────────────────────────────────────────────
  async function handleGoogle() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/patient/dashboard` },
    })
  }

  // ── Mot de passe oublié ──────────────────────────────────────────────────
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await fetch('/api/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch { /* on affiche un succès générique quoi qu'il arrive */ }
    setLoading(false)
    setSuccess('Si cet email existe, un lien de réinitialisation a été envoyé.')
  }

  // ── Email : connexion ────────────────────────────────────────────────────
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      // Cas fréquent avec la confirmation activée : le compte existe mais
      // l'e-mail n'a pas encore été validé.
      setError(/not confirmed|email not confirmed/i.test(error.message)
        ? "Votre compte n'est pas encore activé. Ouvrez l'email de confirmation que nous vous avons envoyé."
        : messageErreur(error.message))
    } else {
      router.push('/patient/dashboard')
    }
  }

  // ── Email : inscription ──────────────────────────────────────────────────
  async function handleEmailSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (password.length < 6)  { setError('Le mot de passe doit contenir au moins 6 caractères.'); return }
    if (!consentCGU)          { setError('Vous devez accepter les CGU pour continuer.'); return }
    if (!consentMedical)      { setError('Vous devez accepter le stockage de vos données médicales.'); return }
    setLoading(true); setError(null)
    const supabase = createClient()
    // Le lien de l'e-mail de confirmation doit revenir sur notre callback, qui
    // échange le code contre une session et redirige vers l'espace patient.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/patient/dashboard` },
    })
    setLoading(false)

    if (error) { setError(messageErreur(error.message)); return }

    // Session présente = confirmation désactivée côté Supabase : on entre directement.
    // Session absente = un e-mail de confirmation vient de partir.
    if (data.session) {
      router.push('/patient/dashboard')
    } else {
      setSuccess(`Compte créé. Un email de confirmation vient d'être envoyé à ${email}. Ouvrez-le pour activer votre compte (pensez à vérifier vos spams).`)
      setMode('email-login')
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

          {/* Retour */}
          {mode !== 'home' && (
            <button onClick={goBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
          )}

          {/* Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">
              {success}
            </div>
          )}

          {/* ── HOME ───────────────────────────────────────────────────── */}
          {mode === 'home' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Se connecter avec…</h2>

              {/* Google */}
              <button onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center gap-3 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl px-4 py-3.5 transition-all font-medium text-gray-700 text-sm">
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuer avec Google
                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">ou</span></div>
              </div>

              {/* Email */}
              <button onClick={() => { reset(); setMode('email-login') }}
                className="w-full flex items-center gap-3 border-2 border-gray-200 hover:border-primary-300 hover:bg-primary-50 rounded-xl px-4 py-3.5 transition-all font-medium text-gray-700 text-sm">
                <Mail className="h-5 w-5 text-primary-500 shrink-0" />
                Continuer avec Email
                <ChevronRight className="h-4 w-4 ml-auto text-gray-400" />
              </button>
            </div>
          )}

          {/* ── EMAIL LOGIN ─────────────────────────────────────────────── */}
          {mode === 'email-login' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Se connecter</h2>
              <div className="space-y-1.5">
                <Label>Adresse email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.ma" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Mot de passe</Label>
                <div className="relative">
                  <Input type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required className="pr-10" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Connexion…' : 'Se connecter'}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={() => { reset(); setMode('email-signup') }}
                  className="text-primary-600 font-medium hover:underline">
                  Créer un compte
                </button>
                <button type="button" onClick={() => { reset(); setMode('forgot') }}
                  className="text-gray-400 hover:text-primary-500">
                  Mot de passe oublié ?
                </button>
              </div>
            </form>
          )}

          {/* ── EMAIL SIGNUP ────────────────────────────────────────────── */}
          {mode === 'email-signup' && (
            <form onSubmit={handleEmailSignup} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Créer un compte</h2>
              <div className="space-y-1.5">
                <Label>Adresse email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.ma" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Mot de passe</Label>
                <div className="relative">
                  <Input type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 6 caractères" required className="pr-10" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Confirmer le mot de passe</Label>
                <Input type={showPwd ? 'text' : 'password'} value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe" required />
              </div>
              {/* CGU — obligatoire */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
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
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentMedical}
                    onChange={(e) => setConsentMedical(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-500 shrink-0"
                  />
                  <span className="text-xs text-blue-800 leading-relaxed">
                    J&apos;accepte le stockage de mes données médicales (rendez-vous, motifs de consultation)
                    conformément à la{' '}
                    <a href="/politique-confidentialite" target="_blank" className="underline hover:text-primary-600">
                      politique de confidentialité
                    </a>.
                    Je peux retirer mon consentement à tout moment depuis mon espace patient.
                  </span>
                </label>
              </div>

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Création…' : 'Créer mon compte'}
              </Button>
              <p className="text-center text-sm text-gray-500">
                Déjà un compte ?{' '}
                <button type="button" onClick={() => { reset(); setMode('email-login') }}
                  className="text-primary-600 font-medium hover:underline">
                  Se connecter
                </button>
              </p>
            </form>
          )}

          {/* ── FORGOT PASSWORD ─────────────────────────────────────────── */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Mot de passe oublié</h2>
              <p className="text-sm text-gray-500">Entrez votre email — vous recevrez un lien pour créer un nouveau mot de passe.</p>
              <div className="space-y-1.5">
                <Label>Adresse email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.ma" required autoFocus />
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? 'Envoi…' : 'Envoyer le lien'}
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
