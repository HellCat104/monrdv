'use client'

// « Mon compte » (secrétaire) : infos + changement de mot de passe direct
// (sans passer par « mot de passe oublié » — elle est déjà connectée).
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Settings, KeyRound, Check, Eye, EyeOff } from 'lucide-react'

export default function AccountClient({ email, name, doctorName }: { email: string; name: string; doctorName: string }) {
  const supabase = createClient()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setDone(false)
    if (pw1.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    if (pw1 !== pw2) { setError('Les deux mots de passe ne sont pas identiques.'); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: pw1 })
    setSaving(false)
    if (err) {
      setError(err.message.includes('different from the old')
        ? 'Le nouveau mot de passe doit être différent de l\'ancien.'
        : 'Échec du changement de mot de passe. Réessayez.')
      return
    }
    setDone(true)
    setPw1(''); setPw2('')
  }

  return (
    <div className="space-y-5 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary-500" /> Mon compte
      </h1>

      <Card>
        <CardContent className="p-4 text-sm space-y-1.5">
          <p><span className="text-gray-400">Nom :</span> <span className="font-medium text-gray-900">{name}</span></p>
          <p><span className="text-gray-400">E-mail de connexion :</span> <span className="font-medium text-gray-900">{email}</span></p>
          <p><span className="text-gray-400">Cabinet :</span> <span className="font-medium text-gray-900">Dr. {doctorName}</span></p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary-500" /> Changer mon mot de passe
          </h2>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw1">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="pw1"
                  type={show ? 'text' : 'password'}
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  placeholder="8 caractères minimum"
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShow(!show)} tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirmer le nouveau mot de passe</Label>
              <Input
                id="pw2"
                type={show ? 'text' : 'password'}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}
            {done && (
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg flex items-center gap-1.5">
                <Check className="h-4 w-4" /> Mot de passe changé. Utilisez-le à votre prochaine connexion.
              </p>
            )}

            <Button type="submit" disabled={saving || !pw1 || !pw2}>
              {saving ? 'Enregistrement…' : 'Changer le mot de passe'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
