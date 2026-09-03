'use client'

// « Mon équipe » — le médecin invite des secrétaires et règle leurs permissions.
// Visible seulement si le médecin a déclaré avoir une secrétaire (Paramètres).
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Trash2, Users2, Check, Mail, Loader2, ChevronDown } from 'lucide-react'
import { DEFAULT_STAFF_PERMISSIONS, STAFF_PERMISSION_GROUPS, type CabinetStaff, type StaffPermissions } from '@/types'
import { canAccess, type DoctorPlan } from '@/lib/plan'

// Ce qu'une personne peut réellement faire, en une ligne.
//
// Quatorze cases à cocher répondent mal à « est-ce qu'elle peut encaisser ? ».
// Le résumé le dit sans qu'on ait à les parcourir.
function resumeDroits(perms: StaffPermissions, plan: DoctorPlan): string[] {
  const accordes: string[] = []
  for (const groupe of STAFF_PERMISSION_GROUPS) {
    for (const item of groupe.items) {
      if (item.requiert && !canAccess(plan, item.requiert)) continue
      if (perms[item.key]) accordes.push(item.label)
    }
  }
  return accordes
}

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
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState<StaffPermissions>({ ...DEFAULT_STAFF_PERMISSIONS })
  const [formOuvert, setFormOuvert] = useState(false)
  // Le repli ne se décide qu'au premier chargement : sinon, cocher une case
  // rechargeait la liste et refermait le formulaire sous les doigts du médecin.
  const premierChargement = useRef(true)
  // Une fiche dépliée à la fois n'est pas imposée : le médecin peut vouloir
  // comparer deux secrétaires. C'est l'état replié qui est le défaut.
  const [ouvert, setOuvert] = useState<Record<string, boolean>>({})
  const [enregistre, setEnregistre] = useState<string | null>(null)
  const [permErreur, setPermErreur] = useState('')

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
    if (premierChargement.current) {
      // Personne dans l'équipe : rien à confondre, le formulaire s'ouvre seul.
      setFormOuvert((d.staff ?? []).length === 0)
      premierChargement.current = false
    }
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
    if (password && password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    setAdding(true)
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password: password || undefined, permissions: perms }),
    })
    const d = await res.json().catch(() => ({}))
    setAdding(false)
    if (!res.ok) { setError(d.error || 'Échec de l’invitation.'); return }
    setOk(`Invitation envoyée à ${email.trim()}.`)
    setName(''); setEmail(''); setPassword(''); setPerms({ ...DEFAULT_STAFF_PERMISSIONS })
    setFormOuvert(false)
    load()
  }

  async function togglePerm(s: CabinetStaff, key: keyof StaffPermissions) {
    // Fusion avec les défauts : les anciennes invitations n'ont pas les nouvelles clés
    const merged = { ...DEFAULT_STAFF_PERMISSIONS, ...s.permissions }
    const next = { ...merged, [key]: !merged[key] }
    const avant = s.permissions
    setStaff((prev) => prev.map((x) => x.id === s.id ? { ...x, permissions: next } : x))
    setPermErreur('')
    const res = await fetch('/api/staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, permissions: next }),
    }).catch(() => null)

    // Sans ce retour en arrière, la case restait cochée à l'écran alors que
    // rien n'avait été enregistré : le médecin croyait avoir retiré un droit
    // qui restait actif.
    if (!res || !res.ok) {
      setStaff((prev) => prev.map((x) => x.id === s.id ? { ...x, permissions: avant } : x))
      setPermErreur('Le changement n’a pas pu être enregistré. Vérifiez votre connexion et réessayez.')
      return
    }
    setEnregistre(s.id)
    setTimeout(() => setEnregistre((v) => (v === s.id ? null : v)), 2500)
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

      {permErreur && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {permErreur}
        </p>
      )}

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
            {staff.map((s) => {
              const effectives = { ...DEFAULT_STAFF_PERMISSIONS, ...s.permissions }
              const accordes = resumeDroits(effectives, plan)
              const deplie = !!ouvert[s.id]
              return (
                <Card key={s.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 font-bold flex items-center justify-center shrink-0">
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                          <p className="text-xs text-gray-500 truncate">{s.email}</p>
                        </div>
                      </div>
                      <button onClick={() => remove(s)} className="text-gray-300 hover:text-red-500 shrink-0" title="Retirer de l’équipe">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Le résumé reste visible même replié : c'est lui qui répond
                        à « qu'est-ce qu'elle a le droit de faire ? ». */}
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        Ce que {s.name} peut faire
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {accordes.length > 0 ? accordes.join(' · ') : 'Aucun droit accordé pour le moment.'}
                      </p>
                    </div>

                    <button
                      onClick={() => setOuvert((o) => ({ ...o, [s.id]: !o[s.id] }))}
                      aria-expanded={deplie}
                      className="mt-3 w-full flex items-center justify-between gap-2 text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 hover:border-primary-300 hover:text-primary-600 transition-colors"
                    >
                      <span>{deplie ? 'Masquer ses accès' : 'Voir et modifier ses accès'}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${deplie ? 'rotate-180' : ''}`} />
                    </button>

                    {deplie && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs text-gray-400">
                            Cochez ou décochez : c’est enregistré aussitôt, il n’y a pas de bouton à valider.
                          </p>
                          {enregistre === s.id && (
                            <span className="text-xs text-green-600 flex items-center gap-1 shrink-0">
                              <Check className="h-3.5 w-3.5" /> Enregistré
                            </span>
                          )}
                        </div>
                        <PermMatrix values={effectives} onToggle={(key) => togglePerm(s, key)} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {ok && (
        <p className="text-sm text-green-600 flex items-center gap-1">
          <Check className="h-4 w-4 shrink-0" /> {ok}
        </p>
      )}

      {/* Même vocabulaire visuel que les fiches ci-dessus : un volet qu'on
          ouvre. Déplié en permanence, son tableau de permissions par défaut se
          confondait avec celui d'une secrétaire réelle. */}
      <Card>
        <button
          onClick={() => setFormOuvert((v) => !v)}
          aria-expanded={formOuvert}
          className="w-full flex items-center justify-between gap-3 p-5 text-left"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-full bg-primary-50 text-primary-500 flex items-center justify-center shrink-0">
              <UserPlus className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-gray-900">Inviter une secrétaire</span>
              <span className="block text-xs text-gray-500">
                Créez son accès et choisissez ce qu&rsquo;elle pourra faire
              </span>
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${formOuvert ? 'rotate-180' : ''}`} />
        </button>

        {formOuvert && (
          <CardContent className="px-5 pb-5 pt-0 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la secrétaire" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Adresse e-mail" />
          </div>

          <div className="space-y-1">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Mot de passe (facultatif)"
            />
            <p className="text-[11px] text-gray-400">
              Laissez vide pour qu&apos;un mot de passe soit généré et envoyé par e-mail.
              Elle pourra le changer après sa première connexion.
            </p>
          </div>

          <div className="pt-1">
            {/* Futur, pas réel : le libellé doit interdire de confondre cette
                grille avec celle d'une secrétaire déjà en poste. */}
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Ce qu’elle pourra faire
            </p>
            <PermMatrix values={perms} onToggle={(key) => setPerms((p) => ({ ...p, [key]: !p[key] }))} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-2">
            <Button onClick={invite} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              {adding ? 'Envoi…' : 'Envoyer l’invitation'}
            </Button>
            {staff.length > 0 && (
              <Button variant="ghost" onClick={() => { setFormOuvert(false); setError(''); setOk('') }}>
                Annuler
              </Button>
            )}
          </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
