// La « Déclaration dentaire » de RMA Watanya, imprimée remplie.
//
// Imprimé FOR-GM-022, Code GP 001, version 2019. Il ne ressemble pas à celui
// de l'ANAM, et la différence n'est pas qu'esthétique :
//
//   · il sépare les SOINS des PROTHÈSES ET DE L'ODF, en deux tableaux qui ne
//     demandent pas les mêmes colonnes ;
//   · le tableau des prothèses distingue ce qu'on PROPOSE de ce qu'on EXÉCUTE,
//     en deux groupes de lignes — c'est la demande d'accord préalable de RMA,
//     et elle se lit sur la même page que les travaux faits ;
//   · il ne demande AUCUN code d'acte : une nature d'intervention écrite en
//     toutes lettres et un coefficient, rien de plus.
//
// L'imprimé est reproduit ENTIER, cadres du gestionnaire compris : « Partie
// réservée à RMA » (dates de réception, n° de sinistre, ordonnancement) et le
// tableau « Pharmacie ». Ils n'appartiennent pas au praticien, mais ils
// appartiennent au formulaire : une déclaration remise sans eux n'est pas la
// déclaration de RMA, c'est un extrait.
import SchemaDentaireFormulaire from '@/components/shared/SchemaDentaireFormulaire'
import { Cases, Champ, Pastille, jourFr } from '@/components/shared/traits-formulaire'
import { estProtheseOuOdf } from '@/lib/nomenclature-anam'
import type {
  ActeImprime, BeneficiaireImprime, FeuilleImprimee, PraticienImprime,
} from '@/lib/feuilles-soins'
import type { Organisme } from '@/lib/organismes'
import { PrintButton } from '../../facture/[id]/PrintButton'

export interface Props {
  organisme: Organisme
  praticien: PraticienImprime
  patientId: string
  assure: Record<string, string>
  beneficiaire: BeneficiaireImprime
  feuille: FeuilleImprimee
  actes: ActeImprime[]
}

const dh = (n: number) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2 })

/** La cotation d'une ligne, telle que l'imprimé la veut : RMA écrit
 *  « Coefficients » là où l'ANAM écrit « Lettre clé + Cotation », mais c'est
 *  la même chose, et le praticien a saisi les deux parties. */
function cotation(a: ActeImprime): string {
  if (!a.coefficient) return ''
  return `${a.lettre_cle ?? ''} ${a.coefficient}`.trim()
}

/** Une rangée de cases vides, pour que le praticien ajoute au stylo ce qui
 *  n'était pas prévu. Tous les imprimés en ménagent. */
function LignesLibres({ colonnes, nombre }: { colonnes: number; nombre: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, nombre) }).map((_, i) => (
        <tr key={`libre-${i}`}>
          {Array.from({ length: colonnes }).map((__, j) => (
            <td key={j} className="border border-gray-500 h-[20px]" />
          ))}
        </tr>
      ))}
    </>
  )
}

/** Un cadre vide que RMA remplit elle-même : un titre, des colonnes
 *  étiquetées, et de la place. Le praticien n'y écrit rien. */
function CadreGestionnaire({ titre, colonnes, hauteur }: {
  titre: string; colonnes: string[]; hauteur: number
}) {
  return (
    <div className="border border-gray-500 rounded-sm">
      <p className="text-[10px] font-bold px-2 py-[3px] border-b border-gray-400">{titre}</p>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${colonnes.length}, 1fr)` }}>
        {colonnes.map((c) => (
          <span key={c} className="text-[9px] text-center py-[2px] border-r border-b border-gray-300 last:border-r-0">{c}</span>
        ))}
        {colonnes.map((c) => (
          <span key={`v-${c}`} className="border-r border-gray-300 last:border-r-0" style={{ height: hauteur }} />
        ))}
      </div>
    </div>
  )
}

function Titre({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-200 border border-gray-500 px-2 py-[3px] text-[10px] font-bold text-gray-900">
      {children}
    </div>
  )
}

export default function GabaritRMA({
  organisme, praticien, patientId, assure, beneficiaire, feuille, actes,
}: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  // Les deux tableaux de l'imprimé. Un acte sans code part avec les soins :
  // c'est là que l'assureur s'attend à trouver le gros des lignes, et une
  // prothèse mal classée se corrige d'un trait de stylo, pas une ligne
  // perdue au milieu d'un tableau qu'il ne lit pas.
  const soins = items.filter((a) => !estProtheseOuOdf(a.code))
  const protheses = items.filter((a) => estProtheseOuOdf(a.code))
  const dents = items.map((i) => i.tooth ?? '').filter(Boolean)
  const devis = feuille.nature === 'entente_prealable'

  return (
    <div className="bg-gray-100 print:bg-white py-6 print:py-0">
      <style>{`@page { size: A4 landscape; margin: 8mm; } @media print { .saut { break-after: page; } }`}</style>

      <div className="max-w-[1050px] mx-auto mb-3 flex items-center justify-between print:hidden px-4">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      {/* ══ PAGE 1 — le cadre du gestionnaire, puis la déclaration ═════════ */}
      <section className="saut max-w-[1050px] mx-auto bg-white shadow-sm print:shadow-none p-6 print:p-0 mb-6 print:mb-0 flex gap-5">

        {/* ── Ce que RMA remplit elle-même à l'arrivée du courrier ────── */}
        <div className="w-[33%] shrink-0 space-y-3">
          <p className="text-[12px] font-bold text-gray-900">Partie réservée à RMA</p>
          <CadreGestionnaire titre="Date(s) de réception du courrier" colonnes={['1', '2', '3', '4']} hauteur={150} />
          <div className="border border-gray-500 rounded-sm">
            <p className="text-[10px] font-bold px-2 py-[3px] border-b border-gray-400">Identification</p>
            <div className="flex">
              <span className="w-[110px] shrink-0 border-r border-gray-400 flex items-center justify-center text-[9px] px-1">N° du sinistre</span>
              <span className="flex-1 px-2 py-2 space-y-2">
                <Cases nombre={7} />
                <span className="flex items-center gap-2">
                  <Cases nombre={7} />
                  <span className="text-[9px]">CP</span>
                </span>
              </span>
            </div>
          </div>
          <CadreGestionnaire titre="Ordonnancement" colonnes={['I.C.', 'D.D', 'D', 'C.C']} hauteur={130} />
        </div>

        <div className="flex-1 min-w-0">
        <header className="flex items-start justify-between gap-6 pb-2 border-b border-gray-400">
          <div className="text-[8.5px] leading-snug text-gray-800">
            <p className="font-bold">Siège social</p>
            <p>83, avenue de l&apos;Armée Royale — Casablanca — Maroc</p>
            <p>Tél. : 0522 31 21 63 — 0522 31 01 69 — Fax : 0522 31 38 84</p>
            <p>www.rmaassurance.com</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-bold tracking-wide text-gray-900">RMA</p>
            <p className="text-[8px] leading-tight text-gray-700">ROYALE MAROCAINE D&apos;ASSURANCE</p>
          </div>
        </header>

        <div className="text-center my-3">
          <p className="text-[12px] font-bold text-gray-900" dir="rtl">تصريح معالجة الأسنان</p>
          <p className="text-[14px] font-bold text-gray-900">Déclaration dentaire</p>
        </div>

        <div className="border border-gray-500 rounded-sm p-3 mb-3">
          <div className="flex items-center gap-10 border-b border-gray-300 pb-2 mb-2">
            <span className="text-[10px] font-bold text-gray-900">Type de déclaration</span>
            <span className="flex items-center gap-1.5 text-[10px]"><Pastille cochee={devis} /> Devis</span>
            <span className="flex items-center gap-1.5 text-[10px]"><Pastille cochee={!devis} /> Exécution</span>
          </div>
          <div className="flex items-baseline gap-2 py-[3px]">
            <span className="text-[9.5px] shrink-0">N° d&apos;affiliation :</span>
            <Cases valeur={assure.affiliation} nombre={16} />
          </div>
          <div className="flex gap-8">
            <div className="flex-1">
              <Champ fr="Souscripteur">{assure.souscripteur}</Champ>
              <Champ fr="N° de police">{assure.police}</Champ>
              <Champ fr="Adresse">{assure.adresse_assure}</Champ>
            </div>
            <div className="w-[240px] border border-gray-400 h-[74px] p-1">
              <p className="text-[8.5px] text-gray-600">Cachet du souscripteur</p>
            </div>
          </div>
        </div>

        <Titre>Renseignements concernant l&apos;assuré(e)</Titre>
        <div className="border border-t-0 border-gray-500 px-3 py-2 mb-3">
          <Champ fr="Nom et prénom">{assure.assure || beneficiaire.nom}</Champ>
          <Champ fr="Adresse">{assure.adresse_assure}</Champ>
        </div>

        <Titre>Renseignements concernant le malade</Titre>
        <div className="border border-t-0 border-gray-500 px-3 py-2 mb-3 flex gap-8">
          <div className="flex-1"><Champ fr="Nom et Prénom">{beneficiaire.nom}</Champ></div>
          <div className="w-[320px]"><Champ fr="Lien de parenté">{assure.lien}</Champ></div>
        </div>

        <div className="border border-gray-500 px-3 py-2">
          <Champ fr="Montant des frais engagés">{dh(feuille.total)} DHS</Champ>
          <p className="text-[9.5px] font-semibold text-gray-900 mt-3">
            J&apos;atteste sur l&apos;honneur l&apos;exactitude des renseignements portés sur la présente déclaration
          </p>
          <div className="flex items-end gap-8 mt-3">
            <span className="text-[9.5px]">Fait à : <span className="font-medium">{praticien.ville ?? ''}</span></span>
            <span className="text-[9.5px]">, le : <span className="font-medium">{jourFr(feuille.jour)}</span></span>
            <span className="flex-1" />
            <span className="text-[9.5px] font-semibold">Signature de l&apos;assuré(e)</span>
          </div>
        </div>
        <p className="text-[7.5px] text-gray-500 mt-2">FOR-GM-022 — Code GP 001 — Version 2019</p>
        </div>
      </section>

      {/* ══ PAGE 2 — ce que remplit le praticien ═══════════════════════════ */}
      <section className="max-w-[1050px] mx-auto bg-white shadow-sm print:shadow-none p-6 print:p-0">
        <div className="flex gap-4">
          {/* ── Le schéma, et la consigne de l'imprimé ─────────────────── */}
          <div className="w-[290px] shrink-0">
            <Titre>Partie réservée au praticien</Titre>
            <div className="border border-t-0 border-gray-500 p-2">
              <SchemaDentaireFormulaire dents={dents} largeur={250} />
              <p className="text-[8.5px] text-gray-800 leading-snug mt-2">
                Le praticien est prié de préciser la dent traitée, l&apos;acte pratiqué en indiquant la
                nature des soins et leur coefficient d&apos;après la Nomenclature Générale des Actes
                Professionnels.
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            {/* ── Soins dentaires ──────────────────────────────────────── */}
            <div>
              <Titre>Soins dentaires</Titre>
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr>
                    {['Date', 'Dents traitées', 'Nature de l’intervention', 'Coefficients', 'Honoraires', 'Avis du médecin conseil'].map((t) => (
                      <th key={t} className="border border-gray-500 px-1 py-[3px] font-semibold bg-gray-50">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {soins.map((a, i) => (
                    <tr key={i}>
                      <td className="border border-gray-500 px-1 py-[3px] text-center tabular-nums w-[70px]">{jourFr(a.acte_date) || jourFr(feuille.jour)}</td>
                      <td className="border border-gray-500 px-1 py-[3px] text-center tabular-nums w-[60px]">{a.tooth ?? ''}</td>
                      <td className="border border-gray-500 px-1 py-[3px]">{a.label}</td>
                      <td className="border border-gray-500 px-1 py-[3px] text-center w-[65px]">{cotation(a)}</td>
                      <td className="border border-gray-500 px-1 py-[3px] text-right tabular-nums w-[70px]">{dh(a.amount)}</td>
                      <td className="border border-gray-500 w-[120px]" />
                    </tr>
                  ))}
                  <LignesLibres colonnes={6} nombre={4 - soins.length} />
                </tbody>
              </table>
            </div>

            {/* ── ODF & Prothèses ──────────────────────────────────────────
                Deux groupes de lignes, et c'est tout l'intérêt du tableau :
                ce qu'on propose à l'accord de l'assureur, et ce qu'on a
                exécuté. La feuille remplit celui que sa nature désigne. */}
            <div>
              <Titre>ODF &amp; Prothèses dentaires</Titre>
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr>
                    <th className="border border-gray-500 w-[70px] bg-gray-50" />
                    {['Date', 'Coefficient des travaux', 'Honoraires', 'Cachet du praticien', 'Avis du médecin conseil'].map((t) => (
                      <th key={t} className="border border-gray-500 px-1 py-[3px] font-semibold bg-gray-50">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['Proposition', 'Exécution'] as const).map((groupe) => {
                    const pourCeGroupe = (groupe === 'Proposition') === devis ? protheses : []
                    const lignes = Math.max(2, pourCeGroupe.length)
                    return Array.from({ length: lignes }).map((_, i) => {
                      const a = pourCeGroupe[i]
                      return (
                        <tr key={`${groupe}-${i}`}>
                          {i === 0 && (
                            <td rowSpan={lignes} className="border border-gray-500 px-1 text-center font-semibold bg-gray-50">
                              {groupe}
                            </td>
                          )}
                          <td className="border border-gray-500 px-1 py-[3px] text-center tabular-nums h-[20px] w-[70px]">
                            {a ? (jourFr(a.acte_date) || jourFr(feuille.jour)) : ''}
                          </td>
                          <td className="border border-gray-500 px-1 py-[3px]">
                            {a ? `${a.label}${cotation(a) ? ` — ${cotation(a)}` : ''}${a.tooth ? ` (dent ${a.tooth})` : ''}` : ''}
                          </td>
                          <td className="border border-gray-500 px-1 py-[3px] text-right tabular-nums w-[70px]">
                            {a ? dh(a.amount) : ''}
                          </td>
                          <td className="border border-gray-500 w-[110px]" />
                          <td className="border border-gray-500 w-[120px]" />
                        </tr>
                      )
                    })
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pharmacie ────────────────────────────────────────────────
                Ce tableau n'est pas au dentiste : c'est le pharmacien qui le
                remplit, quand l'ordonnance suit la déclaration. Il reste sur
                l'imprimé, vide, parce qu'il y est sur le papier. */}
            <div>
              <Titre>Pharmacie</Titre>
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr>
                    {['Date', 'Montant', 'Signature et cachet'].map((t) => (
                      <th key={t} className="border border-gray-500 px-1 py-[3px] font-semibold bg-gray-50">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody><LignesLibres colonnes={3} nombre={2} /></tbody>
              </table>
            </div>

            {/* ── Les recommandations de l'imprimé, citées ──────────────── */}
            <div>
              <Titre>Recommandations importantes</Titre>
              <div className="border border-t-0 border-gray-500 px-3 py-2">
                <ul className="text-[8.5px] text-gray-800 leading-snug space-y-[2px] list-disc pl-4">
                  <li>La déclaration doit être accompagnée de toutes les pièces justificatives (ordonnances médicales, résultats des examens de radiologie etc…).</li>
                  {organisme.accordPrealable.map((r) => <li key={r}>{r}</li>)}
                  <li>{organisme.delai.texte}</li>
                  <li>Toute fausse déclaration est passible des sanctions prévues par la loi n° 17-99 portant code des assurances.</li>
                </ul>
                <p className="text-[9px] font-bold text-red-700 mt-2">
                  ← Toute réclamation doit être formulée au plus tard dans un délai de deux mois.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
