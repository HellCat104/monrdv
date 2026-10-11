'use client'

// Nom du patient sur le bon de laboratoire — réglage autonome, comme le logo :
// il charge et enregistre lui-même, et ne dépend pas du bouton « Enregistrer »
// de la page. Visible seulement pour les spécialités dentaires, et silencieux
// tant que la migration v68 n'est pas passée.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isDentalDoctor } from '@/lib/dental'
import { FlaskConical, Check } from 'lucide-react'

type Mode = 'initiales' | 'complet'

export default function ReglageBonLabo() {
  const supabase = createClient()
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<Mode>('initiales')
  const [docteurId, setDocteurId] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    let annule = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('doctors').select('id, specialty, specialties').eq('email', user.email).maybeSingle()
      if (!data || annule) return
      if (!isDentalDoctor([data.specialty, ...((data.specialties as string[] | null) ?? [])])) return
      setDocteurId(data.id)

      // Colonne lue à part : sans la v68, le réglage ne s'affiche pas plutôt
      // que de faire échouer la requête de la fiche.
      const { data: reglage, error } = await supabase
        .from('doctors').select('lab_slip_naming').eq('id', data.id).maybeSingle()
      if (error || annule) return
      setMode((reglage?.lab_slip_naming as Mode | null) ?? 'initiales')
      setVisible(true)
    })()
    return () => { annule = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function choisir(valeur: Mode) {
    if (!docteurId) return
    setMode(valeur)
    const { error } = await supabase.from('doctors').update({ lab_slip_naming: valeur }).eq('id', docteurId)
    if (error) { alert("Le réglage n'a pas pu être enregistré."); return }
    setEnregistre(true)
    setTimeout(() => setEnregistre(false), 2500)
  }

  if (!visible) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary-500" /> Bon de laboratoire
          {enregistre && (
            <span className="text-xs font-normal text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Enregistré
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-gray-500">
          Comment votre patient apparaît sur le bon qui part chez le prothésiste.
        </p>
        <div className="flex gap-2">
          {([['initiales', 'Initiales (A. B.)'], ['complet', 'Nom complet']] as const).map(([cle, lbl]) => (
            <button
              key={cle}
              type="button"
              onClick={() => choisir(cle)}
              className={`flex-1 text-sm px-3 py-2 rounded-lg border transition ${mode === cle ? 'bg-primary-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Les initiales par défaut : le nom d&apos;un patient n&apos;a pas à circuler hors du cabinet
          sans que vous l&apos;ayez décidé.
        </p>
      </CardContent>
    </Card>
  )
}
