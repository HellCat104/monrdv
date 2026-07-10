// Téléchargement d'un document par le PATIENT connecté.
// Sécurité : le document doit appartenir à une fiche patient liée à son compte.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('patient_documents')
    .select('id, file_path, file_name, file_type, patient:patients(user_id)')
    .eq('id', params.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerId = (doc?.patient as any)?.user_id
  if (!doc || ownerId !== user.id) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  const { data: blob, error } = await admin.storage.from('patient-documents').download(doc.file_path)
  if (error || !blob) return NextResponse.json({ error: 'Fichier indisponible' }, { status: 404 })

  const buf = Buffer.from(await blob.arrayBuffer())
  const safeName = (doc.file_name || 'document').replace(/[^\w.\- ]/g, '_')
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': doc.file_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
