'use client'

// « Ce qui reste à faire » : les suivis de surveillance et les résultats en
// attente.
//
// ── EN RETARD NE SE STOCKE PAS ──────────────────────────────────────────────
//
// Un suivi est en retard quand sa date est dépassée. Le calculer plutôt que
// l'enregistrer évite le statut qui ment : un champ « en retard » n'est juste
// que si quelqu'un le met à jour tous les matins, et personne ne le fait.
//
// ── RIEN N'EST DÉDUIT ───────────────────────────────────────────────────────
//
// Aucun intervalle de surveillance n'est proposé à partir d'un diagnostic.
// Les dates viennent de ce que le médecin a saisi dans sa consultation ou son
// compte rendu, et il les change ici s'il le veut.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateFr, getNowInMaroc } from '@/lib/utils'
import { STATUTS_RESULTAT } from '@/types'
import { BellRing, CalendarPlus, Check, FlaskConical, Clock, Plus } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>

const STATUTS_SUIVI: { cle: string; label: string }[] = [
  { cle: 'pending',    label: 'À planifier' },
  { cle: 'programme',  label: 'Programmé' },
  { cle: 'reporte',    label: 'Reporté' },
  { cle: 'done',       label: 'Réalisé' },
  { cle: 'cancelled',  label: 'Annulé' },
]

export default function SuivisClient() {
  const supabase = createClient()
  const router = useRouter()
  const [suivis, setSuivis] = useState<Ligne[]>([])
  const [resultats, setResultats] = useState<Ligne[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)

  const charger = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.from('recalls')
        .select('*, patient:patients(id, first_name, last_name, phone)')
        .not('status', 'in', '("done","cancelled","sent")')
        .order('due_date', { ascending: true }).limit(200),
      supabase.from('resultats')
        .select('*, patient:patients(id, first_name, last_name)')
        .in('statut', ['attendu', 'recu', 'suivi_requis'])
        .order('created_at', { ascending: false }).limit(200),
    ])
    if (s.error) setErreur('Les suivis n’ont pas pu être chargés.')
    else setSuivis(s.data ?? [])
    if (r.error) setErreur('Les résultats attendent une migration de la base (v81).')
    else setResultats(r.data ?? [])
    setChargement(false)
  }, [supabase])
  useEffect(() => { charger() }, [charger])

  function signale(texte: string) {
    setMessage(texte); setTimeout(() => setMessage(''), 3000)
  }

  async function majSuivi(id: string, champs: Record<string, unknown>) {
    const { error } = await supabase.from('recalls').update(champs).eq('id', id)
    if (error) { setErreur('La modification a échoué.'); return }
    signale('Suivi mis à jour.'); charger()
  }

  async function majResultat(id: string, champs: Record<string, unknown>) {
    const { error } = await supabase.from('resultats').update(champs).eq('id', id)
    if (error) { setErreur('La modification a échoué.'); return }
    signale('Résultat mis à jour.'); charger()
  }

  const enRetard = suivis.filter((s) => s.due_date < aujourdhui)
  const aVenir = suivis.filter((s) => s.due_date >= aujourdhui)

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Suivis et résultats</h1>
        <p className="text-xs text-gray-500 mt-0.5">Ce que vous avez prévu, et ce que vous attendez encore.</p>
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erreur}</p>}
      {message && <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{message}</p>}

      {chargement ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <>
          <Section titre="Suivis en retard" compteur={enRetard.length} couleur="text-red-600" icone={<Clock className="h-4 w-4 text-red-500" />}>
            {enRetard.length === 0 ? <Vide texte="Aucun suivi en retard." /> : enRetard.map((s) => (
              <LigneSuivi key={s.id} s={s} enRetard onMaj={majSuivi} router={router} />
            ))}
          </Section>

          <Section titre="Suivis à venir" compteur={aVenir.length} couleur="text-primary-600" icone={<BellRing className="h-4 w-4 text-primary-500" />}>
            {aVenir.length === 0 ? <Vide texte="Aucun suivi programmé." /> : aVenir.map((s) => (
              <LigneSuivi key={s.id} s={s} onMaj={majSuivi} router={router} />
            ))}
          </Section>

          <Section titre="Résultats à traiter" compteur={resultats.length} couleur="text-amber-600" icone={<FlaskConical className="h-4 w-4 text-amber-500" />}>
            {resultats.length === 0 ? <Vide texte="Aucun résultat en attente." /> : resultats.map((r) => (
              <LigneResultat key={r.id} r={r} onMaj={majResultat} />
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ titre, compteur, couleur, icone, children }: {
  titre: string; compteur: number; couleur: string; icone: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icone}
        <h2 className="text-sm font-semibold text-gray-800">{titre}</h2>
        <span className={`text-sm font-bold ${couleur}`}>{compteur}</span>
      </div>
      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function Vide({ texte }: { texte: string }) {
  return <p className="text-xs text-gray-400 italic p-4 text-center">{texte}</p>
}

function LigneSuivi({ s, enRetard, onMaj, router }: {
  s: Ligne; enRetard?: boolean
  onMaj: (id: string, champs: Record<string, unknown>) => void
  router: ReturnType<typeof useRouter>
}) {
  const [date, setDate] = useState<string>(s.due_date ?? '')
  const nom = s.patient ? `${s.patient.first_name} ${s.patient.last_name}` : 'Patient'
  return (
    <div className="flex items-center gap-3 p-3.5 flex-wrap">
      <div className="flex-1 min-w-[12rem]">
        <p className="font-medium text-gray-900 text-sm">{nom}</p>
        <p className="text-[11px] text-gray-500">
          {s.reason || 'Suivi'}
          {s.source_type && <span className="text-gray-400"> · depuis {s.source_type === 'endoscopie' ? 'un compte rendu' : s.source_type === 'resultat' ? 'un résultat' : 'une consultation'}</span>}
        </p>
        {s.notes && <p className="text-[11px] text-violet-700 truncate">{s.notes}</p>}
      </div>

      <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${enRetard ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
        {formatDateFr(s.due_date)}
      </span>

      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        onBlur={() => { if (date && date !== s.due_date) onMaj(s.id, { due_date: date, status: 'reporte' }) }}
        className="h-8 w-36 text-xs" title="Reporter l'échéance" />

      <select value={s.status} onChange={(e) => onMaj(s.id, { status: e.target.value })}
        className="h-8 text-xs rounded-lg border border-gray-200 px-2 text-gray-600">
        {STATUTS_SUIVI.map((o) => <option key={o.cle} value={o.cle}>{o.label}</option>)}
      </select>

      {/* Transformer le suivi en rendez-vous : on ouvre l'agenda existant sur
          la date voulue plutôt que de créer un second endroit où l'on prend
          rendez-vous. */}
      <button onClick={() => router.push(`/appointments?date=${s.due_date}&patient=${s.patient_id}`)}
        title="Prendre le rendez-vous" className="text-primary-600 hover:text-primary-700">
        <CalendarPlus className="h-4 w-4" />
      </button>
      <button onClick={() => onMaj(s.id, { status: 'done' })} title="Marquer réalisé" className="text-gray-400 hover:text-green-600">
        <Check className="h-4 w-4" />
      </button>
    </div>
  )
}

function LigneResultat({ r, onMaj }: {
  r: Ligne; onMaj: (id: string, champs: Record<string, unknown>) => void
}) {
  const st = STATUTS_RESULTAT.find((x) => x.cle === r.statut)
  const nom = r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : 'Patient'
  return (
    <div className="flex items-center gap-3 p-3.5 flex-wrap">
      <div className="flex-1 min-w-[12rem]">
        <p className="font-medium text-gray-900 text-sm">{nom}</p>
        <p className="text-[11px] text-gray-500">{r.libelle}</p>
      </div>
      <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${st?.couleur ?? 'bg-gray-100 text-gray-600'}`}>
        {st?.label ?? r.statut}
      </span>
      <select value={r.statut}
        onChange={(e) => {
          const v = e.target.value
          // Horodater le passage : « examiné » sans date ne prouve rien le
          // jour où l'on se demande quand le médecin a vu le résultat.
          onMaj(r.id, {
            statut: v,
            ...(v === 'recu' && !r.recu_le ? { recu_le: new Date().toISOString().slice(0, 10) } : {}),
            ...(v === 'examine' ? { examine_le: new Date().toISOString() } : {}),
          })
        }}
        className="h-8 text-xs rounded-lg border border-gray-200 px-2 text-gray-600">
        {STATUTS_RESULTAT.map((o) => <option key={o.cle} value={o.cle}>{o.label}</option>)}
      </select>
    </div>
  )
}
