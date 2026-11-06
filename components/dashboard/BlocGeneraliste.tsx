'use client'

// Le bloc MÉDECINE GÉNÉRALE dans le dossier patient : par où l'on crée, et ce
// qui a déjà été fait.
//
// ── POURQUOI IL EXISTE ──────────────────────────────────────────────────────
//
// La consultation structurée du généraliste était écrite mais sans porte : la
// route existait, et aucun écran n'y menait. Un brouillon commencé entre deux
// patients était donc perdu — il vivait en base, et rien ne le rouvrait.
//
// ── UN SEUL BOUTON « NOUVEAU » ──────────────────────────────────────────────
//
// Six liens côte à côte se relisent à chaque visite. Un bouton qui ouvre six
// entrées nommées se lit une fois, et la ligne d'aide dit à quoi chacune sert.
//
// ── CE QU'IL NE FAIT PAS ────────────────────────────────────────────────────
//
// Il ne calcule aucune date, ne déduit aucun suivi. La cloche à côté d'une
// consultation reprend LA DATE QUE LE MÉDECIN A ÉCRITE dans « prochain
// contrôle » et la transforme en rappel. Rien de plus.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Stethoscope, FileText, Mail, FlaskConical, Pill, Syringe,
  ChevronDown, Plus, BellRing,
} from 'lucide-react'
import { formatDateFr } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ligne = Record<string, any>

export default function BlocGeneraliste({
  patientId, doctorId,
}: {
  patientId: string
  doctorId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const [ouvert, setOuvert] = useState(false)
  const [consultations, setConsultations] = useState<Ligne[]>([])
  const [indisponible, setIndisponible] = useState(false)

  const retour = encodeURIComponent(`/patients/${patientId}`)

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('consultations')
      .select('id, date_consultation, motif, diagnostic, statut, prochain_controle')
      .eq('patient_id', patientId)
      .order('date_consultation', { ascending: false })
      .limit(20)
    // Pas de migration, pas de fonctionnalité — mais jamais d'écran cassé.
    if (error) { setIndisponible(true); return }
    setConsultations(data ?? [])
  }, [supabase, patientId])
  useEffect(() => { charger() }, [charger])

  /** Transformer un « prochain contrôle » en rappel. La date n'est jamais
   *  calculée : c'est celle que le médecin a saisie. */
  async function programmerSuivi(id: string, date: string, motif: string) {
    const { error } = await supabase.from('recalls').insert({
      doctor_id: doctorId, patient_id: patientId, due_date: date,
      reason: motif, status: 'pending', source_type: 'consultation', source_id: id,
    })
    alert(error
      ? 'Le suivi n’a pas pu être programmé.'
      : 'Suivi programmé. Il apparaît dans les rappels dus, sur l’accueil.')
  }

  const entrees = [
    { label: 'Consultation', aide: 'Motif, examen, diagnostic, traitement', icone: Stethoscope, href: `/generaliste/consultation/${patientId}?back=${retour}` },
    { label: 'Ordonnance', aide: 'Depuis un modèle ou vierge', icone: Pill, href: `/ordonnance/patient/${patientId}?back=${retour}` },
    { label: 'Demande d’examen', aide: 'Analyses, imagerie', icone: FlaskConical, href: `/certificat/nouveau/${patientId}?famille=examen&back=${retour}` },
    { label: 'Certificat ou arrêt', aide: 'Repos, aptitude, scolaire', icone: FileText, href: `/certificat/nouveau/${patientId}?famille=certificat&back=${retour}` },
    { label: 'Courrier au confrère', aide: 'Demande d’avis, résumé médical', icone: Mail, href: `/certificat/nouveau/${patientId}?famille=courrier&back=${retour}` },
    { label: 'Vaccin', aide: 'Enregistrer et remettre le certificat', icone: Syringe, href: `/vaccin/${patientId}?back=${retour}` },
  ]

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-primary-600">Médecine générale</h3>
        <div className="relative">
          <button onClick={() => setOuvert(!ouvert)}
            className="flex items-center gap-1.5 text-xs font-medium bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600 transition">
            <Plus className="h-3.5 w-3.5" /> Nouveau <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {ouvert && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
              {/* Ancré à DROITE : à 375 px, un menu de 256 px ancré à gauche
                  sort de l'écran et on ne lit plus que le début des libellés. */}
              <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1">
                {entrees.map((e) => (
                  <a key={e.label} href={e.href} className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 transition">
                    <e.icone className="h-4 w-4 text-primary-500 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-900">{e.label}</span>
                      <span className="block text-[11px] text-gray-400">{e.aide}</span>
                    </span>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {indisponible ? (
        <p className="text-[11px] text-gray-400 italic">
          Les consultations structurées attendent une migration de la base (v81).
        </p>
      ) : (
        <div>
          <p className="text-[11px] font-medium text-gray-400 mb-1">Consultations</p>
          {consultations.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic">Aucune consultation enregistrée.</p>
          ) : (
            <ul className="space-y-1">
              {consultations.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(
                      c.statut === 'validee'
                        ? `/generaliste/consultation/cr/${c.id}`
                        : `/generaliste/consultation/${patientId}?id=${c.id}`,
                    )}
                    className="flex-1 min-w-0 text-left text-sm text-primary-600 hover:underline truncate"
                  >
                    <span className="text-gray-400 text-[11px] mr-1.5">{formatDateFr(c.date_consultation)}</span>
                    {String(c.motif ?? '').trim() || String(c.diagnostic ?? '').trim() || 'Consultation'}
                  </button>
                  {c.statut === 'brouillon' && (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">
                      brouillon
                    </span>
                  )}
                  {c.prochain_controle && (
                    <button
                      onClick={() => programmerSuivi(c.id, c.prochain_controle, String(c.motif ?? '').trim() || 'Contrôle')}
                      title={`Programmer le suivi du ${formatDateFr(c.prochain_controle)}`}
                      className="text-gray-400 hover:text-primary-600 shrink-0"
                    >
                      <BellRing className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
