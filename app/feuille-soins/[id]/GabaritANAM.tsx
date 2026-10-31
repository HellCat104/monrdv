// Le formulaire de l'ANAM, celui de la CNSS et du CNOPS, imprimé rempli.
//
// ── POURQUOI DEUX ORGANISMES, UN SEUL GABARIT ───────────────────────────────
//
// « Feuille de soins dentaires », Réf. ANAM 1.2.03.01 pour la CNSS et
// 1.1.03.01 pour le CNOPS : c'est le MÊME imprimé normalisé, à quelques mots
// près. Le CNOPS ajoute un numéro d'affiliation et les causes de l'accident,
// écrit « Orthodentie et O.D.F » là où la CNSS écrit « Orthodontie faciale »,
// et ne propose que deux cases de parenté au lieu de trois. Tout le reste est
// identique, blocs, colonnes et ordre compris. Deux fichiers auraient divergé
// à la première correction.
//
// ── CE QUI EST REPRODUIT, ET CE QUI NE L'EST PAS ────────────────────────────
//
// Les blocs que l'organisme lit, dans leur ordre, avec leurs intitulés dans
// les deux langues de l'imprimé. Ce qui n'est PAS reproduit : les cadres
// « Réservé à la DAMO » et « Cachet et signature de la mutuelle », qui ne
// concernent que l'agent au guichet et seraient du bruit sur une feuille
// blanche.
//
// L'imprimé officiel est un A3 plié. Ici chaque volet devient une page A4
// paysage : la trame tient à l'identique avec une réduction d'environ un
// cinquième, et le praticien imprime sur du papier ordinaire.
import SchemaDentaireFormulaire from '@/components/shared/SchemaDentaireFormulaire'
import { Case, Cases, Champ, chiffresDate, jourFr } from '@/components/shared/traits-formulaire'
import type { Organisme } from '@/lib/organismes'
import type {
  ActeImprime, BeneficiaireImprime, FeuilleImprimee, PraticienImprime,
} from '@/lib/feuilles-soins'
import { PrintButton } from '../../facture/[id]/PrintButton'

export interface Props {
  organisme: Organisme
  praticien: PraticienImprime
  patientId: string
  /** L'assuré, dans les champs que CET organisme demande. */
  assure: Record<string, string>
  beneficiaire: BeneficiaireImprime
  feuille: FeuilleImprimee
  actes: ActeImprime[]
}

function Bandeau({ fr, ar }: { fr: string; ar: string }) {
  return (
    <div className="flex items-center justify-between border-y border-gray-700 bg-gray-100 px-2 py-[2px] mt-2 mb-1">
      <span className="text-[10px] font-bold text-gray-900">{fr}</span>
      <span className="text-[10px] font-bold text-gray-900" dir="rtl">{ar}</span>
    </div>
  )
}

export default function GabaritANAM({
  organisme, praticien, patientId, assure, beneficiaire, feuille, actes,
}: Props) {
  const cnops = organisme.cle === 'cnops'
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const dents = items.map((i) => i.tooth ?? '').filter(Boolean)
  const coche = (t: string) => feuille.typesSoins.includes(t)

  return (
    <div className="bg-gray-100 print:bg-white py-6 print:py-0">
      {/* Un A3 plié devient deux A4 paysage. La réduction tient dans la marge. */}
      <style>{`@page { size: A4 landscape; margin: 8mm; } @media print { .saut { break-after: page; } }`}</style>

      <div className="max-w-[1050px] mx-auto mb-3 flex items-center justify-between print:hidden px-4">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      {/* ══ VOLET 1 — l'assuré, le bénéficiaire, le praticien ══════════════ */}
      <section className="saut max-w-[1050px] mx-auto bg-white shadow-sm print:shadow-none p-6 print:p-0 mb-6 print:mb-0">
        <header className="flex items-start justify-between gap-4 border border-gray-700 p-2">
          <div className="text-[9px] leading-tight text-gray-800">
            <p className="font-bold">{praticien.nom}</p>
            {praticien.specialite && <p>{praticien.specialite}</p>}
            {praticien.adresse && <p>{praticien.adresse}</p>}
            {praticien.telephone && <p>{praticien.telephone}</p>}
          </div>
          <div className="text-center">
            <p className="text-[12px] font-bold text-gray-900" dir="rtl">ورقة العلاجات المتعلقة بالأسنان</p>
            <p className="text-[13px] font-bold text-gray-900">Feuille de soins dentaires</p>
            <div className="flex items-center justify-center gap-4 mt-1">
              <span className="flex items-center gap-1 text-[9.5px]">
                <Case cochee={feuille.nature === 'entente_prealable'} /> Entente préalable
              </span>
              <span className="flex items-center gap-1 text-[9.5px]">
                <Case cochee={feuille.nature === 'execution'} /> Exécution
              </span>
            </div>
          </div>
          <div className="text-[9px] text-right leading-tight text-gray-800">
            <p dir="rtl">مديرية التأمين الصحي الإجباري</p>
            <p>Direction de l&apos;Assurance Maladie Obligatoire</p>
            <p className="mt-1 font-semibold">{organisme.nom}</p>
            <p className="text-[8px]">Réf. ANAM {cnops ? '1.1.03.01' : '1.2.03.01'}</p>
          </div>
        </header>

        <Bandeau fr="Partie réservée à l'assuré(e)" ar="خاص بالمؤمن له (لها)" />
        <div className="px-2">
          <Champ fr="Nom et prénom" ar="الإسم العائلي و الشخصي">{assure.assure || beneficiaire.nom}</Champ>
          {cnops && (
            <Champ fr="N° Affiliation" ar="رقم الانخراط"><Cases valeur={assure.affiliation} nombre={8} /></Champ>
          )}
          <Champ fr="N° Immatriculation" ar="رقم التسجيل"><Cases valeur={assure.immatriculation} nombre={10} /></Champ>
          <Champ fr="N° de la Carte d'Identité Nationale" ar="رقم بطاقة التعريف الوطنية">
            <Cases valeur={assure.cin_assure} nombre={10} />
          </Champ>
          <div className="flex items-center gap-4 py-[3px]">
            <span className="text-[9.5px] shrink-0">Lien de parenté du bénéficiaire avec l&apos;assuré(e) :</span>
            {organisme.liens.map((l) => (
              <span key={l} className="flex items-center gap-1 text-[9.5px]">
                <Case cochee={(assure.lien ?? '').toLowerCase() === l.toLowerCase()} /> {l}
              </span>
            ))}
            <span className="flex-1" />
            <span className="text-[9px] text-gray-700" dir="rtl">علاقة القرابة بين المستفيد و المؤمن له</span>
          </div>
          <Champ fr="Adresse" ar="العنوان">{assure.adresse_assure}</Champ>
          <Champ fr="Montant des frais" ar="مبلغ المصاريف">
            {feuille.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dhs
          </Champ>
          <Champ fr="Nombre de pièces jointes" ar="عدد الوثائق المرفقة" large />
        </div>

        <Bandeau fr={`Déclaration du ${cnops ? 'médecin traitant' : 'Chirurgien Dentiste'}`} ar="تصريح الطبيب المعالج" />
        <div className="px-2">
          <Champ fr="Bénéficiaire des soins — Nom et prénom" ar="المستفيد من العلاجات">{beneficiaire.nom}</Champ>
          <Champ fr="Date de naissance" ar="تاريخ الازدياد">
            <Cases valeur={chiffresDate(beneficiaire.dateNaissance)} nombre={8} />
          </Champ>
          <Champ fr="N° de la Carte d'Identité Nationale" ar="رقم بطاقة التعريف الوطنية">
            <Cases valeur={beneficiaire.cin} nombre={10} />
          </Champ>
          <div className="flex items-center gap-4 py-[3px]">
            <span className="text-[9.5px]">Sexe :</span>
            <span className="flex items-center gap-1 text-[9.5px]"><Case cochee={beneficiaire.sexe === 'M'} /> M</span>
            <span className="flex items-center gap-1 text-[9.5px]"><Case cochee={beneficiaire.sexe === 'F'} /> F</span>
            <span className="flex-1" />
            <span className="text-[9px] text-gray-700" dir="rtl">الجنس</span>
          </div>
        </div>

        <Bandeau fr="Identification du Chirurgien Dentiste" ar="تعريف طبيب الأسنان" />
        <div className="px-2 flex gap-8">
          <div className="flex-1">
            <Champ fr="N° INP" ar="الرقم الوطني الاستدلالي للممارس"><Cases valeur={praticien.inpe} nombre={10} /></Champ>
            {praticien.ice && <Champ fr="ICE">{praticien.ice}</Champ>}
            {praticien.identifiantFiscal && <Champ fr="Identifiant fiscal">{praticien.identifiantFiscal}</Champ>}
            <Champ fr="N° Entente préalable" ar="رقم الموافقة المسبقة">{feuille.ententeNo}</Champ>
          </div>
          <div className="w-[260px]">
            <p className="text-[9.5px] font-semibold mb-1 flex items-center justify-between">
              Type de soins <span dir="rtl" className="text-[9px] font-normal text-gray-700">نوع العلاجات</span>
            </p>
            {(organisme.typesSoins ?? []).map((t) => (
              <div key={t.cle} className="flex items-center justify-between border-b border-gray-200 py-[2px]">
                <span className="text-[9.5px]">{t.cle === 'orthodontie' && cnops ? 'Orthodentie et O.D.F' : t.cle === 'orthodontie' ? 'Orthodontie faciale' : t.label}</span>
                <Case cochee={coche(t.cle)} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 px-2">
          <div className="border border-gray-700 p-2 h-[90px]">
            <p className="text-[8.5px] text-gray-800">J&apos;atteste sur l&apos;honneur l&apos;exactitude des renseignements portés ci-avant.</p>
            <p className="text-[9px] mt-2">Fait à : {praticien.ville ?? ''}</p>
            <p className="text-[9px]">Le : <Cases valeur={chiffresDate(feuille.jour)} nombre={8} /></p>
            <p className="text-[8px] text-gray-600 mt-1">Signature de l&apos;assuré(e)</p>
          </div>
          <div className="border border-gray-700 p-2 h-[90px]">
            <p className="text-[8.5px] text-gray-800">Je déclare les informations ci-dessus sincères et véritables.</p>
            <p className="text-[9px] mt-2">Fait à : {praticien.ville ?? ''}</p>
            <p className="text-[9px]">Le : <Cases valeur={chiffresDate(feuille.jour)} nombre={8} /></p>
            <p className="text-[8px] text-gray-600 mt-1">Cachet et Signature du Chirurgien Dentiste</p>
          </div>
        </div>
        <p className="text-[8px] text-gray-500 mt-1 px-2">INP : Identification Nationale du Praticien.</p>
      </section>

      {/* ══ VOLET 2 — les actes et le schéma ═══════════════════════════════ */}
      <section className="max-w-[1050px] mx-auto bg-white shadow-sm print:shadow-none p-6 print:p-0">
        <Bandeau fr="Description des actes effectués" ar="وصف العمليات المجراة" />
        <table className="w-full border-collapse text-[9.5px]">
          <thead>
            <tr>
              {[
                ['Dents traitées', 'أسنان معالجة'],
                ['Code des actes', 'رمز العمليات'],
                ['Dates des actes', 'تاريخ العمليات'],
                ['Lettre clé + Cotation', 'معامل العمليات'],
                ['Valeur Clé', 'قيمة المعامل'],
                ['Montant facturé', 'المبلغ المفوتر'],
                ['Signature et Cachet du Chirurgien Dentiste', 'توقيع و طابع طبيب الأسنان'],
              ].map(([fr, ar]) => (
                <th key={fr} className="border border-gray-600 px-1 py-1 font-semibold align-top">
                  <span className="block">{fr}</span>
                  <span className="block text-[8px] font-normal text-gray-700" dir="rtl">{ar}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="border border-gray-600 px-1 py-[3px] text-center tabular-nums">{it.tooth ?? ''}</td>
                <td className="border border-gray-600 px-1 py-[3px] text-center font-medium">{it.code ?? ''}</td>
                <td className="border border-gray-600 px-1 py-[3px] text-center tabular-nums">{jourFr(it.acte_date) || jourFr(feuille.jour)}</td>
                <td className="border border-gray-600 px-1 py-[3px] text-center">
                  {it.lettre_cle && it.coefficient ? `${it.lettre_cle} ${it.coefficient}` : ''}
                </td>
                <td className="border border-gray-600 px-1 py-[3px] text-center tabular-nums">{it.valeur_cle ?? ''}</td>
                <td className="border border-gray-600 px-1 py-[3px] text-right tabular-nums">
                  {Number(it.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                </td>
                <td className="border border-gray-600 px-1 py-[3px] w-[190px]" />
              </tr>
            ))}
            {/* Le formulaire ménage toujours des lignes libres : un acte ajouté
                à la main au fauteuil ne doit pas déborder dans la marge. */}
            {Array.from({ length: Math.max(0, 3 - items.length) }).map((_, i) => (
              <tr key={`v${i}`}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="border border-gray-600 h-[22px]" />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="border border-gray-600 px-2 py-1 text-right font-semibold">Total</td>
              <td className="border border-gray-600 px-1 py-1 text-right font-bold tabular-nums">
                {feuille.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
              </td>
              <td className="border border-gray-600" />
            </tr>
          </tfoot>
        </table>

        <div className="flex items-start gap-6 mt-3">
          <div className="border border-gray-600 p-2">
            <SchemaDentaireFormulaire dents={dents} largeur={230} />
          </div>
          <div className="flex-1 text-[9px] text-gray-800 leading-relaxed">
            <p>
              Le praticien est prié de préciser la dent traitée, l&apos;acte pratiqué en indiquant la
              nature des soins et son coefficient d&apos;après la nomenclature des actes professionnels.
            </p>
            <p className="mt-2 text-[8.5px] text-gray-600">{organisme.delai.texte}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
