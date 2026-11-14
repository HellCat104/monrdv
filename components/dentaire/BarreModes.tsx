'use client'

// LES DEUX MODES DU DOSSIER — « Dossier patient » et « Consultation en cours ».
//
// Un seul dossier, deux façons d'y travailler. Cette barre est la même en haut
// des deux écrans : le patient ne change pas, seul le mode change, et le
// praticien voit toujours où il est.
//
// Les deux modes sont deux adresses (/patients/… et /consultation/…), reliées
// par des liens préchargés : la bascule est immédiate, et un retour arrière du
// navigateur ramène au mode précédent comme on s'y attend.
//
// Au clavier : Alt + D pour le dossier, Alt + C pour la consultation.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { FolderOpen, Stethoscope } from 'lucide-react'

export default function BarreModes({
  patientId, mode, rdv,
}: {
  patientId: string
  mode: 'dossier' | 'consultation'
  /** Le rendez-vous du jour sur lequel s'ouvre la consultation. Absent : pas
   *  de séance aujourd'hui, l'onglet le dit au lieu de mener nulle part. */
  rdv: { id: string; time?: string | null } | null
}) {
  const router = useRouter()
  const versDossier = `/patients/${patientId}`
  const versConsultation = rdv ? `/consultation/${rdv.id}` : null

  useEffect(() => {
    function touche(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey) return
      // `code` et non `key` : sur Mac, Alt + D produit « ∂ ».
      if (e.code === 'KeyD' && mode !== 'dossier') { e.preventDefault(); router.push(versDossier) }
      if (e.code === 'KeyC' && mode !== 'consultation' && versConsultation) { e.preventDefault(); router.push(versConsultation) }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [mode, router, versDossier, versConsultation])

  const actif = 'bg-white text-gray-900 shadow-sm'
  const inactif = 'text-gray-600 hover:text-gray-900'

  return (
    <nav aria-label="Mode de travail" className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
      <Link
        href={versDossier}
        prefetch
        aria-current={mode === 'dossier' ? 'page' : undefined}
        title="Alt + D"
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${mode === 'dossier' ? actif : inactif}`}
      >
        <FolderOpen className="h-4 w-4" /> Dossier patient
      </Link>
      {versConsultation ? (
        <Link
          href={versConsultation}
          prefetch
          aria-current={mode === 'consultation' ? 'page' : undefined}
          title="Alt + C"
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${mode === 'consultation' ? actif : inactif}`}
        >
          <Stethoscope className="h-4 w-4" />
          Consultation en cours
          {rdv?.time && <span className="text-xs font-normal text-gray-400">{String(rdv.time).slice(0, 5)}</span>}
        </Link>
      ) : (
        <span
          className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-gray-400 cursor-not-allowed"
          title="Aucun rendez-vous aujourd’hui pour ce patient. Donnez-lui-en un depuis l’agenda (ou « Sans RDV ») pour ouvrir une consultation."
        >
          <Stethoscope className="h-4 w-4" /> Pas de séance aujourd&apos;hui
        </span>
      )}
    </nav>
  )
}
