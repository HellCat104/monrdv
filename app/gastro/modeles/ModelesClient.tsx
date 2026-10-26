'use client'

// Modèles d'ordonnance et protocoles de préparation — création, modification,
// duplication, archivage.
//
// ARCHIVER PLUTÔT QUE SUPPRIMER : une ordonnance délivrée il y a deux ans a
// été faite à partir d'un modèle. L'effacer ne change pas l'ordonnance, mais
// il ferait disparaître la trace de ce qui était prescrit à l'époque. Un
// modèle archivé ne s'affiche plus, il n'est pas détruit.
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Copy, Archive, Save, Pill, ClipboardList } from 'lucide-react'
import { CATEGORIES_MODELE } from '@/lib/gastro'
import type { LigneOrdonnance, HoraireePreparation } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Modele = Record<string, any>
const champ = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300'

export default function ModelesClient({ doctorId }: { doctorId: string }) {
  const supabase = createClient()
  const [onglet, setOnglet] = useState<'ordonnances' | 'preparations'>('ordonnances')
  const [ordos, setOrdos] = useState<Modele[]>([])
  const [preps, setPreps] = useState<Modele[]>([])
  const [edite, setEdite] = useState<Modele | null>(null)
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)

  const charger = useCallback(async () => {
    const [o, p] = await Promise.all([
      supabase.from('prescription_templates').select('*').is('archive_le', null).order('categorie').order('nom'),
      supabase.from('preparation_protocols').select('*').is('archive_le', null).order('nom'),
    ])
    if (o.error || p.error) {
      setErreur('Les modèles attendent une migration de la base (v81).')
    } else {
      setOrdos(o.data ?? []); setPreps(p.data ?? [])
    }
    setChargement(false)
  }, [supabase])
  useEffect(() => { charger() }, [charger])

  const table = () => (onglet === 'ordonnances' ? 'prescription_templates' : 'preparation_protocols')

  function nouveau() {
    setEdite(onglet === 'ordonnances'
      ? { nom: '', categorie: CATEGORIES_MODELE[0], lignes: [{}] as LigneOrdonnance[], examens: '', notes: '' }
      : { nom: '', produit: '', regime: '', modalites: '', horaires: [{}] as HoraireePreparation[], consignes_medicaments: '', consignes_pratiques: '' })
  }

  async function enregistrer() {
    if (!edite || !String(edite.nom ?? '').trim()) { setErreur('Donnez un nom à ce modèle.'); return }
    setErreur('')
    const { id, created_at, doctor_id, archive_le, ...reste } = edite // eslint-disable-line @typescript-eslint/no-unused-vars
    const corps = { ...reste, doctor_id: doctorId }
    const r = id
      ? await supabase.from(table()).update(corps).eq('id', id)
      : await supabase.from(table()).insert(corps)
    if (r.error) { setErreur('L’enregistrement a échoué.'); return }
    setEdite(null); charger()
  }

  async function archiver(m: Modele) {
    if (!confirm(`Archiver « ${m.nom} » ? Il n’apparaîtra plus dans la liste, sans être supprimé.`)) return
    await supabase.from(table()).update({ archive_le: new Date().toISOString() }).eq('id', m.id)
    charger()
  }

  function dupliquer(m: Modele) {
    const { id, created_at, ...reste } = m // eslint-disable-line @typescript-eslint/no-unused-vars
    setEdite({ ...reste, nom: `${m.nom} (copie)` })
  }

  const liste = onglet === 'ordonnances' ? ordos : preps

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes modèles</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Rien n’est livré pré-rempli : ces modèles sont les vôtres, et vous les validez avant chaque usage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
            {([['ordonnances', 'Ordonnances'], ['preparations', 'Préparations']] as const).map(([c, l]) => (
              <button key={c} onClick={() => { setOnglet(c); setEdite(null) }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${onglet === c ? 'bg-primary-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{l}</button>
            ))}
          </div>
          <Button size="sm" onClick={nouveau}><Plus className="h-4 w-4 mr-1.5" /> Nouveau</Button>
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erreur}</p>}

      {edite && (
        <div className="bg-white border border-primary-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-400">Nom du modèle</Label>
              <Input value={edite.nom ?? ''} onChange={(e) => setEdite({ ...edite, nom: e.target.value })} className="h-9" />
            </div>
            {onglet === 'ordonnances' && (
              <div className="space-y-1">
                <Label className="text-[11px] text-gray-400">Catégorie</Label>
                <Input list="categories-modele" value={edite.categorie ?? ''} onChange={(e) => setEdite({ ...edite, categorie: e.target.value })} className="h-9" />
                <datalist id="categories-modele">
                  {CATEGORIES_MODELE.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            )}
          </div>

          {onglet === 'ordonnances' ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-[11px] text-gray-400">Lignes de prescription</Label>
                  <button type="button" onClick={() => setEdite({ ...edite, lignes: [...(edite.lignes ?? []), {}] })}
                    className="text-xs font-medium text-primary-600 flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
                </div>
                <div className="space-y-1.5">
                  {(edite.lignes ?? []).map((l: LigneOrdonnance, i: number) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-center">
                      {(['medicament', 'dosage', 'voie', 'frequence', 'duree'] as const).map((k) => (
                        <Input key={k} placeholder={LABELS_LIGNE[k]} value={l[k] ?? ''} className="h-8 text-xs"
                          onChange={(e) => {
                            const suivant = [...(edite.lignes ?? [])]
                            suivant[i] = { ...suivant[i], [k]: e.target.value }
                            setEdite({ ...edite, lignes: suivant })
                          }} />
                      ))}
                      <button type="button" onClick={() => setEdite({ ...edite, lignes: (edite.lignes ?? []).filter((_: unknown, j: number) => j !== i) })}
                        className="text-gray-300 hover:text-red-500 justify-self-start"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <Zone label="Examens biologiques ou autres demandes" value={edite.examens ?? ''} onChange={(v) => setEdite({ ...edite, examens: v })} />
              <Zone label="Notes" value={edite.notes ?? ''} onChange={(v) => setEdite({ ...edite, notes: v })} />
            </>
          ) : (
            <>
              <Zone label="Produit de préparation" value={edite.produit ?? ''} onChange={(v) => setEdite({ ...edite, produit: v })} rows={2} />
              <Zone label="Régime alimentaire" value={edite.regime ?? ''} onChange={(v) => setEdite({ ...edite, regime: v })} rows={3} />
              <Zone label="Modalités de prise" value={edite.modalites ?? ''} onChange={(v) => setEdite({ ...edite, modalites: v })} rows={3} />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-[11px] text-gray-400">Horaires</Label>
                  <button type="button" onClick={() => setEdite({ ...edite, horaires: [...(edite.horaires ?? []), {}] })}
                    className="text-xs font-medium text-primary-600 flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
                </div>
                <div className="space-y-1.5">
                  {(edite.horaires ?? []).map((h: HoraireePreparation, i: number) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 items-center">
                      <Input placeholder="Quand (ex : la veille à 19 h)" value={h.quand ?? ''} className="h-8 text-xs"
                        onChange={(e) => { const s = [...(edite.horaires ?? [])]; s[i] = { ...s[i], quand: e.target.value }; setEdite({ ...edite, horaires: s }) }} />
                      <Input placeholder="Quoi" value={h.quoi ?? ''} className="h-8 text-xs"
                        onChange={(e) => { const s = [...(edite.horaires ?? [])]; s[i] = { ...s[i], quoi: e.target.value }; setEdite({ ...edite, horaires: s }) }} />
                      <button type="button" onClick={() => setEdite({ ...edite, horaires: (edite.horaires ?? []).filter((_: unknown, j: number) => j !== i) })}
                        className="text-gray-300 hover:text-red-500 justify-self-start"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              <Zone label="Consignes sur les médicaments habituels" value={edite.consignes_medicaments ?? ''} rows={3}
                onChange={(v) => setEdite({ ...edite, consignes_medicaments: v })}
                aide="Texte libre. MonRDV n’y écrit rien : toute adaptation d’un traitement relève de votre évaluation." />
              <Zone label="Consignes pratiques" value={edite.consignes_pratiques ?? ''} rows={3} onChange={(v) => setEdite({ ...edite, consignes_pratiques: v })} />
            </>
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEdite(null)}>Annuler</Button>
            <Button size="sm" onClick={enregistrer}><Save className="h-4 w-4 mr-1.5" /> Enregistrer</Button>
          </div>
        </div>
      )}

      {chargement ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : liste.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          {onglet === 'ordonnances' ? <Pill className="h-8 w-8 mx-auto mb-2 opacity-40" /> : <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />}
          Aucun modèle pour l’instant. Créez le premier — il sera réutilisable sur chaque patient.
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {liste.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3.5">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{m.nom}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {onglet === 'ordonnances'
                    ? `${m.categorie || 'Sans catégorie'} · ${(m.lignes ?? []).length} ligne(s)`
                    : m.produit || 'Protocole'}
                </p>
              </div>
              <button onClick={() => setEdite(m)} className="text-xs text-primary-600 hover:underline">Modifier</button>
              <button onClick={() => dupliquer(m)} title="Dupliquer" className="text-gray-400 hover:text-gray-600"><Copy className="h-4 w-4" /></button>
              <button onClick={() => archiver(m)} title="Archiver" className="text-gray-400 hover:text-amber-600"><Archive className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const LABELS_LIGNE: Record<string, string> = {
  medicament: 'Médicament', dosage: 'Dosage', voie: 'Voie', frequence: 'Fréquence', duree: 'Durée',
}

function Zone({ label, value, onChange, rows = 2, aide }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; aide?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-gray-400">{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={champ} />
      {aide && <p className="text-[11px] text-gray-400">{aide}</p>}
    </div>
  )
}
