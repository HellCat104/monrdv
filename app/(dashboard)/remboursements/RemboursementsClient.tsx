'use client'

// L'écran du suivi des remboursements.
//
// ── CE QU'IL MONTRE D'ABORD ─────────────────────────────────────────────────
//
// Deux listes, et dans cet ordre : ce qui n'est jamais parti du cabinet, puis
// ce qui est parti et n'est pas revenu. Les feuilles remboursées sont
// rangées en dessous — une affaire classée ne se relit pas.
//
// ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
//
// Aucun total n'est présenté comme une recette ou une créance. Le patient a
// déjà réglé le cabinet ; ce que ces montants attendent, c'est LUI qui
// l'attend. Les confondre ferait apparaître dans la caisse un argent qui n'y
// entrera jamais.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Receipt, Search, AlertTriangle, Check, Clock, ExternalLink } from 'lucide-react'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  bilanFeuilles, departAttente, joursEcoules, resteACharge, nomPatient,
  JOURS_SANS_RETOUR, STATUT_FEUILLE_LABELS,
  type FeuilleSuivi, type StatutFeuille,
} from '@/lib/feuilles-soins'
import { jourMaroc } from '@/lib/stock'

type Vue = 'a_remettre' | 'en_attente' | 'remboursees' | 'tout'

export default function RemboursementsClient() {
  const [feuilles, setFeuilles] = useState<FeuilleSuivi[]>([])
  const [chargement, setChargement] = useState(true)
  const [activee, setActivee] = useState(true)
  // Les colonnes de suivi (v90) manquent : l'écran marche, il sait seulement
  // moins de choses, et il le dit plutôt que d'afficher des cases mortes.
  const [suivi, setSuivi] = useState(true)
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [vue, setVue] = useState<Vue>('en_attente')
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)

  const aujourdhui = jourMaroc(getNowInMaroc())

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/feuilles-soins?suivi=1')
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErreur(d.error || 'Lecture impossible'); return }
      setActivee(d.activee !== false)
      setSuivi(d.suivi !== false)
      setFeuilles(d.feuilles ?? [])
    } catch {
      setErreur('Les feuilles de soins n’ont pas pu être chargées.')
    } finally { setChargement(false) }
  }, [])
  useEffect(() => { charger() }, [charger])

  const bilan = useMemo(() => bilanFeuilles(feuilles, aujourdhui), [feuilles, aujourdhui])

  // La vue par défaut suit ce qu'il y a à faire : rien ne sert d'ouvrir sur
  // « en attente » quand cinq feuilles dorment, imprimées et jamais remises.
  const [vueReglee, setVueReglee] = useState(false)
  useEffect(() => {
    if (vueReglee || chargement) return
    if (bilan.aRemettre.length > 0) setVue('a_remettre')
    setVueReglee(true)
  }, [vueReglee, chargement, bilan.aRemettre.length])

  const visibles = useMemo(() => {
    let liste: FeuilleSuivi[]
    if (vue === 'a_remettre') liste = bilan.aRemettre
    else if (vue === 'en_attente') liste = bilan.enAttente
    else if (vue === 'remboursees') liste = feuilles.filter((f) => f.status === 'remboursee')
    else liste = feuilles
    const q = recherche.trim().toLowerCase()
    if (q) liste = liste.filter((f) => `${nomPatient(f)} ${f.insurer ?? ''}`.toLowerCase().includes(q))
    return liste
  }, [vue, bilan, feuilles, recherche])

  async function modifier(f: FeuilleSuivi, champs: Record<string, unknown>) {
    setErreur('')
    const r = await fetch(`/api/feuilles-soins/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErreur(d.error || 'Modification impossible'); return false }
    setFeuilles((xs) => xs.map((x) => (x.id === f.id ? { ...x, ...d } : x)))
    if (d.suiviIgnore) {
      setErreur('Le statut est enregistré, mais les dates attendent une migration de la base (v90).')
    } else {
      setMessage('Enregistré.')
      setTimeout(() => setMessage(''), 2500)
    }
    return true
  }

  if (!activee) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-sm text-gray-500">Les feuilles de soins attendent une migration de la base (v65).</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary-500" /> Remboursements
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Les feuilles de soins de tout le cabinet : celles qui dorment, et celles qui ne reviennent pas.
        </p>
      </div>

      {!suivi && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Les dates de remise et les montants remboursés attendent une migration de la base (v90).
          Le reste de l’écran fonctionne.
        </p>
      )}

      {!bilan.rien && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> À traiter
          </p>
          {bilan.aRemettre.length > 0 && (
            <p>
              {bilan.aRemettre.length} feuille{bilan.aRemettre.length > 1 ? 's' : ''} établie
              {bilan.aRemettre.length > 1 ? 's' : ''} il y a plus d’une semaine et jamais remise
              {bilan.aRemettre.length > 1 ? 's' : ''} au patient.
            </p>
          )}
          {bilan.souffrance.length > 0 && (
            <p className="text-red-700">
              {bilan.souffrance.length} dossier{bilan.souffrance.length > 1 ? 's' : ''} déposé
              {bilan.souffrance.length > 1 ? 's' : ''} depuis plus de {JOURS_SANS_RETOUR} jours sans retour.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['a_remettre', `À remettre${bilan.aRemettre.length ? ` (${bilan.aRemettre.length})` : ''}`],
          ['en_attente', `En attente${bilan.enAttente.length ? ` (${bilan.enAttente.length})` : ''}`],
          ['remboursees', 'Remboursées'],
          ['tout', `Tout (${feuilles.length})`],
        ] as [Vue, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setVue(k)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border transition ${
              vue === k ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Patient, organisme…"
            className="text-xs rounded-lg border border-gray-200 pl-8 pr-2 py-1.5 w-52" />
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erreur}</p>}
      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <Check className="h-4 w-4" /> {message}
        </p>
      )}

      {chargement ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : visibles.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm text-gray-600">
            {vue === 'a_remettre' ? 'Aucune feuille en attente d’être remise : tout est parti.'
             : vue === 'en_attente' ? 'Aucun dossier en attente de remboursement.'
             : vue === 'remboursees' ? 'Aucune feuille marquée remboursée pour l’instant.'
             : 'Aucune feuille de soins établie. Elles se créent depuis le dossier d’un patient couvert.'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibles.map((f) => (
            <Ligne key={f.id} f={f} aujourdhui={aujourdhui} suivi={suivi}
              ouvert={ouvert === f.id}
              onBasculer={() => setOuvert(ouvert === f.id ? null : f.id)}
              onModifier={modifier} />
          ))}
        </div>
      )}

      {bilan.enAttente.length > 0 && (
        <p className="text-[11px] text-gray-400 max-w-3xl">
          {bilan.montantEnAttente.toLocaleString('fr-FR')} DH de soins sont en attente de
          remboursement. Cette somme n’est <strong>pas</strong> une créance du cabinet : vos patients
          vous ont déjà réglé, c’est eux que leur organisme doit rembourser. Elle n’entre dans
          aucun total de caisse.
        </p>
      )}
    </div>
  )
}

function Ligne({
  f, aujourdhui, suivi, ouvert, onBasculer, onModifier,
}: {
  f: FeuilleSuivi
  aujourdhui: string
  suivi: boolean
  ouvert: boolean
  onBasculer: () => void
  onModifier: (f: FeuilleSuivi, champs: Record<string, unknown>) => Promise<boolean>
}) {
  const depart = departAttente(f)
  const jours = joursEcoules(depart.jour, aujourdhui)
  const alerte = f.status === 'remise' && jours >= JOURS_SANS_RETOUR
  const reste = resteACharge(f)
  const [montant, setMontant] = useState(f.montant_rembourse != null ? String(f.montant_rembourse) : '')
  const [leJour, setLeJour] = useState(f.rembourse_le ?? '')
  const [remiseLe, setRemiseLe] = useState(f.remise_le ?? '')
  const [occupe, setOccupe] = useState(false)

  const couleur = alerte ? 'border-red-200 bg-red-50'
    : f.status === 'remboursee' ? 'border-gray-200 bg-white'
    : f.status === 'etablie' ? 'border-amber-200 bg-amber-50'
    : 'border-gray-200 bg-white'

  return (
    <div className={`border rounded-xl ${couleur}`}>
      <div className="flex items-center gap-2 p-2.5 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {nomPatient(f)}
            {f.insurer && <span className="text-[11px] text-gray-400 font-normal ml-1.5">{f.insurer}</span>}
          </p>
          <p className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
            <span>soins du {formatDateShort(f.care_date)}</span>
            {f.status === 'remise' && (
              <span className={alerte ? 'text-red-700 font-semibold' : ''}>
                <Clock className="h-3 w-3 inline -mt-0.5 mr-0.5" />
                {/* « au plus tôt » quand la date de remise manque : la date des
                    soins est une borne sûre, pas le jour réel du dépôt. */}
                {jours === 0 && !depart.estime
                  ? 'remise aujourd’hui'
                  : `en attente depuis ${depart.estime ? 'au plus tôt ' : ''}${jours} jour${jours > 1 ? 's' : ''}`}
              </span>
            )}
            {f.status === 'remboursee' && f.rembourse_le && (
              <span className="text-emerald-700">remboursé le {formatDateShort(f.rembourse_le)}</span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-gray-800">{Number(f.total).toLocaleString('fr-FR')} DH</p>
          {reste != null && (
            <p className="text-[11px] text-gray-500">
              remboursé {Number(f.montant_rembourse).toLocaleString('fr-FR')} · reste {reste.toLocaleString('fr-FR')} DH
            </p>
          )}
        </div>

        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          f.status === 'remboursee' ? 'bg-emerald-100 text-emerald-800'
          : f.status === 'remise' ? (alerte ? 'bg-red-200 text-red-900' : 'bg-sky-100 text-sky-800')
          : 'bg-amber-200 text-amber-900'}`}>
          {STATUT_FEUILLE_LABELS[f.status as StatutFeuille]}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {f.status === 'etablie' && (
            <button type="button" disabled={occupe}
              onClick={async () => { setOccupe(true); await onModifier(f, { status: 'remise' }); setOccupe(false) }}
              className="text-[11px] font-medium bg-primary-500 text-white rounded-lg px-2.5 py-1 hover:bg-primary-600 disabled:opacity-60">
              Remise au patient
            </button>
          )}
          {f.status !== 'remboursee' && (
            <button type="button" onClick={onBasculer}
              className="text-[11px] text-primary-600 hover:text-primary-700 px-1">
              Remboursement
            </button>
          )}
          <a href={`/feuille-soins/${f.id}`} target="_blank" rel="noopener noreferrer"
            title="Ouvrir la feuille" className="text-gray-400 hover:text-primary-600">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {ouvert && (
        <div className="border-t border-gray-200 bg-white rounded-b-xl p-3 space-y-2">
          {!suivi ? (
            <p className="text-[11px] text-gray-500">
              Les dates et le montant remboursé attendent une migration de la base (v90).
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[11px] text-gray-500">Remise au patient le</span>
                  <input type="date" value={remiseLe} onChange={(e) => setRemiseLe(e.target.value)}
                    className="w-full text-sm rounded-lg border border-gray-200 px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Remboursé le</span>
                  <input type="date" value={leJour} onChange={(e) => setLeJour(e.target.value)}
                    className="w-full text-sm rounded-lg border border-gray-200 px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Montant remboursé (DH)</span>
                  <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal"
                    placeholder="laisser vide si inconnu"
                    className="w-full text-sm rounded-lg border border-gray-200 px-2 py-1.5" />
                </label>
              </div>
              <p className="text-[11px] text-gray-400">
                Les organismes remboursent une part. Le montant versé permet de dire au patient
                ce qui est resté à sa charge — il n’entre dans aucun total du cabinet.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={occupe}
                  onClick={async () => {
                    setOccupe(true)
                    // Un champ de date LAISSÉ VIDE n'est pas envoyé : le
                    // serveur note alors le jour du geste. L'envoyer à vide
                    // lui disait « efface cette date », et « Marquer
                    // remboursée » perdait en silence le jour du
                    // remboursement — six mois plus tard, on ne savait plus
                    // quand l'organisme avait payé.
                    //
                    // Effacer une date reste possible : c'est le bouton
                    // « Enregistrer sans changer le statut », qui corrige la
                    // fiche au lieu de constater un fait du jour.
                    const ok = await onModifier(f, {
                      status: 'remboursee',
                      ...(remiseLe ? { remise_le: remiseLe } : {}),
                      ...(leJour ? { rembourse_le: leJour } : {}),
                      montant_rembourse: montant,
                    })
                    setOccupe(false)
                    if (ok) onBasculer()
                  }}
                  className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-60">
                  {occupe ? 'Enregistrement…' : 'Marquer remboursée'}
                </button>
                <button type="button" disabled={occupe}
                  onClick={async () => {
                    setOccupe(true)
                    await onModifier(f, {
                      remise_le: remiseLe || null,
                      rembourse_le: leJour || null,
                      montant_rembourse: montant,
                    })
                    setOccupe(false)
                  }}
                  className="text-xs font-medium border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60">
                  Enregistrer sans changer le statut
                </button>
                <button type="button" onClick={onBasculer} className="text-xs text-gray-400 hover:text-gray-600">
                  Annuler
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
