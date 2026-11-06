// MA JOURNÉE — le briefing du matin.
//
// ── CE QUE ÇA REMPLACE ──────────────────────────────────────────────────────
//
// La liste des rendez-vous du jour dit QUI vient et à QUELLE HEURE. Elle ne
// dit pas que la troisième patiente a eu 152/94 la dernière fois, que le
// cinquième est allergique aux pénicillines, et que le huitième n'a pas eu de
// bilan depuis dix-huit mois. Pour le savoir, il fallait ouvrir huit dossiers.
//
// Cet encart le dit en un écran, avant la première sonnerie.
//
// ── CE QU'IL MONTRE, ET CE QU'IL TAIT ───────────────────────────────────────
//
// Seuls les points URGENTS et d'ATTENTION remontent ici. Les « info »
// (questionnaire qui a vieilli, dossier sans antécédent) sont vrais mais ne
// changent pas la journée : ils restent dans le résumé du dossier, où on les
// lit au moment utile. Un briefing qui signale tout ne se lit plus.
//
// Les rendez-vous DÉJÀ PARTIS ne sont pas annotés : préparer un patient qu'on
// a fini de voir n'a pas de sens.
//
// ── IL SE TAIT QUAND IL N'A RIEN À DIRE ─────────────────────────────────────
//
// Pas de patient, ou pas un seul point sur toute la journée : l'encart rend
// `null`. C'est la place d'un bandeau qui ne coûte rien les jours calmes.
import { createClient } from '@/lib/supabase/server'
import { preparerPlusieurs } from '@/lib/preparation-serveur'
import type { Preparation } from '@/lib/preparation'
import MaJourneeVue from '@/components/dashboard/MaJourneeVue'

export interface RdvDuJour {
  id: string
  time: string
  patient_id: string
  queue_status?: string | null
  notes?: string | null
  patient?: { first_name?: string | null; last_name?: string | null; age?: number | null } | null
}

export default async function MaJournee({
  doctorId, rendezVous, aujourdhui,
}: {
  doctorId: string
  /** Les rendez-vous du jour, déjà chargés par la page : on ne les relit pas. */
  rendezVous: RdvDuJour[]
  /** Le jour de référence en AAAA-MM-JJ (UTC+0 au Maroc : jamais toISOString). */
  aujourdhui: string
}) {
  // Les patients encore à voir. « parti » = la consultation est faite.
  const aVoir = rendezVous.filter((r) => r.queue_status !== 'parti' && r.patient_id)
  if (aVoir.length === 0) return null

  const supabase = createClient()
  const preparations = await preparerPlusieurs(
    supabase, doctorId, aVoir.map((r) => r.patient_id), aujourdhui,
  )

  /** Ce qui mérite d'être dit le matin : l'urgent et l'attention, rien d'autre. */
  const marquants = (p?: Preparation) =>
    (p?.points ?? []).filter((pt) => pt.niveau !== 'info')

  // Les lignes qui ont quelque chose à dire. Celles qui n'ont rien ne sont
  // pas envoyées : la vue n'a pas à refaire ce tri, et un patient sans point
  // n'a rien à faire dans un briefing.
  const lignes = aVoir
    .map((r) => ({ rdv: r, points: marquants(preparations.get(r.patient_id)) }))
    .filter((l) => l.points.length > 0)
  if (lignes.length === 0) return null

  return <MaJourneeVue lignes={lignes} total={aVoir.length} />
}
