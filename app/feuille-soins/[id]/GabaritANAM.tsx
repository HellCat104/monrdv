// Le formulaire de l'ANAM, celui de la CNSS et du CNOPS, imprimé rempli.
//
// ── POURQUOI DEUX ORGANISMES, UN SEUL GABARIT ───────────────────────────────
//
// « Feuille de soins dentaires », Réf. ANAM 1.2.03.01 pour la CNSS et
// 1.1.03.01 pour le CNOPS : c'est le MÊME imprimé normalisé, à quelques mots
// près. Le CNOPS ajoute un numéro d'affiliation, les lignes « N° Bordereau »
// et « N° Dossier », les causes de l'accident, écrit « Orthodentie et O.D.F »
// là où la CNSS écrit « Orthodontie faciale », parle du « médecin traitant »
// quand la CNSS dit « Chirurgien Dentiste », et ne propose que deux cases de
// parenté au lieu de trois. Tout le reste est identique, blocs, colonnes et
// ordre compris. Deux fichiers auraient divergé à la première correction.
//
// ── UNE TRAME, PAS SEULEMENT DES BLOCS ──────────────────────────────────────
//
// La première version reprenait les blocs du formulaire dans le bon ordre,
// mais aérée comme une page web : interlignes larges, pas de filets, et la
// moitié gauche de l'imprimé absente. Elle ne ressemblait pas au document —
// or un imprimé de remboursement se reconnaît d'abord à sa trame, avant
// d'être lu. On reproduit donc le quadrillage serré de l'original, bandeaux
// compris, et les DEUX volets de la page : les instructions à l'assuré et le
// cadre de l'organisme à gauche, le formulaire à droite.
//
// Trois champs manquaient aussi, et ils sont sur les deux imprimés : le cadre
// « En cas d'accident », la grille « CIN - 10 » du volet des actes, et les
// renvois de bas de page. À l'inverse, l'ICE et l'identifiant fiscal du
// praticien ne figurent sur AUCUN des deux : les imprimer ajoutait des lignes
// que l'organisme ne lit pas.
//
// Ce qui n'est pas reproduit : les logos CNSS et CNOPS, qui sont leurs
// marques — seul leur nom est écrit —, et la colonne arabe des instructions,
// que je ne retranscris pas d'un scan sur un document qui engage un
// remboursement.
//
// L'imprimé officiel est un A3 plié. Ici chaque volet devient une page A4
// paysage : la trame tient à l'identique avec une réduction d'environ un
// cinquième, et le praticien imprime sur du papier ordinaire.
import SchemaDentaireFormulaire from '@/components/shared/SchemaDentaireFormulaire'
import { Case, Cases, chiffresDate, jourFr } from '@/components/shared/traits-formulaire'
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

/** Les instructions à l'assuré, volet gauche de l'imprimé. Seul le nom de
 *  l'organisme change d'une feuille à l'autre ; le délai vient du registre,
 *  où il est déjà cité dans les mots du formulaire. */
const instructions = (org: string, delai: string) => [
  'Etablir une feuille de soins par personne et par événement.',
  'La feuille de soins doit être accompagnée de toutes les pièces justificatives originales (ordonnances médicales, factures, résultats des examens de radiologie et/ou de laboratoire).',
  'Le nom et prénom de la personne soignée doivent être portés par les praticiens eux mêmes sur chaque feuille de soins.',
  'Les prospectus et les PPM concernant les médicaments achetés doivent être joints aux ordonnances transmises.',
  delai,
  'Le remboursement des frais engagés sera effectué sur la base de la tarification nationale de référence.',
  'Les risques liés aux accidents du travail et maladies professionnelles ne sont pas couverts.',
  'Toute personne coupable de fraude ou de fausse déclaration pour obtenir des prestations qui ne sont pas dues, est passible des sanctions légales et réglementaires.',
  `L'obligation de remboursement prise par la ${org} est subordonnée au respect des conditions réglementaires et de ce qui précède.`,
]

/** Le bandeau d'une section, français à gauche, arabe à droite. */
function Bandeau({ fr, ar }: { fr: string; ar: string }) {
  return (
    <div className="flex items-center justify-between border-y border-gray-700 bg-gray-200 px-2 py-[2px]">
      <span className="text-[10px] font-bold text-gray-900">{fr}</span>
      <span className="text-[10px] font-bold text-gray-900" dir="rtl">{ar}</span>
    </div>
  )
}

/** Une ligne du formulaire : libellé français, valeur, libellé arabe.
 *
 *  Sur l'imprimé, chaque ligne occupe toute la largeur du cadre et touche
 *  presque la suivante. C'est ce resserrement qui fait qu'on reconnaît le
 *  document d'un coup d'œil, d'où les interlignes minuscules. */
function L({ fr, ar, children, pointille = true }: {
  fr: string
  ar?: string
  children?: React.ReactNode
  /** Les champs à cases n'ont pas de ligne de pointillés sous eux. */
  pointille?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5 py-[1.5px]">
      <span className="text-[9px] text-gray-900 shrink-0">{fr} :</span>
      <span className={`flex-1 text-[9.5px] font-semibold text-gray-900 min-h-[12px] ${pointille ? 'border-b border-dotted border-gray-500' : ''}`}>
        {children}
      </span>
      {ar && (
        <span className="text-[9px] text-gray-800 shrink-0 w-[150px] text-right" dir="rtl">{ar} :</span>
      )}
    </div>
  )
}

export default function GabaritANAM({
  organisme, praticien, patientId, assure, beneficiaire, feuille, actes,
}: Props) {
  const cnops = organisme.cle === 'cnops'
  const nom = cnops ? 'CNOPS' : 'CNSS'
  const items = actes.slice().sort((a, b) => a.position - b.position)
  const dents = items.map((i) => i.tooth ?? '').filter(Boolean)
  const coche = (t: string) => feuille.typesSoins.includes(t)
  // L'imprimé ne nomme pas le praticien de la même façon d'un organisme à
  // l'autre, jusque dans le titre des blocs.
  const praticienDit = cnops ? 'médecin traitant' : 'Chirurgien Dentiste'
  const libelleCin = cnops ? 'N° CIN' : "N° de la Carte d'Identité Nationale"

  return (
    <div className="bg-gray-100 print:bg-white py-6 print:py-0">
      {/* Un A3 plié devient deux A4 paysage. La réduction tient dans la marge. */}
      <style>{`@page { size: A4 landscape; margin: 7mm; } @media print { .saut { break-after: page; } }`}</style>

      <div className="max-w-[1080px] mx-auto mb-3 flex items-center justify-between print:hidden px-4">
        <a href={`/patients/${patientId}`} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      {/* ══ VOLET 1 — les instructions, puis le formulaire ═════════════════ */}
      <section className="saut max-w-[1080px] mx-auto bg-white shadow-sm print:shadow-none p-5 print:p-0 mb-6 print:mb-0">
        <div className="flex gap-3 items-stretch">

          {/* ── Gauche : ce que l'assuré doit savoir, et le cadre que
                 l'organisme remplit au guichet ───────────────────────────── */}
          <div className="w-[36%] flex flex-col border border-gray-700">
            <div className="flex items-center justify-between border-b border-gray-700 bg-gray-200 px-2 py-[2px]">
              <span className="text-[10px] font-bold">Instructions à suivre</span>
              <span className="text-[10px] font-bold" dir="rtl">تعليمات يجب اتباعها</span>
            </div>
            <div className="flex-1">
              {instructions(nom, organisme.delai.texte).map((t, i) => (
                <p key={i} className="text-[7.5px] leading-[1.35] text-gray-900 text-justify px-2 py-[3px] border-b border-gray-300 last:border-b-0">
                  {t}
                </p>
              ))}
            </div>
            {/* Ce cadre fait partie de l'imprimé : sans lui, l'agent n'a pas
                où tamponner le dépôt du dossier. */}
            <div className="m-1.5 border border-gray-700">
              {/* Le CNOPS n'a qu'un cadre, la mutuelle de rattachement ;
                  la CNSS en a deux, la DAMO et l'agence. */}
              <div className={`${cnops ? '' : 'grid grid-cols-2'} border-b border-gray-700 bg-gray-100`}>
                <div className={`px-1 py-[2px] text-center ${cnops ? '' : 'border-r border-gray-700'}`}>
                  <p className="text-[8px] font-bold" dir="rtl">{cnops ? 'توقيع و طابع التعاضدية' : 'خاص بمديرية التأمين الصحي الإجباري'}</p>
                  <p className="text-[8px] font-bold">{cnops ? 'Cachet et signature de la mutuelle' : 'Réservé à la DAMO'}</p>
                </div>
                {!cnops && (
                  <div className="px-1 py-[2px] text-center">
                    <p className="text-[8px] font-bold" dir="rtl">توقيع و طابع الوكالة</p>
                    <p className="text-[8px] font-bold">Cachet et Signature de l&apos;Agence</p>
                  </div>
                )}
              </div>
              <div className="h-[64px]" />
              <div className="border-t border-gray-700 px-2 py-1">
                <p className="text-[8px] font-semibold">Identification de l&apos;agent : ……………………………………</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[8px] font-semibold">Date de dépôt du dossier :</span>
                  <Cases nombre={8} />
                  <span className="text-[7.5px]" dir="rtl">تاريخ الإيداع</span>
                </div>
                {!cnops && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[8px] font-semibold">Date d&apos;arrivée :</span>
                    <Cases nombre={8} />
                    <span className="text-[7.5px]" dir="rtl">تاريخ الإستلام</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Droite : le formulaire ────────────────────────────────── */}
          <div className="flex-1 border border-gray-700">

            <div className="flex items-stretch border-b border-gray-700">
              <div className="w-[100px] border-r border-gray-700 flex flex-col items-center justify-center py-1">
                <span className="text-[13px] font-bold tracking-[0.18em] text-gray-900">{nom}</span>
                <span className="text-[7px] text-gray-700 text-center px-1" dir="rtl">
                  {cnops ? 'الصندوق الوطني لمنظمات الاحتياط الاجتماعي' : 'الضمان الاجتماعي'}
                </span>
              </div>
              <div className="flex-1 text-center py-1">
                <p className="text-[11px] font-bold text-gray-900" dir="rtl">ورقة العلاجات المتعلقة بالأسنان</p>
                <p className="text-[12px] font-bold text-gray-900">Feuille de soins dentaires</p>
                <div className="flex items-center justify-center gap-3 mt-[2px]">
                  <span className="border border-gray-700 px-1.5 py-[1px] text-center leading-tight">
                    <span className="block text-[7px]" dir="rtl">موافقة مسبقة*</span>
                    <span className="block text-[8.5px]">Entente préalable* <Case cochee={feuille.nature === 'entente_prealable'} /></span>
                  </span>
                  <span className="border border-gray-700 px-1.5 py-[1px] text-center leading-tight">
                    <span className="block text-[7px]" dir="rtl">تنفيذ*</span>
                    <span className="block text-[8.5px]">Exécution* <Case cochee={feuille.nature === 'execution'} /></span>
                  </span>
                </div>
              </div>
              <div className="w-[118px] border-l border-gray-700 px-1 py-1 text-[7.5px] leading-tight text-right">
                <p dir="rtl">التأمين الإجباري عن المرض</p>
                <p>Assurance Maladie Obligatoire</p>
                <p className="mt-1 border border-gray-500 px-1 py-[1px]">Réf. ANAM {cnops ? '1.1.03.01' : '1.2.03.01'}</p>
                {!cnops && <p className="mt-[2px]">Réf. : 610-1-04</p>}
              </div>
            </div>

            {/* Le CNOPS ouvre sur deux numéros de gestion que la CNSS n'a pas. */}
            {cnops && (
              <div className="flex gap-6 px-2 py-[3px] border-b border-gray-700">
                <span className="text-[9px] flex-1">N° Bordereau : ……………………………</span>
                <span className="text-[9px] flex-1">N° Dossier : ……………………………</span>
              </div>
            )}

            <Bandeau fr="Partie réservée à l'assuré(e)" ar="خاص بالمؤمن له (لها)" />
            <div className="px-2 py-[2px]">
              <L fr="Nom et prénom" ar="الإسم العائلي و الشخصي">{assure.assure || beneficiaire.nom}</L>
              {cnops && (
                <L fr="N° Affiliation" ar="رقم الانخراط" pointille={false}><Cases valeur={assure.affiliation} nombre={8} /></L>
              )}
              <L fr="N° Immatriculation" ar="رقم التسجيل" pointille={false}><Cases valeur={assure.immatriculation} nombre={10} /></L>
              <L fr={libelleCin} ar="رقم بطاقة التعريف الوطنية" pointille={false}>
                <Cases valeur={assure.cin_assure} nombre={10} />
              </L>
              <div className="flex items-center gap-3 py-[2px]">
                <span className="text-[9px] shrink-0">Lien de parenté du bénéficiaire avec l&apos;assuré(e)*</span>
                {organisme.liens.map((l) => (
                  <span key={l} className="flex items-center gap-1 text-[9px]">
                    {l} <Case cochee={(assure.lien ?? '').toLowerCase() === l.toLowerCase()} />
                  </span>
                ))}
                <span className="flex-1" />
                <span className="text-[8px] text-gray-800" dir="rtl">علاقة القرابة بين المستفيد و المؤمن له*</span>
              </div>
              <div className="flex items-start gap-1.5 py-[2px]">
                <span className="text-[9px] shrink-0">Adresse :</span>
                <span className="flex-1 border border-gray-500 min-h-[26px] px-1 text-[9.5px] font-semibold">
                  {assure.adresse_assure}
                </span>
                <span className="text-[9px] shrink-0 w-[150px] text-right" dir="rtl">العنوان :</span>
              </div>
              <L fr="Montant des frais" ar="مبلغ المصاريف">
                {feuille.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} Dhs.
              </L>
              <L fr="Nombre de pièces jointes" ar="عدد الوثائق المرفقة" />
            </div>

            <Bandeau fr={`Déclaration du ${praticienDit}`} ar="تصريح الطبيب المعالج" />
            <div className="px-2 py-[2px]">
              <p className="text-[9px] font-semibold flex items-center justify-between">
                Bénéficiaire des soins :
                <span className="text-[8px] font-normal" dir="rtl">المستفيد من العلاجات :</span>
              </p>
              <L fr="Nom et prénom" ar="الإسم العائلي و الشخصي">{beneficiaire.nom}</L>
              <L fr="Date de naissance" ar="تاريخ الازدياد" pointille={false}>
                <Cases valeur={chiffresDate(beneficiaire.dateNaissance)} nombre={8} />
              </L>
              <L fr={libelleCin} ar="رقم بطاقة التعريف الوطنية" pointille={false}>
                <Cases valeur={beneficiaire.cin} nombre={10} />
              </L>
              <div className="flex items-center gap-4 py-[2px]">
                <span className="text-[9px]">Sexe* :</span>
                <span className="flex items-center gap-1 text-[9px]">M <Case cochee={beneficiaire.sexe === 'M'} /> <span dir="rtl">ذكر</span></span>
                <span className="flex items-center gap-1 text-[9px]">F <Case cochee={beneficiaire.sexe === 'F'} /> <span dir="rtl">أنثى</span></span>
                <span className="flex-1" />
                <span className="text-[8px]" dir="rtl">الجنس* :</span>
              </div>
            </div>

            <Bandeau fr={`Identification du ${cnops ? 'chirurgien dentiste' : 'Chirurgien Dentiste'}`} ar="تعريف طبيب الأسنان" />
            <div className="px-2 py-[2px]">
              <L fr="N° INP" ar="الرقم الوطني الاستدلالي للممارس" pointille={false}>
                <Cases valeur={praticien.inpe} nombre={10} />
              </L>
              <p className="text-[9px] font-semibold flex items-center justify-between mt-[2px]">
                Type de soins
                <span className="text-[8px] font-normal" dir="rtl">نوع العلاجات</span>
              </p>
              {[
                ['soins', 'Soins*', 'علاجات'],
                ['prothese', 'Prothèse*', cnops ? 'تعويض الأسنان' : 'البدلة السنية'],
                ['orthodontie', cnops ? 'Orthodentie et O.D.F*' : 'Orthodontie faciale*', cnops ? 'تقويم الأسنان و الفكين' : 'تقويم الأسنان الوجهي'],
                ['autres', 'Autres*', 'علاجات أخرى'],
              ].map(([cle, fr, ar]) => (
                <div key={cle} className="flex items-center py-[1px]">
                  <span className="text-[9px] w-[170px]">{fr} :</span>
                  <Case cochee={coche(cle)} />
                  <span className="flex-1" />
                  <span className="text-[8px] text-right" dir="rtl">{ar} :</span>
                </div>
              ))}
              <L fr="N° Entente préalable" ar="رقم الموافقة المسبقة" pointille={false}>
                <Cases valeur={feuille.ententeNo} nombre={10} />
              </L>
              {/* Le cadre « accident », qui manquait : les deux imprimés le
                  portent, et un soin dentaire après un choc s'y déclare. */}
              <p className="text-[9px] flex items-center justify-between">
                En cas d&apos;accident précisez
                <span className="text-[8px]" dir="rtl">في حالة حادث، يرجى تحديد ما يلي :</span>
              </p>
              <L fr={cnops ? "La date de l'accident" : "Date d'accident"} ar={cnops ? 'تاريخ الحادث' : 'تاريخ'} pointille={false}>
                <Cases nombre={8} />
              </L>
              {cnops && <L fr="Les causes de l'accident" ar="أسباب الحادث" />}
            </div>

            <div className="grid grid-cols-2 m-1.5 border border-gray-700">
              <div className="border-r border-gray-700 p-1.5">
                <p className="text-[7.5px] text-right" dir="rtl">أشهد بصحة كل ما ذكر أعلاه.</p>
                <p className="text-[7.5px] text-gray-900">J&apos;atteste sur l&apos;honneur l&apos;exactitude des renseignements portés ci-avant.</p>
                <p className="text-[8px] mt-2 flex items-center">
                  <span>Fait à : <span className="font-semibold">{praticien.ville ?? ''}</span></span>
                  <span className="flex-1" /><span dir="rtl">حرر ب :</span>
                </p>
                <p className="text-[8px] mt-1 flex items-center gap-1">
                  Le : <Cases valeur={chiffresDate(feuille.jour)} nombre={8} /><span className="flex-1" /><span dir="rtl">في :</span>
                </p>
                <p className="text-[7.5px] text-center mt-2" dir="rtl">توقيع المؤمن له (لها)</p>
                <p className="text-[7.5px] text-center">Signature de l&apos;assuré (e)</p>
              </div>
              <div className="p-1.5">
                <p className="text-[7.5px] text-right" dir="rtl">أصرح بمصداقية و صحة المعلومات المذكورة أعلاه</p>
                <p className="text-[7.5px] text-gray-900">Je déclare les informations ci-dessus sincères et véritables.</p>
                <p className="text-[8px] mt-2 flex items-center">
                  <span>Fait à : <span className="font-semibold">{praticien.ville ?? ''}</span></span>
                  <span className="flex-1" /><span dir="rtl">حرر ب :</span>
                </p>
                <p className="text-[8px] mt-1 flex items-center gap-1">
                  Le : <Cases valeur={chiffresDate(feuille.jour)} nombre={8} /><span className="flex-1" /><span dir="rtl">في :</span>
                </p>
                <p className="text-[7.5px] text-center mt-2" dir="rtl">
                  {cnops ? 'توقيع و طابع الطبيب المعالج أو المؤسسة الصحية' : 'توقيع و طابع طبيب الأسنان'}
                </p>
                <p className="text-[7.5px] text-center">
                  {cnops ? "Cachet et Signature du Médecin traitant ou de l'Etablissement de soins" : 'Cachet et Signature du Chirurgien Dentiste'}
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between px-2 pb-1">
              <div className="text-[7px] text-gray-800 leading-tight">
                <p>- INP : Identification Nationale du Praticien</p>
                <p>- * Cocher la mention utile pour chaque case</p>
              </div>
              <p className="text-[7px] text-gray-800" dir="rtl">{cnops ? '* أشطب الخانة' : '* ضع العلامة في الخانة المناسبة'}</p>
            </div>

            {cnops ? (
              <div className="flex items-center justify-between border-t border-gray-700 bg-gray-200 px-2 py-[2px]">
                <span className="text-[9px] font-bold">La vente de cet imprimé est formellement interdite</span>
                <span className="text-[9px] font-bold" dir="rtl">يمنع منعا كليا بيع هذا المطبوع</span>
              </div>
            ) : (
              <div className="border-t border-gray-700 px-2 py-[2px] text-center text-[7px] leading-tight text-gray-800">
                <p>Maison de l&apos;Assuré — Place de DAKAR — Casablanca B.P 2186 Casa-Gare</p>
                <p>Téléphone : 05 22 54 86 07 — Fax : 05 22 54 86 73 — www.cnss.ma — Centre d&apos;appels 08200 7200</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ VOLET 2 — les actes et le schéma ═══════════════════════════════ */}
      <section className="max-w-[1080px] mx-auto bg-white shadow-sm print:shadow-none p-5 print:p-0">
        <div className="border border-gray-700">
          <Bandeau fr="Description des actes" ar="وصف العلاجات" />
          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr>
                {[
                  ['Dents traitées', 'الأسنان المعالجة'],
                  ['Code des actes', 'رمز العلاجات'],
                  ['Dates des actes', 'تاريخ العلاجات'],
                  ['Lettre clé + Cotation NGAP', 'معامل العلاجات'],
                  ['Valeur Clé', 'قيمة المعامل'],
                  ['Montant facturé', 'المبلغ المفوتر'],
                  [`Signature et Cachet du ${cnops ? 'Médecin traitant' : 'Chirurgien Dentiste'}`, 'توقيع و طابع طبيب الأسنان'],
                ].map(([fr, ar]) => (
                  <th key={fr} className="border border-gray-600 px-1 py-1 font-semibold align-top">
                    <span className="block">{fr}</span>
                    <span className="block text-[7.5px] font-normal text-gray-700" dir="rtl">{ar}</span>
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
              {/* Le formulaire ménage toujours des lignes libres : un acte
                  ajouté à la main au fauteuil ne doit pas déborder. */}
              {Array.from({ length: Math.max(0, 6 - items.length) }).map((_, i) => (
                <tr key={`v${i}`}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="border border-gray-600 h-[21px]" />
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

          {/* La grille « CIN - 10 » du volet des actes : le même numéro qu'au
              volet 1, redemandé pour que la page des actes, qui se détache,
              reste rattachable à son dossier. */}
          <div className="flex items-center gap-2 px-2 py-1 border-t border-gray-600">
            <span className="text-[9px] font-semibold">CIN - 10</span>
            <Cases valeur={beneficiaire.cin} nombre={10} />
          </div>
        </div>

        <div className="flex items-start gap-6 mt-3">
          <div className="border border-gray-600 p-2">
            <SchemaDentaireFormulaire dents={dents} largeur={230} />
          </div>
          <div className="flex-1 text-[9px] text-gray-900 leading-relaxed">
            <p>
              Le praticien est prié de préciser la dent traitée, l&apos;acte pratiqué en indiquant la
              nature des soins et son coefficient d&apos;après la nomenclature des actes professionnels.
            </p>
            <p className="mt-2 text-[8.5px] text-gray-700">{organisme.delai.texte}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
