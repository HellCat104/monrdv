'use client'

// Le pont entre l'odontogramme et le devis.
//
// ── LE GESTE QU'ON RÉPÈTE DIX FOIS PAR JOUR ─────────────────────────────────
//
// Le dentiste coche « obturation à faire » sur la 46, puis change d'onglet,
// ouvre le devis, et retape « Obturation 46 » avec son prix. Les deux écrans
// parlaient de la même chose en s'ignorant.
//
// Ici, le soin planifié sur la dent devient une ligne de devis en un clic. Le
// libellé et la dent sont déduits de ce qui est déjà saisi ; le PRIX, lui, est
// proposé d'après les devis passés du praticien — jamais inventé, jamais codé
// en dur : les tarifs d'un cabinet de Rabat ne sont pas ceux d'un cabinet de
// Taroudant.
//
// ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
//
// Il ne marque rien comme réalisé, et il ne facture rien. Ajouter au devis,
// c'est proposer un acte ; le réaliser et l'encaisser restent deux décisions
// distinctes, prises ailleurs. Confondre les trois est exactement ce qui
// produit les doubles facturations.
import { useCallback, useEffect, useState } from 'react'
import { Plus, Check, FileText } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Devis = Record<string, any>

interface Acte { label: string; unit_price: number }

export default function DentDevis({
  patientId, dent, etatsPlanifies,
}: {
  patientId: string
  dent: string
  /** Les soins marqués « à faire » sur cette dent : eux seuls ont vocation à
   *  entrer dans un devis. Un constat ne se facture pas. */
  etatsPlanifies: { cle: string; label: string }[]
}) {
  const [devis, setDevis] = useState<Devis[]>([])
  const [actes, setActes] = useState<Acte[]>([])
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [libelle, setLibelle] = useState('')
  const [prix, setPrix] = useState('')
  const [cible, setCible] = useState<string>('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')

  const charger = useCallback(async () => {
    try {
      const [q, a] = await Promise.all([
        fetch(`/api/quotes?patient_id=${patientId}`).then((r) => (r.ok ? r.json() : { quotes: [] })),
        fetch('/api/quotes/actes').then((r) => (r.ok ? r.json() : { actes: [] })),
      ])
      setDevis(q.quotes ?? [])
      setActes(a.actes ?? [])
    } catch { /* silencieux : l'odontogramme reste utilisable sans le devis */ }
  }, [patientId])
  useEffect(() => { charger() }, [charger])

  // Les devis encore ouverts : on ne vient pas ajouter une ligne à un devis
  // refusé ou terminé, qui est une pièce close.
  const ouverts = devis.filter((d) => ['brouillon', 'propose', 'accepte'].includes(d.status))

  // Ce qui figure DÉJÀ au devis pour cette dent — la moitié de l'intérêt du
  // pont : savoir qu'on l'a déjà proposé évite de le proposer deux fois.
  const lignesDeLaDent = devis.flatMap((d: Devis) =>
    (d.items ?? [])
      .filter((i: Devis) => String(i.tooth ?? '') === dent)
      .map((i: Devis) => ({ ...i, devis: d })))

  function commencer(cle: string, label: string) {
    setErreur(''); setMessage('')
    setOuvert(cle)
    setLibelle(`${label} — dent ${dent}`)
    // Le prix du même acte dans un devis précédent, s'il y en a un.
    const connu = actes.find((a) => a.label.toLowerCase().includes(label.toLowerCase()))
    setPrix(connu ? String(connu.unit_price) : '')
    setCible(ouverts[0]?.id ?? '')
  }

  async function ajouter() {
    const montant = Number(prix)
    if (!libelle.trim()) { setErreur('Donnez un libellé à l’acte.'); return }
    if (!Number.isFinite(montant) || montant < 0) { setErreur('Prix invalide.'); return }
    setEnCours(true); setErreur('')
    try {
      let quoteId = cible
      // Pas de devis ouvert : on en crée un. Le praticien n'a pas à sortir de
      // l'odontogramme pour ça.
      if (!quoteId) {
        const r = await fetch('/api/quotes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patient_id: patientId, label: 'Plan de traitement' }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Création du devis impossible')
        quoteId = d.quote?.id ?? d.id
      }
      const r2 = await fetch(`/api/quotes/${quoteId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: libelle.trim(), unit_price: montant, quantity: 1, tooth: dent }),
      })
      const d2 = await r2.json().catch(() => ({}))
      if (!r2.ok) throw new Error(d2.error || 'Ajout impossible')
      setOuvert(null); setMessage('Ajouté au devis.')
      setTimeout(() => setMessage(''), 3000)
      await charger()
    } catch (e) {
      setErreur((e as Error).message)
    } finally { setEnCours(false) }
  }

  if (etatsPlanifies.length === 0 && lignesDeLaDent.length === 0) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <FileText className="h-3 w-3" /> Devis
      </p>

      {/* Déjà proposé pour cette dent. On le dit AVANT d'offrir d'ajouter :
          c'est ce qui évite la ligne en double. */}
      {lignesDeLaDent.map((l) => (
        <p key={l.id} className="text-[11px] text-gray-600 flex items-center gap-1.5 flex-wrap">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${l.done ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          {l.label} · {Number(l.unit_price).toFixed(2)} DH
          <span className="text-gray-400">{l.done ? '· fait' : '· à faire'}</span>
        </p>
      ))}

      {etatsPlanifies.map((e) => (
        <div key={e.cle}>
          {ouvert === e.cle ? (
            <div className="space-y-1.5 bg-white border border-primary-200 rounded-lg p-2">
              <input value={libelle} onChange={(ev) => setLibelle(ev.target.value)}
                className="w-full text-[12px] rounded border border-gray-200 px-2 py-1" placeholder="Libellé de l’acte" />
              <div className="flex items-center gap-1.5">
                <input value={prix} onChange={(ev) => setPrix(ev.target.value)} inputMode="decimal"
                  list="tarifs-connus"
                  className="w-24 text-[12px] rounded border border-gray-200 px-2 py-1" placeholder="Prix" />
                <span className="text-[11px] text-gray-400">DH</span>
                <datalist id="tarifs-connus">
                  {actes.slice(0, 20).map((a) => <option key={a.label} value={a.unit_price}>{a.label}</option>)}
                </datalist>
                {ouverts.length > 0 && (
                  <select value={cible} onChange={(ev) => setCible(ev.target.value)}
                    className="text-[11px] rounded border border-gray-200 px-1.5 py-1 text-gray-600">
                    {ouverts.map((d) => (
                      <option key={d.id} value={d.id}>{d.label || 'Devis'} · {d.status}</option>
                    ))}
                    <option value="">Nouveau devis</option>
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={ajouter} disabled={enCours}
                  className="text-[11px] bg-primary-500 text-white rounded px-2 py-1 hover:bg-primary-600 disabled:opacity-60">
                  {enCours ? 'Ajout…' : 'Ajouter au devis'}
                </button>
                <button type="button" onClick={() => setOuvert(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
                  Annuler
                </button>
              </div>
              {/* Le prix proposé vient de SES devis, et il reste modifiable. */}
              <p className="text-[10px] text-gray-400">
                Prix repris de vos devis précédents quand l’acte y figure. Rien n’est imposé.
              </p>
            </div>
          ) : (
            <button type="button" onClick={() => commencer(e.cle, e.label)}
              className="text-[11px] inline-flex items-center gap-1 text-primary-600 hover:text-primary-700">
              <Plus className="h-3 w-3" /> {e.label} au devis
            </button>
          )}
        </div>
      ))}

      {erreur && <p className="text-[11px] text-red-600">{erreur}</p>}
      {message && <p className="text-[11px] text-emerald-700 flex items-center gap-1"><Check className="h-3 w-3" /> {message}</p>}
    </div>
  )
}
