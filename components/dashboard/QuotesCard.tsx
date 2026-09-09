'use client'

// Devis (plan de traitement chiffré) dans le dossier patient.
//
// L'utilisateur type est un praticien qui n'a jamais utilisé d'ordinateur :
// l'écran répond à trois questions et à rien d'autre — combien coûte le plan,
// combien le patient a déjà versé, combien il reste. Le RESTE DÛ est le seul
// chiffre mis en gros ; c'est celui qu'on cherche quand le patient est debout
// devant le bureau.
//
// Tout passe par /api/quotes plutôt que par supabase depuis le navigateur : le
// contrôle de forfait, la propriété du devis, le refus d'un trop-perçu et
// l'attribution du numéro de facture sont des règles serveur. Un écran ne doit
// jamais être le seul endroit où une règle d'argent est appliquée.
//
// DEUX PUBLICS, UN SEUL ÉCRAN (v55) :
//   mode 'medecin'    — le dossier patient du praticien, tout est ouvert ;
//   mode 'secretaire' — l'espace cabinet : LECTURE, plus la saisie d'un
//                       versement si le médecin l'a autorisée.
// Le même composant plutôt qu'une copie, parce que la copie divergerait : le
// jour où le calcul du reste dû ou l'affichage d'un devis soldé change, il ne
// changerait que d'un côté, et la secrétaire annoncerait au patient un montant
// que le médecin ne voit pas. Ce que le mode secrétaire retire n'est ici qu'un
// confort d'écran : les créations, modifications et suppressions n'existent
// PAS dans /api/cabinet/quotes — c'est le serveur qui les refuse, pas ce fichier.
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/lib/utils'
import { quoteTotal, quotePaid, quoteRemaining, itemTotal, installmentsTotal } from '@/lib/devis'
import { PAYMENT_METHOD_LABELS, QUOTE_STATUS_COLORS, QUOTE_STATUS_LABELS,
  type PaymentMethod, type Quote, type QuoteStatus } from '@/types'
import { FileSpreadsheet, Plus, Trash2, Printer, Check, ChevronDown, ChevronRight, CalendarClock } from 'lucide-react'

const sec = 'bg-white border border-gray-100 rounded-xl p-4'
const secTitle = 'text-sm font-semibold text-primary-600 mb-3 flex items-center justify-between'
const inputCls = 'text-xs border border-gray-200 rounded-lg px-2 py-1.5'

// Statuts proposés au médecin. « terminé » n'est pas dans la liste : il se pose
// tout seul quand le devis est soldé, et l'y remettre à la main laisserait
// croire qu'il solde le paiement — ce qu'il ne fait pas.
const STATUS_CHOICES: QuoteStatus[] = ['brouillon', 'propose', 'accepte', 'refuse', 'annule']

export default function QuotesCard({
  patientId,
  dental,
  mode = 'medecin',
  canPay = true,
}: {
  patientId: string
  dental: boolean
  /** 'secretaire' : lecture seule + éventuellement l'encaissement. Défaut
   *  'medecin' pour que l'écran du praticien reste ce qu'il était. */
  mode?: 'medecin' | 'secretaire'
  /** Mode secrétaire : le médecin a-t-il coché « Encaisser sur un devis » ? */
  canPay?: boolean
}) {
  // Un seul booléen dérivé plutôt que `mode === …` répété dans le JSX : la
  // règle « la secrétaire ne modifie rien » se lit alors en un seul endroit.
  const secretaire = mode === 'secretaire'
  const peutEncaisser = secretaire ? canPay : true
  // La secrétaire lit et encaisse via ses propres routes cabinet : celles du
  // médecin (/api/quotes) lui répondraient 404, elle n'est pas dans `doctors`.
  const listeUrl = secretaire
    ? `/api/cabinet/quotes?patient_id=${patientId}`
    : `/api/quotes?patient_id=${patientId}`

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  // Saisies du devis ouvert. Un seul jeu d'états : un seul devis est déplié à
  // la fois, inutile de les indexer par identifiant.
  const [itTooth, setItTooth] = useState('')
  const [itLabel, setItLabel] = useState('')
  const [itPrice, setItPrice] = useState('')
  const [itQty, setItQty] = useState('1')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('especes')
  const [payDate, setPayDate] = useState('')
  const [echCount, setEchCount] = useState('3')
  const [echDate, setEchDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(listeUrl)
    const data = await res.json().catch(() => ({}))
    setQuotes(res.ok ? (data.quotes ?? []) : [])
    setLoading(false)
  }, [listeUrl])
  useEffect(() => { load() }, [load])

  /** Un seul point de sortie pour les erreurs serveur : le message renvoyé par
   *  l'API est écrit pour être lu tel quel par le praticien. */
  async function call(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(true)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || 'Opération impossible.'); return null }
      return data
    } finally {
      setBusy(false)
    }
  }

  /** Après chaque écriture on relit le devis complet côté serveur plutôt que de
   *  bricoler l'état local : les totaux, le statut « terminé » et le numéro de
   *  facture sont calculés en base, et une copie locale finirait par en
   *  diverger. */
  async function refresh(quoteId: string) {
    // La secrétaire n'a pas de route « un devis » : elle relit la liste, qui lui
    // est de toute façon filtrée sur son cabinet côté serveur.
    if (secretaire) { await load(); return }
    const res = await fetch(`/api/quotes/${quoteId}`)
    if (!res.ok) { await load(); return }
    const fresh = await res.json()
    setQuotes((prev) => prev.map((q) => (q.id === quoteId ? fresh : q)))
  }

  async function createQuote() {
    const data = await call('/api/quotes', {
      method: 'POST',
      body: JSON.stringify({ patient_id: patientId, label: newLabel.trim() || null }),
    })
    if (!data) return
    setNewLabel('')
    setQuotes((prev) => [data as unknown as Quote, ...prev])
    setOpenId((data as { id: string }).id)
  }

  async function setStatus(q: Quote, status: QuoteStatus) {
    const data = await call(`/api/quotes/${q.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    if (data) setQuotes((prev) => prev.map((x) => (x.id === q.id ? (data as unknown as Quote) : x)))
  }

  async function deleteQuote(q: Quote) {
    if (!confirm('Supprimer ce devis et toutes ses lignes ?')) return
    const data = await call(`/api/quotes/${q.id}`, { method: 'DELETE' })
    if (data) setQuotes((prev) => prev.filter((x) => x.id !== q.id))
  }

  async function addItem(q: Quote) {
    if (!itLabel.trim()) { alert('Indiquez l\'acte (par exemple « Couronne céramique »).'); return }
    const data = await call(`/api/quotes/${q.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        tooth: itTooth.trim() || null,
        label: itLabel.trim(),
        unit_price: Number((itPrice || '0').replace(',', '.')),
        quantity: Number(itQty || '1'),
      }),
    })
    if (!data) return
    setItTooth(''); setItLabel(''); setItPrice(''); setItQty('1')
    await refresh(q.id)
  }

  async function toggleDone(q: Quote, itemId: string, done: boolean) {
    const data = await call(`/api/quotes/${q.id}/items/${itemId}`, {
      method: 'PATCH', body: JSON.stringify({ done }),
    })
    if (data) await refresh(q.id)
  }

  async function deleteItem(q: Quote, itemId: string) {
    const data = await call(`/api/quotes/${q.id}/items/${itemId}`, { method: 'DELETE' })
    if (data) await refresh(q.id)
  }

  async function addPayment(q: Quote) {
    const amount = Number((payAmount || '').replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) { alert('Indiquez le montant reçu.'); return }
    const corps = {
      amount,
      payment_method: payMethod,
      // Date laissée vide = aujourd'hui. Le champ existe pour le chèque
      // encaissé lundi et saisi mercredi.
      paid_at: payDate ? `${payDate}T12:00:00` : undefined,
    }
    const data = secretaire
      ? await call('/api/cabinet/quotes', {
          method: 'POST', body: JSON.stringify({ ...corps, quote_id: q.id }),
        })
      : await call(`/api/quotes/${q.id}/payments`, { method: 'POST', body: JSON.stringify(corps) })
    if (!data) return
    setPayAmount(''); setPayDate('')
    await refresh(q.id)
  }

  async function deletePayment(q: Quote, paymentId: string) {
    if (!confirm('Supprimer ce versement ?')) return
    const data = await call(`/api/quotes/${q.id}/payments?payment_id=${paymentId}`, { method: 'DELETE' })
    if (data) await refresh(q.id)
  }

  async function genInstallments(q: Quote) {
    if (!echDate) { alert('Choisissez la date de la première échéance.'); return }
    const data = await call(`/api/quotes/${q.id}/installments`, {
      method: 'POST', body: JSON.stringify({ count: Number(echCount), first_date: echDate }),
    })
    if (data) await refresh(q.id)
  }

  async function clearInstallments(q: Quote) {
    const data = await call(`/api/quotes/${q.id}/installments`, { method: 'DELETE' })
    if (data) await refresh(q.id)
  }

  return (
    <div className={sec}>
      <div className={secTitle}>
        <span className="flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4" /> Devis / plan de traitement</span>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Chargement…</p>
      ) : quotes.length === 0 ? (
        <p className="text-xs text-gray-400 italic mb-2">
          {secretaire
            // Ne jamais inviter la secrétaire à faire ce qu'elle ne peut pas :
            // « Créez-en un » l'enverrait chercher un bouton qui n'existe pas.
            ? 'Aucun devis pour ce patient. Seul le médecin peut en créer un.'
            : 'Aucun devis. Créez-en un pour chiffrer un plan de traitement et suivre les paiements du patient.'}
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {quotes.map((q) => {
            const items = q.items ?? []
            const payments = q.payments ?? []
            const echeances = (q.installments ?? []).slice().sort((a, b) => a.due_date.localeCompare(b.due_date))
            const total = quoteTotal(items)
            const paid = quotePaid(payments)
            const reste = quoteRemaining(items, payments)
            const ouvert = openId === q.id

            return (
              <li key={q.id} className="border border-gray-100 rounded-lg">
                {/* En-tête repliable : l'essentiel tient sur cette ligne */}
                <button
                  onClick={() => setOpenId(ouvert ? null : q.id)}
                  className="w-full text-left p-2.5 flex items-center gap-2 hover:bg-gray-50 rounded-lg"
                >
                  {ouvert ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-800 truncate">
                      {q.label || `Devis du ${formatDateShort(q.created_at)}`}
                    </span>
                    <span className="block text-[11px] text-gray-400">
                      {items.length} acte{items.length > 1 ? 's' : ''} · {total.toLocaleString('fr-FR')} DH · versé {paid.toLocaleString('fr-FR')} DH
                    </span>
                  </span>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${QUOTE_STATUS_COLORS[q.status]}`}>
                    {QUOTE_STATUS_LABELS[q.status]}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[10px] text-gray-400 uppercase tracking-wide">Reste dû</span>
                    <span className={`block text-base font-bold ${reste > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {reste.toLocaleString('fr-FR')} DH
                    </span>
                  </span>
                </button>

                {ouvert && (
                  <div className="border-t border-gray-100 p-3 space-y-4">
                    {/* ── Actes ───────────────────────────────────────── */}
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Actes prévus</p>
                      {items.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucun acte pour l&apos;instant.</p>
                      ) : (
                        <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                          {items.slice().sort((a, b) => a.position - b.position).map((it) => (
                            <li key={it.id} className="flex items-center gap-2 px-2.5 py-1.5">
                              {secretaire ? (
                                // Même pastille, sans le bouton : « réalisé » est
                                // un constat de soin, pas une information d'accueil.
                                <span
                                  title={it.done ? 'Acte réalisé' : 'Acte non réalisé'}
                                  className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 text-transparent'}`}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              ) : (
                                <button
                                  onClick={() => toggleDone(q, it.id, !it.done)}
                                  disabled={busy}
                                  title={it.done ? 'Marquer comme non réalisé' : 'Marquer comme réalisé'}
                                  className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent hover:border-primary-400'}`}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
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
                              {!secretaire && (
                                <button onClick={() => deleteItem(q, it.id)} disabled={busy}
                                  className="text-gray-300 hover:text-red-500 shrink-0" title="Retirer cet acte">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Ajout d'un acte — jamais côté secrétaire : ajouter une
                          ligne, c'est décider d'un soin et de son prix. */}
                      {!secretaire && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {dental && (
                          <input value={itTooth} onChange={(e) => setItTooth(e.target.value)} placeholder="Dent"
                            title="Numéro de dent (notation FDI, ex. 16) — facultatif"
                            className={`${inputCls} w-16`} />
                        )}
                        <input value={itLabel} onChange={(e) => setItLabel(e.target.value)} placeholder="Acte (ex. couronne)"
                          className={`${inputCls} flex-1 min-w-[130px]`} />
                        <input value={itPrice} onChange={(e) => setItPrice(e.target.value)} type="number" min="0" placeholder="DH"
                          className={`${inputCls} w-20`} />
                        <input value={itQty} onChange={(e) => setItQty(e.target.value)} type="number" min="1" placeholder="Qté"
                          className={`${inputCls} w-14`} />
                        <Button size="sm" onClick={() => addItem(q)} disabled={busy} className="h-[30px] text-xs">
                          <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
                        </Button>
                      </div>
                      )}
                    </div>

                    {/* ── Totaux ──────────────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-50 rounded-lg py-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total du devis</p>
                        <p className="text-sm font-semibold text-gray-800">{total.toLocaleString('fr-FR')} DH</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg py-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Déjà versé</p>
                        <p className="text-sm font-semibold text-gray-800">{paid.toLocaleString('fr-FR')} DH</p>
                      </div>
                      <div className={`rounded-lg py-2 ${reste > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Reste dû</p>
                        <p className={`text-sm font-bold ${reste > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                          {reste.toLocaleString('fr-FR')} DH
                        </p>
                      </div>
                    </div>

                    {/* ── Versements encaissés ────────────────────────── */}
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Versements reçus
                      </p>
                      {payments.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucun versement encaissé.</p>
                      ) : (
                        <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                          {payments.slice().sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map((p) => (
                            <li key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                              <span className="text-gray-500 w-16 shrink-0">{formatDateShort(p.paid_at)}</span>
                              <span className="flex-1 text-gray-500 truncate">
                                {p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '—'}
                                {p.invoice_no && <span className="text-gray-400"> · {p.invoice_no}</span>}
                              </span>
                              <span className="font-medium text-gray-900 whitespace-nowrap tabular-nums">
                                {Number(p.amount).toLocaleString('fr-FR')} DH
                              </span>
                              {/* Côté secrétaire : ni impression, ni suppression.
                                  La page /facture/devis/[id] exige un compte
                                  médecin (elle ne s'ouvrirait pas), et défaire
                                  une recette est un acte comptable du praticien. */}
                              {!secretaire && (p.invoice_no ? (
                                <a href={`/facture/devis/${p.id}`} target="_blank" rel="noopener noreferrer"
                                  className="text-primary-500 hover:text-primary-700 shrink-0" title="Imprimer la facture">
                                  <Printer className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <button onClick={() => deletePayment(q, p.id)} disabled={busy}
                                  className="text-gray-300 hover:text-red-500 shrink-0" title="Supprimer ce versement">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ))}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Saisie d'un versement — le seul geste d'écriture que la
                          secrétaire puisse avoir, et seulement si le médecin a
                          coché « Encaisser sur un devis ». */}
                      {peutEncaisser && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} type="number" min="0"
                          placeholder="Montant reçu (DH)" className={`${inputCls} flex-1 min-w-[120px]`} />
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} className={inputCls}>
                          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                            <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                          ))}
                        </select>
                        <input value={payDate} onChange={(e) => setPayDate(e.target.value)} type="date"
                          title="Date du règlement (vide = aujourd'hui)" className={inputCls} />
                        <Button size="sm" onClick={() => addPayment(q)} disabled={busy} className="h-[30px] text-xs">
                          Encaisser
                        </Button>
                      </div>
                      )}
                    </div>

                    {/* ── Échéancier prévisionnel ─────────────────────── */}
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" /> Échéancier prévu
                      </p>
                      {echeances.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Aucun échéancier.</p>
                      ) : (
                        <>
                          <ul className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                            {echeances.map((e) => (
                              <li key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
                                <span className="text-gray-600 flex-1">{formatDateShort(e.due_date)}</span>
                                <span className="text-gray-700 tabular-nums">{Number(e.amount).toLocaleString('fr-FR')} DH</span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {echeances.length} échéance{echeances.length > 1 ? 's' : ''} ·
                            {' '}{installmentsTotal(echeances).toLocaleString('fr-FR')} DH prévus.
                            {' '}<span className="italic">Prévisionnel : ce n&apos;est pas de l&apos;argent reçu.</span>
                          </p>
                        </>
                      )}

                      {/* L'échéancier se LIT côté secrétaire (elle doit pouvoir
                          dire au patient ce qui est prévu), il ne se refait pas :
                          rééchelonner un plan de paiement est un accord entre le
                          praticien et son patient. */}
                      {!secretaire && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-xs text-gray-500">Étaler le reste dû en</span>
                        <input value={echCount} onChange={(e) => setEchCount(e.target.value)} type="number" min="1" max="60"
                          className={`${inputCls} w-14`} />
                        <span className="text-xs text-gray-500">fois, à partir du</span>
                        <input value={echDate} onChange={(e) => setEchDate(e.target.value)} type="date" className={inputCls} />
                        <Button size="sm" variant="outline" onClick={() => genInstallments(q)} disabled={busy} className="h-[30px] text-xs">
                          Générer
                        </Button>
                        {echeances.length > 0 && (
                          <button onClick={() => clearInstallments(q)} disabled={busy}
                            className="text-[11px] text-gray-400 hover:text-red-500">Effacer</button>
                        )}
                      </div>
                      )}
                    </div>

                    {/* ── Statut et suppression ─────────────────────────
                        Le statut du devis (proposé, accepté, refusé, annulé) dit
                        où en est la décision du patient face au plan proposé :
                        il appartient au praticien. La secrétaire le lit sur la
                        pastille de l'en-tête, elle n'en change pas. */}
                    {!secretaire && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100">
                      <span className="text-xs text-gray-500">Statut :</span>
                      <select value={STATUS_CHOICES.includes(q.status) ? q.status : ''} disabled={busy}
                        onChange={(e) => setStatus(q, e.target.value as QuoteStatus)} className={inputCls}>
                        {!STATUS_CHOICES.includes(q.status) && (
                          <option value="">{QUOTE_STATUS_LABELS[q.status]}</option>
                        )}
                        {STATUS_CHOICES.map((s) => <option key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</option>)}
                      </select>
                      <button onClick={() => deleteQuote(q)} disabled={busy}
                        className="ml-auto text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer ce devis
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Création — médecin uniquement : chiffrer un plan de traitement est
          une décision clinique et commerciale. */}
      {!secretaire && (
      <div className="flex flex-wrap items-center gap-1.5">
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Intitulé du devis (optionnel)" className={`${inputCls} flex-1 min-w-[140px]`} />
        <Button size="sm" onClick={createQuote} disabled={busy} className="h-[30px] text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> Nouveau devis
        </Button>
      </div>
      )}
    </div>
  )
}
