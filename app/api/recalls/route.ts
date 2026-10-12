// Rappels de suivi dus — ce que le cabinet doit traiter cette semaine.
//
// La table `recalls` existe depuis la v7, mais ses lignes ne se lisaient que
// dans la fiche du patient concerné : un « revoir dans 6 mois » programmé en
// janvier n'était revu par personne en juillet. Cette route répond à la seule
// question qui compte sur le tableau de bord — « qui dois-je rappeler ? » —
// et rend le téléphone du patient avec, pour qu'on puisse décrocher sans
// ouvrir la fiche.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNowInMaroc } from '@/lib/utils'
import { format, addDays } from 'date-fns'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

/** 42P01 = table absente (base antérieure à la v7). */


/** Rappels encore ouverts : ils attendent une action du cabinet.
 *  `a_rappeler` (v71) = le patient n'a pas d'e-mail, donc personne ne le
 *  prévient à notre place. `sent`, `done` et `cancelled` sont des fins de
 *  parcours : ils quittent les écrans de suivi. */
const RAPPELS_OUVERTS = ['pending', 'a_rappeler']

/** Horizon de la vue : au-delà, le rappel n'est pas encore actionnable et
 *  n'a rien à faire sur un écran qui doit rester court. */
const HORIZON_JOURS = 7

/**
 * Médecin connecté. Même enchaînement que lib/labo-server.ts (session, puis
 * médecin existant, puis `doctor_id` sur chaque requête) à une différence
 * près : AUCUN verrou de forfait ici. Un rappel de suivi n'est pas une donnée
 * de santé — une date et un motif libre — et le forfait Agenda peut déjà en
 * programmer depuis PatientDossierLite. Le filtrer sur `records` rendrait
 * invisibles, pour ces cabinets-là, des rappels qu'ils ont eux-mêmes créés.
 */
async function medecinConnecte() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }

  return { ctx: { supabase, doctor } }
}

export async function GET() {
  const auth = await medecinConnecte()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const aujourdhui = getNowInMaroc()
  const limite = format(addDays(aujourdhui, HORIZON_JOURS), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('recalls')
    .select('id, due_date, reason, status, patient:patients(id, first_name, last_name, phone)')
    .eq('doctor_id', doctor.id)
    .in('status', RAPPELS_OUVERTS)
    .lte('due_date', limite)
    .order('due_date', { ascending: true })

  if (error) {
    // Table absente : l'encart n'existe pas, ce n'est pas une panne.
    if (tableAbsente(error.code)) return NextResponse.json({ rappels: [] })
    console.error('[Rappels] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ rappels: data ?? [] })
}

/** Marque un rappel traité : le patient a été joint, ou son rendez-vous est
 *  pris. C'est la seule écriture que l'encart propose — on ne reprogramme pas
 *  depuis le tableau de bord, la fiche patient est là pour ça. */
export async function PATCH(req: NextRequest) {
  const auth = await medecinConnecte()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const id = body.id ? String(body.id) : ''
  if (!id) return NextResponse.json({ error: 'Rappel manquant' }, { status: 400 })

  // `.in('status', RAPPELS_OUVERTS)` autant que `.eq('doctor_id', …)` : deux
  // clics sur le même bouton ne doivent pas refermer deux fois un rappel, et
  // un identifiant deviné ne doit rien toucher chez un autre cabinet.
  const { data, error } = await supabase
    .from('recalls')
    .update({ status: 'done' })
    .eq('id', id).eq('doctor_id', doctor.id).in('status', RAPPELS_OUVERTS)
    .select('id, status')
    .maybeSingle()

  if (error) {
    console.error('[Rappels] mise à jour impossible :', error.message)
    return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  }
  // Rien de modifié : rappel inconnu, déjà traité, ou appartenant à un autre
  // cabinet. On répond « introuvable » sans distinguer les trois.
  if (!data) return NextResponse.json({ error: 'Rappel introuvable' }, { status: 404 })

  return NextResponse.json(data)
}
