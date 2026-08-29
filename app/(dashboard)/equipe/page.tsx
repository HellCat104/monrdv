'use client'

// « Mon équipe » — le médecin invite des secrétaires et règle leurs permissions.
// Visible seulement si le médecin a déclaré avoir une secrétaire (Paramètres).
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Trash2, Users2, Check, Mail, Loader2 } from 'lucide-react'
import { DEFAULT_STAFF_PERMISSIONS, STAFF_PERMISSION_GROUPS, type CabinetStaff, type StaffPermissions } from '@/types'
import { canAccess, type DoctorPlan } from '@/lib/plan'

export default function EquipePage() {
  const [staff, setStaff] = useState<CabinetStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [hasSecretary, setHasSecretary] = useState<boolean | null>(null)
  const [plan, setPlan] = useState<DoctorPlan>('complet')
  const supabase = createClient()

  // Formulaire d'invitation
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [perms, setPerms] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMISSIONS })

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: doc } = await supabase.from('doctors').select('has_secretary, plan').eq('email', user.email).single()
      setHasSecretary(!!doc?.has_secretary)
      // Défaut 'complet' avant chargement : on n'affiche pas fugitivement des
      // cases qui vont disparaître. C'est le forfait confirmé qui restreint.
      setPlan(doc?.plan === 'agenda' ? 'agenda' : 'complet')
    }
    const res = await fetch('/api/staff')
    const d = await res.json().catch(() => ({}))
    setStaff(d.staff ?? [])
    setLoading(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function enableSecretary() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('doctors').update({ has_secretary: true }).eq('email', user.email)
    setHasSecretary(true)
  }

  async function invite() {
    setError(''); setOk('')
    if (!name.trim() || !email.trim()) { setError('Nom et e-mail requis.'); return }
    setAdding(true)
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), permissions: perms }),
    })
    const d = await res.json().catch(() => ({}))
    setAdding(false)
    if (!res.ok) { setError(d.error || 'Échec de l’invitation.'); return }
    setOk(`Invitation envoyée à ${email.trim()}.`)
    setName(''); setEmail(''); setPerms({ ...DEFAULT_STAFF_PERMISSIONS })
    load()
  }

  async function togglePerm(s: CabinetStaff, key: keyof StaffPermissions) {
    // Fusion avec les défauts : les anciennes invitations n'ont pas les nouvelles clés
    const merged = { ...DEFAULT_STAFF_PERMISSIONS, ...s.permissions }
    const next = { ...merged, [key]: !merged[key] }
    setStaff((prev) => prev.map((x) => x.id === s.id ? { ...x, permissions: next } : x))
    await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, permissions: next }),
    })
  }

  async function remove(s: CabinetStaff) {
    if (!confirm(`Retirer ${s.name} de votre équipe ? Cette personne perdra l’accès au cabinet.`)) return
    setStaff((prev) => prev.filter((x) => x.id !== s.id))
    await fetch(`/api/staff?id=${s.id}`, { method: 'DELETE' })
  }

  // Matrice groupée réutilisée (invitation + édition)
  const PermMatrix = ({ values, onToggle }: { values: StaffPermissions; onToggle: (k: keyof StaffPermissions) => void }) => (
    <div className="space-y-3">
      {STAFF_PERMISSION_GROUPS.map((g) => {
        const visibles = g.items.filter(({ requiert }) => !requiert || canAccess(plan, requiert))
        if (visibles.length === 0) {
          return (
            <div key={g.title}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.title}</p>
              <p className="text-[13px] text-gray-500 rounded-lg border border-dashed border-gray-200 p-2.5">
                Disponible avec le forfait <b>Cabinet complet</b>.
              </p>
            </div>
          )
        }
        return (
        <div key={g.title}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.title}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {g.items
              // Une permission dont le forfait ne couvre pas le droit n'est pas
              // grisée mais retirée : une case cochable et sans effet finit en
              // appel au support. Le bandeau ci-dessous dit ce qui manque.
              .filter(({ requiert }) => !requiert || canAccess(plan, requiert))
              .map(({ key, label, hint }) => (
              <label key={key} className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-gray-100 p-2.5 hover:bg-gray-50">
                <input type="checkbox" checked={!!values[key]} onChange={() => onToggle(key)}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
                <span>
                  <span className="text-gray-800">{label}</span>
                  <span className="block text-[11px] text-gray-400">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        )
      })}
    </div>
  )

  if (!loading && hasSecretary === false && staff.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users2 className="h-6 w-6 text-primary-500" /> Mon équipe</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <Users2 className="h-10 w-10 mx-auto text-gray-300" />
            <p className="text-sm text-gray-600">Vous n’avez pas encore déclaré de secrétaire pour votre cabinet.</p>
            <p className="text-xs text-gray-400">Activez cette option pour inviter votre secrétaire et lui donner un accès limité (agenda, accueil…), sans jamais exposer le dossier médical si vous ne le souhaitez pas.</p>
            <Button onClick={enableSecretary}><UserPlus className="h-4 w-4 mr-1.5" /> J’ai une secrétaire — activer</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users2 className="h-6 w-6 text-primary-500" /> Mon équipe</h1>
        <p className="text-sm text-gray-500 mt-1">Donnez à votre secrétaire un accès limité au cabinet (agenda, patients…), sans le dossier médical si vous le souhaitez.</p>
      </div>

      {/* Inviter une secrétaire */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary-500" /> Inviter une secrétaire</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la secrétaire" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Adresse e-mail" />
          </div>

          <PermMatrix values={perms} onToggle={(key) => setPerms((p) => ({ ...p, [key]: !p[key] }))} />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {ok && <p className="text-sm text-green-600 flex items-center gap-1"><Check className="h-4 w-4" /> {ok}</p>}

          <Button onClick={invite} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
            {adding ? 'Envoi…' : 'Envoyer l’invitation'}
          </Button>
        </CardContent>
      </Card>

      {/* Liste de l'équipe */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Équipe ({staff.length})</h2>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : staff.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-gray-400 text-sm">
            <Users2 className="h-8 w-8 mx-auto mb-2 opacity-40" /> Aucune secrétaire pour l’instant.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {staff.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500">{s.email}</p>
                    </div>
                    <button onClick={() => remove(s)} className="text-gray-300 hover:text-red-500 shrink-0" title="Retirer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <PermMatrix values={{ ...DEFAULT_STAFF_PERMISSIONS, ...s.permissions }} onToggle={(key) => togglePerm(s, key)} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
