// L'AFFICHAGE de « Ma journée ». Aucune requête, aucune décision.
//
// ── POURQUOI SÉPARÉ DU CHARGEMENT ───────────────────────────────────────────
//
// `MaJournee.tsx` va chercher les dossiers en base ; ce fichier-ci ne fait que
// dessiner. La séparation sert deux choses :
//
//   1. On peut REGARDER cet écran sans base — c'est ce que fait /apercu, avec
//      une journée inventée. Un écran de briefing se juge à l'œil, pas à la
//      lecture du code.
//   2. Le tri (qui remonte, dans quel ordre, combien de points par ligne) vit
//      dans le chargeur, en un seul endroit, testable.
//
// ── MOBILE ──────────────────────────────────────────────────────────────────
//
// Une seule colonne, partout. L'heure, le nom et l'âge restent sur la même
// ligne à 375 px — ils tiennent, et les séparer aurait doublé la hauteur de
// chaque rendez-vous. Le motif, lui, est tronqué : c'est la seule chose dont
// la coupe ne fait rien perdre, puisqu'on va ouvrir le dossier.
import Link from 'next/link'
import { Sun, AlertTriangle, ChevronRight } from 'lucide-react'
import type { PointAVerifier } from '@/lib/preparation'

export interface LigneJournee {
  rdv: {
    id: string
    time: string
    patient_id: string
    notes?: string | null
    patient?: { first_name?: string | null; last_name?: string | null; age?: number | null } | null
  }
  /** Les points marquants de ce patient. Jamais vide : le chargeur a trié. */
  points: PointAVerifier[]
}

export default function MaJourneeVue({
  lignes, total,
}: {
  lignes: LigneJournee[]
  /** Combien de patients il reste à voir aujourd'hui, tous confondus. */
  total: number
}) {
  if (lignes.length === 0) return null
  const concernes = lignes.length

  return (
    <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
      {/* À 375 px, le décompte ne tient pas sur la même ligne que le titre :
          il passe DESSOUS plutôt que de casser « Ma journée » en deux. */}
      <header className="flex flex-wrap items-center gap-x-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <Sun className="h-4 w-4 text-amber-500 shrink-0" />
        <h2 className="text-sm font-semibold text-amber-900 shrink-0">Ma journée</h2>
        <p className="text-[11px] text-amber-700 basis-full sm:basis-auto sm:ml-auto sm:text-right">
          {concernes} patient{concernes > 1 ? 's' : ''} sur {total} demande{concernes > 1 ? 'nt' : ''} un coup d&apos;œil
        </p>
      </header>

      <ul className="divide-y divide-gray-50">
        {lignes.map(({ rdv, points }) => {
          const nom = `${rdv.patient?.first_name ?? ''} ${rdv.patient?.last_name ?? ''}`.trim() || 'Patient'
          return (
            <li key={rdv.id}>
              <Link
                href={`/patients/${rdv.patient_id}`}
                className="block px-4 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-500 tabular-nums shrink-0">
                    {String(rdv.time ?? '').slice(0, 5)}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate">{nom}</span>
                  {rdv.patient?.age != null && (
                    <span className="text-[11px] text-gray-400 shrink-0">{rdv.patient.age} ans</span>
                  )}
                  {rdv.notes && (
                    <span className="text-[11px] text-gray-400 truncate hidden sm:inline">· {rdv.notes}</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-gray-300 ml-auto shrink-0" />
                </div>

                {/* Deux points au plus : le troisième se lit dans le dossier.
                    Une ligne de journée qui déborde sur cinq lignes casse la
                    lecture en diagonale, qui est tout l'intérêt de l'encart. */}
                <ul className="mt-1 space-y-0.5">
                  {points.slice(0, 2).map((pt, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      {pt.niveau === 'urgent'
                        ? <AlertTriangle className="h-3 w-3 text-red-500 shrink-0 mt-[3px]" />
                        : <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-[6px]" />}
                      <p className={`text-[12.5px] leading-snug min-w-0 ${pt.niveau === 'urgent' ? 'text-red-700' : 'text-gray-600'}`}>
                        <span className="font-medium">{pt.titre}</span>
                        <span className="text-gray-400"> — {pt.detail}</span>
                      </p>
                    </li>
                  ))}
                  {points.length > 2 && (
                    <li className="text-[11px] text-gray-400 pl-[18px]">
                      et {points.length - 2} autre{points.length - 2 > 1 ? 's' : ''} point{points.length - 2 > 1 ? 's' : ''} au dossier
                    </li>
                  )}
                </ul>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="px-4 py-2 text-[10.5px] text-gray-400 border-t border-gray-50 leading-snug">
        Relevé de ce qui est déjà au dossier : constantes, antécédents, ordonnances, rappels, documents.
        Aucun diagnostic. Les patients sans rien à signaler ne figurent pas ici.
      </p>
    </section>
  )
}
