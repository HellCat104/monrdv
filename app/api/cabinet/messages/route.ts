// Mots échangés avec le médecin au sujet d'un rendez-vous (v77), côté accueil.
//
// Le navigateur de la secrétaire n'écrit PAS directement en base : c'est ici
// qu'on vérifie sa permission et qu'on pose l'auteur. Sans ça, rien
// n'empêcherait le poste d'accueil d'enregistrer un mot signé « le médecin ».
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

// POST — écrire un mot sur un rendez-vous
export async function POST(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  // Si elle voit le rendez-vous, elle peut y laisser un mot : même règle que
  // les présences, décidée par le médecin en donnant l'accès à l'agenda.
  if (!ctx.permissions.agenda) {
    return NextResponse.json({ error: 'Le médecin ne vous a pas donné accès à l\'agenda.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const appointmentId = typeof body.appointment_id === 'string' ? body.appointment_id : null
  const contenu = typeof body.contenu === 'string' ? body.contenu.trim() : ''
  if (!appointmentId) return NextResponse.json({ error: 'Rendez-vous manquant' }, { status: 400 })
  if (!contenu) return NextResponse.json({ error: 'Le mot est vide.' }, { status: 400 })
  if (contenu.length > 1000) return NextResponse.json({ error: 'Le mot est trop long (1000 caractères).' }, { status: 400 })

  const admin = createAdminClient()

  // Le rendez-vous doit appartenir à CE cabinet : l'identifiant vient du
  // navigateur, et le service_role ne filtre plus rien derrière nous.
  const { data: apt } = await admin
    .from('appointments')
    .select('id')
    .eq('id', appointmentId)
    .eq('doctor_id', ctx.doctor.id)
    .maybeSingle()
  if (!apt) return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 })

  const { data, error } = await admin
    .from('appointment_messages')
    .insert({
      doctor_id: ctx.doctor.id,
      appointment_id: appointmentId,
      auteur: 'secretaire',
      auteur_nom: ctx.staff.name,
      contenu,
    })
    .select('id, auteur, auteur_nom, contenu, created_at')
    .single()

  if (error) {
    // Migration v77 pas encore passée : la fonctionnalité se tait, elle ne
    // casse pas l'agenda de la secrétaire.
    if (tableAbsente(error.code)) return NextResponse.json({ error: 'Fonction indisponible' }, { status: 501 })
    console.error('[Cabinet] mot non enregistré :', error.message)
    return NextResponse.json({ error: 'Le mot n\'a pas pu être enregistré.' }, { status: 500 })
  }

  return NextResponse.json({ message: data })
}

// DELETE ?id=… — retirer un mot
//
// Elle n'efface QUE les siens. Effacer un mot du médecin reviendrait à faire
// disparaître une consigne qu'on lui a donnée.
export async function DELETE(req: NextRequest) {
  const ctx = await getStaffContext()
  if (!ctx) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  if (!ctx.permissions.agenda) {
    return NextResponse.json({ error: 'Le médecin ne vous a pas donné accès à l\'agenda.' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('appointment_messages')
    .delete()
    .eq('id', id)
    .eq('doctor_id', ctx.doctor.id)
    .eq('auteur', 'secretaire')
    .select('id')

  if (error) {
    console.error('[Cabinet] mot non effacé :', error.message)
    return NextResponse.json({ error: 'Le mot n\'a pas pu être retiré.' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Seuls vos propres mots peuvent être retirés.' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
