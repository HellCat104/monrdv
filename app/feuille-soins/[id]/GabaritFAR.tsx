// La « Feuille de maladie » de la Mutuelle des Forces Armées Royales.
//
// ── UN CARNET, DONT UNE SEULE PAGE EST CELLE DU DENTISTE ────────────────────
//
// L'imprimé des FAR n'est pas une feuille de soins dentaires : c'est une
// feuille de maladie commune à tout le corps de santé, en quatre pages.
//
//   page 1 — l'adhérent, le bénéficiaire, l'INPE du médecin traitant
//   page 2 — l'ORDONNANCE, remplie par le pharmacien
//   page 3 — le relevé commun : médecin, labo, imagerie, para-médical, optique
//   page 4 — « SOINS ET PROTHESE DENTAIRE (INPE) », la page du dentiste
//
// Les quatre sortent, dans l'ordre du carnet, chacune avec son numéro pour que
// l'agent de la mutuelle la reconnaisse. La page 2 n'est pas celle du dentiste
// — il n'y porte que le nom du malade et son cachet s'il prescrit — mais elle
// fait partie du carnet : un carnet amputé d'une page n'est plus le carnet.
//
// ── CE QUE CET IMPRIMÉ DEMANDE QUE LES AUTRES NE DEMANDENT PAS ──────────────
//
//   · aucun code d'acte — « Natures des actes & coefficients », en toutes
//     lettres, et c'est tout ;
//   · deux marques distinctes sur la grille des dents, pas une seule : une
//     croix sur l'extraction ou la prothèse, un cercle sur la dent soignée ;
//   · « DEVIS ? — REÇUS ? (Rayer la mention inutile) », qui tient lieu de
//     demande d'accord préalable ;
//   · et une phrase que le logiciel ne peut pas honorer à la place du
//     praticien : « L'identité du malade doit être portée de la main du
//     médecin traitant. » Elle est rappelée sous la page 1.
import GrilleDentaireFAR from '@/components/shared/GrilleDentaireFAR'
import { Case, Champ, jourFr } from '@/components/shared/traits-formulaire'
import { dentCroisee, estProtheseOuOdf } from '@/lib/nomenclature-anam'
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

/** « Natures des actes & coefficients » : une seule colonne, donc une seule
 *  phrase. La dent y entre aussi, puisque l'imprimé de la page 3 n'a pas de
 *  colonne pour elle. */
function natureEtCoefficient(a: ActeImprime, avecDent: boolean): string {
  const bouts = [avecDent && a.tooth ? `Dent ${a.tooth} —` : '', a.label]
  if (a.coefficient) bouts.push(`— ${`${a.lettre_cle ?? ''} ${a.coefficient}`.trim()}`)
  return bouts.filter(Boolean).join(' ')
}

/** Les cadres de la mutuelle, en tête de chaque page. */
function EnTetePage({ titre, ar, numero }: { titre: string; ar?: string; numero: number }) {
  return (
    <div className="flex items-stretch border border-gray-700">
      <div className="flex-1 px-2 py-1 text-center">
        <span className="text-[11px] font-bold text-gray-900">{titre}</span>
        {ar && <span className="text-[11px] font-bold text-gray-900 mr-2" dir="rtl"> {ar}</span>}
      </div>
      <div className="w-[70px] border-l border-gray-700 bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-700">
        Page {numero}
      </div>
    </div>
  )
}

function Cadre({ titre, ar, children }: { titre: string; ar?: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-700 border-t-0">
      <div className="flex items-center justify-between px-2 py-[2px] border-b border-gray-400">
        <span className="text-[10px] font-bold text-gray-900">{titre}</span>
        {ar && <span className="text-[10px] font-bold text-gray-900" dir="rtl">{ar}</span>}
      </div>
      <div className="px-2 py-1">{children}</div>
    </div>
  )
}

export default function GabaritFAR({
  organisme, praticien, patientId, assure, beneficiaire, feuille, actes,
}: Props) {
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const croix = items.filter((a) => dentCroisee(a.code)).map((a) => a.tooth ?? '').filter(Boolean)
  const cercles = items.filter((a) => !dentCroisee(a.code)).map((a) => a.tooth ?? '').filter(Boolean)
  const devis = feuille.nature === 'entente_prealable'
  const lien = (assure.lien ?? '').toLowerCase()
  // Le cadre « Maladie / Maternité / Accident ». Sans réponse sur la fiche, on
  // coche Maladie : c'est le cas de tous les soins dentaires sauf le trauma,
  // et une feuille qui ne coche rien revient au cabinet.
  const cas = (assure.cas ?? '').toLowerCase().trim() || 'maladie'
  // Les cases « Soins ? » et « Prothèse ? » de la page 4. Le praticien les a
  // cochées à l'écran ; à défaut, la nomenclature des actes répond pour lui.
  const coche = (t: string) => feuille.typesSoins.includes(t)
  const auMoinsUnType = coche('soins') || coche('prothese')
  const soinsCoche = auMoinsUnType ? coche('soins') : items.some((a) => !estProtheseOuOdf(a.code))
  const protheseCoche = auMoinsUnType ? coche('prothese') : items.some((a) => estProtheseOuOdf(a.code))

  return (
    <div className="bg-gray-100 print:bg-white py-6 print:py-0">
      <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { .saut { break-after: page; } }`}</style>

      <div className="max-w-[780px] mx-auto mb-3 flex items-center justify-between print:hidden px-4">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      {/* ══ PAGE 1 — l'adhérent et le bénéficiaire ═════════════════════════ */}
      <section className="saut max-w-[780px] mx-auto bg-white shadow-sm print:shadow-none p-8 print:p-0 mb-6 print:mb-0">
        <header className="flex items-start justify-between gap-6 mb-3">
          <div className="text-[9.5px] leading-snug text-gray-900">
            <p className="font-bold text-[10.5px]">Mutuelle des Forces Armées Royales</p>
            <p>Complexe Socio-Administratif des FAR,</p>
            <p>Av. Al Milia, BP n° 92, Hay Riad — Rabat</p>
            <p>Tél : 05 37 72 17 46</p>
            <p>Fax (PEC) : 05 37 26 13 66 — 05 37 73 58 57</p>
          </div>
          <div className="text-[9.5px] leading-snug text-gray-900 text-right" dir="rtl">
            <p className="font-bold text-[10.5px]">تعاضدية القوات المسلحة الملكية</p>
            <p>المركب السوسيو-إداري للقوات المسلحة الملكية</p>
            <p>شارع الميليا، ص ب 92، حي الرياض - الرباط</p>
            <p>الهاتف : 05 37 72 17 46</p>
          </div>
        </header>

        <EnTetePage titre="Feuille de maladie (*)" ar="ورقة المرض" numero={1} />

        <Cadre titre="Renseignements relatifs à l'adhérent" ar="معلومات خاصة بالمنخرط">
          <Champ fr="N° Carte Nationale d'Identité" ar="رقم بطاقة التعريف الوطنية">{assure.cin_assure}</Champ>
          <Champ fr="N° de Compte" ar="رقم الحساب البنكي">{assure.compte_bancaire}</Champ>
          <Champ fr="N° de Téléphone" ar="رقم الهاتف">{assure.telephone_assure}</Champ>
          <Champ fr="Nom et Prénom" ar="الاسم العائلي والشخصي">{assure.assure}</Champ>
          <Champ fr="Grade" ar="الرتبة">{assure.grade}</Champ>
          <Champ fr="Unité" ar="الوحدة">{assure.unite}</Champ>
          <Champ fr="Adresse" ar="العنوان الشخصي">{assure.adresse_assure}</Champ>
        </Cadre>

        <Cadre titre="Partie réservée au bénéficiaire" ar="خاص بالمستفيد">
          <Champ fr="Nom et Prénom" ar="الاسم العائلي والشخصي">{beneficiaire.nom}</Champ>
          <Champ fr="Date de Naissance" ar="تاريخ الازدياد">{jourFr(beneficiaire.dateNaissance)}</Champ>
          <div className="flex items-center gap-8 py-1 border-t border-gray-300 mt-1">
            {organisme.liens.map((l) => (
              <span key={l} className="flex items-center gap-1.5 text-[10px]">
                <Case cochee={lien === l.toLowerCase()} /> {l}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-8 py-1 border-t border-gray-300">
            {[['mal', 'Maladie'], ['mat', 'Maternité'], ['acc', 'Accident']].map(([debut, lib]) => (
              <span key={lib} className="flex items-center gap-1.5 text-[10px]">
                <Case cochee={cas.startsWith(debut)} /> {lib}
              </span>
            ))}
          </div>
        </Cadre>

        <Cadre titre="Identification du médecin traitant" ar="تعريف للطبيب المعالج">
          <Champ fr="N° INPE" ar="الرقم الوطني الإستدلالي">{praticien.inpe}</Champ>
        </Cadre>

        <div className="border border-gray-700 border-t-0 grid grid-cols-3 text-[10px]">
          <div className="border-r border-gray-400 p-2">
            <p>Frais engagés</p>
            <p className="font-semibold mt-1">{dh(feuille.total)} Dh</p>
            <p className="mt-3">Le : {jourFr(feuille.jour)}</p>
          </div>
          <div className="border-r border-gray-400 p-2">
            <p>Nombre prospectus :</p>
            <p className="mt-3">Nombre pièces :</p>
          </div>
          <div className="p-2">
            <p className="font-semibold">Signature Adhérent</p>
            <p className="text-[8.5px] text-gray-700 mt-1">Je déclare les informations ci-dessus sincères et véritables</p>
          </div>
        </div>
        <div className="border border-gray-700 border-t-0 p-2 h-[64px]">
          <p className="text-[10px]">Identité et signature du correspondant de la Mutuelle</p>
        </div>

        <p className="text-[9px] text-gray-700 mt-1">(*) Tous les champs sont à renseigner obligatoirement</p>
        {/* La seule consigne de cet imprimé qu'un logiciel ne peut pas tenir. */}
        <p className="text-[9px] text-gray-900 font-semibold mt-2 print:hidden">
          À faire à la main avant de déposer : l&apos;identité du malade doit être portée de la main
          du médecin traitant.
        </p>
      </section>

      {/* ══ PAGE 2 — l'ordonnance ══════════════════════════════════════════ */}
      <section className="saut max-w-[780px] mx-auto bg-white shadow-sm print:shadow-none p-8 print:p-0 mb-6 print:mb-0">
        <div className="border border-gray-700 flex flex-col" style={{ minHeight: 760 }}>
          <div className="flex items-stretch border-b border-gray-700">
            {['P.U', 'Nbr', 'Prix total'].map((t) => (
              <div key={t} className="w-[70px] border-r border-gray-700 flex items-center justify-center text-[10px] font-bold text-center px-1">{t}</div>
            ))}
            <div className="flex-1 flex items-center justify-center text-[11px] font-bold">ORDONNANCE</div>
            <div className="w-[70px] border-l border-gray-700 bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-700">Page 2</div>
          </div>

          <div className="flex flex-1">
            {['', '', ''].map((_, i) => (
              <div key={i} className="w-[70px] border-r border-gray-700" />
            ))}
            <div className="flex-1 p-3 flex flex-col">
              <p className="text-[10px]">Nom et prénom du malade : <span className="font-semibold">{beneficiaire.nom}</span></p>
              <div className="flex-1" />
              <div className="flex items-end justify-between">
                <p className="text-[10px]">À ……………………… , Le {jourFr(feuille.jour)}</p>
                <span className="w-[110px] h-[110px] rounded-full border border-gray-600 flex items-center justify-center text-[9px] text-center text-gray-600 leading-tight px-2">
                  Cachet du Médecin avec INPE
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-stretch border-t border-gray-700">
            <div className="w-[140px] border-r border-gray-700 px-1 py-2 text-center text-[10px] font-bold">Montant Global</div>
            <div className="w-[70px] border-r border-gray-700" />
            <div className="flex-1 px-2 py-2 text-[10px] font-bold">
              Cachet et Signature du Pharmacien : <span className="font-normal">Avec INPE</span>
            </div>
          </div>
        </div>
      </section>

      {/* ══ PAGE 3 — le relevé du corps de santé ═══════════════════════════ */}
      <section className="saut max-w-[780px] mx-auto bg-white shadow-sm print:shadow-none p-8 print:p-0 mb-6 print:mb-0">
        <EnTetePage titre="Réservé au corps de santé : Médecins, Chirurgiens, Dentistes et Auxiliaires médicaux" numero={3} />
        <table className="w-full border-collapse text-[9px] border border-gray-700 border-t-0">
          <thead>
            <tr>
              {['PRATICIEN', 'Date des actes', 'Natures des actes & coefficients', 'Montants des Honoraires', 'Signature & Cachet du praticien avec INPE'].map((t) => (
                <th key={t} className="border border-gray-600 px-1 py-1 font-bold align-middle">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Le bloc du dentiste, rempli. Les autres restent vides : c'est
                le même carnet pour le labo, l'imagerie, l'optique. */}
            {(() => {
              const lignes = Math.max(4, items.length)
              return Array.from({ length: lignes }).map((_, i) => {
                const a = items[i]
                return (
                  <tr key={`d${i}`}>
                    {i === 0 && (
                      <td rowSpan={lignes} className="border border-gray-600 px-1 text-center font-bold w-[90px] align-middle">
                        MÉDECIN TRAITANT OU CHIRURGIEN DENTISTE<br />– INPE –
                        <span className="block font-normal text-[8.5px] mt-1">{praticien.inpe ?? ''}</span>
                      </td>
                    )}
                    <td className="border border-gray-600 px-1 py-[3px] text-center tabular-nums h-[19px] w-[72px]">
                      {a ? (jourFr(a.acte_date) || jourFr(feuille.jour)) : ''}
                    </td>
                    <td className="border border-gray-600 px-1 py-[3px]">{a ? natureEtCoefficient(a, true) : ''}</td>
                    <td className="border border-gray-600 px-1 py-[3px] text-right tabular-nums w-[78px]">{a ? dh(a.amount) : ''}</td>
                    {i === 0 && <td rowSpan={lignes} className="border border-gray-600 w-[120px]" />}
                  </tr>
                )
              })
            })()}
            {[['ANALYSES DU LABO – INPE –', 4], ['IMAGERIE – INPE –', 3], ['ACTES PARA MÉDICAUX', 3], ['OPTIQUE – INPE –', 3]].map(([titre, n]) => (
              Array.from({ length: n as number }).map((_, i) => (
                <tr key={`${titre}-${i}`}>
                  {i === 0 && (
                    <td rowSpan={n as number} className="border border-gray-600 px-1 text-center font-bold align-middle">{titre as string}</td>
                  )}
                  <td className="border border-gray-600 h-[19px]" />
                  <td className="border border-gray-600" />
                  <td className="border border-gray-600" />
                  {i === 0 && <td rowSpan={n as number} className="border border-gray-600" />}
                </tr>
              ))
            ))}
          </tbody>
        </table>

        <div className="border border-gray-700 border-t-0 p-3">
          <p className="text-[10px] font-bold text-center underline mb-2">IMPORTANT</p>
          <ol className="text-[9px] text-gray-900 leading-snug space-y-1">
            <li>(1) {organisme.delai.texte}</li>
            <li>(2) <em>ACCIDENT</em> : En cas d&apos;accident, joindre un rapport précisant le type d&apos;accident et les renseignements concernant le tiers ayant occasionné l&apos;accident.</li>
            <li>(3) <em>FRAUDE</em> : Toute fraude ou tentative de fraude exposera le contrevenant à la suspension immédiate de la Mutuelle et sa poursuite.</li>
            <li>(4) Joindre les résultats des bilans effectués, sous plis fermés (biologie, radiologie, exploration… etc)</li>
            <li>(5) L&apos;apposition de l&apos;INPE est obligatoire.</li>
          </ol>
        </div>
      </section>

      {/* ══ PAGE 4 — la page du dentiste ═══════════════════════════════════ */}
      <section className="max-w-[780px] mx-auto bg-white shadow-sm print:shadow-none p-8 print:p-0">
        <div className="flex items-stretch border border-gray-700">
          <div className="w-[70px] border-r border-gray-700 bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-700">
            Page 4
          </div>
          <div className="flex-1 px-2 py-1 text-center">
            <p className="text-[11px] font-bold text-gray-900">SOINS ET PROTHÈSE DENTAIRE (INPE)</p>
            {/* « Rayer la mention inutile » : le logiciel raye, le praticien
                n'a plus à le faire. */}
            <p className="text-[10px] text-gray-900">
              <span className={devis ? 'font-bold' : 'line-through text-gray-400'}>DEVIS ?</span>
              {' — '}
              <span className={!devis ? 'font-bold' : 'line-through text-gray-400'}>REÇUS ?</span>
            </p>
          </div>
        </div>

        <table className="w-full border-collapse text-[9.5px] border border-gray-700 border-t-0">
          <thead>
            <tr>
              {['Date', 'Position dent', 'Nature des travaux', 'Coefficient', 'Montant honoraires'].map((t) => (
                <th key={t} className="border border-gray-600 px-1 py-1 font-bold">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => (
              <tr key={i}>
                <td className="border border-gray-600 px-1 py-[3px] text-center tabular-nums w-[78px]">{jourFr(a.acte_date) || jourFr(feuille.jour)}</td>
                <td className="border border-gray-600 px-1 py-[3px] text-center tabular-nums w-[62px]">{a.tooth ?? ''}</td>
                <td className="border border-gray-600 px-1 py-[3px]">{a.label}</td>
                <td className="border border-gray-600 px-1 py-[3px] text-center w-[64px]">
                  {a.coefficient ? `${a.lettre_cle ?? ''} ${a.coefficient}`.trim() : ''}
                </td>
                <td className="border border-gray-600 px-1 py-[3px] text-right tabular-nums w-[84px]">{dh(a.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 6 - items.length) }).map((_, i) => (
              <tr key={`v${i}`}>
                {Array.from({ length: 5 }).map((__, j) => <td key={j} className="border border-gray-600 h-[21px]" />)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="border border-gray-600 px-2 py-1 text-right font-semibold">Montant honoraires</td>
              <td className="border border-gray-600 px-1 py-1 text-right font-bold tabular-nums">{dh(feuille.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="border border-gray-700 border-t-0 p-3">
          <div className="flex items-center justify-center gap-12 mb-3">
            <span className="flex items-center gap-2 text-[10.5px] font-bold">Soins ? <Case cochee={soinsCoche} /></span>
            <span className="flex items-center gap-2 text-[10.5px] font-bold">Prothèse ? <Case cochee={protheseCoche} /></span>
          </div>
          <ul className="text-[9.5px] text-gray-900 leading-snug space-y-[2px] mb-3">
            <li>▪ Le praticien met une croix sur la dent objet de la prothèse ou de l&apos;extraction.</li>
            <li>▪ Il encercle la dent soignée ou couronnée.</li>
            <li>▪ Il instruit la quatrième page du présent document.</li>
          </ul>
          <div className="flex justify-center">
            <GrilleDentaireFAR croix={croix} cercles={cercles} />
          </div>
        </div>

        <div className="border border-gray-700 border-t-0 p-3 h-[150px]">
          <p className="text-[10.5px] font-bold text-center">Cadre réservé au Contrôle Médical de la Mutuelle des F.A.R.</p>
        </div>
      </section>
    </div>
  )
}
