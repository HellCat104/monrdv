'use client'

// Cocher un acte, et que le code vienne tout seul.
//
// ── CE QUE ÇA REMPLACE ──────────────────────────────────────────────────────
//
// Le praticien tapait le code de nomenclature dans une case, acte par acte.
// Un D704 écrit D740 ne se voyait pas à l'écran : il se voyait au retour du
// dossier, des semaines plus tard, quand plus personne ne se souvenait de la
// séance. Ici il n'y a plus de code à taper — on coche l'acte, le code suit.
//
// ── L'ORDRE DES CHOSES, ET IL COMPTE ────────────────────────────────────────
//
// 1. Les RACCOURCIS, en premier : les quelques actes que ce cabinet vient de
//    poser. Un dentiste fait trois fois le même geste dans la journée, et
//    quatre-vingts pour cent de ses feuilles tiennent dans dix codes. C'est
//    la rangée qu'il utilisera, pas la liste complète.
// 2. La RECHERCHE ensuite, pour le geste qu'on fait une fois par mois.
// 3. Les SIX FAMILLES en dernier, repliées : on ne déroule cinquante actes
//    sous les yeux de quelqu'un qui en cherche un.
import { useMemo, useState } from 'react'
import { GROUPES_ACTES, rechercherActes, acteParCode, type ActeDentaire } from '@/lib/actes-dentaires'
import { ChevronDown, Search } from 'lucide-react'

/** Un acte déjà posé par ce cabinet, tel que l'API le renvoie. */
export interface ActeRecent {
  label: string
  code: string | null
  amount: number
}

export default function ChoixActesNgap({
  recents = [], tarifs = {}, onChoisir, dejaChoisis = [],
}: {
  /** Les derniers actes cotés par ce praticien, du plus récent au plus ancien. */
  recents?: ActeRecent[]
  /** Le dernier tarif pratiqué, PAR CODE et en majuscules.
   *
   *  À part de `recents`, qui est volontairement court — huit actes, pour que
   *  la rangée de raccourcis tienne sur une ligne. La mémoire des prix, elle,
   *  n'a pas de raison d'être courte : un acte posé il y a deux mois garde son
   *  tarif. Tant qu'elle passait par `recents`, le praticien le retapait. */
  tarifs?: Record<string, number>
  /** Appelé avec l'acte coché, et le dernier tarif connu s'il y en a un. */
  onChoisir: (acte: ActeDentaire, montant?: number) => void
  /** Les codes déjà portés sur la feuille : on les marque, sans les interdire
   *  — deux obturations sur deux dents portent le même code. */
  dejaChoisis?: string[]
}) {
  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)

  const trouves = useMemo(() => rechercherActes(q), [q])
  const porte = (code: string) => dejaChoisis.includes(code.toUpperCase())

  /** Le dernier tarif pratiqué pour ce code, s'il a déjà été posé. */
  const dernierTarif = (code: string): number | undefined =>
    tarifs[code.toUpperCase()]
    ?? recents.find((r) => (r.code ?? '').toUpperCase() === code.toUpperCase())?.amount

  /** Une ligne d'acte, cliquable. Le code à gauche, en chiffres fixes, parce
   *  que c'est lui qu'on relit sur la feuille imprimée. */
  const ligne = (a: ActeDentaire) => (
    <button
      key={a.code}
      type="button"
      onClick={() => { onChoisir(a, dernierTarif(a.code)); setQ('') }}
      className="w-full flex items-start gap-2 px-2 py-1.5 text-left rounded-lg hover:bg-primary-50/70"
    >
      <span className="text-[10px] font-bold text-primary-700 bg-primary-50 rounded px-1.5 py-0.5 shrink-0 tabular-nums w-11 text-center">
        {a.code}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-xs leading-snug ${porte(a.code) ? 'text-gray-400' : 'text-gray-800'}`}>
          {a.libelle}
        </span>
        {/* Ce que l'organisme exigera en plus. Dit au moment de cocher, pas
            au moment d'imprimer : c'est maintenant que le praticien sait
            quelle dent il a soignée. */}
        {(a.dent || a.accord || a.horsNomenclature) && (
          <span className="block text-[10px] text-gray-400 leading-snug">
            {a.dent === 'une' && 'dent à préciser'}
            {a.dent === 'bloc' && 'bloc de dents à préciser'}
            {a.accord && `${a.dent ? ' · ' : ''}accord préalable`}
            {a.horsNomenclature && `${a.dent || a.accord ? ' · ' : ''}non remboursé`}
          </span>
        )}
        {/* Un code dont le numéro contredit le référentiel officiel. On ne
            l'interdit pas — on ne le laisse pas passer en silence. */}
        {a.aVerifier && (
          <span className="block text-[10px] text-amber-600 leading-snug" title={a.aVerifier}>
            ⚠ code à confirmer
          </span>
        )}
      </span>
      {/* Le tarif retenu, montré AVANT de cocher. Sans lui, le praticien ne
          sait pas si le prix va venir tout seul, et le retape « au cas où ». */}
      {dernierTarif(a.code) !== undefined && (
        <span className="text-[10px] text-gray-500 shrink-0 mt-0.5 tabular-nums">
          {dernierTarif(a.code)!.toLocaleString('fr-FR')} DH
        </span>
      )}
      {porte(a.code) && <span className="text-[9.5px] text-gray-400 shrink-0 mt-0.5">déjà porté</span>}
    </button>
  )

  return (
    <div className="border border-gray-100 rounded-lg p-2.5 space-y-2">
      <p className="text-[11px] font-semibold text-gray-500">
        Cochez les actes de la séance — le code part tout seul sur la feuille
      </p>

      {/* ── Les raccourcis ────────────────────────────────────────────── */}
      {recents.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-400 mb-1">Récemment utilisés</p>
          <div className="flex flex-wrap gap-1">
            {recents.map((r) => {
              const a = acteParCode(r.code)
              return (
                <button
                  key={`${r.code}-${r.label}`}
                  type="button"
                  // Un acte qui n'est plus au catalogue — un code tapé à la
                  // main sous l'ancienne version — garde son libellé et son
                  // code : on ne fait pas disparaître le travail d'hier.
                  onClick={() => onChoisir(
                    a ?? { code: r.code ?? '', libelle: r.label, dent: null, face: false, accord: false },
                    dernierTarif(r.code ?? '') ?? r.amount,
                  )}
                  title={a?.libelle ?? r.label}
                  className="flex items-center gap-1.5 text-[11px] border border-gray-200 rounded-full pl-1.5 pr-2.5 py-1 hover:border-primary-300 hover:bg-primary-50/70"
                >
                  <span className="font-bold text-primary-700 tabular-nums">{r.code}</span>
                  <span className="text-gray-600 truncate max-w-[150px]">{a?.libelle ?? r.label}</span>
                  {dernierTarif(r.code ?? '') !== undefined && (
                    <span className="text-gray-400 tabular-nums">
                      {dernierTarif(r.code ?? '')!.toLocaleString('fr-FR')} DH
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── La recherche ──────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="h-3.5 w-3.5 text-gray-300 absolute left-2 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un acte ou un code…"
          className="w-full text-xs border border-gray-200 rounded-lg pl-7 pr-2 py-1.5"
        />
      </div>

      {q.trim() && (
        trouves.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic px-1">Aucun acte ne correspond.</p>
        ) : (
          <div className="divide-y divide-gray-50">{trouves.map(ligne)}</div>
        )
      )}

      {/* ── Les familles, repliées ────────────────────────────────────── */}
      {!q.trim() && (
        <div className="space-y-1">
          {GROUPES_ACTES.map((g) => (
            <div key={g.cle} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setOuvert(ouvert === g.cle ? null : g.cle)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50"
              >
                <span className="text-[11px] font-medium text-gray-700">{g.titre}</span>
                <span className="text-[10px] text-gray-300">{g.actes.length}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 ml-auto transition-transform ${ouvert === g.cle ? 'rotate-180' : ''}`} />
              </button>
              {ouvert === g.cle && (
                <div className="divide-y divide-gray-50 border-t border-gray-100 max-h-56 overflow-auto">
                  {g.actes.map(ligne)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
