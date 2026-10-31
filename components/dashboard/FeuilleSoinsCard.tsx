'use client'

// Feuille de soins — établissement et suivi, depuis la consultation ou le dossier.
//
// CE QUE L'ÉCRAN DOIT FAIRE DISPARAÎTRE
//
// Aujourd'hui le praticien recopie à la main, sur un formulaire, ce que le
// logiciel sait déjà : son identité, celle du patient, l'organisme, la date,
// les actes et leurs montants. L'écran ne demande donc QUE ce que la machine
// ne peut pas deviner — le code de nomenclature de chaque acte — et encore :
// une seule fois, puisqu'il est ensuite proposé avec l'acte.
//
// ── ON COCHE, ON NE SAISIT PAS ──────────────────────────────────────────────
//
// La première version pré-remplissait des lignes et ouvrait un éditeur. Ce
// n'est pas le même geste : le praticien sortait de son fauteuil pour relire
// un tableau. Ici il voit ses actes terminés, il coche ceux qui partent sur
// cette feuille, et c'est tout. L'éditeur reste, derrière « ajouter un acte
// hors plan de traitement », pour ce qui n'était pas prévu.
//
// Le reste vient du dossier et des paramètres : identité, organisme, numéros
// de l'assuré, INPE, ville, date. Le formulaire de l'organisme se remplit
// seul et sort sur une feuille A4 blanche.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatDateShort } from '@/lib/utils'
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'
import { STATUT_FEUILLE_LABELS, STATUTS_FEUILLE, totalFeuille, resteACharge, type StatutFeuille, type FeuilleSuivi } from '@/lib/feuilles-soins'
import { ORGANISMES, organismePour } from '@/lib/organismes'
import { alertesFeuille, type AlerteFeuille } from '@/lib/feuille-regles'
import type { ImageDentaire } from '@/lib/imagerie'
import { AlertTriangle, FileSpreadsheet, Info, Plus, Printer, Trash2, XCircle } from 'lucide-react'

const inputCls = 'text-xs border border-gray-200 rounded-lg px-2 py-1.5'

export interface ActeSuggere { tooth?: string | null; label: string; amount: number }

interface Ligne {
  /** L'acte du plan de traitement dont vient cette ligne, quand elle a été
   *  cochée plutôt que tapée. Sert à décocher. */
  origine?: string
  tooth: string
  code: string
  label: string
  amount: string
  acteDate: string
  lettreCle: string
  coefficient: string
  valeurCle: string
}

/** Un acte terminé du plan de traitement, proposé à cocher. */
interface Candidat {
  cle: string
  tooth: string | null
  label: string
  amount: number
  jour: string
}

const LIGNE_VIDE: Ligne = {
  tooth: '', code: '', label: '', amount: '',
  acteDate: '', lettreCle: '', coefficient: '', valeurCle: '',
}

/** Au-delà, l'acte est trop ancien pour partir sur une feuille neuve : tous
 *  les organismes ont déjà fermé leur délai de dépôt. L'afficher ne ferait
 *  qu'allonger la liste à cocher. */
const JOURS_CANDIDATS = 120

interface Feuille {
  id: string
  care_date: string
  total: number
  status: StatutFeuille
  insurer: string | null
  items?: { id: string; tooth: string | null; code: string | null; label: string; amount: number }[]
}

export default function FeuilleSoinsCard({
  patientId, appointmentId = null, dental = false, mutuelle = null, suggestions = [],
  images = null, inpe = null, declencheur = 0,
}: {
  patientId: string
  appointmentId?: string | null
  /** Dentiste : la colonne « dent » n'a de sens que là. */
  dental?: boolean
  /** Organisme de la fiche patient : il commande le formulaire imprimé. */
  mutuelle?: string | null
  /** Actes du jour calculés côté serveur — le repli quand le plan de
   *  traitement n'est pas lisible depuis le navigateur. */
  suggestions?: ActeSuggere[]
  /** L'imagerie du patient, pour vérifier la règle des six mois de l'ANAM.
   *  Le dossier patient l'a déjà sous la main et la passe ; la consultation ne
   *  l'affiche pas, et laisse donc l'encart la chercher lui-même — à `null`,
   *  et non à `[]`, qui voudrait dire « ce patient n'a aucun cliché » et ferait
   *  conclure à tort que la radio manque. */
  images?: ImageDentaire[] | null
  /** L'INPE du praticien : obligatoire sur tout imprimé AMO. */
  inpe?: string | null
  /** Compteur qu'un écran extérieur incrémente pour ouvrir la feuille et
   *  l'amener sous les yeux. L'écran de consultation s'en sert : son bouton
   *  « Feuille de soins » est dans la colonne d'actions, à droite, alors que
   *  l'encart est au milieu, sous le reste du dossier. */
  declencheur?: number
}) {
  // L'organisme de CETTE feuille.
  //
  // Il venait uniquement de la fiche patient. Un patient dont la case
  // « Mutuelle » n'avait pas été remplie — le cas de toute fiche créée à la
  // volée au comptoir — ressortait donc avec la feuille neutre de MonRDV au
  // lieu de l'imprimé de sa caisse, sans que rien n'explique pourquoi. Le
  // praticien devait deviner qu'il fallait d'abord aller modifier la fiche.
  //
  // Il se choisit maintenant devant la feuille, et c'est lui qui commande le
  // formulaire imprimé.
  const [organismeChoisi, setOrganismeChoisi] = useState(mutuelle ?? '')
  const organisme = organismePour(organismeChoisi)
  const [feuilles, setFeuilles] = useState<Feuille[]>([])
  const [activee, setActivee] = useState(true)
  const [actes, setActes] = useState<{ label: string; code: string | null; amount: number }[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [candidats, setCandidats] = useState<Candidat[]>([])
  const [nature, setNature] = useState<'execution' | 'entente_prealable'>('execution')
  const [typesSoins, setTypesSoins] = useState<string[]>([])
  const [ententeNo, setEntenteNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState(false)
  /** Les clichés, quand l'écran appelant ne les a pas. */
  const [imagesLues, setImagesLues] = useState<ImageDentaire[]>([])
  const cliches = images ?? imagesLues
  const bloc = useRef<HTMLDivElement>(null)

  const charger = useCallback(async () => {
    const res = await fetch(`/api/feuilles-soins?patient_id=${patientId}`)
    const data = await res.json().catch(() => ({}))
    // Une lecture qui échoue n'est pas une absence de feuille. L'encart
    // affichait « Aucune feuille établie pour ce patient » sur une erreur 500 :
    // le praticien en concluait que son document n'existait pas, et le
    // réétablissait. On dit maintenant que c'est la lecture qui a échoué.
    if (!res.ok) { setErreur(true); return }
    setErreur(false)
    setFeuilles(data.feuilles ?? [])
    setActivee(data.activee !== false)
  }, [patientId])

  useEffect(() => { charger() }, [charger])
  useEffect(() => {
    fetch('/api/feuilles-soins/actes')
      .then((r) => (r.ok ? r.json() : { actes: [] }))
      .then((d) => setActes(d.actes ?? []))
      .catch(() => { /* catalogue vide : on saisit à la main */ })
  }, [])

  /** Les actes du plan marqués « réalisés », du plus récent au plus ancien.
   *
   *  Relus à l'instant où l'on ouvre la feuille, et non reçus du serveur au
   *  chargement de l'écran : l'ordre réel est l'inverse — le praticien soigne,
   *  coche ses actes dans « Actes du jour », PUIS établit la feuille. Les
   *  actes cochés depuis l'affichage de la page manquaient donc toujours.
   *
   *  On remonte quatre mois et non le jour même : une feuille porte couramment
   *  plusieurs séances, et c'est bien ce que demandent les formulaires, qui
   *  ont une colonne « Dates des actes » sur CHAQUE ligne. */
  async function chargerCandidats(): Promise<Candidat[]> {
    try {
      const res = await fetch(`/api/quotes?patient_id=${encodeURIComponent(patientId)}`)
      if (!res.ok) return []
      const data = (await res.json()) as { quotes?: { id?: string; status?: string; items?: { id?: string; tooth: string | null; label: string; unit_price: number; quantity: number; done: boolean; done_at: string | null }[] }[] }
      const limite = new Date(Date.now() - JOURS_CANDIDATS * 86400000).toISOString().slice(0, 10)
      return (data.quotes ?? [])
        .filter((q) => q.status !== 'refuse' && q.status !== 'annule')
        .flatMap((q) => (q.items ?? []).map((it, i) => ({ it, cle: it.id ?? `${q.id ?? 'q'}-${i}` })))
        .filter(({ it }) => it.done && (it.done_at ?? '').slice(0, 10) >= limite)
        .map(({ it, cle }) => ({
          cle,
          tooth: it.tooth,
          label: it.label,
          amount: Number(it.unit_price) * (it.quantity || 1),
          jour: (it.done_at ?? '').slice(0, 10),
        }))
        .sort((a, b) => b.jour.localeCompare(a.jour))
    } catch {
      return []
    }
  }

  /** Une ligne construite à partir d'un acte coché. Le code et le tarif
   *  viennent du catalogue : saisis une fois, ils reviennent tout seuls. */
  function ligneDepuis(c: Candidat): Ligne {
    const connu = actes.find((a) => a.label.toLowerCase().replace(/\s+/g, ' ') === c.label.toLowerCase().replace(/\s+/g, ' '))
    return {
      ...LIGNE_VIDE,
      origine: c.cle,
      tooth: c.tooth ?? '',
      code: connu?.code ?? '',
      label: c.label,
      amount: String(c.amount || connu?.amount || ''),
      acteDate: c.jour,
      lettreCle: dental ? 'D' : '',
    }
  }

  /** Les clichés du patient, lus seulement si personne ne nous les a donnés
   *  et seulement à l'ouverture de la feuille : un écran de consultation ne
   *  doit pas payer cette requête tant qu'on n'établit rien.
   *
   *  Une lecture en échec — la v94 n'est pas passée — laisse la liste vide, ce
   *  qui n'affirme rien : `alertesFeuille` ne conclut à la radio manquante que
   *  sur une imagerie réellement présente. */
  async function chargerCliches() {
    const { data, error } = await createClient()
      .from('patient_documents')
      .select('id, file_path, file_name, file_type, file_size, created_at, dents, type_image, date_examen')
      .eq('patient_id', patientId)
      .not('type_image', 'is', null)
    if (!error) setImagesLues((data ?? []) as ImageDentaire[])
  }

  /** Première ouverture : on charge les actes terminés et on coche ceux du
   *  jour. Le praticien décoche ce qui ne part pas sur cette feuille. */
  async function ouvrir() {
    setOuvert(true)
    if (images === null) chargerCliches()
    if (lignes.length > 0 || candidats.length > 0) return
    const liste = await chargerCandidats()
    setCandidats(liste)
    const aujourdhui = new Date().toLocaleDateString('en-CA')
    const duJour = liste.filter((c) => c.jour === aujourdhui)
    if (duJour.length > 0) {
      setLignes(duJour.map(ligneDepuis))
    } else if (liste.length === 0 && suggestions.length > 0) {
      // Plan de traitement illisible : on garde ce que le serveur avait
      // préparé plutôt que d'ouvrir une feuille vide.
      setLignes(suggestions.map((sg) => ({
        ...LIGNE_VIDE,
        tooth: sg.tooth ?? '',
        label: sg.label,
        amount: String(sg.amount || ''),
        acteDate: aujourdhui,
        lettreCle: dental ? 'D' : '',
      })))
    }
  }

  // Ouverture demandée de l'extérieur : on ouvre, puis on amène l'encart sous
  // les yeux. Sans le défilement, le praticien cliquerait sur un bouton de la
  // colonne de droite et rien ne bougerait à l'écran.
  useEffect(() => {
    if (declencheur === 0 || ouvert) return
    ouvrir()
    bloc.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // `ouvrir` lit l'état du moment : le relancer à chaque rendu rechargerait
    // les actes cochés et effacerait la saisie en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declencheur])

  /** Cocher ou décocher un acte terminé. Décocher n'efface que la ligne qui
   *  en vient : un acte tapé à la main reste. */
  function basculer(c: Candidat) {
    setLignes((prev) => (
      prev.some((l) => l.origine === c.cle)
        ? prev.filter((l) => l.origine !== c.cle)
        : [...prev, ligneDepuis(c)]
    ))
  }

  function majLigne(i: number, champ: keyof Ligne, valeur: string) {
    setLignes((prev) => prev.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)))
  }

  /** Acte choisi dans le catalogue : code et montant suivent, sans écraser ce
   *  que le praticien a déjà tapé. */
  function choisirActe(i: number, label: string) {
    setLignes((prev) => prev.map((l, j) => {
      if (j !== i) return l
      const connu = actes.find((a) => a.label.toLowerCase().replace(/\s+/g, ' ') === label.trim().toLowerCase().replace(/\s+/g, ' '))
      return {
        ...l,
        label,
        code: l.code || connu?.code || '',
        amount: l.amount || (connu ? String(connu.amount) : ''),
      }
    }))
  }

  async function etablir() {
    const items = lignes
      .filter((l) => l.label.trim())
      .map((l) => ({
        tooth: l.tooth || null,
        code: l.code || null,
        label: l.label.trim(),
        amount: Number(String(l.amount || '0').replace(',', '.')),
        acte_date: l.acteDate || null,
        lettre_cle: l.lettreCle || null,
        coefficient: l.coefficient || null,
        valeur_cle: l.valeurCle || null,
      }))
    if (items.length === 0) { alert('Cochez au moins un acte.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/feuilles-soins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId, appointment_id: appointmentId, items,
          insurer: organismeChoisi || null,
          nature, types_soins: typesSoins, entente_no: ententeNo.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error || "La feuille n'a pas pu être établie."); return }
      setLignes([]); setCandidats([]); setTypesSoins([]); setEntenteNo(''); setNature('execution')
      setOuvert(false)
      await charger()
      // Le document s'ouvre tout de suite : c'est pour l'imprimer qu'on l'établit.
      window.open(`/feuille-soins/${data.id}`, '_blank', 'noopener')
    } finally {
      setBusy(false)
    }
  }

  async function changerStatut(f: Feuille, status: StatutFeuille) {
    const res = await fetch(`/api/feuilles-soins/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (res.ok) setFeuilles((prev) => prev.map((x) => (x.id === f.id ? { ...x, status } : x)))
  }

  async function supprimer(f: Feuille) {
    if (!confirm('Supprimer cette feuille de soins ?')) return
    const res = await fetch(`/api/feuilles-soins/${f.id}`, { method: 'DELETE' })
    if (res.ok) setFeuilles((prev) => prev.filter((x) => x.id !== f.id))
  }

  if (!activee) return null

  const total = totalFeuille(lignes.map((l) => ({ amount: l.amount })))

  // Ce qui ferait revenir le dossier, calculé à chaque frappe sur les lignes
  // retenues. Rien n'est bloqué : le praticien connaît son dossier mieux que
  // le logiciel, et une alerte fausse qui empêche d'imprimer est pire que pas
  // d'alerte du tout.
  const aujourdhui = new Date().toLocaleDateString('en-CA')
  const alertes: AlerteFeuille[] = ouvert && organisme
    ? alertesFeuille({
        organisme,
        actes: lignes.filter((l) => l.label.trim()).map((l) => ({
          tooth: l.tooth || null,
          code: l.code || null,
          label: l.label.trim(),
          amount: Number(String(l.amount || '0').replace(',', '.')),
          acte_date: l.acteDate || null,
          lettre_cle: l.lettreCle || null,
          coefficient: l.coefficient || null,
          valeur_cle: l.valeurCle || null,
        })),
        jourFeuille: aujourdhui,
        aujourdhui,
        images: cliches,
        inpe,
        ententePrealable: nature === 'entente_prealable',
        ententeNo,
      })
    : []

  return (
    <div ref={bloc} className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <FileSpreadsheet className="h-4 w-4" /> Feuille de soins
          {mutuelle && <span className="text-[11px] font-medium text-gray-400">· {mutuelle}</span>}
        </h3>
        {!ouvert && (
          <Button size="sm" variant="outline" onClick={ouvrir}>
            <Plus className="h-4 w-4 mr-1" /> Établir
          </Button>
        )}
      </div>

      {ouvert && (
        <div className="space-y-3 mb-4">
          {/* ── Pour quel organisme ? ─────────────────────────────────────
              Première question, et la seule qui change le document : c'est
              elle qui décide si l'on imprime l'imprimé de la CNSS, celui du
              CNOPS, de RMA, des FAR, ou la feuille neutre de MonRDV. */}
          <div className={`rounded-lg p-2.5 ${organisme ? 'bg-gray-50' : 'bg-amber-50 border border-amber-200'}`}>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">
              Organisme — il commande le formulaire imprimé
            </label>
            <select value={organismeChoisi} onChange={(e) => setOrganismeChoisi(e.target.value)}
              className={`${inputCls} w-full bg-white`}>
              <option value="">— à choisir —</option>
              {ORGANISMES.map((o) => <option key={o.cle} value={o.nom}>{o.nom}</option>)}
              {/* L'organisme déjà inscrit sur la fiche, s'il sort de la liste :
                  une saisie libre d'hier ne doit pas disparaître du menu. */}
              {organismeChoisi && !ORGANISMES.some((o) => o.nom === organismeChoisi) && (
                <option value={organismeChoisi}>{organismeChoisi}</option>
              )}
            </select>
            {!organisme && (
              <p className="text-[11px] text-amber-700 mt-1">
                Sans organisme, la feuille sort sous la forme neutre de MonRDV, à agrafer à
                l&apos;imprimé de l&apos;assureur.
              </p>
            )}
            {organisme && organisme.gabarit !== 'neutre' && (
              <p className="text-[11px] text-gray-500 mt-1">
                Le formulaire {organisme.nom} sortira rempli, prêt à imprimer sur une A4 blanche.
              </p>
            )}
            {!mutuelle && organismeChoisi && (
              <p className="text-[11px] text-gray-400 mt-1">
                Il sera aussi inscrit sur la fiche du patient : vous ne le choisirez qu&apos;une fois.
              </p>
            )}
          </div>

          {/* ── Ce qui part sur la feuille ──────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
              Actes terminés — cochez ceux qui partent sur cette feuille
            </p>
            {candidats.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">
                Aucun acte marqué « réalisé » dans le plan de traitement. Ajoutez-les ci-dessous.
              </p>
            ) : (
              <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-56 overflow-auto">
                {candidats.map((c) => {
                  const coche = lignes.some((l) => l.origine === c.cle)
                  // Indice, pas verdict : deux séances identiques sur la même
                  // dent existent. On signale, on n'empêche pas.
                  const deja = feuilles.some((f) => (f.items ?? []).some(
                    (i) => (i.tooth ?? '') === (c.tooth ?? '') && i.label === c.label,
                  ))
                  return (
                    <li key={c.cle}>
                      <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={coche} onChange={() => basculer(c)}
                          className="h-3.5 w-3.5 accent-primary-600" />
                        {c.tooth && (
                          <span className="text-[10px] font-semibold text-gray-500 tabular-nums w-6 shrink-0">{c.tooth}</span>
                        )}
                        <span className="text-xs text-gray-800 truncate flex-1">{c.label}</span>
                        {deja && !coche && (
                          <span className="text-[9.5px] text-amber-600 shrink-0">déjà porté sur une feuille</span>
                        )}
                        <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{formatDateShort(c.jour)}</span>
                        <span className="text-xs font-medium text-gray-700 tabular-nums shrink-0 w-16 text-right">
                          {c.amount.toLocaleString('fr-FR')} DH
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── Les lignes retenues, avec ce que le formulaire exige ─────── */}
          {lignes.length > 0 && (
            <div className="space-y-1.5">
              {lignes.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  {dental && (
                    <select value={l.tooth} onChange={(e) => majLigne(i, 'tooth', e.target.value)}
                      className={`${inputCls} w-[68px] bg-white`} title="Dent (FDI)">
                      <option value="">Dent</option>
                      <optgroup label="Haut">{FDI_UPPER.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                      <optgroup label="Bas">{FDI_LOWER.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                      <optgroup label="Lait — haut">{FDI_UPPER_LAIT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                      <optgroup label="Lait — bas">{FDI_LOWER_LAIT.map((n) => <option key={n} value={String(n)}>{n}</option>)}</optgroup>
                    </select>
                  )}
                  <input value={l.label} onChange={(e) => choisirActe(i, e.target.value)} placeholder="Acte"
                    list="feuille-actes" autoComplete="off" className={`${inputCls} flex-1 min-w-[130px]`} />
                  <input value={l.acteDate} onChange={(e) => majLigne(i, 'acteDate', e.target.value)} type="date"
                    title="Date de cet acte" className={`${inputCls} w-[125px]`} />
                  <input value={l.code} onChange={(e) => majLigne(i, 'code', e.target.value.toUpperCase())}
                    placeholder="Code" title="Code de l'acte (D726…)" className={`${inputCls} w-20 uppercase`} />
                  {/* La cotation : lettre clé, coefficient, valeur de la clé.
                      Trois colonnes distinctes sur le formulaire, et sans
                      elles le dossier revient au cabinet. */}
                  {organisme?.colonneCotation && (
                    <>
                      <input value={l.lettreCle} onChange={(e) => majLigne(i, 'lettreCle', e.target.value.toUpperCase())}
                        placeholder="D" title="Lettre clé" className={`${inputCls} w-10 uppercase text-center`} />
                      <input value={l.coefficient} onChange={(e) => majLigne(i, 'coefficient', e.target.value)} type="number" min="0"
                        placeholder="Coef." title="Coefficient" className={`${inputCls} w-16`} />
                      <input value={l.valeurCle} onChange={(e) => majLigne(i, 'valeurCle', e.target.value)} type="number" min="0"
                        placeholder="Val. clé" title="Valeur de la clé, en dirhams" className={`${inputCls} w-20`} />
                    </>
                  )}
                  <input value={l.amount} onChange={(e) => majLigne(i, 'amount', e.target.value)} type="number" min="0"
                    placeholder="DH" className={`${inputCls} w-20`} />
                  <button onClick={() => setLignes((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500" title="Retirer cette ligne">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <datalist id="feuille-actes">
            {actes.map((a) => (
              <option key={a.label} value={a.label}>{a.code ? `${a.code} · ` : ''}{a.amount} DH</option>
            ))}
          </datalist>

          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setLignes((prev) => [...prev, { ...LIGNE_VIDE, lettreCle: dental ? 'D' : '' }])}
              className="text-xs font-medium text-primary-600 hover:text-primary-700">
              ＋ Ajouter un acte hors plan de traitement
            </button>
            <span className="text-sm font-semibold text-gray-800">Total {total.toLocaleString('fr-FR')} DH</span>
          </div>

          {/* ── Ce que le formulaire de CET organisme demande en plus ────── */}
          {organisme && (organisme.ententePrealable || organisme.typesSoins) && (
            <div className="bg-gray-50 rounded-lg p-2.5 space-y-2">
              {organisme.ententePrealable && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Les mots de l'imprimé, pas les nôtres : le praticien doit
                      retrouver à l'écran ce qu'il coche sur le papier. */}
                  <span className="text-[11px] font-semibold text-gray-500">Type de déclaration</span>
                  {([
                    ['execution', organisme.motsNature?.execution ?? 'Actes exécutés'],
                    ['entente_prealable', organisme.motsNature?.entente ?? 'Demande d\u2019accord préalable'],
                  ] as const).map(([v, lib]) => (
                    <button key={v} onClick={() => setNature(v)}
                      className={`text-[11px] px-2 py-1 rounded-lg border ${nature === v ? 'bg-primary-500 text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {lib}
                    </button>
                  ))}
                </div>
              )}
              {organisme.typesSoins && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-500">Type de soins</span>
                  {organisme.typesSoins.map((t) => (
                    <label key={t.cle} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={typesSoins.includes(t.cle)} className="h-3.5 w-3.5 accent-primary-600"
                        onChange={() => setTypesSoins((prev) => prev.includes(t.cle) ? prev.filter((x) => x !== t.cle) : [...prev, t.cle])} />
                      {t.label}
                    </label>
                  ))}
                </div>
              )}
              {organisme.numeroEntente && nature === 'execution' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 shrink-0">N° d&apos;entente préalable</span>
                  <input value={ententeNo} onChange={(e) => setEntenteNo(e.target.value)}
                    placeholder="s&apos;il y en a une" className={`${inputCls} w-44`} />
                </div>
              )}
            </div>
          )}

          {/* ── Ce qui ferait revenir le dossier ─────────────────────────── */}
          {alertes.length > 0 && (
            <ul className="space-y-1">
              {alertes.map((al, i) => (
                <li key={i} className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] border ${
                  al.niveau === 'bloquant' ? 'bg-red-50 border-red-100 text-red-800'
                  : al.niveau === 'attention' ? 'bg-amber-50 border-amber-100 text-amber-800'
                  : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                  {al.niveau === 'bloquant' ? <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    : al.niveau === 'attention' ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    : <Info className="h-3.5 w-3.5 shrink-0 mt-px" />}
                  <span><span className="font-semibold">{al.titre}.</span> {al.detail}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={etablir} disabled={busy}>
              {busy ? 'Établissement…' : 'Établir et imprimer'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOuvert(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {erreur ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
          Les feuilles de ce patient n&apos;ont pas pu être lues. Rechargez la page ; si le message
          revient, la base n&apos;est pas à jour (migration v65).
        </p>
      ) : feuilles.length === 0 ? (
        !ouvert && <p className="text-xs text-gray-400 italic">Aucune feuille établie pour ce patient.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {feuilles.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2">
              <span className="text-sm text-gray-600 shrink-0">{formatDateShort(f.care_date)}</span>
              <span className="text-xs text-gray-400 truncate flex-1">
                {(f.items ?? []).length} acte{(f.items ?? []).length > 1 ? 's' : ''}
                {f.insurer ? ` · ${f.insurer}` : ''}
              </span>
              <span className="text-sm font-semibold text-gray-800 shrink-0">
                {Number(f.total).toLocaleString('fr-FR')} DH
                {/* Le reste à charge, là où le patient pose la question : au
                    comptoir, sa fiche ouverte. Affiché seulement quand le
                    montant versé est connu — présenter le total comme reste à
                    charge laisserait croire que l'organisme n'a rien versé. */}
                {resteACharge(f as unknown as FeuilleSuivi) != null && (
                  <span className="block text-[10px] font-normal text-gray-400 text-right">
                    reste {resteACharge(f as unknown as FeuilleSuivi)!.toLocaleString('fr-FR')} DH
                  </span>
                )}
              </span>
              <select value={f.status} onChange={(e) => changerStatut(f, e.target.value as StatutFeuille)}
                className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 bg-white shrink-0">
                {STATUTS_FEUILLE.map((s) => <option key={s} value={s}>{STATUT_FEUILLE_LABELS[s]}</option>)}
              </select>
              <a href={`/feuille-soins/${f.id}`} target="_blank" rel="noopener noreferrer"
                className="text-gray-400 hover:text-primary-600 shrink-0" title="Imprimer">
                <Printer className="h-4 w-4" />
              </a>
              <button onClick={() => supprimer(f)} className="text-gray-300 hover:text-red-500 shrink-0" title="Supprimer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
