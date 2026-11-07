// Ce qui s'affiche quand MonRDV n'a pas l'imprimé de la caisse.
//
// ── POURQUOI UN ÉCRAN PLUTÔT QU'UN DOCUMENT ─────────────────────────────────
//
// Jusqu'ici, faute de l'imprimé d'un organisme, le logiciel sortait une
// « feuille de soins MonRDV » — un document maison, complet et signé, à
// agrafer au formulaire de la caisse. L'intention était bonne et le résultat
// trompeur : le praticien tenait un papier qui RESSEMBLAIT à une feuille de
// soins, le remettait tel quel, et la caisse le renvoyait. Un formulaire
// officiel se remplit, il ne se dessine pas.
//
// On ne produit donc plus rien du tout, et on le dit. Mieux vaut un praticien
// qui sait qu'il doit prendre l'imprimé papier qu'un praticien qui croit avoir
// fini.
//
// ── CE QUE L'ÉCRAN DOIT DONNER ──────────────────────────────────────────────
//
// Le nom de la caisse, parce que « indisponible » tout court laisse croire à
// une panne. Et la sortie : nous envoyer le scan de son formulaire, qui est
// exactement comme ça que les quatre autres sont arrivés.
import Link from 'next/link'
import { FileX } from 'lucide-react'

export default function FeuilleIndisponible({
  patientId, organismeNom, raison,
}: {
  patientId: string
  /** Le nom de la caisse, tel qu'il est écrit sur la fiche. `null` quand la
   *  feuille n'en porte aucune. */
  organismeNom: string | null
  /** Pourquoi, en une phrase, dans les mots de ce cas-là. */
  raison: string
}) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <FileX className="h-6 w-6 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Feuille de soins indisponible</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {organismeNom ? organismeNom : 'Aucun organisme sur cette feuille'}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed">{raison}</p>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[13px] text-amber-900 leading-relaxed">
            Remplissez l&apos;imprimé papier de la caisse. MonRDV ne produit pas de feuille de
            soins « maison » à sa place : un document qui ressemble à une feuille de soins sans
            en être une se fait renvoyer, et le patient perd son remboursement.
          </p>
        </div>

        <p className="text-[13px] text-gray-500 leading-relaxed">
          Envoyez-nous un scan de ce formulaire et il sortira rempli, comme ceux de la CNSS, du
          CNOPS, de RMA Watanya et de la Mutuelle des FAR.
        </p>

        <div className="pt-1">
          <Link href={`/patients/${patientId}`} className="text-sm text-primary-600 hover:underline">
            ← Retour au patient
          </Link>
        </div>
      </div>
    </div>
  )
}
