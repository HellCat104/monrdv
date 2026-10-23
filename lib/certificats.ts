// Modèles de certificats médicaux (généraliste Maroc) + le modèle « libre ».
// Le texte généré est ÉDITABLE avant enregistrement, puis figé (archive légale).
import { formatDateFr } from '@/lib/utils'

export interface CertPatient {
  first_name: string
  last_name: string
  age?: number | null
  cin?: string | null
  /** Parents (migrations v33/v34) : l'autorisation de soins sur mineur est
   *  signée par eux, pas par l'enfant. Le logiciel connaît leur nom, il n'y a
   *  aucune raison de le faire recopier à la main sur chaque document. */
  parent1_name?: string | null
  parent2_name?: string | null
}
export interface CertDoctor { name: string }

export interface CertField {
  key: string
  label: string
  type: 'number' | 'text' | 'select'
  placeholder?: string
  options?: readonly string[]   // pour 'select'
}

/** Famille de document, pour regrouper les modèles derrière un seul bouton.
 *
 *  Un praticien ne cherche pas « un modèle parmi quinze », il cherche une
 *  CHOSE À FAIRE : une ordonnance, un certificat, un courrier à un confrère,
 *  une demande d'examen. La famille est ce qui permet de ne lui montrer que
 *  les modèles de la chose qu'il a choisie — et, au passage, de ne jamais
 *  proposer un consentement dentaire à un généraliste. */
export type FamilleDocument = 'certificat' | 'courrier' | 'examen' | 'consentement'

/** Les familles valides, pour filtrer ce qui arrive dans l'URL. */
export const FAMILLES_DOCUMENT: FamilleDocument[] = ['certificat', 'courrier', 'examen', 'consentement']

export interface CertTemplate {
  key: string
  title: string
  famille: FamilleDocument
  /** Document signé PAR LE PATIENT, et non délivré par le praticien. Change
   *  la mise en page imprimée : deux signatures, et la mention « lu et
   *  approuvé ». Les clés commencent toutes par `consent_`, ce qui permet au
   *  document imprimé de le reconnaître sans nouvelle colonne en base. */
  consentement?: true
  // champ complémentaire demandé au médecin (en plus du motif, commun à tous)
  extraField?: CertField
  // Certains documents en exigent plusieurs : une demande d'imagerie n'a aucun
  // sens sans l'examen ET la région explorée. `extras` porte alors les valeurs
  // dans l'ordre de `extraFields`.
  extraFields?: readonly CertField[]
  // `resume` est le dossier du patient déjà mis en forme (antécédents,
  // allergies, traitement en cours). Seuls les courriers s'en servent : il
  // leur évite d'être une page blanche. Les autres documents l'ignorent.
  build: (p: CertPatient, d: CertDoctor, extra: string, extras?: string[], resume?: string) => string
}

// Liste courte et fermée : le praticien choisit au lieu de taper, et le
// radiologue reçoit un intitulé normalisé.
export const EXAMENS_IMAGERIE = [
  'Radiographie',
  'Échographie',
  'Échographie-Doppler',
  'Scanner (TDM)',
  'IRM',
  'Mammographie',
  'Ostéodensitométrie',
] as const

const identite = (p: CertPatient) =>
  `${p.first_name} ${p.last_name}${p.age != null ? `, âgé(e) de ${p.age} ans` : ''}${p.cin ? `, titulaire de la CIN n° ${p.cin}` : ''}`

const entete = (d: CertDoctor) =>
  `Je soussigné(e), Dr. ${d.name}, certifie avoir examiné ce jour :\n\n${'{PATIENT}'}\n\n`

const pied = () =>
  `\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.\n\nFait le ${formatDateFr(new Date())}.`

// Un consentement n'est pas un certificat : il n'atteste rien à un tiers, il
// constate que le patient a compris ce qu'on lui propose et qu'il l'accepte.
// D'où un en-tête à la première personne DU PATIENT, et un pied qui rappelle
// ce qui protège réellement le praticien : la possibilité d'avoir posé des
// questions, et le double remis.
/** Le représentant légal connu de la fiche, s'il y en a un. */
export function representantLegal(p: CertPatient): string | null {
  const nom = (p.parent1_name ?? '').trim() || (p.parent2_name ?? '').trim()
  return nom || null
}

const enteteConsent = (p: CertPatient) =>
  `Je soussigné(e) ${identite(p)},\n\n`

const piedConsent = () =>
  `\nJ'ai pu poser toutes les questions que je souhaitais et j'ai reçu des réponses claires. ` +
  `J'ai été informé(e) que je peux revenir sur ma décision à tout moment avant le début des soins.\n\n` +
  `Je donne mon accord pour la réalisation de ces soins.\n\n` +
  `Document établi en deux exemplaires : un remis au patient, un conservé au dossier.\n\n` +
  `Fait le ${formatDateFr(new Date())}.`

export const CERT_TEMPLATES: CertTemplate[] = [
  {
    key: 'repos',
    famille: 'certificat',
    title: 'Certificat médical de repos',
    extraField: { key: 'jours', label: 'Nombre de jours de repos', type: 'number', placeholder: '3' },
    build: (p, d, jours) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `Son état de santé nécessite un repos de ${jours || '…'} jour(s) à compter de ce jour, sauf complications.` +
      pied(),
  },
  {
    key: 'sport',
    famille: 'certificat',
    title: 'Certificat d’aptitude au sport',
    extraField: { key: 'sport', label: 'Sport / activité', type: 'text', placeholder: 'football' },
    build: (p, d, sport) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `L'examen clinique de ce jour ne révèle aucune contre-indication apparente à la pratique de : ${sport || '…'}, y compris en compétition.` +
      pied(),
  },
  {
    key: 'scolaire',
    famille: 'certificat',
    title: 'Certificat d’aptitude scolaire',
    build: (p, d) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `L'examen clinique de ce jour ne révèle aucune contre-indication apparente à la scolarité ni aux activités physiques scolaires.` +
      pied(),
  },
  {
    key: 'permis',
    famille: 'certificat',
    title: 'Certificat médical — permis de conduire',
    extraField: { key: 'categorie', label: 'Catégorie du permis', type: 'text', placeholder: 'B' },
    build: (p, d, cat) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `L'examen clinique de ce jour (acuité visuelle, appareil locomoteur, état général) ne révèle aucune contre-indication apparente à la conduite des véhicules de catégorie ${cat || '…'}.` +
      pied(),
  },
  {
    key: 'courrier',
    famille: 'courrier',
    title: 'Courrier au confrère',
    extraField: { key: 'destinataire', label: 'Confrère destinataire', type: 'text', placeholder: 'Dr. X, cardiologue' },
    // Le dossier s'écrit tout seul sous le motif : antécédents, allergies,
    // traitement en cours. Le médecin n'a plus qu'à dire POURQUOI il adresse
    // — la partie que lui seul connaît. Sans ça, le courrier se résumait à
    // « je vous adresse Mme X pour avis », et le confrère rappelait pour
    // demander ce qu'elle prend.
    build: (p, d, dest, _extras, resume) =>
      `Cher confrère,\n\nJe vous adresse ${identite(p)} pour avis spécialisé et prise en charge.\n\n` +
      `Motif d'adressage :\n\n\n` +
      (resume ? `${resume}\n\n` : `Renseignements cliniques :\n\n\n`) +
      `Vous remerciant de votre retour, veuillez agréer, cher confrère, mes salutations confraternelles.\n\n` +
      `À l'attention de : ${dest || '…'}\nDr. ${d.name} — le ${formatDateFr(new Date())}`,
  },
  {
    key: 'analyses',
    famille: 'examen',
    title: 'Demande d’analyses',
    build: (p, d) =>
      `Demande d'examens biologiques pour :\n\n${identite(p)}\n\n` +
      `Examens demandés :\n\n\n` +
      `Dr. ${d.name} — le ${formatDateFr(new Date())}`,
  },
  {
    key: 'imagerie',
    famille: 'examen',
    title: 'Demande d’imagerie médicale',
    extraFields: [
      { key: 'examen', label: 'Examen demandé', type: 'select', options: EXAMENS_IMAGERIE },
      { key: 'region', label: 'Région ou organe exploré', type: 'text', placeholder: 'abdomen, genou droit, thorax…' },
    ],
    build: (p, d, _extra, extras = []) => {
      const [examen, region] = extras
      const intitule = [examen || '…', region?.trim()].filter(Boolean).join(' — ')
      return (
        `Demande d'examen d'imagerie médicale pour :\n\n${identite(p)}\n\n` +
        `Examen demandé : ${intitule}\n\n` +
        // Le radiologue ne peut pas interpréter sans indication clinique : le
        // champ est laissé ouvert, mais nommé, pour qu'on pense à le remplir.
        `Renseignements cliniques :\n\n\n` +
        `Confraternellement,\n\nDr. ${d.name} — le ${formatDateFr(new Date())}`
      )
    },
  },
  // ── Consentements éclairés ─────────────────────────────────────────────
  // Textes volontairement sobres et GÉNÉRIQUES : ils sont éditables avant
  // enregistrement, et c'est au praticien d'y porter ce qui concerne son
  // patient. Un consentement pré-rempli qu'on signe sans le lire ne protège
  // personne — la loi comme le juge regardent l'information réellement donnée.
  {
    key: 'consent_extraction',
    famille: 'consentement',
    title: 'Consentement éclairé — extraction dentaire',
    consentement: true,
    extraField: { key: 'dents', label: 'Dent(s) concernée(s)', type: 'text', placeholder: '36, 37' },
    build: (p, d, dents) =>
      enteteConsent(p) +
      `déclare avoir été informé(e) par le Dr. ${d.name} de la nécessité de procéder à l'extraction de la ou des dents suivantes : ${dents || '…'}.\n\n` +
      `Le praticien m'a expliqué :\n` +
      `— la raison de cette extraction et ce qui se passerait si elle n'était pas réalisée ;\n` +
      `— les autres traitements possibles, le cas échéant, et leur coût ;\n` +
      `— le déroulement de l'intervention et l'anesthésie locale qui l'accompagne ;\n` +
      `— les suites habituelles : douleur, gonflement et saignement modérés pendant quelques jours ;\n` +
      `— les complications possibles, rares mais connues : infection, saignement prolongé, douleur persistante (alvéolite), atteinte d'une dent voisine, et, selon la localisation, trouble temporaire ou durable de la sensibilité de la lèvre ou de la langue.\n\n` +
      `Je m'engage à signaler mes antécédents médicaux et les traitements que je prends, notamment anticoagulants, et à respecter les consignes qui me seront remises après l'intervention.` +
      piedConsent(),
  },
  {
    key: 'consent_sagesse',
    famille: 'consentement',
    title: 'Consentement éclairé — extraction de dent de sagesse',
    consentement: true,
    extraField: { key: 'dents', label: 'Dent(s) de sagesse', type: 'text', placeholder: '38, 48' },
    build: (p, d, dents) =>
      enteteConsent(p) +
      `déclare avoir été informé(e) par le Dr. ${d.name} de l'indication d'extraction de la ou des dents de sagesse suivantes : ${dents || '…'}.\n\n` +
      `Le praticien m'a expliqué le déroulement de l'intervention, qui peut nécessiter une incision de la gencive et la section de la dent, ainsi que les suites habituelles : douleur, gonflement et difficulté à ouvrir la bouche pendant quelques jours.\n\n` +
      `J'ai été informé(e) des complications possibles, rares mais connues : infection, saignement prolongé, alvéolite, et surtout, en raison de la proximité anatomique des nerfs, trouble de la sensibilité de la lèvre, du menton ou de la langue, le plus souvent temporaire mais parfois durable. Pour les dents du haut, une communication avec le sinus est possible.\n\n` +
      `Je m'engage à respecter les consignes post-opératoires et à consulter sans attendre en cas de fièvre, de saignement important ou de douleur croissante.` +
      piedConsent(),
  },
  {
    key: 'consent_implant',
    famille: 'consentement',
    title: 'Consentement éclairé — pose d\'implant',
    consentement: true,
    extraField: { key: 'site', label: 'Site(s) implantaire(s)', type: 'text', placeholder: '16' },
    build: (p, d, site) =>
      enteteConsent(p) +
      `déclare avoir été informé(e) par le Dr. ${d.name} du traitement implantaire proposé au niveau de : ${site || '…'}.\n\n` +
      `Le praticien m'a expliqué :\n` +
      `— le déroulement du traitement en plusieurs étapes, et sa durée totale de plusieurs mois ;\n` +
      `— les alternatives : bridge, prothèse amovible, ou abstention, et leurs conséquences ;\n` +
      `— que le succès dépend de l'intégration osseuse de l'implant, qui n'est jamais garantie à 100 % ;\n` +
      `— les complications possibles : infection, échec de l'intégration nécessitant la dépose de l'implant, atteinte d'une structure anatomique voisine, et péri-implantite à long terme ;\n` +
      `— que le tabac et un diabète mal équilibré augmentent nettement le risque d'échec.\n\n` +
      `Je m'engage à suivre les contrôles réguliers et à maintenir une hygiène rigoureuse, dont dépend la durée de vie de l'implant. Le devis correspondant m'a été remis.` +
      piedConsent(),
  },
  {
    key: 'consent_endo',
    famille: 'consentement',
    title: 'Consentement éclairé — traitement de racine',
    consentement: true,
    extraField: { key: 'dents', label: 'Dent(s) concernée(s)', type: 'text', placeholder: '26' },
    build: (p, d, dents) =>
      enteteConsent(p) +
      `déclare avoir été informé(e) par le Dr. ${d.name} de la nécessité d'un traitement endodontique (traitement de racine) sur : ${dents || '…'}.\n\n` +
      `Le praticien m'a expliqué que ce traitement vise à conserver une dent dont le nerf est atteint, qu'il peut demander plusieurs séances, et que la dent devra ensuite être protégée, le plus souvent par une couronne, sans quoi elle risque de se fracturer.\n\n` +
      `J'ai été informé(e) des aléas possibles : douleur passagère après la séance, canal difficile d'accès ou calcifié, fracture d'un instrument, persistance de l'infection pouvant conduire à une reprise du traitement, à une intervention chirurgicale, ou en dernier recours à l'extraction de la dent.` +
      piedConsent(),
  },
  {
    key: 'consent_prothese',
    famille: 'consentement',
    title: 'Consentement éclairé — prothèse',
    consentement: true,
    extraField: { key: 'travail', label: 'Travail prévu', type: 'text', placeholder: 'couronne céramique sur 16' },
    build: (p, d, travail) =>
      enteteConsent(p) +
      `déclare avoir été informé(e) par le Dr. ${d.name} du travail prothétique proposé : ${travail || '…'}.\n\n` +
      `Le praticien m'a expliqué le déroulement du traitement, le nombre de séances, le délai de réalisation par le laboratoire, ainsi que les alternatives possibles et leur coût. Le devis détaillé m'a été remis et j'en ai pris connaissance.\n\n` +
      `J'ai été informé(e) que la teinte et la forme sont choisies avant la réalisation, qu'une prothèse peut demander des retouches, et que sa durée de vie dépend de l'hygiène, des contrôles réguliers et de l'état des dents support.` +
      piedConsent(),
  },
  {
    key: 'consent_ortho',
    famille: 'consentement',
    title: 'Consentement éclairé — traitement orthodontique',
    consentement: true,
    extraField: { key: 'duree', label: 'Durée annoncée (mois)', type: 'number', placeholder: '18' },
    build: (p, d, duree) =>
      enteteConsent(p) +
      `déclare avoir été informé(e) par le Dr. ${d.name} du traitement orthodontique proposé, d'une durée estimée à ${duree || '…'} mois.\n\n` +
      `Le praticien m'a expliqué :\n` +
      `— que cette durée est une estimation, et qu'elle dépend directement de la régularité des rendez-vous et du respect des consignes ;\n` +
      `— que le traitement impose une hygiène rigoureuse, sans laquelle des caries et des taches peuvent apparaître autour des attaches ;\n` +
      `— les suites habituelles : gêne et sensibilité pendant quelques jours après chaque activation ;\n` +
      `— les aléas possibles : décollement d'attache, résorption radiculaire, récidive après la fin du traitement ;\n` +
      `— qu'une contention est indispensable à la fin, et que son abandon expose à un retour des dents vers leur position initiale.\n\n` +
      `Je m'engage à honorer les rendez-vous d'activation et à porter la contention selon les consignes.` +
      piedConsent(),
  },
  {
    key: 'consent_mineur',
    famille: 'consentement',
    title: 'Autorisation de soins pour un mineur',
    consentement: true,
    extraField: { key: 'soins', label: 'Soins envisagés', type: 'text', placeholder: 'soins conservateurs et extraction' },
    build: (p, d, soins) =>
      // Le nom du parent est repris de la fiche quand il y figure ; sinon on
      // laisse la ligne à remplir. Le texte reste modifiable : si c'est l'autre
      // parent ou un tuteur qui se présente, le praticien corrige en un mot.
      `Je soussigné(e), ${representantLegal(p) ?? '______________________________'}, agissant en qualité de père, mère ou tuteur légal de :\n\n` +
      `${identite(p)}\n\n` +
      `autorise le Dr. ${d.name} à pratiquer les soins suivants : ${soins || '…'}, ainsi que l'anesthésie locale qu'ils nécessitent.\n\n` +
      `J'ai été informé(e) du déroulement de ces soins, de leurs suites habituelles et de leurs alternatives, et j'ai pu poser toutes mes questions.\n\n` +
      `Je m'engage à signaler les antécédents médicaux et les traitements en cours de l'enfant.\n\n` +
      `Document établi en deux exemplaires : un remis au représentant légal, un conservé au dossier.\n\n` +
      `Fait le ${formatDateFr(new Date())}.`,
  },
  {
    // Le second usage du courrier au confrère : non plus demander un avis,
    // mais transmettre. Le médecin qui adresse son patient résume ce qu'il
    // sait — et sans trame, il écrit trois lignes ou rien.
    key: 'resume',
    famille: 'courrier',
    title: 'Résumé médical pour un confrère',
    extraField: { key: 'destinataire', label: 'Confrère destinataire', type: 'text', placeholder: 'Dr. X, cardiologue' },
    // Celui-ci est ENTIÈREMENT écrit par le dossier quand il est rempli : le
    // médecin relit et corrige au lieu de recopier. La trame vide reste là
    // pour une fiche neuve — un résumé médical d'un patient dont on ne sait
    // rien, ça existe aussi.
    build: (p, d, extra, _extras, resume) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `\n\nCher confrère${extra ? ` (${extra})` : ''},\n\n` +
      `Je vous adresse ${identite(p)}, que je suis.\n\n` +
      (resume
        ? `${resume}\n\n`
        : `Antécédents :\n\n` +
          `Traitement en cours :\n\n` +
          `Évolution et examen clinique :\n\n` +
          `Examens déjà réalisés :\n\n`) +
      `Je reste à votre disposition pour tout complément.\n\n` +
      `Confraternellement,\n\n` +
      pied(),
  },
  {
    key: 'libre',
    famille: 'certificat',
    title: 'Certificat libre',
    build: (p, d) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `\n\n` +
      pied(),
  },
]
