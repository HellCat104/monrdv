// Téléchargement groupé : les dossiers complets d'une sélection de patients,
// dans un seul .zip (un sous-dossier par patient : dossier.pdf + fichiers réels).
// Réservé au médecin propriétaire.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { buildPatientDossierPDF } from '@/lib/dossier'
import { canAccess } from '@/lib/plan'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PATIENTS = 40 // garde-fou contre les timeouts serverless

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id, name, specialty, address, city, phone, ice, inpe, custom_vitals, plan')
    .eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  // Le forfait se contrôle ici, pas seulement dans l'interface : masquer un
  // bouton n'empêche pas d'appeler la route directement.
  if (!canAccess(doctor.plan, 'records')) {
    return NextResponse.json(
      { error: 'Votre forfait ne donne pas accès au dossier médical' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'Aucun patient sélectionné' }, { status: 400 })
  if (ids.length > MAX_PATIENTS) {
    return NextResponse.json({ error: `Sélection trop grande (max ${MAX_PATIENTS} patients à la fois).` }, { status: 400 })
  }

  const zip = new JSZip()
  const usedNames = new Set<string>()
  let count = 0

  for (const id of ids) {
    const r = await buildPatientDossierPDF(supabase, doctor, id)
    if (!r.ok || !r.pdf) continue // ignore silencieusement un id qui n'appartient pas au médecin
    // évite les collisions de noms de dossier (homonymes)
    let folderName = r.slug || 'patient'
    while (usedNames.has(folderName)) folderName = `${r.slug}-${usedNames.size}`
    usedNames.add(folderName)

    const folder = zip.folder(folderName)
    folder?.file(`dossier-${r.slug}.pdf`, r.pdf)
    if ((r.docFiles ?? []).length > 0) {
      const docs = folder?.folder('documents')
      for (const f of r.docFiles ?? []) docs?.file(f.name, f.buf)
    }
    count++
  }

  if (count === 0) return NextResponse.json({ error: 'Aucun dossier accessible' }, { status: 404 })

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const dateStr = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="dossiers-patients-${count}-${dateStr}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
