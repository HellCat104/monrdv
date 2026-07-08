// Téléchargement du dossier patient COMPLET en .zip (récap HTML + fichiers réels).
// Réservé au médecin propriétaire.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { buildPatientDossier } from '@/lib/dossier'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, specialty, address, city, phone, ice, inpe, custom_vitals')
    .eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  const r = await buildPatientDossier(supabase, doctor, params.id)
  if (!r.ok || !r.html) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const zip = new JSZip()
  zip.file('dossier.html', r.html)
  const docsFolder = zip.folder('documents')
  for (const f of r.docFiles ?? []) docsFolder?.file(f.name, f.buf)

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="dossier-${r.slug}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
