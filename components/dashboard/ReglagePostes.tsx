'use client'

// Les postes de travail du cabinet — réglage autonome, comme le logo : il
// charge et enregistre lui-même, sans passer par le bouton « Enregistrer » de
// la page, et il reste silencieux tant que la v89 n'est pas passée.
//
// ── POURQUOI CE RÉGLAGE EXISTE ──────────────────────────────────────────────
//
// Jusqu'ici, la base REFUSAIT physiquement deux rendez-vous à la même heure.
// C'était juste tant qu'un cabinet valait un fauteuil. Un cabinet à deux
// fauteuils ne pouvait donc pas planifier sa journée normale — l'anesthésie
// qui fait effet d'un côté pendant qu'on détartre de l'autre.
//
// Déclarer ses postes ici change le grain de la règle : plus de chevauchement
// SUR UN MÊME POSTE, au lieu de plus de chevauchement tout court. Un cabinet
// qui n'en déclare aucun garde exactement ce qu'il avait.
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Armchair, Plus, Check, X, Trash2 } from 'lucide-react'
import { COULEURS_POSTE, couleurPoste, type Poste } from '@/lib/postes'

export default function ReglagePostes() {
  const [postes, setPostes] = useState<Poste[]>([])
  const [activee, setActivee] = useState(true)
  const [chargement, setChargement] = useState(true)
  const [nouveau, setNouveau] = useState('')
  const [couleur, setCouleur] = useState(COULEURS_POSTE[0].cle)
  const [erreur, setErreur] = useState('')
  const [enregistre, setEnregistre] = useState(false)
  const [confirme, setConfirme] = useState<string | null>(null)

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/postes')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return
      setActivee(d.activee !== false)
      setPostes(d.postes ?? [])
    } finally { setChargement(false) }
  }, [])
  useEffect(() => { charger() }, [charger])

  function flash() {
    setEnregistre(true)
    setTimeout(() => setEnregistre(false), 2000)
  }

  async function ajouter() {
    const nom = nouveau.trim()
    if (!nom) return
    setErreur('')
    const r = await fetch('/api/postes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, couleur, ordre: postes.length }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Création impossible'); return }
    setPostes((xs) => [...xs, d.poste])
    setNouveau('')
    // La couleur suivante, pour ne pas avoir deux fauteuils de la même teinte
    // sans l'avoir voulu.
    setCouleur(COULEURS_POSTE[(postes.length + 1) % COULEURS_POSTE.length].cle)
    flash()
  }

  async function modifier(id: string, champs: Record<string, unknown>) {
    setErreur('')
    const r = await fetch(`/api/postes/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Modification impossible'); return }
    setPostes((xs) => xs.map((p) => (p.id === id ? { ...p, ...d.poste } : p)))
    flash()
  }

  async function demonter(id: string) {
    setErreur('')
    const r = await fetch(`/api/postes/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErreur(d.error || 'Opération impossible'); return
    }
    setPostes((xs) => xs.filter((p) => p.id !== id))
    setConfirme(null)
    flash()
  }

  // Pas de migration, pas de fonctionnalité — et pas d'encart non plus : on
  // n'annonce pas au praticien un réglage qui ne s'enregistrerait pas.
  if (chargement || !activee) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Armchair className="h-4 w-4 text-primary-500" /> Fauteuils et salles
          {enregistre && <span className="text-xs font-normal text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> enregistré</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500 max-w-2xl">
          Si votre cabinet reçoit sur <strong>plusieurs fauteuils ou plusieurs salles</strong>,
          déclarez-les ici : l’agenda pourra alors poser deux rendez-vous à la même heure, un par
          poste, au lieu de les refuser. Tant que vous n’en déclarez aucun, rien ne change.
        </p>

        {postes.length > 0 && (
          <ul className="space-y-1.5">
            {postes.map((p, i) => {
              const c = couleurPoste(p.couleur)
              return (
                <li key={p.id} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 ${c.fond} ${c.bord}`}>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.point}`} />
                  <input
                    defaultValue={p.nom}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== p.nom) modifier(p.id, { nom: v })
                    }}
                    className="flex-1 min-w-0 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 font-medium text-gray-900"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {COULEURS_POSTE.map((x) => (
                      <button key={x.cle} type="button" title={x.label}
                        onClick={() => modifier(p.id, { couleur: x.cle })}
                        className={`h-4 w-4 rounded-full ${x.point} ${p.couleur === x.cle ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-50 hover:opacity-100'}`} />
                    ))}
                  </div>
                  {/* L'ordre des colonnes, celui du couloir et pas l'alphabet. */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button type="button" disabled={i === 0}
                      onClick={() => { modifier(p.id, { ordre: p.ordre - 1 }); modifier(postes[i - 1].id, { ordre: p.ordre }) }}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1 text-xs">↑</button>
                    <button type="button" disabled={i === postes.length - 1}
                      onClick={() => { modifier(p.id, { ordre: p.ordre + 1 }); modifier(postes[i + 1].id, { ordre: p.ordre }) }}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1 text-xs">↓</button>
                  </div>
                  {confirme === p.id ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => demonter(p.id)}
                        className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                        Démonter
                      </button>
                      <button type="button" onClick={() => setConfirme(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirme(p.id)} title="Ce poste n’existe plus"
                      className="text-gray-300 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className={`h-3 w-3 rounded-full shrink-0 ${couleurPoste(couleur).point}`} />
          <input value={nouveau} onChange={(e) => setNouveau(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter() } }}
            placeholder={postes.length === 0 ? 'Fauteuil 1' : `Fauteuil ${postes.length + 1}`}
            className="text-sm rounded-lg border border-gray-200 px-2.5 py-1.5 w-48" />
          <button type="button" onClick={ajouter}
            className="flex items-center gap-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        {postes.length === 1 && (
          <p className="text-[11px] text-amber-700">
            Un seul poste déclaré : l’agenda se comporte comme avant. Déclarez-en un second pour
            pouvoir poser deux rendez-vous à la même heure.
          </p>
        )}
        <p className="text-[11px] text-gray-400 max-w-2xl">
          Un poste est un <strong>lieu</strong>, pas un second praticien : la réservation en ligne
          continue de ne proposer qu’un patient à la fois. Placer deux patients à la même heure
          reste une décision du cabinet, prise depuis l’agenda.
        </p>
      </CardContent>
    </Card>
  )
}
