'use client'

// CE QUE LE DOSSIER SAIT D'UNE DENT, au-delà de son état.
//
// Le panneau de la dent montrait déjà son état, ses faces, sa nature et son
// historique. Il lui manquait les deux choses qu'on allait chercher ailleurs :
// ses CLICHÉS (dans l'onglet imagerie) et son PLAN DE TRAITEMENT (dans
// l'onglet paiements). Les voilà sous l'historique, pour la seule dent
// ouverte, dans le dossier comme en consultation.
//
// Chargé à l'ouverture de la dent (/api/dentaire/dent), pas avec le dossier :
// un praticien ouvre deux dents, pas trente-deux.
import { useEffect, useState } from 'react'
import { formatDateFr } from '@/lib/utils'
import { jourImage, libelleType } from '@/lib/imagerie'
import VisionneuseCliches, { estPdf, type ClicheAffichable } from '@/components/dentaire/VisionneuseCliches'
import { Check, Circle, FileText, ImageIcon } from 'lucide-react'

interface LignePlan {
  id: string
  label: string
  done: boolean
  done_at?: string | null
  appointment_id?: string | null
  session_no?: number | null
  planTitre: string
  planStatut: string
}

const STATUT_PLAN: Record<string, string> = {
  brouillon: 'brouillon', propose: 'proposé', accepte: 'accepté', refuse: 'refusé', termine: 'terminé',
}

export default function PanneauContexteDent({ patientId, dent, seance = null, version = 0 }: {
  patientId: string
  dent: string
  /** Le rendez-vous en cours, pour marquer ce qui a été fait aujourd'hui. */
  seance?: string | null
  /** Change quand le schéma ou le plan ont bougé : on relit. */
  version?: number
}) {
  const [plan, setPlan] = useState<LignePlan[]>([])
  const [cliches, setCliches] = useState<ClicheAffichable[]>([])
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement')
  const [vue, setVue] = useState<number | null>(null)

  useEffect(() => {
    let vivant = true
    setEtat('chargement')
    fetch(`/api/dentaire/dent?patient_id=${patientId}&dent=${dent}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!vivant) return; setPlan(d.plan ?? []); setCliches(d.images ?? []); setEtat('pret') })
      .catch(() => { if (vivant) setEtat('erreur') })
    return () => { vivant = false }
  }, [patientId, dent, version])

  if (etat === 'erreur') return null

  return (
    <div className="mt-3 border-t border-gray-200 pt-2 space-y-3">
      {/* ── Le plan de traitement de cette dent ── */}
      <div>
        <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Plan de traitement — dent {dent}</p>
        {etat === 'chargement' ? (
          <p className="text-[12px] text-gray-400">Chargement…</p>
        ) : plan.length === 0 ? (
          <p className="text-[12px] text-gray-400">Aucun acte prévu ni fait sur cette dent dans un plan de traitement.</p>
        ) : (
          <ul className="space-y-1">
            {plan.map((l) => (
              <li key={l.id} className="text-[12px] text-gray-700 flex items-start gap-1.5">
                {l.done
                  ? <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-px" />
                  : <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0 mt-px" />}
                <span className="min-w-0">
                  {l.label}
                  <span className="text-gray-400">
                    {l.done
                      ? ` · fait${l.done_at ? ` le ${formatDateFr(l.done_at.slice(0, 10))}` : ''}`
                      : l.session_no ? ` · séance ${l.session_no}` : ' · à faire'}
                    {` · ${l.planTitre} (${STATUT_PLAN[l.planStatut] ?? l.planStatut})`}
                  </span>
                  {seance && l.appointment_id === seance && <span className="text-primary-600"> · aujourd&apos;hui</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Les clichés de cette dent ── */}
      <div>
        <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Clichés — dent {dent}</p>
        {etat === 'chargement' ? (
          <p className="text-[12px] text-gray-400">Chargement…</p>
        ) : cliches.length === 0 ? (
          <p className="text-[12px] text-gray-400">Aucun cliché de cette dent. Les panoramiques apparaissent ici aussi.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cliches.map((c, i) => {
              const j = jourImage(c)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setVue(i)}
                  className="shrink-0 w-24 text-left rounded-lg border border-gray-200 bg-white hover:border-primary-300 overflow-hidden"
                  title={`${libelleType(c.type_image)} — ${formatDateFr(j.jour)}`}
                >
                  <span className="block h-16 bg-gray-900">
                    {c.url && !estPdf(c)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.url} alt="" loading="lazy" className="h-16 w-24 object-cover opacity-90" />
                      : <span className="h-16 flex items-center justify-center text-gray-400">
                          {estPdf(c) ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                        </span>}
                  </span>
                  <span className="block px-1.5 py-1 text-[10px] leading-tight text-gray-700">
                    {libelleType(c.type_image)}
                    <span className="block text-gray-400">{formatDateFr(j.jour)}{seance && c.appointment_id === seance ? ' · auj.' : ''}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <VisionneuseCliches cliches={cliches} index={vue} onFermer={() => setVue(null)} seance={seance} />
    </div>
  )
}
