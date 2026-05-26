'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Download, Pencil, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function MesDonneesPage() {
  const router = useRouter()
  const [data, setData]           = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [error, setError]         = useState('')

  useEffect(() => {
    fetch('/api/patient/data')
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setEditPhone(d.patients?.[0]?.phone ?? '')
        setEditEmail(d.patients?.[0]?.email ?? '')
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/patient/data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: editPhone, email: editEmail }),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
    else setError('Erreur lors de la mise à jour')
  }

  async function handleDelete() {
    setDeleteStep('deleting')
    const res = await fetch('/api/patient/data', { method: 'DELETE' })
    if (res.ok) {
      router.push('/?deleted=1')
    } else {
      setError('Erreur lors de la suppression')
      setDeleteStep('idle')
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'mes-donnees-monrdv.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Chargement…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary-500" />
          Mes données personnelles
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Conformément à la loi 09-08, vous pouvez accéder, corriger ou supprimer vos données.
        </p>
      </div>

      {/* Droit d'accès — Export */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">📋 Droit d&apos;accès</h2>
        <p className="text-sm text-gray-500 mb-4">
          Téléchargez une copie de toutes les données que MonRDV détient sur vous.
        </p>
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 mb-4 space-y-1">
          <p><strong>Email :</strong> {data?.account?.email ?? '—'}</p>
          <p><strong>Téléphone :</strong> {data?.patients?.[0]?.phone ?? '—'}</p>
          <p><strong>Rendez-vous :</strong> {data?.appointments?.length ?? 0} au total</p>
          <p><strong>Compte créé le :</strong> {data?.account?.created_at ? new Date(data.account.created_at).toLocaleDateString('fr-FR') : '—'}</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Télécharger mes données (JSON)
        </Button>
      </div>

      {/* Droit de rectification */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">✏️ Droit de rectification</h2>
        <p className="text-sm text-gray-500 mb-4">Corrigez vos informations si elles sont inexactes.</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Téléphone</Label>
            <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="06 12 34 56 78" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="vous@exemple.ma" />
          </div>
          {saved && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Données mises à jour
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </Button>
        </div>
      </div>

      {/* Droit à l'effacement */}
      <div className="bg-white rounded-2xl border border-red-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-red-500" />
          Droit à l&apos;effacement
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Supprimez définitivement votre compte et toutes vos données personnelles.
          Les rendez-vous futurs seront annulés. Cette action est <strong>irréversible</strong>.
        </p>

        {deleteStep === 'idle' && (
          <Button
            variant="outline"
            className="text-red-500 border-red-200 hover:bg-red-50"
            onClick={() => setDeleteStep('confirm')}
          >
            Supprimer mon compte et mes données
          </Button>
        )}

        {deleteStep === 'confirm' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Êtes-vous sûr ? Cette action supprimera définitivement votre compte, vos données et annulera vos rendez-vous à venir.</p>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={handleDelete}
              >
                Oui, supprimer définitivement
              </Button>
              <Button variant="outline" onClick={() => setDeleteStep('idle')}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {deleteStep === 'deleting' && (
          <p className="text-sm text-gray-500">Suppression en cours…</p>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Pour toute demande supplémentaire, contactez-nous à{' '}
        <a href="mailto:asmaadouach@gmail.com" className="underline hover:text-primary-500">
          asmaadouach@gmail.com
        </a>
        . Délai de réponse : 30 jours maximum.
      </p>
    </div>
  )
}
