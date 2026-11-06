// BAC À SABLE — à ne pas confondre avec une page de l'application.
//
// Elle rend le VRAI écran de consultation, avec les vraies rubriques et les
// vraies trames du généraliste, mais sur un patient inventé et sans aucune
// base de données. Elle existe pour qu'on puisse regarder et discuter un
// écran avant de le brancher : on ouvre http://localhost:3000/apercu/
// consultation, on clique, on juge, et rien n'est écrit nulle part.
//
// Les boutons « Brouillon » et « Valider » échoueront : ils parlent à
// Supabase, qui n'est pas configuré ici. C'est voulu — un bac à sable qui
// enregistre n'est plus un bac à sable.
//
// À SUPPRIMER le jour où la consultation du généraliste est branchée pour de
// bon : elle ne doit pas survivre en production comme une porte dérobée.
import ConsultationStructuree from '@/components/consultation/ConsultationStructuree'
import DossierDeConsultation, { type DonneesDossier } from '@/components/consultation/DossierDeConsultation'
import ResumePatient from '@/components/dashboard/ResumePatient'
import { preparer } from '@/lib/preparation'
import { RUBRIQUES_GENERALISTE, TRAMES_GENERALISTE, COLONNES_FACULTATIVES_GENERALISTE } from '@/lib/generaliste'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** EN LIGNE, CETTE PAGE N'EXISTE PAS.
 *
 *  Un bac à sable est fait pour être regardé sur sa machine. Publié sur
 *  monrdv.co.ma, c'est une URL sans mot de passe qui montre des patientes
 *  inventées à qui tombe dessus — un prospect, un confrère, Google. Le
 *  404 est renvoyé AVANT tout rendu : il n'y a rien à deviner, pas même
 *  le titre de la page.
 *
 *  En local (`npm run dev`), rien ne change. */
function horsLigne() {
  if (process.env.NODE_ENV === 'production') notFound()
}

/** Le même dossier inventé que /apercu, pour que les deux écrans parlent de
 *  la même patiente. Journée de référence figée. */
const BERRADA = preparer({
  patient: {
    age: 58,
    allergies: 'Sulfamides (éruption, 2009)',
    conditions: ['Hypertension artérielle', 'Diabète de type 2'],
    chronic_conditions: 'Dyslipidémie',
    surgeries: 'Césarienne 1994',
    current_treatments: 'Amlodipine 5 mg\nMetformine 850 mg × 2',
    anamnese_maj: '2025-02-10',
  },
  constantes: [
    { measured_at: '2026-10-02', values: { systolic: 152, diastolic: 94, heart_rate: 78, weight: 78, height: 162 } },
    { measured_at: '2026-06-18', values: { systolic: 148, diastolic: 92, heart_rate: 74, weight: 77, height: 162 } },
  ],
  consultations: [
    { date: '2026-10-02', titre: 'Suivi d’hypertension artérielle' },
    { date: '2026-06-18', titre: 'Renouvellement de traitement' },
  ],
  ordonnances: [{ created_at: '2026-06-18' }],
  documents: [{ created_at: '2025-05-06', file_name: 'Bilan sanguin mai 2025.pdf' }],
  rappels: [{ due_date: '2026-10-15', reason: 'Contrôle tensionnel à 3 mois' }],
  aujourdhui: '2026-11-06',
})

/** Le dossier de la même patiente, inventé de bout en bout. Il sert à
 *  regarder le rangement des rubriques, pas à juger des données. */
const DOSSIER: DonneesDossier = {
  administratif: [
    { label: 'Nom', valeur: 'BERRADA Fatima' },
    { label: 'Né(e) le', valeur: '14/03/1968' },
    { label: 'Âge', valeur: '58 ans' },
    { label: 'Sexe', valeur: 'Féminin' },
    { label: 'CIN', valeur: 'BK 418 332' },
    { label: 'Téléphone', valeur: '06 61 00 00 00' },
    { label: 'Adresse', valeur: '12 rue Ibn Batouta, Casablanca' },
    { label: 'Mutuelle', valeur: 'CNSS' },
  ],
  allergies: 'Sulfamides (éruption, 2009)',
  etiquettes: ['Hypertension artérielle', 'Diabète de type 2'],
  chroniques: 'Dyslipidémie',
  chirurgies: 'Césarienne 1994',
  familiaux: 'Père : infarctus à 62 ans',
  anamneseMaj: '2025-02-10',
  traitements: 'Amlodipine 5 mg — 1 le matin\nMetformine 850 mg — matin et soir\nAtorvastatine 20 mg — le soir',
  ordonnances: [
    { id: 'o1', created_at: '2026-06-18', content: 'Amlodipine 5 mg : 1 comprimé le matin, 3 mois\nMetformine 850 mg : 1 comprimé matin et soir, 3 mois' },
  ],
  rappels: [{ id: 'r1', due_date: '2026-10-15', reason: 'Contrôle tensionnel à 3 mois' }],
  consultations: [
    { id: 'c1', date_consultation: '2026-10-02', motif: 'Suivi d\u2019hypertension artérielle', diagnostic: null, statut: 'validee' },
    { id: 'c2', date_consultation: '2026-06-18', motif: 'Renouvellement de traitement', diagnostic: null, statut: 'validee' },
    { id: 'c3', date_consultation: '2026-02-10', motif: 'Lombalgie aiguë', diagnostic: null, statut: 'brouillon' },
  ],
  documents: [
    { id: 'd1', file_name: 'Bilan sanguin mai 2025.pdf', file_path: 'apercu/bilan.pdf', categorie: 'biologie', created_at: '2025-05-06' },
    { id: 'd2', file_name: 'Échographie abdominale.pdf', file_path: 'apercu/echo.pdf', categorie: 'imagerie', created_at: '2024-11-21' },
  ],
  vaccins: [{ id: 'v1', libelle: 'Grippe saisonnière', administre_le: '2025-11-04', rappel_le: '2026-11-04' }],
  constantes: {
    mesureLe: '2026-10-02',
    lignes: ['Poids : 78 kg (+1 depuis le 18/06/2026)', 'Tension systolique : 152 mmHg (+4 depuis le 18/06/2026)', 'Tension diastolique : 94 mmHg (+2 depuis le 18/06/2026)', 'Fréquence cardiaque : 78 bpm'],
  },
  aujourdhui: '2026-11-06',
}

export default function ApercuConsultationGeneraliste() {
  horsLigne()
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <b>Bac à sable.</b> Patient inventé, aucune base de données derrière.
          Les boutons « Brouillon » et « Valider » ne marcheront pas, c&apos;est normal.
          Tout le reste — rubriques, trames, mise en page — est l&apos;écran réel.
        </p>
        <ResumePatient preparation={BERRADA} titre="Avant de commencer" compact />
        <DossierDeConsultation
          patient={{ id: 'apercu', first_name: 'Fatima', last_name: 'Berrada', age: 58 }}
          donnees={DOSSIER}
          retourCr="/apercu/consultation"
        >
          <ConsultationStructuree
            doctorId="apercu"
            patient={{ id: 'apercu', first_name: 'Fatima', last_name: 'Berrada', age: 58 }}
            appointmentId={null}
            existant={null}
            dossier={{
              antecedents: 'Hypertension artérielle depuis 2016\nDiabète de type 2 depuis 2021\nChirurgicaux : césarienne 1994',
              allergies: 'Sulfamides (éruption, 2009)',
              mesures: 'Poids 78 kg · TA 148/92 · FC 76 (le 12/08/2026)',
            }}
            rubriques={RUBRIQUES_GENERALISTE}
            trames={TRAMES_GENERALISTE}
            colonnesFacultatives={COLONNES_FACULTATIVES_GENERALISTE}
            retourCr="/apercu/consultation"
            pleineLargeur
          />
        </DossierDeConsultation>
      </div>
    </div>
  )
}
