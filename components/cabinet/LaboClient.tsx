'use client'

// Suivi des travaux de laboratoire — écran du secrétariat.
//
// Une seule question tient cet écran : qu'est-ce qu'on attend, et depuis quand ?
// Les travaux en retard ouvrent la liste, parce que ce sont les seuls qui
// demandent un appel. Le coût facturé par le prothésiste n'est pas affiché :
// il n'est même pas renvoyé par /api/cabinet/lab-works.
import { useCallback, useEffect, useState } from 'react'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  LAB_STATUT_LABELS, LAB_STATUT_COULEURS, LAB_EN_COURS,
  enRetard, titreTravail, type LabStatut,
} from '@/lib/labo'
import { FlaskConical } from 'lucide-react'

interface Travail {
  id: string
  patient_id: string
  work_type: string | null
  teeth: string[]
  lab_name: string | null
  shade: string | null
  sent_at: string | null
  due_at: string | null
  received_at: string | null
  status: LabStatut
  patient?: { first_name?: string; last_name?: string } | null
}

// Statuts que le secrétariat peut poser. « Annulé » reste au praticien :
// renoncer à une prothèse engage le plan de traitement, et parfois un acompte.
const STATUTS_SECRETARIAT: LabStatut[] = ['a_envoyer', 'envoye', 'recu', 'pose', 'retour_labo']

export default function LaboClient() {
  const aujourdhui = getNowInMaroc().toISOString().slice(0, 10)
  const [travaux, setTravaux] = useState<Travail[]>([])
  const [chargement, setChargement] = useState(true)
  const [activee, setActivee] = useState(true)

  const charger = useCallback(async () => {
    const res = await fetch('/api/cabinet/lab-works').catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setChargement(false)
    if (!res?.ok) return
    setTravaux(data.travaux ?? [])
    setActivee(data.activee !== false)
  }, [])

  useEffect(() => { charger() }, [charger])

  async function maj(t: Travail, patch: Record<string, unknown>) {
    const res = await fetch('/api/cabinet/lab-works', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, ...patch }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { alert(data.error || 'Modification impossible.'); return }
    // Un travail posé ou reçu quitte la liste d'attente : elle ne montre que
    // ce qui reste à suivre.
    setTravaux((prev) =>
      LAB_EN_COURS.includes(data.status)
        ? prev.map((x) => (x.id === t.id ? { ...x, ...data } : x))
        : prev.filter((x) => x.id !== t.id),
    )
  }

  if (chargement) return <p className="text-sm text-gray-400">Chargement…</p>
  if (!activee) {
    return <p className="text-sm text-gray-500">Le suivi des travaux de laboratoire n&apos;est pas activé.</p>
  }

  const retard = travaux.filter((t) => enRetard(t, aujourdhui))
  const autres = travaux.filter((t) => !enRetard(t, aujourdhui))

  const Ligne = ({ t, alerte }: { t: Travail; alerte: boolean }) => {
    const nom = `${t.patient?.first_name ?? ''} ${t.patient?.last_name ?? ''}`.trim()
    return (
      <div className={`rounded-xl border p-3 ${alerte ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white'}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{nom || 'Patient'}</span>
          <span className="text-sm text-gray-600">{titreTravail(t)}</span>
          {t.lab_name && <span className="text-xs text-gray-400">· {t.lab_name}</span>}
          {t.shade && <span className="text-xs text-gray-400">· teinte {t.shade}</span>}
          <select
            value={t.status}
            onChange={(e) => maj(t, { status: e.target.value })}
            className={`ml-auto text-xs rounded-full px-2 py-1 border-0 ${LAB_STATUT_COULEURS[t.status]}`}
          >
            {STATUTS_SECRETARIAT.map((s) => <option key={s} value={s}>{LAB_STATUT_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-gray-500">
          <label className="flex items-center gap-1">
            Retour annoncé
            <input
              type="date"
              value={t.due_at ?? ''}
              onChange={(e) => maj(t, { due_at: e.target.value })}
              className="border border-gray-200 rounded px-1.5 py-1"
            />
          </label>
          {t.sent_at && <span>envoyé le {formatDateShort(t.sent_at)}</span>}
          {alerte && <span className="font-semibold text-red-600">en retard — à relancer</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary-500" /> Laboratoire
        </h1>
        <p className="text-sm text-gray-500">
          Les travaux que le cabinet attend encore. Mettez la date à jour quand le laboratoire annonce un délai.
        </p>
      </div>

      {travaux.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Aucun travail en attente.</p>
      ) : (
        <>
          {retard.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                En retard ({retard.length})
              </p>
              {retard.map((t) => <Ligne key={t.id} t={t} alerte />)}
            </div>
          )}
          {autres.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Attendus</p>
              {autres.map((t) => <Ligne key={t.id} t={t} alerte={false} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
