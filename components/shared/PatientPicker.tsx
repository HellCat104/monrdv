'use client'

// Choix du patient lors de la création d'un rendez-vous : soit une fiche
// existante (recherche par nom ou téléphone — aucune ressaisie), soit un
// nouveau patient.
//
// L'e-mail est demandé à la création parce que c'est LUI qui déclenche le
// rappel automatique : sans e-mail, le cron `reminders` ignore le rendez-vous.
// Le libellé le dit explicitement pour que la secrétaire pense à le demander.
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, UserPlus, Check, Mail } from 'lucide-react'

export interface PatientLite {
  id: string
  first_name: string
  last_name: string
  phone: string
}

export interface NewPatientDraft {
  first_name: string
  last_name: string
  phone: string
  email?: string
  birth_date?: string
}

/** Ce que le parent reçoit : une fiche existante, un nouveau patient, ou rien. */
export type PatientChoice =
  | { patientId: string; newPatient?: never }
  | { patientId?: never; newPatient: NewPatientDraft }
  | null

export function PatientPicker({
  onSearch,
  onChange,
  showBirthDate = false,
}: {
  onSearch: (query: string) => Promise<PatientLite[]>
  onChange: (choice: PatientChoice) => void
  showBirthDate?: boolean
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientLite[]>([])
  const [selected, setSelected] = useState<PatientLite | null>(null)
  const [np, setNp] = useState<NewPatientDraft>({ first_name: '', last_name: '', phone: '', email: '', birth_date: '' })

  // Recherche déclenchée après une courte pause, à partir de 2 caractères
  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => { setResults(await onSearch(query.trim())) }, 250)
    return () => clearTimeout(t)
  }, [query, mode, onSearch])

  const pickExisting = useCallback((p: PatientLite) => {
    setSelected(p)
    onChange({ patientId: p.id })
  }, [onChange])

  const editNew = useCallback((patch: Partial<NewPatientDraft>) => {
    setNp((prev) => {
      const next = { ...prev, ...patch }
      const complete = !!(next.first_name.trim() && next.last_name.trim() && next.phone.trim())
      onChange(complete ? { newPatient: next } : null)
      return next
    })
  }, [onChange])

  function switchMode(m: 'existing' | 'new') {
    setMode(m)
    // Le choix précédent n'est plus valable dès qu'on change d'onglet
    if (m === 'existing') onChange(selected ? { patientId: selected.id } : null)
    else {
      const complete = !!(np.first_name.trim() && np.last_name.trim() && np.phone.trim())
      onChange(complete ? { newPatient: np } : null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Onglets */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { m: 'existing' as const, icon: Search,   label: 'Patient existant' },
          { m: 'new'      as const, icon: UserPlus, label: 'Nouveau patient' },
        ]).map(({ m, icon: Icon, label }) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-primary-500 border-primary-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'existing' ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); onChange(null) }}
              placeholder="Nom ou téléphone du patient…"
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {selected ? (
            <div className="flex items-center gap-3 rounded-lg border-2 border-primary-500 bg-primary-50 px-3 py-2.5">
              <Check className="h-4 w-4 text-primary-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{selected.first_name} {selected.last_name}</p>
                <p className="text-xs text-gray-500">{selected.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); onChange(null) }}
                className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700 shrink-0"
              >
                Changer
              </button>
            </div>
          ) : results.length > 0 ? (
            <ul className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pickExisting(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">{p.first_name} {p.last_name}</p>
                    <p className="text-xs text-gray-500">{p.phone}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim().length >= 2 ? (
            <p className="text-xs text-gray-400 px-1">
              Aucun patient trouvé. Utilisez « Nouveau patient » pour créer sa fiche.
            </p>
          ) : (
            <p className="text-xs text-gray-400 px-1">Tapez au moins 2 caractères pour rechercher.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp_first">Prénom *</Label>
              <Input id="pp_first" value={np.first_name} onChange={(e) => editNew({ first_name: e.target.value })} placeholder="Mohammed" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp_last">Nom *</Label>
              <Input id="pp_last" value={np.last_name} onChange={(e) => editNew({ last_name: e.target.value })} placeholder="Alami" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pp_phone">Téléphone *</Label>
            <Input id="pp_phone" type="tel" value={np.phone} onChange={(e) => editNew({ phone: e.target.value })} placeholder="06 12 34 56 78" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pp_email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-primary-500" />
              E-mail
            </Label>
            <Input id="pp_email" type="email" value={np.email ?? ''} onChange={(e) => editNew({ email: e.target.value })} placeholder="patient@exemple.ma" />
            <p className="text-xs text-primary-600 font-medium">
              Nécessaire pour envoyer le rappel automatique avant le rendez-vous.
            </p>
          </div>

          {showBirthDate && (
            <div className="space-y-1.5">
              <Label htmlFor="pp_birth">Date de naissance</Label>
              <Input id="pp_birth" type="date" value={np.birth_date ?? ''} onChange={(e) => editNew({ birth_date: e.target.value })} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
