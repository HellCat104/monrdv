// Téléchargement du dossier patient COMPLET.
// - Sans document joint : un .pdf téléchargé directement.
// - Avec documents joints : un .zip (dossier.pdf + fichiers réels).
// Réservé au médecin propriétaire.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { buildPatientDossierPDF } from '@/lib/dossier'
import { canAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, specialty, address, city, phone, ice, inpe, custom_vitals, plan')
    .eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })
  if (!canAccess(doctor.plan, 'records')) return NextResponse.json({ error: 'Fonction réservée au forfait Cabinet complet' }, { status: 403 })

  const r = await buildPatientDossierPDF(supabase, doctor, params.id)
  if (!r.ok || !r.pdf) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const docFiles = r.docFiles ?? []

  // Pas de document joint → PDF direct
  if (docFiles.length === 0) {
    return new NextResponse(new Uint8Array(r.pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dossier-${r.slug}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // Avec documents → .zip (PDF récap + fichiers d'origine)
  const zip = new JSZip()
  zip.file(`dossier-${r.slug}.pdf`, r.pdf)
  const docsFolder = zip.folder('documents')
  for (const f of docFiles) docsFolder?.file(f.name, f.buf)

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
