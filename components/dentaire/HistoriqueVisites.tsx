'use client'

// L'HISTORIQUE DU PATIENT, VISITE PAR VISITE.
//
// Pour chaque rendez-vous : ce qui a été écrit (motif, diagnostic), ce qui a
// été fait (actes du plan, dents modifiées), ce qui a été pris (clichés) et
// prescrit. Tout cela existait, mais réparti entre cinq onglets, sans rien
// pour dire que c'était la même journée.
//
// La visite s'ouvre en lecture : son compte rendu si une consultation a été
// écrite, et sinon le résumé de la ligne. Rouvrir la SAISIE d'une séance
// passée reste possible depuis l'historique des rendez-vous, en dessous —
// c'est un geste volontaire, pas un clic de lecture.
//
// Dix visites à la fois. « Visites précédentes » charge les dix suivantes.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDateFr } from '@/lib/utils'
import { libelleType } from '@/lib/imagerie'
import { premiereLigne, visiteVide, type VisiteDentaire } from '@/lib/espace-dentaire'
import { ChevronDown, FileText, ScanLine, Pill, Check, Pencil } from 'lucide-react'

export default function HistoriqueVisites({ patientId, enEvidence = null }: {
  patientId: string
  /** Une visite à mettre en évidence : celle qu'on vient de terminer. */
  enEvidence?: string | null
}) {
  const [visites, setVisites] = useState<VisiteDentaire[]>([])
  const [encore, setEncore] = useState(false)
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'erreur'>('chargement')
  const [suite, setSuite] = useState(false)

  const charger = useCallback(async (avant?: string) => {
    const r = await fetch(`/api/dentaire/visites?patient_id=${patientId}${avant ? `&avant=${avant}` : ''}`)
    if (!r.ok) throw new Error()
    return r.json() as Promise<{ visites: VisiteDentaire[]; encore: boolean }>
  }, [patientId])

  useEffect(() => {
    let vivant = true
    charger()
      .then((d) => { if (!vivant) return; setVisites(d.visites); setEncore(d.encore); setEtat('pret') })
      .catch(() => { if (vivant) setEtat('erreur') })
    return () => { vivant = false }
  }, [charger])

  async function precedentes() {
    const derniere = visites[visites.length - 1]
    if (!derniere) return
    setSuite(true)
    try {
      const d = await charger(derniere.rdv.date)
      setVisites((v) => [...v, ...d.visites])
      setEncore(d.encore)
    } catch { /* le bouton reste, on peut réessayer */ } finally { setSuite(false) }
  }

  const retour = `/patients/${patientId}`

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Historique des visites</h3>
      {etat === 'chargement' && <p className="text-sm text-gray-400">Chargement…</p>}
      {etat === 'erreur' && <p className="text-sm text-gray-400">L&apos;historique n&apos;a pas pu être chargé.</p>}
      {etat === 'pret' && visites.length === 0 && (
        <p className="text-sm text-gray-400 italic">Aucune visite pour l&apos;instant.</p>
      )}

      <ol className="space-y-2">
        {visites.map((v) => {
          const c = v.consultation
          const vide = visiteVide(v)
          const evidence = enEvidence === v.rdv.id
          return (
            <li
              key={v.rdv.id}
              id={`visite-${v.rdv.id}`}
              className={`rounded-lg border px-3 py-2.5 ${evidence ? 'border-primary-300 bg-primary-50/50' : 'border-gray-100'} ${vide ? 'opacity-70' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">
                  {formatDateFr(v.rdv.date)}
                  {(c?.motif || v.rdv.motif) && <span className="font-normal text-gray-600"> · {c?.motif || v.rdv.motif}</span>}
                  {evidence && <span className="ml-2 text-[11px] font-medium text-primary-700">vient d&apos;être terminée</span>}
                </p>
                {v.dentsConcernees.length > 0 && (
                  <p className="text-[11px] text-gray-500">dent{v.dentsConcernees.length > 1 ? 's' : ''} {v.dentsConcernees.join(', ')}</p>
                )}
              </div>

              {c?.diagnostic && (
                <p className="text-[13px] text-gray-700 mt-1"><span className="text-gray-500">Diagnostic :</span> {premiereLigne(c.diagnostic)}</p>
              )}

              {(v.actes.length > 0 || v.dents.length > 0) && (
                <ul className="mt-1 space-y-0.5">
                  {v.actes.map((a) => (
                    <li key={a.id} className="text-[12px] text-gray-700 flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-emerald-600 shrink-0" /> {a.label}{a.tooth ? ` · dent ${a.tooth}` : ''}
                    </li>
                  ))}
                  {v.dents.map((d, i) => (
                    <li key={`${d.tooth}-${i}`} className="text-[12px] text-gray-600">
                      <span className="font-medium text-gray-700">Dent {d.tooth}</span> — {d.texte}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[12px]">
                {v.images.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    <ScanLine className="h-3.5 w-3.5 text-gray-400" />
                    {v.images.map((i) => libelleType(i.type_image)).join(', ')}
                  </span>
                )}
                {v.ordonnances > 0 && (
                  <span className="inline-flex items-center gap-1 text-gray-600">
                    <Pill className="h-3.5 w-3.5 text-gray-400" /> {v.ordonnances} ordonnance{v.ordonnances > 1 ? 's' : ''}
                  </span>
                )}
                {c && (
                  c.statut === 'validee' ? (
                    <Link href={`/dentaire/consultation/cr/${c.id}?back=${encodeURIComponent(retour)}`} className="inline-flex items-center gap-1 text-primary-600 hover:underline">
                      <FileText className="h-3.5 w-3.5" /> Compte rendu
                    </Link>
                  ) : (
                    <Link href={`/dentaire/consultation/${patientId}?id=${c.id}&back=${encodeURIComponent(retour)}`} className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                      <Pencil className="h-3.5 w-3.5" /> Brouillon à reprendre
                    </Link>
                  )
                )}
                {vide && <span className="text-gray-400">Rien d&apos;enregistré pour cette visite.</span>}
              </div>
            </li>
          )
        })}
      </ol>

      {encore && (
        <button
          type="button"
          onClick={precedentes}
          disabled={suite}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-700 disabled:opacity-60"
        >
          <ChevronDown className="h-3.5 w-3.5" /> {suite ? 'Chargement…' : 'Visites précédentes'}
        </button>
      )}
    </div>
  )
}
