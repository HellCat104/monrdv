// Modèles de certificats médicaux (généraliste Maroc) + le modèle « libre ».
// Le texte généré est ÉDITABLE avant enregistrement, puis figé (archive légale).
import { formatDateFr } from '@/lib/utils'

export interface CertPatient { first_name: string; last_name: string; age?: number | null; cin?: string | null }
export interface CertDoctor { name: string }

export interface CertTemplate {
  key: string
  title: string
  // champ complémentaire demandé au médecin (en plus du motif, commun à tous)
  extraField?: { key: string; label: string; type: 'number' | 'text'; placeholder?: string }
  build: (p: CertPatient, d: CertDoctor, extra: string) => string
}

const identite = (p: CertPatient) =>
  `${p.first_name} ${p.last_name}${p.age != null ? `, âgé(e) de ${p.age} ans` : ''}${p.cin ? `, titulaire de la CIN n° ${p.cin}` : ''}`

const entete = (d: CertDoctor) =>
  `Je soussigné(e), Dr. ${d.name}, certifie avoir examiné ce jour :\n\n${'{PATIENT}'}\n\n`

const pied = () =>
  `\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.\n\nFait le ${formatDateFr(new Date())}.`

export const CERT_TEMPLATES: CertTemplate[] = [
  {
    key: 'repos',
    title: 'Certificat médical de repos',
    extraField: { key: 'jours', label: 'Nombre de jours de repos', type: 'number', placeholder: '3' },
    build: (p, d, jours) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `Son état de santé nécessite un repos de ${jours || '…'} jour(s) à compter de ce jour, sauf complications.` +
      pied(),
  },
  {
    key: 'sport',
    title: 'Certificat d’aptitude au sport',
    extraField: { key: 'sport', label: 'Sport / activité', type: 'text', placeholder: 'football' },
    build: (p, d, sport) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `L'examen clinique de ce jour ne révèle aucune contre-indication apparente à la pratique de : ${sport || '…'}, y compris en compétition.` +
      pied(),
  },
  {
    key: 'scolaire',
    title: 'Certificat d’aptitude scolaire',
    build: (p, d) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `L'examen clinique de ce jour ne révèle aucune contre-indication apparente à la scolarité ni aux activités physiques scolaires.` +
      pied(),
  },
  {
    key: 'permis',
    title: 'Certificat médical — permis de conduire',
    extraField: { key: 'categorie', label: 'Catégorie du permis', type: 'text', placeholder: 'B' },
    build: (p, d, cat) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `L'examen clinique de ce jour (acuité visuelle, appareil locomoteur, état général) ne révèle aucune contre-indication apparente à la conduite des véhicules de catégorie ${cat || '…'}.` +
      pied(),
  },
  {
    key: 'courrier',
    title: 'Courrier au confrère',
    extraField: { key: 'destinataire', label: 'Confrère destinataire', type: 'text', placeholder: 'Dr. X, cardiologue' },
    build: (p, d, dest) =>
      `Cher confrère,\n\nJe vous adresse ${identite(p)} pour avis spécialisé et prise en charge.\n\n` +
      `Motif d'adressage et renseignements cliniques :\n\n\n` +
      `Vous remerciant de votre retour, veuillez agréer, cher confrère, mes salutations confraternelles.\n\n` +
      `À l'attention de : ${dest || '…'}\nDr. ${d.name} — le ${formatDateFr(new Date())}`,
  },
  {
    key: 'analyses',
    title: 'Demande d’analyses',
    build: (p, d) =>
      `Demande d'examens biologiques pour :\n\n${identite(p)}\n\n` +
      `Examens demandés :\n\n\n` +
      `Dr. ${d.name} — le ${formatDateFr(new Date())}`,
  },
  {
    key: 'libre',
    title: 'Certificat libre',
    build: (p, d) =>
      entete(d).replace('{PATIENT}', identite(p)) +
      `\n\n` +
      pied(),
  },
]
