// Liste des patients pour la secrétaire — COORDONNÉES uniquement (aucun champ médical).
import { getStaffContext } from '@/lib/cabinet'
import { createAdminClient } from '@/lib/supabase/server'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CabinetPatientsPage() {
  const ctx = await getStaffContext()
  if (!ctx) return null
  if (!ctx.permissions.patients_contact) {
    return <p className="text-sm text-gray-500">Vous n’avez pas accès aux fiches patients.</p>
  }

  const admin = createAdminClient()
  // On ne sélectionne QUE les coordonnées — jamais allergies / antécédents / notes.
  const { data } = await admin
    .from('patients')
    .select('id, first_name, last_name, phone, age')
    .eq('doctor_id', ctx.doctor.id)
    .order('created_at', { ascending: false })
  const patients = data ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Users className="h-5 w-5 text-primary-500" /> Patients ({patients.length})</h1>

      {patients.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">Aucun patient.</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {patients.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3.5">
              <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-semibold shrink-0">
                {(p.first_name?.[0] ?? '').toUpperCase()}{(p.last_name?.[0] ?? '').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.first_name} {p.last_name}{p.age != null ? ` · ${p.age} ans` : ''}</p>
                <p className="text-xs text-gray-500">{p.phone}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400">Le dossier médical (allergies, antécédents, notes, ordonnances) n’est pas accessible avec votre profil.</p>
    </div>
  )
}
