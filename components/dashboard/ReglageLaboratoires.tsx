'use client'

// L'ANNUAIRE DES LABORATOIRES — réglage autonome, comme le logo : il charge et
// enregistre lui-même, et reste muet tant que la v93 n'est pas passée.
//
// ── POURQUOI IL N'EST PAS UNE ÉTAPE OBLIGATOIRE ─────────────────────────────
//
// Cet écran ne sert pas à DÉCLARER ses prothésistes avant de pouvoir
// travailler : l'annuaire se remplit tout seul, dès qu'un travail est
// enregistré avec un nom inconnu. Un annuaire qu'il faut peupler avant de
// s'en servir reste vide — c'est exactement ce qui est arrivé au carnet de
// suggestions qu'il remplace.
//
// Il sert à AJOUTER CE QUE LA SAISIE NE DONNE PAS : le téléphone qu'on
// compose quand une couronne tarde, le nom de la personne qu'on demande, le
// délai habituel. Et à retirer les doublons d'orthographe que le passé a
// laissés.
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { isDentalDoctor } from '@/lib/dental'
import { FlaskConical, Plus, Check, X, Trash2, Phone } from 'lucide-react'
import { labosActifs, type Laboratoire } from '@/lib/laboratoires'

export default function ReglageLaboratoires() {
  const supabase = createClient()
  const [visible, setVisible] = useState(false)
  const [annuaire, setAnnuaire] = useState<Laboratoire[]>([])
  const [activee, setActivee] = useState(true)
  const [nouveau, setNouveau] = useState('')
  const [erreur, setErreur] = useState('')
  const [enregistre, setEnregistre] = useState(false)
  const [confirme, setConfirme] = useState<string | null>(null)

  // Les travaux de prothèse sont une affaire de cabinet dentaire : un
  // généraliste n'a pas de prothésiste, et l'encart n'a rien à lui dire.
  useEffect(() => {
    let annule = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('doctors').select('specialty, specialties').eq('email', user.email).maybeSingle()
      if (!data || annule) return
      if (isDentalDoctor([data.specialty, ...((data.specialties as string[] | null) ?? [])])) setVisible(true)
    })()
    return () => { annule = true }
  }, [supabase])

  const charger = useCallback(async () => {
    const r = await fetch('/api/laboratoires')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return
    setActivee(d.activee !== false)
    setAnnuaire(d.laboratoires ?? [])
  }, [])
  useEffect(() => { if (visible) charger() }, [visible, charger])

  function flash() {
    setEnregistre(true)
    setTimeout(() => setEnregistre(false), 2000)
  }

  async function modifier(id: string, champs: Record<string, unknown>) {
    setErreur('')
    const r = await fetch(`/api/laboratoires/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Modification impossible'); return }
    setAnnuaire((xs) => xs.map((l) => (l.id === id ? { ...l, ...d.laboratoire } : l)))
    flash()
  }

  async function ajouter() {
    const nom = nouveau.trim()
    if (!nom) return
    setErreur('')
    const r = await fetch('/api/laboratoires', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Création impossible'); return }
    if (d.laboratoire && !annuaire.some((l) => l.id === d.laboratoire.id)) {
      setAnnuaire((xs) => [...xs, d.laboratoire])
    }
    setNouveau('')
    flash()
  }

  async function retirer(id: string) {
    setErreur('')
    const r = await fetch(`/api/laboratoires/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setErreur(d.error || 'Opération impossible'); return
    }
    setAnnuaire((xs) => xs.filter((l) => l.id !== id))
    setConfirme(null)
    flash()
  }

  if (!visible || !activee) return null

  const champ = 'text-sm rounded-lg border border-gray-200 px-2 py-1.5 w-full'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary-500" /> Mes laboratoires
          {enregistre && <span className="text-xs font-normal text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> enregistré</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500 max-w-2xl">
          Vos prothésistes s’inscrivent ici <strong>tout seuls</strong> dès que vous enregistrez un
          travail à leur nom. Cet écran sert à leur ajouter ce que la saisie ne donne pas : le
          numéro qu’on compose quand une couronne tarde, la personne qu’on demande, le délai
          habituel.
        </p>

        {annuaire.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            Aucun laboratoire pour l’instant. Le premier travail de prothèse en créera un.
          </p>
        ) : (
          <ul className="space-y-2">
            {labosActifs(annuaire).map((l) => (
              <li key={l.id} className="border border-gray-100 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input defaultValue={l.nom}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.nom) modifier(l.id, { nom: v }) }}
                    className="flex-1 min-w-0 text-sm font-medium text-gray-900 bg-transparent border-0 focus:outline-none" />
                  {l.telephone && (
                    <a href={`tel:${l.telephone.replace(/\s/g, '')}`} title="Appeler"
                      className="text-primary-600 hover:text-primary-700"><Phone className="h-3.5 w-3.5" /></a>
                  )}
                  {confirme === l.id ? (
                    <span className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => retirer(l.id)}
                        className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">
                        Retirer
                      </button>
                      <button type="button" onClick={() => setConfirme(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirme(l.id)} title="Je ne travaille plus avec eux"
                      className="text-gray-300 hover:text-red-600 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input defaultValue={l.telephone ?? ''} placeholder="Téléphone"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.telephone ?? '')) modifier(l.id, { telephone: v }) }}
                    className={champ} />
                  <input defaultValue={l.contact ?? ''} placeholder="Personne à demander"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.contact ?? '')) modifier(l.id, { contact: v }) }}
                    className={champ} />
                  <input defaultValue={l.email ?? ''} placeholder="E-mail"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== (l.email ?? '')) modifier(l.id, { email: v }) }}
                    className={champ} />
                  <input defaultValue={l.delai_jours ?? ''} inputMode="numeric" placeholder="Délai habituel (jours)"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(l.delai_jours ?? '')) modifier(l.id, { delai_jours: v }) }}
                    className={champ} />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <input value={nouveau} onChange={(e) => setNouveau(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter() } }}
            placeholder="Nom d’un laboratoire"
            className="text-sm rounded-lg border border-gray-200 px-2.5 py-1.5 w-56" />
          <button type="button" onClick={ajouter}
            className="flex items-center gap-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}
        <p className="text-[11px] text-gray-400 max-w-2xl">
          Retirer un laboratoire le sort des listes ; les travaux qu’il a réalisés gardent sa
          trace et le nom sous lequel ils sont partis.
        </p>
      </CardContent>
    </Card>
  )
}
