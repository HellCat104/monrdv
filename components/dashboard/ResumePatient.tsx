// Ce qu'il faut savoir sur ce patient, en haut de l'écran.
//
// ── LA FORME, ET POURQUOI CELLE-LÀ ──────────────────────────────────────────
//
// Deux blocs, dans cet ordre :
//
//   1. CE QU'IL EST — allergies, antécédents, traitements, dernières
//      constantes. Des faits, pas des avis. L'allergie est en rouge et en
//      premier : c'est la seule ligne dont l'oubli se paie tout de suite.
//   2. CE QU'IL FAUT VÉRIFIER AUJOURD'HUI — des constats datés, calculés par
//      `lib/preparation.ts`. Chacun cite sa donnée et sa date.
//
// Rien n'est repliable dans le premier bloc : un pli, c'est un geste, et à
// 10 h 02 le geste ne se fait pas. Le second se replie quand il y a plus de
// trois points, parce qu'au-delà c'est une liste qu'on ne lit plus.
//
// ── MOBILE D'ABORD ──────────────────────────────────────────────────────────
//
// Le praticien lit ça sur son téléphone entre deux portes. Tout est en une
// colonne sous 640 px, et aucune ligne n'est tronquée : un antécédent coupé à
// « Diabète de type… » ne sert à rien.
import { AlertTriangle, Activity, Pill, ClipboardList, ChevronRight } from 'lucide-react'
import type { Preparation, NiveauPoint } from '@/lib/preparation'
import { frJour } from '@/lib/preparation'

/** Au-delà de ce nombre, les points se replient. */
const POINTS_VISIBLES = 3

const TONS: Record<NiveauPoint, { bord: string; fond: string; texte: string; puce: string }> = {
  urgent:    { bord: 'border-red-200',   fond: 'bg-red-50',    texte: 'text-red-800',    puce: 'bg-red-500' },
  attention: { bord: 'border-amber-200', fond: 'bg-amber-50',  texte: 'text-amber-900',  puce: 'bg-amber-500' },
  info:      { bord: 'border-gray-200',  fond: 'bg-gray-50',   texte: 'text-gray-700',   puce: 'bg-gray-400' },
}

export default function ResumePatient({
  preparation, titre = 'Résumé patient', compact = false,
}: {
  preparation: Preparation
  titre?: string
  /** Dans la consultation, l'écran est déjà chargé : on resserre. */
  compact?: boolean
}) {
  const p = preparation
  const aQuelqueChose =
    p.allergies || p.antecedents.length > 0 || p.traitements.length > 0
    || p.dernieresConstantes || p.points.length > 0 || p.dernieresConsultations.length > 0

  // Un dossier entièrement vide : on ne met pas un cadre vide en haut de
  // l'écran. L'absence d'information n'est pas une information.
  if (!aQuelqueChose) return null

  // L'allergie a déjà son bandeau rouge, deux centimètres plus haut. La
  // répéter dans « à vérifier » gaspille la place du premier point — celui
  // qu'on lit à coup sûr — pour redire ce qu'on vient de lire.
  //
  // Le tri est fait ICI et non dans le moteur : « Ma journée » n'a pas de
  // bandeau, et là-bas l'allergie DOIT être dans la liste.
  const aVerifier = p.allergies ? p.points.filter((pt) => pt.titre !== 'Allergie') : p.points
  const visibles = aVerifier.slice(0, POINTS_VISIBLES)
  const caches = aVerifier.slice(POINTS_VISIBLES)

  return (
    <section className={`bg-white border border-gray-100 rounded-xl ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{titre}</h2>

      {/* ── 1. Les faits ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* L'allergie, séparée du reste et en rouge. Elle n'est pas « un
            antécédent parmi d'autres » : c'est celle qui change l'ordonnance
            qu'on est en train d'écrire. */}
        {p.allergies && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 min-w-0">
              <span className="font-semibold">Allergie :</span> {p.allergies}
            </p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
          {p.antecedents.length > 0 && (
            <Bloc icone={<ClipboardList className="h-3.5 w-3.5" />} titre="Antécédents">
              <ul className="space-y-0.5">
                {p.antecedents.map((a, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-snug">{a}</li>
                ))}
              </ul>
            </Bloc>
          )}

          {p.traitements.length > 0 && (
            <Bloc icone={<Pill className="h-3.5 w-3.5" />} titre="Traitement en cours">
              <ul className="space-y-0.5">
                {p.traitements.map((t, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-snug">{t}</li>
                ))}
              </ul>
            </Bloc>
          )}

          {p.dernieresConstantes && (
            <Bloc
              icone={<Activity className="h-3.5 w-3.5" />}
              titre={`Dernières constantes${p.constantesLe ? ` · ${frJour(p.constantesLe)}` : ''}`}
            >
              <p className="text-sm text-gray-700 leading-snug tabular-nums">{p.dernieresConstantes}</p>
            </Bloc>
          )}

          {p.dernieresConsultations.length > 0 && (
            <Bloc icone={<ChevronRight className="h-3.5 w-3.5" />} titre="Dernières consultations">
              <ul className="space-y-0.5">
                {p.dernieresConsultations.map((c, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-snug">
                    <span className="text-gray-400 tabular-nums">{frJour(c.date)}</span> — {c.titre}
                  </li>
                ))}
              </ul>
            </Bloc>
          )}
        </div>
      </div>

      {/* ── 2. Ce qu'il faut vérifier aujourd'hui ────────────────────── */}
      {aVerifier.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            À vérifier aujourd&apos;hui
          </p>
          {visibles.map((pt, i) => <Point key={i} point={pt} />)}
          {caches.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 py-1">
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                {caches.length} autre{caches.length > 1 ? 's' : ''} point{caches.length > 1 ? 's' : ''}
              </summary>
              <div className="space-y-1.5 mt-1.5">
                {caches.map((pt, i) => <Point key={i} point={pt} />)}
              </div>
            </details>
          )}
          {/* Dire d'où ça sort. Un praticien qui ne sait pas comment une
              alerte a été produite ne peut ni la croire ni la contester. */}
          <p className="text-[10.5px] text-gray-400 leading-snug pt-0.5">
            Calculé à partir de ce qui est déjà au dossier. Aucun diagnostic, aucune donnée inventée.
          </p>
        </div>
      )}
    </section>
  )
}

function Bloc({ icone, titre, children }: { icone: React.ReactNode; titre: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400 flex items-center gap-1 mb-0.5">{icone} {titre}</p>
      {children}
    </div>
  )
}

function Point({ point }: { point: Preparation['points'][number] }) {
  const t = TONS[point.niveau]
  return (
    <div className={`flex items-start gap-2 ${t.fond} border ${t.bord} rounded-lg px-2.5 py-1.5`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.puce} shrink-0 mt-[7px]`} />
      <p className={`text-[13px] ${t.texte} min-w-0 leading-snug`}>
        <span className="font-semibold">{point.titre}</span>
        <span className="text-gray-500"> — {point.detail}</span>
      </p>
    </div>
  )
}
