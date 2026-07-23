'use client'

// Ajout d'un patient « sans RDV » (walk-in) : on choisit une fiche existante
// (recherche nom/téléphone) ou on crée un nouveau patient. Le patient est
// ajouté directement à la file du jour, sans réserver de créneau.
import { useState, useEffect } from 'react'
import { formatAge } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, UserPlus, Check } from 'lucide-react'

export interface PatientLite { id: string; first_name: string; last_name: string; phone: string }

export function WalkInDialog({
  open, onOpenChange, onSearch, onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSearch: (query: string) => Promise<PatientLite[]>
  onSubmit: (arg: { patientId?: string; newPatient?: { first_name: string; last_name: string; phone: string; birth_date?: string } }) => Promise<void>
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientLite[]>([])
  const [selected, setSelected] = useState<PatientLite | null>(null)
  const [np, setNp] = useState({ first_name: '', last_name: '', phone: '', birth_date: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Réinitialise à l'ouverture
  useEffect(() => {
    if (open) { setMode('existing'); setQuery(''); setResults([]); setSelected(null); setNp({ first_name: '', last_name: '', phone: '', birth_date: '' }); setError('') }
  }, [open])

  // Recherche (debounce léger)
  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => { setResults(await onSearch(query.trim())) }, 250)
    return () => clearTimeout(t)
  }, [query, mode, onSearch])

  async function submit() {
    setError('')
    if (mode === 'existing' && !selected) { setError('Choisissez un patient ou créez-en un.'); return }
    if (mode === 'new' && (!np.first_name.trim() || !np.last_name.trim() || !np.phone.trim())) { setError('Prénom, nom et téléphone requis.'); return }
    setSubmitting(true)
    try {
      await onSubmit(mode === 'existing' ? { patientId: selected!.id } : { newPatient: { first_name: np.first_name.trim(), last_name: np.last_name.trim(), phone: np.phone.trim(), birth_date: np.birth_date || undefined } })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l\'ajout.')
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Patient sans RDV</DialogTitle></DialogHeader>

        {/* Bascule fiche existante / nouveau patient */}
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 self-start">
          {([['existing', 'Patient existant'], ['new', 'Nouveau patient']] as const).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError('') }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${mode === m ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null) }} placeholder="Nom ou téléphone…" className="pl-9" autoFocus />
            </div>
            {selected ? (
              <div className="flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-lg px-3 py-2 text-sm">
                <Check className="h-4 w-4 text-primary-600" />
                <span className="font-medium">{selected.first_name} {selected.last_name}</span>
                <span className="text-gray-500">· {selected.phone}</span>
                <button onClick={() => setSelected(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">changer</button>
              </div>
            ) : query.trim().length >= 2 && (
              <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                {results.length === 0 ? (
                  <p className="text-xs text-gray-400 p-3">Aucun patient trouvé. Utilisez « Nouveau patient ».</p>
                ) : results.map((p) => (
                  <button key={p.id} onClick={() => setSelected(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    <span className="font-medium text-gray-800">{p.first_name} {p.last_name}</span>
                    <span className="text-gray-500"> · {p.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Prénom *</Label><Input value={np.first_name} onChange={(e) => setNp({ ...np, first_name: e.target.value })} placeholder="Mohammed" /></div>
              <div className="space-y-1.5"><Label>Nom *</Label><Input value={np.last_name} onChange={(e) => setNp({ ...np, last_name: e.target.value })} placeholder="Alami" /></div>
            </div>
            <div className="space-y-1.5"><Label>Téléphone *</Label><Input type="tel" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} placeholder="06 12 34 56 78" /></div>
            <div className="space-y-1.5">
              <Label>Date de naissance</Label>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} value={np.birth_date} onChange={(e) => setNp({ ...np, birth_date: e.target.value })} />
              {formatAge(np.birth_date) && <p className="text-xs font-medium text-primary-600">👶 {formatAge(np.birth_date)}</p>}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>
            <UserPlus className="h-4 w-4 mr-1" /> {submitting ? 'Ajout…' : 'Ajouter à la file'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
