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
import { RUBRIQUES_GENERALISTE, TRAMES_GENERALISTE } from '@/lib/generaliste'

export const dynamic = 'force-dynamic'

export default function ApercuConsultationGeneraliste() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <b>Bac à sable.</b> Patient inventé, aucune base de données derrière.
          Les boutons « Brouillon » et « Valider » ne marcheront pas, c&apos;est normal.
          Tout le reste — rubriques, trames, mise en page — est l&apos;écran réel.
        </p>
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
        retourCr="/apercu/consultation"
      />
    </div>
  )
}
