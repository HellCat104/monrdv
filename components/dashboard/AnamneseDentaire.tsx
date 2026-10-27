'use client'

// LE QUESTIONNAIRE D'ANAMNÈSE — vingt-deux questions, posées une fois.
//
// ── POURQUOI TROIS RÉPONSES ET PAS UNE CASE À COCHER ────────────────────────
//
// Une case à cocher ne sait dire que « oui » et « rien ». Or « non, le patient
// ne prend pas d'anticoagulant » et « personne ne lui a demandé » sont deux
// informations opposées, et les confondre est précisément ce qui fait extraire
// une dent chez un patient sous Sintrom. D'où trois réponses explicites :
// Oui / Non / Ne sait pas — et une quatrième, l'absence de réponse, qui reste
// visible comme un trou.
//
// Le « ne sait pas » n'est pas un échec de saisie : c'est une donnée. Sur un
// point majeur il remonte dans la bannière, à confirmer avant le geste.
//
// ── CE QU'IL N'ÉCRIT PAS ────────────────────────────────────────────────────
//
// Il ne touche pas aux champs de texte libre du dossier. Recopier « Sintrom »
// dans `current_treatments` donnerait deux vérités à entretenir, et celle que
// le praticien corrigerait ne serait jamais la bonne.
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getNowInMaroc } from '@/lib/utils'
import { ClipboardList, Check, ChevronDown, ChevronUp } from 'lucide-react'
import {
  ITEMS_ANAMNESE, GROUPES_ANAMNESE, normaliserAnamnese,
  type Anamnese, type Reponse,
} from '@/lib/anamnese'

const REPONSES: { v: Reponse; label: string; actif: string }[] = [
  { v: 'oui',     label: 'Oui',         actif: 'bg-red-500 text-white border-red-500' },
  { v: 'non',     label: 'Non',         actif: 'bg-emerald-500 text-white border-emerald-500' },
  { v: 'inconnu', label: 'Ne sait pas', actif: 'bg-gray-400 text-white border-gray-400' },
]

/** Date du jour au Maroc. `toISOString()` renverrait la date UTC, qui peut
 *  être la veille. */
function jourMaroc(): string {
  const d = getNowInMaroc()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AnamneseDentaire({
  patientId, valeur, maj, ouvertParDefaut = false, onEnregistre,
}: {
  patientId: string
  valeur: unknown
  maj?: string | null
  ouvertParDefaut?: boolean
  /** Le parent garde la main : la bannière du dossier doit changer dans la
   *  seconde, sans recharger la page. */
  onEnregistre: (anamnese: Anamnese, maj: string) => void
}) {
  const supabase = createClient()
  const initial = useMemo(() => normaliserAnamnese(valeur), [valeur])
  const [reponses, setReponses] = useState<Anamnese>(initial)
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const [indisponible, setIndisponible] = useState(false)

  // La bannière du haut du dossier déplie le questionnaire. Sans cet effet,
  // le clic ferait défiler jusqu'à un bloc resté fermé.
  useEffect(() => { if (ouvertParDefaut) setOuvert(true) }, [ouvertParDefaut])

  const repondues = Object.values(reponses).filter((r) => r.r).length
  const modifie = JSON.stringify(reponses) !== JSON.stringify(initial)

  function repondre(cle: string, v: Reponse) {
    setMessage('')
    setReponses((p) => {
      const actuel = p[cle]?.r
      const suivant = { ...p }
      // Recliquer la même réponse l'annule : on peut revenir à « pas posée ».
      if (actuel === v) {
        const { p: prec } = suivant[cle] ?? {}
        if (prec) suivant[cle] = { p: prec }
        else delete suivant[cle]
      } else {
        suivant[cle] = { ...(suivant[cle] ?? {}), r: v }
      }
      return suivant
    })
  }

  function preciser(cle: string, texte: string) {
    setMessage('')
    setReponses((p) => ({ ...p, [cle]: { ...(p[cle] ?? {}), p: texte } }))
  }

  async function enregistrer() {
    setEnCours(true); setErreur('')
    const propre = normaliserAnamnese(reponses)
    const jour = jourMaroc()
    const { error } = await supabase
      .from('patients')
      .update({ anamnese: propre, anamnese_maj: jour })
      .eq('id', patientId)
    setEnCours(false)
    if (error) {
      // Pas de migration, pas de fonctionnalité — mais jamais d'écran cassé.
      if (error.code === '42703' || error.code === 'PGRST204') { setIndisponible(true); return }
      setErreur('L’enregistrement a échoué. Réessayez.')
      return
    }
    setReponses(propre)
    onEnregistre(propre, jour)
    setMessage('Anamnèse enregistrée.')
    setTimeout(() => setMessage(''), 3000)
  }

  if (indisponible) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-[11px] text-gray-400 italic">
          L’anamnèse structurée attend une migration de la base (v87).
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <button
        type="button" onClick={() => setOuvert((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4" /> Anamnèse médicale
        </h3>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-gray-400">
            {repondues}/{ITEMS_ANAMNESE.length} renseignées
          </span>
          {ouvert ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </span>
      </button>

      {!ouvert ? (
        <p className="text-[11px] text-gray-400">
          Anticoagulant, allergies, valve cardiaque, bisphosphonates, grossesse.
          Les réponses « oui » remontent d’elles-mêmes au-dessus de l’odontogramme.
        </p>
      ) : (
        <>
          {GROUPES_ANAMNESE.map((groupe) => (
            <div key={groupe} className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{groupe}</p>
              {ITEMS_ANAMNESE.filter((i) => i.groupe === groupe).map((item) => {
                const r = reponses[item.cle]
                return (
                  <div key={item.cle} className="space-y-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-[12px] text-gray-700 flex-1 min-w-[180px]">
                        {item.question}
                        {item.gravite === 'majeur' && <span className="text-red-400 ml-1">•</span>}
                      </p>
                      <div className="flex gap-1 shrink-0">
                        {REPONSES.map((rep) => (
                          <button
                            key={rep.v} type="button" onClick={() => repondre(item.cle, rep.v)}
                            className={`text-[11px] rounded-md border px-2 py-0.5 transition ${
                              r?.r === rep.v ? rep.actif : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            {rep.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* La précision ne s'affiche que là où elle sert : un
                        « non » n'a rien à préciser. */}
                    {(r?.r === 'oui' || r?.r === 'inconnu') && (
                      <input
                        value={r?.p ?? ''} onChange={(e) => preciser(item.cle, e.target.value)}
                        placeholder={item.precision ?? 'Précisez'}
                        className="w-full text-[12px] rounded border border-gray-200 px-2 py-1"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button" onClick={enregistrer} disabled={enCours}
              className="text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 disabled:opacity-60"
            >
              {enCours ? 'Enregistrement…' : modifie ? 'Enregistrer l’anamnèse' : 'Reconfirmer sans changement'}
            </button>
            {/* Reconfirmer sans rien changer EST un acte : ça date l'anamnèse
                à aujourd'hui, et c'est ce qui la rend fiable. */}
            {maj && <span className="text-[11px] text-gray-400">Dernière mise à jour : {maj.slice(8, 10)}/{maj.slice(5, 7)}/{maj.slice(0, 4)}</span>}
            {message && <span className="text-[11px] text-emerald-700 flex items-center gap-1"><Check className="h-3 w-3" /> {message}</span>}
            {erreur && <span className="text-[11px] text-red-600">{erreur}</span>}
          </div>
          <p className="text-[10px] text-gray-400">
            • = point majeur. Une question sans réponse reste un trou visible : « non » et
            « pas encore demandé » ne se ressemblent pas.
          </p>
        </>
      )}
    </div>
  )
}
