'use client'

// Les consultations du cabinet dentaire, dans la fiche patient.
//
// Sans cette liste, une consultation commencée entre deux patients existait en
// base et aucun écran n'y menait : le brouillon était perdu. C'est le même
// défaut que j'avais trouvé côté gastro, et il se répare de la même façon —
// par une liste, pas par un bouton de plus.
//
// Une consultation VALIDÉE s'ouvre sur son compte rendu, qui est sa forme
// définitive ; un brouillon se rouvre en saisie.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDateFr } from '@/lib/utils'
import { Stethoscope, Plus } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>

export default function BlocConsultationsDentaires({ patientId }: { patientId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [consultations, setConsultations] = useState<Ligne[]>([])
  const [indisponible, setIndisponible] = useState(false)

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, date_consultation, motif, statut, dents')
      .eq('patient_id', patientId)
      .order('date_consultation', { ascending: false })
      .limit(20)
    // Pas de migration, pas de fonctionnalité — mais jamais d'écran cassé.
    if (error) { setIndisponible(true); return }
    setConsultations(data ?? [])
  }, [supabase, patientId])
  useEffect(() => { charger() }, [charger])

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary-600 flex items-center gap-1.5">
          <Stethoscope className="h-4 w-4" /> Consultations
        </h3>
        <button
          onClick={() => router.push(`/dentaire/consultation/${patientId}`)}
          className="flex items-center gap-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle consultation
        </button>
      </div>

      {indisponible ? (
        <p className="text-[11px] text-gray-400 italic">
          Les consultations structurées attendent une migration de la base (v81 et v85).
        </p>
      ) : consultations.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">
          Aucune consultation enregistrée. Motif, examen, diagnostic, actes réalisés et matériaux employés.
        </p>
      ) : (
        <ul className="space-y-1">
          {consultations.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <button
                onClick={() => router.push(c.statut === 'validee'
                  ? `/dentaire/consultation/cr/${c.id}`
                  : `/dentaire/consultation/${patientId}?id=${c.id}`)}
                className="flex-1 min-w-0 text-left text-sm text-primary-600 hover:underline truncate"
              >
                <span className="text-gray-400 text-[11px] mr-1.5">{formatDateFr(c.date_consultation)}</span>
                {c.motif || 'Consultation'}
                {(c.dents ?? []).length > 0 && (
                  <span className="text-gray-400 text-[11px]"> · dents {(c.dents as string[]).join(', ')}</span>
                )}
              </button>
              {c.statut === 'brouillon' && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                  brouillon
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
