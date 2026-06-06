'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Stethoscope, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')
  const [ready, setReady]         = useState(false)
  const [linkError, setLinkError] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let resolved = false

    const markReady = () => { resolved = true; setReady(true) }

    // 1) Le token du hash a peut-être DÉJÀ été traité avant qu'on s'abonne :
    //    on vérifie tout de suite si une session existe.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady()
    })

    // 2) Sinon, on écoute l'événement (au cas où il arrive juste après)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || session) {
        markReady()
      }
    })

    // 3) Filet de sécurité : si rien après 5s, le lien est invalide/expiré
    const timeout = setTimeout(() => {
      if (!resolved) setLinkError(true)
    }, 5000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (err) {
      setError('Une erreur est survenue. Le lien a peut-être expiré.')
    } else {
      setDone(true)
      setTimeout(() => router.push('/login'), 3000)
    }
  }

  if (linkError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-xl p-8 space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900">Lien invalide ou expiré</h1>
          <p className="text-sm text-gray-500">
            Ce lien de réinitialisation n&apos;est plus valide. Demandez-en un nouveau.
          </p>
          <a href="/forgot-password"
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            Demander un nouveau lien
          </a>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <div className="h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Vérification du lien…
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded-2xl mb-4 shadow-lg">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MonRDV</h1>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Nouveau mot de passe</CardTitle>
            <CardDescription>Choisissez un mot de passe sécurisé.</CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
                <p className="font-semibold text-gray-900">Mot de passe mis à jour !</p>
                <p className="text-sm text-gray-500">Redirection vers la connexion…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nouveau mot de passe</Label>
                  <div className="relative">
                    <Input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 caractères"
                      required
                      autoFocus
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Confirmer le mot de passe</Label>
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Répétez le mot de passe"
                    required
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? 'Mise à jour…' : 'Enregistrer le nouveau mot de passe'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
