'use client'

// « Actes du jour » — ce que le praticien a à faire PENDANT cette séance, et la
// case à cocher qui le note fait.
//
// POURQUOI cet encart existe : marquer un acte réalisé n'était possible que
// dans le dossier patient, onglet Paiements, devis déplié — trois navigations
// alors que le patient est dans le fauteuil. En pratique le dentiste ne le
// faisait pas, et toute la suite en dépendait : l'avancement du plan, la
// feuille de soins (pré-remplie avec les actes marqués faits AUJOURD'HUI, voir
// page.tsx) et la prochaine séance que la secrétaire doit proposer au patient
// qui se lève.
//
// Ce qui est montré est volontairement étroit : la PROCHAINE séance à réaliser
// de chaque plan en cours, rien de plus. Pas de prix du plan, pas de reste dû,
// pas d'ajout d'acte — ces décisions appartiennent au devis, dans le dossier.
// L'écran de consultation est déjà dense ; il montre ici ce que le praticien a
// sous la main dans l'heure, pas le plan de traitement en entier.
import { useCallback, useEffect, useState } from 'react'
import { itemTotal, prochaineSeanceAFaire } from '@/lib/devis'
import type { Quote, QuoteItem } from '@/types'
import { Check, ClipboardList } from 'lucide-react'

/** Actes montrés d'emblée par séance. Cinq, parce qu'une séance dentaire
 *  réelle en compte rarement plus, et qu'au-delà l'encart cesserait d'être
 *  « ce que j'ai à faire » pour redevenir le plan de traitement. */
const VISIBLES = 5

/** Une séance à réaliser, figée au chargement — voir `charger()`. */
type Lot = {
  quoteId: string
  /** Libellé du devis, affiché seulement si plusieurs plans sont en cours. */
  quoteLabel: string
  seance: number | null
  items: QuoteItem[]
}

export default function ActesDuJourCard({
  patientId, appointmentId, appointmentPaid, onRattachement,
}: {
  patientId: string
  appointmentId: string
  /** Ce rendez-vous porte-t-il DÉJÀ son propre encaissement ? État vivant, pas
   *  la valeur de départ : le praticien peut encaisser dans la colonne de
   *  droite entre deux actes cochés. */
  appointmentPaid: boolean
  /** Appelé au premier acte effectivement rattaché à ce rendez-vous : la
   *  colonne de droite prévient alors que l'argent de ces actes se saisit sur
   *  le devis (verrou v54), au lieu de laisser le praticien le découvrir en
   *  cliquant « Valider l'encaissement ». */
  onRattachement?: () => void
}) {
  const [lots, setLots] = useState<Lot[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const charger = useCallback(async () => {
    // Même lecture que le dossier patient : /api/quotes porte le contrôle du
    // forfait et la propriété du devis. Rien n'est lu en direct depuis le
    // navigateur.
    const res = await fetch(`/api/quotes?patient_id=${encodeURIComponent(patientId)}`)
    if (!res.ok) return
    const data = (await res.json().catch(() => ({}))) as { quotes?: Quote[] }
    const trouves: Lot[] = []
    for (const q of data.quotes ?? []) {
      // Un plan refusé ou annulé n'a plus d'actes à réaliser : les proposer à
      // cocher ferait rentrer dans le dossier des soins que le patient a
      // justement déclinés.
      if (q.status === 'refuse' || q.status === 'annule') continue
      const lignes = q.items ?? []
      // Les actes DÉJÀ cochés au cours de ce rendez-vous. Sans eux, l'encart
      // mentait dès que l'écran était rechargé : `prochaineSeanceAFaire` ne
      // retient que les actes non faits, et le praticien qui revient de
      // l'ordonnance retrouvait « 0/1 fait » sans trace du détartrage qu'il
      // venait de poser — ni moyen de décocher un clic de trop.
      // Le critère est le rattachement à CE rendez-vous, pas la date du jour :
      // un acte coché lors d'une autre séance du même jour appartient à cette
      // séance-là, pas à celle-ci.
      const faitsIci = lignes.filter((i) => i.done && i.appointment_id === appointmentId)
      const suite = prochaineSeanceAFaire(lignes)
      if (!suite && faitsIci.length === 0) continue
      trouves.push({
        quoteId: q.id,
        quoteLabel: q.label ?? 'Plan de traitement',
        // Le titre annonce ce qu'il RESTE à faire ; quand tout est fait, on
        // retombe sur la séance des actes posés.
        seance: suite?.seance ?? faitsIci.find((i) => i.session_no != null)?.session_no ?? null,
        // Ordre de saisie du médecin (`position`), comme dans le devis du
        // dossier : il a chiffré ses actes dans l'ordre où il les pose, et
        // /api/quotes ne garantit pas l'ordre des lignes.
        items: [...faitsIci, ...(suite?.items ?? [])].sort((a, b) => a.position - b.position),
      })
    }
    setLots(trouves)
  }, [patientId, appointmentId])

  useEffect(() => { charger() }, [charger])

  /** Remplace une ligne par celle que le serveur vient de renvoyer.
   *
   *  La liste des actes est figée au chargement et n'est PAS recalculée après
   *  chaque clic : `prochaineSeanceAFaire` ne retient que les actes non faits,
   *  un acte coché disparaîtrait donc de l'écran à l'instant où on le coche —
   *  impossible de vérifier, impossible de corriger un clic de trop. Le lot
   *  reste affiché jusqu'au prochain chargement de l'écran, les actes faits
   *  barrés à leur place. */
  function remplacer(ligne: QuoteItem) {
    setLots((prev) => prev.map((lot) => ({
      ...lot,
      items: lot.items.map((i) => (i.id === ligne.id ? { ...i, ...ligne } : i)),
    })))
  }

  async function patch(quoteId: string, itemId: string, corps: Record<string, unknown>) {
    const res = await fetch(`/api/quotes/${quoteId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data: data as QuoteItem & { error?: string } }
  }

  async function basculer(lot: Lot, item: QuoteItem) {
    setBusyId(item.id)
    try {
      // DEUX APPELS, ET DANS CET ORDRE. « Réalisé » est un constat de soin : il
      // ne doit jamais échouer pour une raison d'argent. Envoyé avec
      // `appointment_id` dans le même PATCH, il serait perdu avec lui le jour
      // où la route refuse le rattachement (409 : rendez-vous portant déjà son
      // encaissement) — le dentiste cliquerait la case et rien ne se passerait.
      const fait = await patch(lot.quoteId, item.id, { done: !item.done })
      if (!fait.ok) { alert(fait.data.error || 'Modification impossible.'); return }
      remplacer(fait.data)

      // Rattachement au rendez-vous : utile et volontairement SECONDAIRE. Il
      // inscrit quel acte a été posé à quelle séance, et dit à la comptabilité
      // que l'argent de ces actes se saisit sur le devis (le RDV reçoit
      // `quote_id`, et PATCH /api/appointments refuse alors son propre
      // `amount_paid` — migration v54). On ne le tente donc pas quand la
      // consultation a déjà été encaissée ici : ce serait demander au serveur
      // de choisir entre deux recettes, ce qu'il refuse à juste titre.
      if (!item.done && !appointmentPaid) {
        const lie = await patch(lot.quoteId, item.id, { appointment_id: appointmentId })
        // Un refus n'est pas remonté au praticien : l'acte EST noté réalisé,
        // seul le rattachement comptable n'a pas eu lieu, et il se fait sur le
        // devis. Une alerte ici laisserait croire que le soin n'est pas noté.
        if (lie.ok) { remplacer(lie.data); onRattachement?.() }
      }
    } finally {
      setBusyId(null)
    }
  }

  // Rien à montrer (pas de plan, ou tout est fait) : pas d'encart, pas de
  // titre, pas de « aucun acte ». Un généraliste ne doit pas payer d'une ligne
  // d'écran une fonction dentaire qui ne le concerne pas.
  if (lots.length === 0) return null

  const tous = lots.flatMap((l) => l.items)
  const faits = tous.filter((i) => i.done).length

  /** Une ligne d'acte. */
  const ligne = (lot: Lot, it: QuoteItem) => (
    <li key={it.id}>
      {/* TOUTE la ligne coche l'acte, pas seulement la pastille : viser une
          case de 20 px entre deux gants, au fauteuil, est le genre de détail
          qui fait qu'un praticien cesse d'utiliser la fonction. La pastille
          reste dessinée — même repère que dans le devis du dossier, cocher ici
          ou là-bas est le même geste — mais elle n'est plus la seule cible. */}
      <button
        type="button"
        onClick={() => basculer(lot, it)}
        disabled={busyId !== null}
        title={it.done ? 'Marquer comme non réalisé' : 'Marquer comme réalisé'}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg hover:bg-primary-50/60 disabled:opacity-60"
      >
        <span className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent'}`}>
          <Check className="h-3.5 w-3.5" />
        </span>
        {it.tooth && (
          <span className="text-[11px] font-bold text-primary-700 bg-primary-50 rounded px-1.5 py-0.5 shrink-0 tabular-nums">
            {it.tooth}
          </span>
        )}
        <span className={`flex-1 text-xs truncate ${it.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
          {it.label}{it.quantity > 1 ? ` × ${it.quantity}` : ''}
        </span>
        <span className="text-xs font-medium text-gray-800 whitespace-nowrap tabular-nums">
          {itemTotal(it).toLocaleString('fr-FR')} DH
        </span>
      </button>
    </li>
  )

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <ClipboardList className="h-4 w-4 text-primary-500" /> Actes du jour
        <span className="ml-auto text-[11px] font-normal text-gray-400 tabular-nums">
          {faits}/{tous.length} fait{faits > 1 ? 's' : ''}
        </span>
      </h3>

      <div className="space-y-2.5">
        {lots.map((lot) => (
          <div key={lot.quoteId}>
            {/* Le numéro de séance est ce que le praticien dicte à la
                secrétaire ; le libellé du devis n'est utile que s'il y a
                plusieurs plans en cours, sinon il répète l'évidence. */}
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {lot.seance !== null ? `Séance ${lot.seance}` : 'Actes à planifier'}
              {lots.length > 1 && <span className="font-normal normal-case text-gray-400"> · {lot.quoteLabel}</span>}
            </p>
            <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
              {lot.items.slice(0, VISIBLES).map((it) => ligne(lot, it))}
            </ul>
            {/* Un devis fraîchement chiffré n'a AUCUN numéro de séance (c'est
                son état normal) : « la prochaine séance » est alors le plan en
                entier, parfois quinze actes. On n'affiche pas quinze lignes
                dans un écran de consultation — le reste est à un clic, et reste
                cochable, ce qui compte plus que de tout voir d'emblée. */}
            {lot.items.length > VISIBLES && (
              <details className="mt-1">
                <summary className="list-none cursor-pointer select-none text-[11px] text-gray-400 hover:text-primary-600">
                  + {lot.items.length - VISIBLES} autre(s) acte(s)
                </summary>
                <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg mt-1">
                  {lot.items.slice(VISIBLES).map((it) => ligne(lot, it))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
