// Les consignes « à reprogrammer » encore ouvertes, toutes dates confondues.
//
// Le médecin pose la consigne en fin de consultation, puis clôture : le
// rendez-vous passe « parti », et toutes les listes du cabinet s'organisent
// autour de la JOURNÉE. Le lendemain, la consigne n'était donc affichée nulle
// part — alors que la migration v76 avait créé l'index exprès pour cette
// liste. Un médecin qui dit « revoyez-le dans quinze jours » voyait sa phrase
// disparaître avec la journée.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { colonneAbsente, tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.agenda) return NextResponse.json({ consignes: [] })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('appointments')
    .select('id, date, time, reprogrammer_jours, patient:patients(first_name, last_name, phone)')
    .eq('doctor_id', ctx.doctor.id)
    .not('reprogrammer_jours', 'is', null)
    .neq('status', 'cancelled')
    .order('date', { ascending: true })
    .limit(50)

  // Migration v76 pas passée : la liste n'existe pas, l'écran ne la montre
  // pas, et rien ne tombe en erreur.
  if (error) {
    if (colonneAbsente(error.code) || tableAbsente(error.code)) return NextResponse.json({ consignes: [] })
    console.error('[Cabinet] consignes illisibles :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }

  return NextResponse.json({ consignes: data ?? [] })
}
