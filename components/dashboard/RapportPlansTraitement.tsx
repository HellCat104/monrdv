'use client'

// LE DEVENIR DES PLANS DE TRAITEMENT — bloc de l'écran Statistiques.
//
// Les statistiques comptaient l'argent encaissé et les rendez-vous honorés.
// Deux chiffres justes, et muets sur ce qui fait vivre un cabinet dentaire :
// ce qui est proposé, ce qui est accepté, et surtout CE QUI RESTE À FAIRE.
//
// Le bloc est autonome — il charge lui-même — et il disparaît entièrement
// pour un cabinet qui n'établit pas de devis : un rapport vide n'apprend
// rien et finit par rendre l'écran illisible.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList, PhoneCall } from 'lucide-react'
import { formatDateShort, getNowInMaroc } from '@/lib/utils'
import {
  jourDe, joursEntre, nomPatientDevis, JOURS_SANS_REPONSE,
  type RapportDevis,
} from '@/lib/rapport-devis'
import { jourMaroc } from '@/lib/stock'

export default function RapportPlansTraitement({
  debut, fin, libellePeriode,
}: {
  debut: string
  fin: string
  libellePeriode: string
}) {
  const [r, setR] = useState<RapportDevis | null>(null)
  const [aDesDevis, setADesDevis] = useState(false)
  const aujourdhui = jourMaroc(getNowInMaroc())

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes/rapport?debut=${debut}&fin=${fin}`)
      if (!res.ok) return
      const d = await res.json()
      setR(d.rapport ?? null)
      setADesDevis(!!d.aDesDevis)
    } catch { /* ni devis ni forfait : le bloc n'existe pas */ }
  }, [debut, fin])
  useEffect(() => { charger() }, [charger])

  if (!r || !aDesDevis) return null

  const dh = (n: number) => `${n.toLocaleString('fr-FR')} DH`

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary-500" /> Plans de traitement — {libellePeriode}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Ce qui est proposé, et ce qu'il devient ──────────────────── */}
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Devis <strong>proposés</strong> pendant la période, et ce qu’ils sont devenus depuis.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Chiffre libelle="Proposés" valeur={String(r.proposes)} detail={dh(r.proposesMontant)} />
            <Chiffre libelle="Acceptés" valeur={String(r.acceptes)} detail={dh(r.acceptesMontant)} ton="vert" />
            <Chiffre libelle="Refusés" valeur={String(r.refuses)} detail={dh(r.refusesMontant)} ton="rouge" />
            <Chiffre libelle="Sans réponse" valeur={String(r.enAttente)} detail={dh(r.enAttenteMontant)} ton="orange" />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            {r.tauxAcceptation === null ? (
              // « 0 % » laisserait croire à un échec alors que personne n’a
              // encore répondu. On ne donne un taux que s’il en existe un.
              <>Aucun de ces devis n’a encore été tranché : le taux d’acceptation ne veut rien dire pour l’instant.</>
            ) : (
              <><strong>{r.tauxAcceptation} %</strong> des devis tranchés ont été acceptés
                {' '}({r.acceptes} sur {r.acceptes + r.refuses}). Les devis sans réponse n’entrent pas dans ce calcul.</>
            )}
          </p>
        </div>

        {/* ── Le carnet de commandes ───────────────────────────────────── */}
        <div className="border-t border-gray-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">Accepté et pas encore réalisé</p>
            <p className="text-xl font-bold text-gray-900">{dh(r.encours)}</p>
            <p className="text-[11px] text-gray-400">
              {r.encoursDevis} plan{r.encoursDevis > 1 ? 's' : ''} en cours, toutes périodes confondues.
              Ce n’est <strong>pas</strong> une recette : c’est du travail vendu et pas encore fait.
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Actes réalisés — {libellePeriode}</p>
            <p className="text-xl font-bold text-gray-900">{dh(r.realise)}</p>
            <p className="text-[11px] text-gray-400">
              {r.realiseActes} acte{r.realiseActes > 1 ? 's' : ''} cochés faits pendant la période,
              à leur date de réalisation. L’argent réellement entré reste dans la caisse.
            </p>
          </div>
        </div>

        {/* ── Les devis qu'on perd faute d'un appel ────────────────────── */}
        {r.aRelancer.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
              <PhoneCall className="h-4 w-4" />
              {r.aRelancer.length} devis sans réponse depuis plus de {JOURS_SANS_REPONSE} jours
            </p>
            <ul className="space-y-0.5">
              {r.aRelancer.slice(0, 8).map((d) => {
                const j = jourDe(d.proposed_at)
                return (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-medium text-gray-800 truncate">{nomPatientDevis(d)}</span>
                    <span className="text-gray-400 text-[11px] truncate">
                      {d.label || 'Plan de traitement'} · proposé le {j ? formatDateShort(j) : '—'}
                    </span>
                    <span className="ml-auto shrink-0 text-[12px] text-amber-700 tabular-nums">
                      {j ? `${joursEntre(j, aujourdhui)} j` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
            {r.aRelancer.length > 8 && (
              <p className="text-[11px] text-gray-400 mt-1">et {r.aRelancer.length - 8} autre{r.aRelancer.length - 8 > 1 ? 's' : ''}…</p>
            )}
            <p className="text-[11px] text-gray-400 mt-2">
              Cette liste ne dépend pas de la période affichée : un devis oublié en mars se
              rappelle encore en juin. Les devis s’ouvrent depuis la{' '}
              <Link href="/patients" className="text-primary-600 hover:underline">fiche du patient</Link>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Chiffre({
  libelle, valeur, detail, ton,
}: {
  libelle: string
  valeur: string
  detail: string
  ton?: 'vert' | 'rouge' | 'orange'
}) {
  const couleur = ton === 'vert' ? 'text-emerald-700'
    : ton === 'rouge' ? 'text-red-700'
    : ton === 'orange' ? 'text-amber-700'
    : 'text-gray-900'
  return (
    <div>
      <p className="text-xs text-gray-500">{libelle}</p>
      <p className={`text-xl font-bold ${couleur}`}>{valeur}</p>
      <p className="text-[11px] text-gray-400 tabular-nums">{detail}</p>
    </div>
  )
}
