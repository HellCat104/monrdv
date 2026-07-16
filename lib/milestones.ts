// Repères de développement de l'enfant (psychomoteur, langage, sensoriel,
// social) par âge de visite. Grille indicative inspirée des repères OMS et du
// carnet de santé — à cocher rapidement pendant l'examen.

export type MilestoneDomain = 'motricite' | 'langage' | 'sensoriel' | 'social'

export interface MilestoneItem {
  key: string
  label: string
  domain: MilestoneDomain
}

export interface MilestoneVisit {
  months: number
  label: string
  items: MilestoneItem[]
}

export const DOMAIN_LABELS: Record<MilestoneDomain, string> = {
  motricite: 'Motricité',
  langage: 'Langage',
  sensoriel: 'Audition / Vision',
  social: 'Social',
}

export const MILESTONE_VISITS: MilestoneVisit[] = [
  {
    months: 2, label: '2 mois', items: [
      { key: 'm2_tete', label: 'Tient sa tête quelques instants (sur le ventre)', domain: 'motricite' },
      { key: 'm2_sourire', label: 'Sourire-réponse', domain: 'social' },
      { key: 'm2_regard', label: 'Suit un objet du regard', domain: 'sensoriel' },
      { key: 'm2_sons', label: 'Réagit aux sons / à la voix', domain: 'sensoriel' },
      { key: 'm2_vocalise', label: 'Émet des petits sons (areu)', domain: 'langage' },
    ],
  },
  {
    months: 4, label: '4 mois', items: [
      { key: 'm4_tete', label: 'Tient sa tête droite et stable', domain: 'motricite' },
      { key: 'm4_attrape', label: 'Attrape un objet volontairement', domain: 'motricite' },
      { key: 'm4_rit', label: 'Rit aux éclats', domain: 'social' },
      { key: 'm4_gazouille', label: 'Gazouille en réponse', domain: 'langage' },
      { key: 'm4_oriente', label: "S'oriente vers la source d'un bruit", domain: 'sensoriel' },
    ],
  },
  {
    months: 6, label: '6 mois', items: [
      { key: 'm6_assis_appui', label: 'Se tient assis avec appui', domain: 'motricite' },
      { key: 'm6_retourne', label: 'Se retourne (dos ↔ ventre)', domain: 'motricite' },
      { key: 'm6_transfert', label: "Passe un objet d'une main à l'autre", domain: 'motricite' },
      { key: 'm6_babille', label: 'Babille (ba-ba, da-da)', domain: 'langage' },
      { key: 'm6_prenom', label: 'Réagit à son prénom', domain: 'sensoriel' },
    ],
  },
  {
    months: 9, label: '9 mois', items: [
      { key: 'm9_assis', label: 'Tient assis sans appui', domain: 'motricite' },
      { key: 'm9_pince', label: 'Pince pouce-index (début)', domain: 'motricite' },
      { key: 'm9_syllabes', label: 'Répète des syllabes (mamama…)', domain: 'langage' },
      { key: 'm9_etranger', label: "Réagit à l'étranger (peur / méfiance)", domain: 'social' },
      { key: 'm9_bruit', label: 'Se retourne à un bruit doux (audition)', domain: 'sensoriel' },
      { key: 'm9_objet', label: 'Cherche un objet caché (vision / attention)', domain: 'sensoriel' },
    ],
  },
  {
    months: 12, label: '12 mois', items: [
      { key: 'm12_debout', label: 'Se met debout avec appui / marche tenu', domain: 'motricite' },
      { key: 'm12_pince', label: 'Pince fine pouce-index acquise', domain: 'motricite' },
      { key: 'm12_mots', label: 'Dit « papa / maman » (ou 1-2 mots)', domain: 'langage' },
      { key: 'm12_aurevoir', label: 'Fait « au revoir » de la main', domain: 'social' },
      { key: 'm12_consigne', label: 'Comprend une consigne simple', domain: 'langage' },
    ],
  },
  {
    months: 18, label: '18 mois', items: [
      { key: 'm18_marche', label: 'Marche seul (acquise)', domain: 'motricite' },
      { key: 'm18_cubes', label: 'Empile 2-3 cubes', domain: 'motricite' },
      { key: 'm18_mots', label: 'Dit plusieurs mots (≥ 8-10)', domain: 'langage' },
      { key: 'm18_montre', label: 'Montre du doigt ce qu\'il veut', domain: 'social' },
      { key: 'm18_designe', label: 'Désigne une partie du corps', domain: 'langage' },
    ],
  },
  {
    months: 24, label: '24 mois', items: [
      { key: 'm24_court', label: 'Court / monte les escaliers (tenu)', domain: 'motricite' },
      { key: 'm24_2mots', label: 'Associe 2 mots (« papa parti »)', domain: 'langage' },
      { key: 'm24_images', label: 'Nomme des images familières', domain: 'langage' },
      { key: 'm24_cuillere', label: 'Mange seul à la cuillère', domain: 'social' },
      { key: 'm24_imite', label: 'Imite les gestes du quotidien', domain: 'social' },
      { key: 'm24_tour', label: 'Tour de 6 cubes', domain: 'motricite' },
    ],
  },
  {
    months: 36, label: '3 ans', items: [
      { key: 'm36_saute', label: 'Saute sur place, pédale sur un tricycle', domain: 'motricite' },
      { key: 'm36_phrases', label: 'Fait des phrases (3 mots et +)', domain: 'langage' },
      { key: 'm36_prenom', label: 'Dit son prénom', domain: 'langage' },
      { key: 'm36_joue', label: "Joue avec d'autres enfants", domain: 'social' },
      { key: 'm36_proprete', label: 'Propreté de jour', domain: 'social' },
      { key: 'm36_rond', label: 'Copie un rond', domain: 'motricite' },
    ],
  },
  {
    months: 48, label: '4 ans', items: [
      { key: 'm48_unpied', label: 'Tient sur un pied quelques secondes', domain: 'motricite' },
      { key: 'm48_histoire', label: 'Raconte une petite histoire', domain: 'langage' },
      { key: 'm48_compte', label: "Compte jusqu'à 4", domain: 'langage' },
      { key: 'm48_carre', label: 'Copie une croix / un carré', domain: 'motricite' },
      { key: 'm48_vision', label: 'Acuité visuelle vérifiée (échelle images)', domain: 'sensoriel' },
    ],
  },
  {
    months: 60, label: '5 ans', items: [
      { key: 'm60_sautille', label: 'Sautille sur un pied', domain: 'motricite' },
      { key: 'm60_bonhomme', label: 'Dessine un bonhomme (≥ 6 parties)', domain: 'motricite' },
      { key: 'm60_langage', label: 'Langage clair, compréhensible par tous', domain: 'langage' },
      { key: 'm60_couleurs', label: 'Connaît les couleurs', domain: 'langage' },
      { key: 'm60_audition', label: 'Audition vérifiée (voix chuchotée)', domain: 'sensoriel' },
    ],
  },
]

// Statut d'un repère dans patients.milestones (JSONB) :
// { [key]: { s: 'ok' | 'ko', d: 'YYYY-MM-DD' } }
export type MilestoneStatus = { s: 'ok' | 'ko'; d: string }
export type MilestonesMap = Record<string, MilestoneStatus>
