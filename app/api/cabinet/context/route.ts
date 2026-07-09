// Contexte minimal de la secrétaire connectée (pour le client : id du médecin).
import { NextResponse } from 'next/server'
import { getStaffContext } from '@/lib/cabinet'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  return NextResponse.json({ doctorId: ctx.doctor.id, doctorName: ctx.doctor.name, permissions: ctx.permissions })
}
