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

export default function ApercuConsultationGeneraliste() {
  horsLigne()
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <b>Bac à sable.</b> Patient inventé, aucune base de données derrière.
          Les boutons « Brouillon » et « Valider » ne marcheront pas, c&apos;est normal.
          Tout le reste — rubriques, trames, mise en page — est l&apos;écran réel.
        </p>
        <div className="mt-4">
          <ResumePatient preparation={BERRADA} titre="Avant de commencer" compact />
        </div>
      </div>
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
      />
    </div>
  )
}
