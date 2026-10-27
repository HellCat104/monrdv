'use client'

// Vue Semaine sous forme de grille horaire : 7 colonnes de jours, les heures en
// ordonnée. Une liste oblige à lire chaque ligne pour se représenter la
// journée ; ici les trous, les blocages et les chevauchements se voient d'un
// coup d'œil, ce qui est tout l'intérêt d'un agenda de cabinet.

import { useRef, useState } from 'react'
import { format, addDays, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Ban } from 'lucide-react'
import { getDayKey, getDayBreaks, getNowInMaroc, toMinutes } from '@/lib/utils'
import { estAbsent } from '@/lib/file-attente'
import type { Appointment, WorkingHours } from '@/types'
import { posteUtile, nomPoste, couleurPoste, type Poste } from '@/lib/postes'

export interface WeekBlock {
  id: string
  date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

interface WeekGridProps {
  weekStart: Date                     // lundi de la semaine affichée, ou le jour affiché si nbJours = 1
  appointments: Appointment[]
  blocks: WeekBlock[]
  workingHours: WorkingHours
  defaultDuration: number             // durée de base, si le RDV n'en porte pas
  onSelectDay: (day: Date) => void
  onSelectAppointment: (apt: Appointment) => void
  /** Clic sur un créneau LIBRE : créer un rendez-vous à cette date et cette
   *  heure. Absent = la grille reste en lecture seule (ce qu'elle était). */
  onCreate?: (date: string, heure: string) => void
  /** Rendez-vous déplacé en le faisant GLISSER. On ne prévient le parent qu'au
   *  relâchement, et seulement si la case a changé : un doigt qui tremble sur
   *  une tablette ne doit pas déplacer la consultation de quelqu'un. */
  onMove?: (apt: Appointment, date: string, heure: string) => void
  /** Nombre de colonnes. 7 pour la semaine, 1 pour une seule journée — la
   *  même grille sert aux deux : des trous à voir et des chevauchements à
   *  démêler, c'est le même problème sur un jour que sur sept. */
  nbJours?: number
  /** Les fauteuils du cabinet (v89). Deux rendez-vous à la même heure étaient
   *  jusqu'ici impossibles ; maintenant qu'ils le sont, la grille doit dire
   *  LEQUEL est où — sinon deux colonnes côte à côte ne veulent rien dire. */
  postes?: Poste[]
}

const HEURE_PX = 56                   // hauteur d'une heure, en pixels
const MINUTE_PX = HEURE_PX / 60

/** Position verticale d'un horaire, en pixels depuis le haut de la grille. */
function y(minutes: number, debutGrille: number): number {
  return (minutes - debutGrille) * MINUTE_PX
}

/**
 * Répartit les rendez-vous qui se chevauchent sur plusieurs colonnes, pour
 * qu'aucun n'en masque un autre (deux patients à la même heure, un walk-in
 * inséré sur un créneau déjà pris…).
 */
function repartir(items: { start: number; end: number }[]): { col: number; total: number }[] {
  const res = items.map(() => ({ col: 0, total: 1 }))
  const ordre = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start)

  let groupe: number[] = []
  const cloreGroupe = () => {
    if (groupe.length === 0) return
    const total = Math.max(...groupe.map((i) => res[i].col)) + 1
    groupe.forEach((i) => { res[i].total = total })
    groupe = []
  }

  let finGroupe = -1
  for (const i of ordre) {
    if (items[i].start >= finGroupe) cloreGroupe()
    // Première colonne libre parmi les voisins déjà placés
    const prises = new Set(groupe.filter((j) => items[j].end > items[i].start).map((j) => res[j].col))
    let c = 0
    while (prises.has(c)) c++
    res[i].col = c
    groupe.push(i)
    finGroupe = Math.max(finGroupe, items[i].end)
  }
  cloreGroupe()
  return res
}

export function WeekGrid({
  weekStart, appointments, blocks, workingHours,
  defaultDuration, onSelectDay, onSelectAppointment, onCreate, onMove, nbJours = 7,
  postes = [],
}: WeekGridProps) {
  // Avec un seul poste, la grille reste celle d'avant : rien à distinguer.
  const montrerPoste = posteUtile(postes)
  const jours = Array.from({ length: nbJours }, (_, i) => addDays(weekStart, i))
  // La grille des colonnes et la largeur minimale suivent le nombre de jours :
  // une journée seule étalée sur 760 px de large laissait six colonnes vides.
  const colonnes = { gridTemplateColumns: `48px repeat(${nbJours}, 1fr)` }
  const largeur = nbJours === 1 ? 'min-w-[280px]' : 'min-w-[760px]'
  const aujourdhui = getNowInMaroc()

  // Amplitude de la grille : la plus large plage d'ouverture de la semaine,
  // élargie si un rendez-vous ou un blocage déborde (urgence, dépassement).
  let debut = 24 * 60
  let fin = 0
  for (const j of jours) {
    const s = workingHours[getDayKey(j)]
    if (!s?.enabled) continue
    debut = Math.min(debut, toMinutes(s.start))
    fin = Math.max(fin, toMinutes(s.end))
  }
  for (const a of appointments) {
    const t = toMinutes(a.time.substring(0, 5))
    debut = Math.min(debut, t)
    fin = Math.max(fin, t + (a.duration_minutes || defaultDuration))
  }
  for (const b of blocks) {
    if (!b.start_time) continue
    debut = Math.min(debut, toMinutes(b.start_time.substring(0, 5)))
    fin = Math.max(fin, toMinutes((b.end_time ?? b.start_time).substring(0, 5)))
  }
  if (debut >= fin) { debut = 8 * 60; fin = 19 * 60 }       // semaine entièrement fermée
  debut = Math.floor(debut / 60) * 60                        // caler sur l'heure pleine
  fin = Math.ceil(fin / 60) * 60
  const hauteur = (fin - debut) * MINUTE_PX
  const heures = Array.from({ length: (fin - debut) / 60 + 1 }, (_, i) => debut + i * 60)

  // Trait de l'heure courante, seulement si la semaine affichée le contient
  const maintenant = toMinutes(format(aujourdhui, 'HH:mm'))
  const colonneAujourdhui = jours.findIndex((j) => isSameDay(j, aujourdhui))
  const afficheMaintenant = colonneAujourdhui >= 0 && maintenant >= debut && maintenant <= fin

  const congesDuJour = (dStr: string) => blocks.filter((b) => b.date === dStr && !b.start_time)

  // ── Interaction : créer en cliquant, déplacer en glissant ─────────────────
  //
  // Les minutes se calent sur le quart d'heure. Au pixel près, on obtiendrait
  // « 09:07 », que personne n'a voulu et que tout le monde devrait corriger.
  const PAS_MIN = 15
  const grille = useRef<HTMLDivElement>(null)
  const [glisse, setGlisse] = useState<{ id: string; dejaBouge: boolean } | null>(null)
  const [cible, setCible] = useState<{ jour: string; minutes: number } | null>(null)

  /** Où pointe-t-on dans la grille ? Null hors des colonnes de jours. */
  function positionDe(clientX: number, clientY: number): { jour: Date; minutes: number } | null {
    const el = grille.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const largeurColonnes = r.width - 48          // 48 px : la colonne des heures
    const x = clientX - r.left - 48
    if (x < 0 || x > largeurColonnes) return null
    const index = Math.min(nbJours - 1, Math.max(0, Math.floor(x / (largeurColonnes / nbJours))))
    const brut = debut + (clientY - r.top) / MINUTE_PX
    const cale = Math.round(brut / PAS_MIN) * PAS_MIN
    if (cale < debut || cale >= fin) return null
    return { jour: jours[index], minutes: cale }
  }

  const enTexte = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  return (
    <div className="overflow-x-auto">
      <div className={largeur}>

        {/* En-tête : les sept jours */}
        <div className="grid border-b border-gray-200" style={colonnes}>
          <div />
          {jours.map((j) => {
            const estAujourdhui = isSameDay(j, aujourdhui)
            const ouvert = workingHours[getDayKey(j)]?.enabled
            return (
              <button
                key={j.toISOString()}
                onClick={() => onSelectDay(j)}
                className="py-2 text-center transition-colors hover:bg-gray-50"
                title="Voir cette journée en détail"
              >
                <div className={`text-[11px] uppercase tracking-wide ${ouvert ? 'text-gray-400' : 'text-gray-300'}`}>
                  {format(j, 'EEE', { locale: fr })}
                </div>
                <div className={`text-lg leading-tight font-semibold ${
                  estAujourdhui ? 'text-white bg-primary-500 rounded-full w-8 h-8 mx-auto flex items-center justify-center'
                                : ouvert ? 'text-gray-800' : 'text-gray-300'}`}>
                  {format(j, 'd')}
                </div>
              </button>
            )
          })}
        </div>

        {/* Bandeau des journées entièrement fermées */}
        {blocks.some((b) => !b.start_time) && (
          <div className="grid border-b border-gray-200 bg-gray-50" style={colonnes}>
            <div className="text-[10px] text-gray-400 px-1 py-1.5 text-right leading-tight">toute la journée</div>
            {jours.map((j) => {
              const conges = congesDuJour(format(j, 'yyyy-MM-dd'))
              return (
                <div key={j.toISOString()} className="px-0.5 py-1 border-l border-gray-100">
                  {conges.map((c) => (
                    <div key={c.id}
                      className="text-[10px] leading-tight bg-red-100 text-red-700 rounded px-1 py-0.5 truncate"
                      title={c.reason ?? 'Journée bloquée'}>
                      {c.reason || 'Fermé'}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Grille horaire */}
        <div ref={grille} className="relative grid mt-3" style={{ ...colonnes, height: hauteur }}
          onPointerMove={(e) => {
            if (!glisse) return
            const p = positionDe(e.clientX, e.clientY)
            if (p) { setCible({ jour: format(p.jour, 'yyyy-MM-dd'), minutes: p.minutes }); setGlisse({ ...glisse, dejaBouge: true }) }
          }}
          onPointerUp={(e) => {
            if (!glisse) return
            const encours = glisse
            setGlisse(null); setCible(null)
            if (!encours.dejaBouge || !onMove) return
            const p = positionDe(e.clientX, e.clientY)
            if (!p) return
            const apt = appointments.find((a) => a.id === encours.id)
            if (!apt) return
            const jour = format(p.jour, 'yyyy-MM-dd')
            const heure = enTexte(p.minutes)
            // Reposé exactement d'où il vient : ce n'est pas un déplacement.
            if (jour === apt.date && heure === apt.time.substring(0, 5)) return
            onMove(apt, jour, heure)
          }}
          onPointerLeave={() => { setGlisse(null); setCible(null) }}
        >

          {/* Colonne des heures */}
          <div className="relative">
            {heures.slice(0, -1).map((h) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[11px] text-gray-400"
                   style={{ top: y(h, debut) }}>
                {String(Math.floor(h / 60)).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Lignes horaires, tracées sur toute la largeur */}
          <div className="absolute inset-y-0 left-12 right-0 pointer-events-none">
            {heures.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-gray-100" style={{ top: y(h, debut) }} />
            ))}
          </div>

          {/* Une colonne par jour */}
          {jours.map((j) => {
            const dStr = format(j, 'yyyy-MM-dd')
            const sched = workingHours[getDayKey(j)]
            const ouvert = !!sched?.enabled
            const ouv = ouvert ? toMinutes(sched.start) : 0
            const ferm = ouvert ? toMinutes(sched.end) : 0

            const rdv = appointments
              .filter((a) => a.date === dStr && a.status !== 'cancelled')
              .map((a) => {
                const start = toMinutes(a.time.substring(0, 5))
                return { apt: a, start, end: start + (a.duration_minutes || defaultDuration) }
              })
              .sort((x, z) => x.start - z.start)
            const places = repartir(rdv)

            const plages = blocks.filter((b) => b.date === dStr && b.start_time && b.end_time)

            return (
              <div key={dStr}
                className={`relative border-l border-gray-100 ${onCreate ? 'cursor-copy' : ''}`}
                onClick={(e) => {
                  // Seulement le fond de la colonne : un clic sur un rendez-vous
                  // ou sur un créneau bloqué veut dire autre chose.
                  if (!onCreate || e.target !== e.currentTarget) return
                  const p = positionDe(e.clientX, e.clientY)
                  if (p) onCreate(format(p.jour, 'yyyy-MM-dd'), enTexte(p.minutes))
                }}
              >

                {/* Congé : toute la colonne est teintée, sinon la fermeture
                    ne se lit que dans le bandeau du haut. */}
                {congesDuJour(dStr).length > 0 && (
                  <div className="absolute inset-0 bg-red-50/60 z-[1] pointer-events-none" />
                )}

                {/* Hors horaires d'ouverture — grisé */}
                {!ouvert ? (
                  <div className="absolute inset-0 bg-gray-50/80 pointer-events-none" />
                ) : (
                  <>
                    {ouv > debut && (
                      <div className="absolute inset-x-0 bg-gray-50/80 pointer-events-none"
                           style={{ top: 0, height: y(ouv, debut) }} />
                    )}
                    {ferm < fin && (
                      <div className="absolute inset-x-0 bg-gray-50/80 pointer-events-none"
                           style={{ top: y(ferm, debut), height: y(fin, debut) - y(ferm, debut) }} />
                    )}
                    {/* Pauses déclarées (déjeuner…) */}
                    {getDayBreaks(sched).map((p, i) => (
                      <div key={i} className="absolute inset-x-0 bg-gray-100/70 pointer-events-none"
                           style={{ top: y(toMinutes(p.start), debut),
                                    height: (toMinutes(p.end) - toMinutes(p.start)) * MINUTE_PX }} />
                    ))}
                  </>
                )}

                {/* Créneaux bloqués */}
                {plages.map((b) => {
                  const s = toMinutes(b.start_time!.substring(0, 5))
                  const e = toMinutes(b.end_time!.substring(0, 5))
                  return (
                    <div key={b.id}
                      className="absolute left-0.5 right-0.5 rounded border border-red-200 bg-red-50 overflow-hidden"
                      style={{ top: y(s, debut), height: Math.max(14, (e - s) * MINUTE_PX) }}
                      title={`Bloqué ${b.start_time!.slice(0, 5)}–${b.end_time!.slice(0, 5)}${b.reason ? ` · ${b.reason}` : ''}`}
                    >
                      <div className="flex items-center gap-1 px-1 pt-0.5 text-[10px] leading-tight text-red-700">
                        <Ban className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{b.reason || 'Bloqué'}</span>
                      </div>
                    </div>
                  )
                })}

                {/* Rendez-vous */}
                {rdv.map((r, i) => {
                  const { col, total } = places[i]
                  const largeur = 100 / total
                  // Même règle que la vue Jour : voir estAbsent().
                  const absent = estAbsent(r.apt)
                  const enAttente = r.apt.status === 'pending'
                  return (
                    <button
                      key={r.apt.id}
                      onPointerDown={(e) => {
                        if (!onMove) return
                        // On capture le pointeur sur la GRILLE et non sur le
                        // bloc : sinon, dès que le doigt sort du rendez-vous,
                        // les événements cessent d'arriver et le déplacement
                        // s'interrompt au premier millimètre.
                        e.preventDefault()
                        setGlisse({ id: r.apt.id, dejaBouge: false })
                      }}
                      onClick={() => { if (!glisse) onSelectAppointment(r.apt) }}
                      className={`absolute rounded px-1 pt-0.5 text-left overflow-hidden border-l-2 transition-shadow hover:shadow-md ${
                        onMove ? 'cursor-grab active:cursor-grabbing touch-none' : ''
                      } ${glisse?.id === r.apt.id ? 'opacity-40' : ''} ${
                        absent      ? 'bg-gray-100 border-gray-400 text-gray-500 line-through'
                        : enAttente ? 'bg-amber-50 border-amber-400 text-amber-900'
                                    : 'bg-primary-50 border-primary-500 text-primary-900'
                      } ${
                        // Le liseré gauche prend la couleur du fauteuil : deux
                        // blocs côte à côte sans ce repère laissent deviner
                        // lequel est où, ce qui est justement la question.
                        montrerPoste && r.apt.poste_id && !absent
                          ? couleurPoste(postes.find((p) => p.id === r.apt.poste_id)?.couleur).bord.replace('border-', 'border-l-')
                          : ''
                      }`}
                      style={{
                        top: y(r.start, debut),
                        height: Math.max(16, (r.end - r.start) * MINUTE_PX - 2),
                        left: `calc(${col * largeur}% + 2px)`,
                        width: `calc(${largeur}% - 4px)`,
                      }}
                      title={`${r.apt.time.substring(0, 5)} · ${r.apt.patient?.first_name ?? ''} ${r.apt.patient?.last_name ?? ''}${
                        r.apt.consultation_type?.name ? ` · ${r.apt.consultation_type.name}` : ''}${
                        montrerPoste && nomPoste(postes, r.apt.poste_id) ? ` · ${nomPoste(postes, r.apt.poste_id)}` : ''}`}
                    >
                      <div className="text-[10px] font-semibold leading-tight truncate">
                        {r.apt.time.substring(0, 5)} {r.apt.patient?.first_name ?? 'Patient'}
                      </div>
                      {(r.end - r.start) >= 30 && (
                        <div className="text-[10px] leading-tight truncate opacity-75">
                          {r.apt.patient?.last_name ?? ''}
                        </div>
                      )}
                      {montrerPoste && (r.end - r.start) >= 45 && nomPoste(postes, r.apt.poste_id) && (
                        <div className="text-[9px] leading-tight truncate opacity-60">
                          {nomPoste(postes, r.apt.poste_id)}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* L'ombre de destination : sans elle on lâche à l'aveugle, et on
              découvre l'heure obtenue une fois le rendez-vous déplacé. */}
          {glisse && cible && (
            <div className="absolute z-20 pointer-events-none flex items-center justify-center rounded border-2 border-dashed border-primary-500 bg-primary-50/70"
              style={{
                top: y(cible.minutes, debut),
                height: 24,
                // Les colonnes commencent APRÈS la gouttière des heures : un
                // pourcentage de la largeur totale décalerait l'ombre de 48 px
                // divisés par le nombre de jours.
                left: `calc(48px + (100% - 48px) * ${jours.findIndex((j) => format(j, 'yyyy-MM-dd') === cible.jour)} / ${nbJours})`,
                width: `calc((100% - 48px) / ${nbJours})`,
              }}
            >
              <span className="text-[10px] font-semibold text-primary-700">{enTexte(cible.minutes)}</span>
            </div>
          )}

          {/* Trait de l'heure courante */}
          {afficheMaintenant && (
            <div className="absolute left-12 right-0 pointer-events-none z-10"
                 style={{ top: y(maintenant, debut) }}>
              <div className="relative h-px bg-red-500">
                <div className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Cliquez sur un jour pour voir le détail, ou sur un rendez-vous pour ouvrir la fiche
        </p>
      </div>
    </div>
  )
}
