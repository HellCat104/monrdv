'use client'

// La fiche de synthèse d'une pathologie suivie au long cours.
//
// ── POURQUOI ────────────────────────────────────────────────────────────────
//
// Un Crohn ou une cirrhose se suit dix ans. La chronologie LISTE ce qui s'est
// passé ; elle ne RÉSUME pas. Le praticien qui rouvre le dossier après six
// mois relisait quinze lignes pour reconstituer trois faits : depuis quand,
// sous quoi, où en est-on. Cette fiche répond aux trois en haut de l'écran.
//
// ── CE QUI EST ÉCRIT, ET CE QUI EST COMPTÉ ──────────────────────────────────
//
// Les champs sont SAISIS par le médecin — y compris le statut : le logiciel ne
// décide pas qu'une maladie est en rémission.
//
// Ce que la fiche y ajoute est du COMPTAGE : le nombre de consultations et
// d'endoscopies depuis le diagnostic, la date du dernier examen. Des faits
// vérifiables, pas une appréciation clinique.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateFr } from '@/lib/utils'
import { Activity, Plus, Save, Trash2, Pencil } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fiche = Record<string, any>

const STATUTS: { cle: string; label: string; couleur: string }[] = [
  { cle: 'active',       label: 'Active',          couleur: 'bg-blue-100 text-blue-700' },
  { cle: 'poussee',      label: 'Poussée',         couleur: 'bg-red-100 text-red-700' },
  { cle: 'remission',    label: 'En rémission',    couleur: 'bg-green-100 text-green-700' },
  { cle: 'surveillance', label: 'Sous surveillance', couleur: 'bg-amber-100 text-amber-700' },
  { cle: 'guerie',       label: 'Guérie',          couleur: 'bg-gray-100 text-gray-600' },
]

export default function SynthesePathologie({
  patientId, doctorId, actes,
}: {
  patientId: string
  doctorId: string
  /** Dates des actes déjà chargés par le dossier : on compte, on ne requête
   *  pas une seconde fois. */
  actes: { consultations: string[]; endoscopies: { jour: string; titre: string }[] }
}) {
  const supabase = createClient()
  const [fiches, setFiches] = useState<Fiche[]>([])
  const [edite, setEdite] = useState<Fiche | null>(null)
  const [indisponible, setIndisponible] = useState(false)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('patient_pathologies').select('*')
      .eq('patient_id', patientId).order('created_at', { ascending: false })
    if (error) { setIndisponible(true); return }
    setFiches(data ?? [])
  }, [supabase, patientId])
  useEffect(() => { charger() }, [charger])

  async function enregistrer() {
    if (!edite || !String(edite.libelle ?? '').trim()) { setErreur('Nommez la pathologie.'); return }
    setErreur('')
    const { id, created_at, updated_at, ...reste } = edite // eslint-disable-line @typescript-eslint/no-unused-vars
    const corps = { ...reste, doctor_id: doctorId, patient_id: patientId }
    const r = id
      ? await supabase.from('patient_pathologies').update(corps).eq('id', id)
      : await supabase.from('patient_pathologies').insert(corps)
    if (r.error) { setErreur('L’enregistrement a échoué.'); return }
    setEdite(null); charger()
  }

  async function supprimer(f: Fiche) {
    if (!confirm(`Supprimer la fiche « ${f.libelle} » ? Les consultations et comptes rendus ne sont pas touchés.`)) return
    await supabase.from('patient_pathologies').delete().eq('id', f.id)
    charger()
  }

  if (indisponible) return null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <Activity className="h-4 w-4" /> Pathologies suivies
        </h3>
        <button onClick={() => setEdite({ libelle: '', statut: 'active' })}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </div>

      {erreur && <p className="text-xs text-red-600">{erreur}</p>}

      {edite && (
        <div className="border border-primary-200 rounded-lg p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-400">Pathologie</Label>
              <Input value={edite.libelle ?? ''} placeholder="Ex : maladie de Crohn iléo-colique" className="h-9"
                onChange={(e) => setEdite({ ...edite, libelle: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-400">Diagnostiquée le</Label>
              <Input type="date" value={edite.date_diagnostic ?? ''} className="h-9"
                onChange={(e) => setEdite({ ...edite, date_diagnostic: e.target.value || null })} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-gray-400">Où en est-on</Label>
            <div className="flex flex-wrap gap-1.5">
              {STATUTS.map((s) => (
                <button key={s.cle} type="button" onClick={() => setEdite({ ...edite, statut: s.cle })}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition ${edite.statut === s.cle ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">C’est vous qui le qualifiez : MonRDV ne le déduit de rien.</p>
          </div>

          <Zone label="Traitement actuel" value={edite.traitement_actuel ?? ''} rows={2}
            onChange={(v) => setEdite({ ...edite, traitement_actuel: v })} />
          <Zone label="Évolution (poussées, changements de traitement, complications)" value={edite.evolution ?? ''} rows={4}
            onChange={(v) => setEdite({ ...edite, evolution: v })}
            aide="Quelques lignes datées suffisent : c’est ce qu’on relit dans six mois." />

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEdite(null)}>Annuler</Button>
            <Button size="sm" onClick={enregistrer}><Save className="h-4 w-4 mr-1.5" /> Enregistrer</Button>
          </div>
        </div>
      )}

      {fiches.length === 0 && !edite ? (
        <p className="text-xs text-gray-400 italic">
          Aucune pathologie suivie. Utile sur un Crohn, une cirrhose, une hépatite : trois faits en haut du dossier plutôt que quinze lignes à relire.
        </p>
      ) : (
        <div className="space-y-2">
          {fiches.map((f) => {
            const st = STATUTS.find((s) => s.cle === f.statut)
            // COMPTAGE, pas clinique : ce qui s'est passé depuis le diagnostic.
            const depuis = f.date_diagnostic ?? ''
            const nbCons = actes.consultations.filter((d) => !depuis || d >= depuis).length
            const endos = actes.endoscopies.filter((e) => !depuis || e.jour >= depuis)
            const derniere = endos.length > 0 ? endos.reduce((a, b) => (a.jour > b.jour ? a : b)) : null
            return (
              <div key={f.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{f.libelle}</span>
                  {st && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${st.couleur}`}>{st.label}</span>}
                  <span className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => setEdite(f)} className="text-gray-400 hover:text-primary-600"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => supprimer(f)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>

                <p className="text-[11px] text-gray-500 mt-0.5">
                  {f.date_diagnostic ? `Diagnostiquée le ${formatDateFr(f.date_diagnostic)}` : 'Date de diagnostic non renseignée'}
                  {f.traitement_actuel ? ` · ${String(f.traitement_actuel).split('\n')[0]}` : ''}
                </p>

                {/* Les faits comptés, dits comme tels. */}
                <p className="text-[11px] text-gray-400 mt-1">
                  {nbCons} consultation{nbCons > 1 ? 's' : ''} · {endos.length} endoscopie{endos.length > 1 ? 's' : ''}
                  {derniere && ` · dernière : ${derniere.titre} du ${formatDateFr(derniere.jour)}`}
                </p>

                {f.evolution && (
                  <p className="text-xs text-gray-700 whitespace-pre-wrap mt-1.5 border-t border-gray-50 pt-1.5">{f.evolution}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Zone({ label, value, onChange, rows = 2, aide }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; aide?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-gray-400">{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300" />
      {aide && <p className="text-[11px] text-gray-400">{aide}</p>}
    </div>
  )
}
