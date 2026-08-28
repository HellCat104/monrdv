'use client'

// Feuille de route du jour : vue épurée, imprimable et plein écran, du planning
// d'une journée. Utilisée par le médecin (/appointments) et la secrétaire (agenda).
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatTime } from '@/lib/utils'
import { Printer, X } from 'lucide-react'

export interface DaySheetItem {
  id: string
  time: string
  /** Durée réelle du RDV : elle varie selon le motif choisi */
  duration?: number | null
  name: string
  motif?: string | null
  phone?: string | null
  attendance?: string | null
  amount_paid?: number | null
  payment_method?: string | null
}
export interface DaySheetBlock {
  id: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

const ATT_LABEL: Record<string, string> = { present: 'Présent', late: 'En retard', absent: 'Absent' }

export default function DaySheet({
  doctorName, date, items, blocks = [], showPhone = true, showMoney = true, onClose,
}: {
  doctorName: string
  date: string
  items: DaySheetItem[]
  blocks?: DaySheetBlock[]
  showPhone?: boolean
  showMoney?: boolean
  onClose: () => void
}) {
  const sorted = [...items].sort((a, b) => String(a.time).localeCompare(String(b.time)))
  const nbPresents = sorted.filter((i) => i.attendance === 'present').length
  const encaisse = sorted.reduce((s, i) => s + (i.amount_paid ?? 0), 0)
  const nbEncaisses = sorted.filter((i) => i.amount_paid != null).length

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white feuille-route">
      {/* CSS d'impression : n'imprime que la feuille, masque le reste + la barre d'actions */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .feuille-route, .feuille-route * { visibility: visible !important; }
          .feuille-route { position: absolute !important; inset: 0 !important; }
          .fr-no-print { display: none !important; }
          @page { margin: 14mm; }
        }
      `}</style>

      {/* Barre d'actions (non imprimée) */}
      <div className="fr-no-print sticky top-0 flex items-center justify-between gap-2 bg-gray-50 border-b border-gray-200 px-4 py-3">
        <span className="text-sm text-gray-500">Feuille de route — aperçu avant impression</span>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm bg-primary-500 text-white rounded-lg px-3 py-1.5 hover:bg-primary-600">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-100">
            <X className="h-4 w-4" /> Fermer
          </button>
        </div>
      </div>

      {/* Contenu imprimable */}
      <div className="max-w-3xl mx-auto px-6 py-6 text-gray-900">
        <div className="flex items-end justify-between border-b-2 border-gray-900 pb-3">
          <div>
            <h1 className="text-xl font-bold">{doctorName}</h1>
            <p className="text-sm text-gray-600 capitalize">{format(new Date(date + 'T12:00:00'), 'EEEE d MMMM yyyy', { locale: fr })}</p>
          </div>
          <div className="text-right text-xs text-gray-600 space-y-0.5">
            <p><span className="font-semibold text-gray-900">{sorted.length}</span> rendez-vous</p>
            <p><span className="font-semibold text-gray-900">{nbPresents}</span> présent(s)</p>
            {showMoney && <p><span className="font-semibold text-gray-900">{encaisse} DH</span> encaissés ({nbEncaisses})</p>}
          </div>
        </div>

        {blocks.length > 0 && (
          <div className="mt-3 text-xs text-gray-600">
            <span className="font-semibold">Créneaux bloqués : </span>
            {blocks.map((b, i) => (
              <span key={b.id}>
                {i > 0 ? ' · ' : ''}
                {b.start_time ? `${String(b.start_time).substring(0, 5)}–${String(b.end_time).substring(0, 5)}` : 'journée entière'}
                {b.reason ? ` (${b.reason})` : ''}
              </span>
            ))}
          </div>
        )}

        {sorted.length === 0 ? (
          <p className="mt-8 text-center text-gray-400 text-sm">Aucun rendez-vous ce jour.</p>
        ) : (
          <table className="mt-4 w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-2 w-16">Heure</th>
                <th className="py-2 pr-2">Patient</th>
                <th className="py-2 pr-2">Motif</th>
                {showPhone && <th className="py-2 pr-2">Tél.</th>}
                <th className="py-2 pr-2 w-16 text-center">Présent</th>
                {showMoney && <th className="py-2 pr-2 w-20 text-right">Réglé</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-2 font-semibold whitespace-nowrap">
                    {formatTime(i.time)}
                    {i.duration ? <span className="font-normal text-gray-500"> · {i.duration} min</span> : null}
                  </td>
                  <td className="py-2 pr-2">{i.name}</td>
                  <td className="py-2 pr-2 text-gray-600">{i.motif || '—'}</td>
                  {showPhone && <td className="py-2 pr-2 text-gray-600">{i.phone || '—'}</td>}
                  <td className="py-2 pr-2 text-center">
                    {i.attendance ? (ATT_LABEL[i.attendance] ?? i.attendance) : <span className="inline-block w-4 h-4 border border-gray-400 rounded-sm align-middle" />}
                  </td>
                  {showMoney && <td className="py-2 pr-2 text-right text-gray-700">{i.amount_paid != null ? `${i.amount_paid} DH` : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-8 text-[10px] text-gray-400 text-center">MonRDV · Feuille de route générée le {format(new Date(), 'd MMM yyyy à HH:mm', { locale: fr })}</p>
      </div>
    </div>
  )
}
