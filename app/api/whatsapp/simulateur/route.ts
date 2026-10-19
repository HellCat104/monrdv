// Simulateur du chatbot WhatsApp, réservé au praticien connecté.
//
// POURQUOI UNE ROUTE À PART, ET POURQUOI ELLE EST AUTHENTIFIÉE
// Elle appelle `traiter()`, c'est-à-dire la MÊME machine à états que le webhook
// Meta : ce qui se passe ici est exactement ce que vivra le patient. Elle crée
// donc de VRAIS rendez-vous dans l'agenda. Laisser cela ouvert équivaudrait à
// offrir une création de RDV sans contrôle, pour n'importe quel médecin.
//
// Son intérêt : tout le parcours est testable, et corrigeable, avant que le
// compte Meta ne soit vérifié — ce qui est le chemin critique du projet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normaliserTelephone } from '@/lib/telephone'
import { traiter } from '@/lib/whatsapp/traiter'

async function medecinConnecte() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('doctors')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()
  return data?.id ?? null
}

export async function POST(req: NextRequest) {
  if (!(await medecinConnecte())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const waId = normaliserTelephone(String(body.waId ?? ''))
  if (!waId) {
    return NextResponse.json({ error: 'Numéro de téléphone manquant ou invalide' }, { status: 400 })
  }

  try {
    const resultat = await traiter({
      waId,
      texte: typeof body.texte === 'string' ? body.texte : undefined,
      choix: typeof body.choix === 'string' ? body.choix : undefined,
    })
    return NextResponse.json(resultat)
  } catch (e) {
    // Table introuvable. Deux causes possibles, et le code ne peut PAS les
    // distinguer : PostgREST répond pareil pour une table qui n'existe pas
    // (42P01) et pour une table absente de son cache de schéma (PGRST205).
    // Le message doit donc nommer les deux — c'est précisément la confusion
    // qui a coûté trois semaines sur la v65, où les tables étaient bien là et
    // où seul le `notify` manquait.
    if (e instanceof Error && e.message === 'MIGRATION_V73_ABSENTE') {
      return NextResponse.json(
        {
          error:
            "Table whatsapp_conversations introuvable. Deux causes possibles — la migration v73 " +
            "n'a pas été lancée, OU elle l'a été sans recharger le cache. Pour trancher : " +
            "select to_regclass('public.whatsapp_conversations');  →  null = lancer la v73, " +
            "sinon = notify pgrst, 'reload schema';",
        },
        { status: 503 }
      )
    }
    console.error('[simulateur whatsapp]', e)
    return NextResponse.json({ error: 'Erreur du simulateur' }, { status: 500 })
  }
}

/** Remet la conversation à zéro, pour rejouer un parcours depuis le début. */
export async function DELETE(req: NextRequest) {
  if (!(await medecinConnecte())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const waId = normaliserTelephone(new URL(req.url).searchParams.get('waId') ?? '')
  if (!waId) return NextResponse.json({ error: 'Numéro manquant' }, { status: 400 })

  await createAdminClient().from('whatsapp_conversations').delete().eq('wa_id', waId)
  return NextResponse.json({ ok: true })
}
