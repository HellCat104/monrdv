// Les conversations WhatsApp qui attendent une personne du cabinet.
//
// POURQUOI PAS UNE BOÎTE DE RÉCEPTION
// Le chatbot est une extension de MonRDV, pas un outil à côté. Une conversation
// en attente n'est donc pas un objet nouveau avec son propre écran : c'est un
// élément OUVERT, qui s'affiche là où le cabinet regarde déjà et qui disparaît
// quand on l'a traité — exactement comme un rappel `a_rappeler` (v71).
//
// Tant que MonRDV ne sait pas ENVOYER sur WhatsApp, le geste attendu est de
// décrocher le téléphone. D'où le numéro en clair, et pas un lien vers un fil
// de discussion auquel on ne pourrait pas répondre.
//
// Deux identités servies : le médecin, et la secrétaire via `getStaffContext()`
// — le même mécanisme que les routes /api/cabinet, pas un second.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getStaffContext } from '@/lib/cabinet'
import { colonneAbsente, tableAbsente } from '@/lib/migrations'
import { afficherTelephone } from '@/lib/telephone'

export const dynamic = 'force-dynamic'

/** Cabinet dont relève la personne connectée : le médecin lui-même, ou la
 *  secrétaire qui travaille pour lui. */
async function cabinetConnecte(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  const { data: medecin } = await supabase
    .from('doctors').select('id').eq('email', user.email).maybeSingle()
  if (medecin?.id) return medecin.id

  const ctx = await getStaffContext()
  return ctx?.doctor.id ?? null
}

export async function GET() {
  const doctorId = await cabinetConnecte()
  if (!doctorId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .select('id, wa_id, escalade_le, escalade_motif, patient:patients(first_name, last_name)')
    .eq('doctor_id', doctorId)
    .not('escalade_le', 'is', null)
    .is('escalade_traitee_le', null)
    .order('escalade_le', { ascending: true })

  // Migrations v73/v75 non passées : l'encart n'existe pas, il ne tombe pas en
  // erreur. Règle de la maison (lib/migrations.ts).
  if (error) {
    if (tableAbsente(error.code) || colonneAbsente(error.code)) {
      return NextResponse.json({ conversations: [] })
    }
    console.error('[escalades] lecture :', error.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  const conversations = (data ?? []).map((c) => {
    const fiche = c.patient as { first_name?: string; last_name?: string } | null
    return {
      id: c.id,
      // Prénom seul : c'est ce qui sert à s'adresser au patient au téléphone,
      // et l'écran peut être vu depuis l'accueil du cabinet.
      prenom: fiche?.first_name ?? null,
      telephone: afficherTelephone(c.wa_id),
      motif: c.escalade_motif ?? '',
      depuis: c.escalade_le,
    }
  })

  return NextResponse.json({ conversations })
}

/** « Traité ». Referme l'escalade SANS l'effacer (v75) : la date de traitement
 *  arrive, `escalade_le` et le motif restent — c'est ce qui permettra de
 *  compter les passages de main et d'en comprendre les causes.
 *
 *  Effet voulu : le bot se remet à répondre à ce patient. Il se taisait pour ne
 *  pas parler par-dessus la personne qui reprend le dossier ; une fois celui-ci
 *  traité, il peut reprendre son travail. */
export async function POST(req: NextRequest) {
  const doctorId = await cabinetConnecte()
  if (!doctorId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return NextResponse.json({ error: 'Conversation manquante' }, { status: 400 })

  const admin = createAdminClient()
  // Le filtre sur doctor_id est la sécurité : l'identifiant vient du client,
  // le cabinet vient de la session. On ne peut pas refermer l'escalade d'un
  // autre praticien en forgeant un identifiant.
  const { data, error } = await admin
    .from('whatsapp_conversations')
    .update({ escalade_traitee_le: new Date().toISOString(), etape: 'accueil', contexte: {} })
    .eq('id', id)
    .eq('doctor_id', doctorId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[escalades] traitement :', error.message)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })

  // Trace dans le fil : la secrétaire qui relira la conversation doit voir
  // qu'elle a été reprise, et quand.
  await admin.from('whatsapp_messages').insert({
    conversation_id: id,
    sens: 'sortant',
    contenu: '— conversation reprise par le cabinet —',
  })

  return NextResponse.json({ ok: true })
}
