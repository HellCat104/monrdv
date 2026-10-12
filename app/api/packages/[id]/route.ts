// Forfaits de séances — consommation, annulation, journal.
//
// POURQUOI UNE ROUTE SERVEUR PLUTÔT QUE SUPABASE DEPUIS LE NAVIGATEUR
//
// 1. Le compteur et son journal doivent partir du même geste. Écrits depuis
//    deux appels du navigateur, une coupure réseau entre les deux laisserait
//    un forfait décompté sans trace — exactement la situation où le patient
//    conteste.
// 2. Le nombre de séances restantes est de l'argent déjà encaissé. La borne
//    (« pas plus que le total », « jamais en dessous de zéro ») est relue ici
//    à partir de la base, pas de ce que le navigateur croit afficher : deux
//    clics rapides, ou deux onglets ouverts, ne font plus sauter une séance.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

// Tant que la v64 n'est pas passée, la table du journal n'existe pas. Le
// décompte doit continuer de fonctionner : on l'écrit, on signale juste que la
// trace n'a pas pu l'être.


async function contexte(packageId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  if (!canAccess(doctor.plan, 'records')) {
    return { error: NextResponse.json({ error: 'Les forfaits nécessitent le forfait Cabinet complet' }, { status: 403 }) }
  }

  // Le forfait doit être celui de ce cabinet.
  const { data: pkg } = await supabase
    .from('session_packages').select('*').eq('id', packageId).eq('doctor_id', doctor.id).maybeSingle()
  if (!pkg) return { error: NextResponse.json({ error: 'Forfait introuvable' }, { status: 404 }) }

  return { ctx: { supabase, doctor, pkg } }
}

// GET — le journal des séances de ce forfait.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await contexte(params.id)
  if ('error' in r) return r.error
  const { supabase, pkg } = r.ctx

  const { data, error } = await supabase
    .from('session_package_uses')
    .select('id, delta, used_at, note')
    .eq('package_id', pkg.id)
    .order('used_at', { ascending: false })
    .limit(100)

  if (error) {
    if (tableAbsente(error.code)) return NextResponse.json({ uses: [], journal: false })
    return NextResponse.json({ error: 'Journal illisible' }, { status: 500 })
  }
  return NextResponse.json({ uses: data ?? [], journal: true })
}

// POST { delta: 1 | -1 } — consomme une séance, ou en rend une.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await contexte(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, pkg } = r.ctx

  const body = await req.json().catch(() => ({}))
  const delta = Number(body.delta)
  if (delta !== 1 && delta !== -1) {
    return NextResponse.json({ error: 'Mouvement invalide' }, { status: 400 })
  }
  if (pkg.status === 'annule') {
    return NextResponse.json({ error: 'Ce forfait est annulé.' }, { status: 409 })
  }

  // Bornes relues sur la base : c'est elle qui fait foi, pas l'écran.
  const suivant = pkg.used_sessions + delta
  if (suivant < 0) {
    return NextResponse.json({ error: 'Aucune séance consommée à rendre.' }, { status: 409 })
  }
  if (suivant > pkg.total_sessions) {
    return NextResponse.json({ error: 'Toutes les séances du forfait sont déjà utilisées.' }, { status: 409 })
  }

  const { data: maj, error } = await supabase
    .from('session_packages')
    .update({ used_sessions: suivant })
    .eq('id', pkg.id)
    .eq('doctor_id', doctor.id)
    // Le compteur n'a pas bougé depuis la lecture : sans cette condition, deux
    // clics simultanés décompteraient deux fois la même séance.
    .eq('used_sessions', pkg.used_sessions)
    .select('*')
    .single()

  if (error || !maj) {
    return NextResponse.json({ error: 'Le forfait vient d\'être modifié ailleurs. Rouvrez la fiche.' }, { status: 409 })
  }

  const { error: errJournal } = await supabase.from('session_package_uses').insert({
    package_id: pkg.id,
    doctor_id: doctor.id,
    patient_id: pkg.patient_id,
    delta,
    note: body.note ? String(body.note).slice(0, 200) : null,
  })
  // Le compteur est à jour ; si la trace manque, le praticien doit le savoir
  // plutôt que de découvrir un journal troué le jour d'une contestation.
  const journal = !errJournal
  if (errJournal && !tableAbsente(errJournal.code)) {
    console.error('[Forfait] journal non écrit :', errJournal.message)
  }

  return NextResponse.json({ package: maj, journal })
}

// PATCH { status: 'annule' | 'actif' } — annuler un forfait, ou le réactiver.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await contexte(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, pkg } = r.ctx

  const body = await req.json().catch(() => ({}))
  const status = String(body.status ?? '')
  if (status !== 'annule' && status !== 'actif') {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  const { data: maj, error } = await supabase
    .from('session_packages')
    .update({ status })
    .eq('id', pkg.id)
    .eq('doctor_id', doctor.id)
    .select('*')
    .single()

  if (error || !maj) {
    return NextResponse.json({ error: 'Le forfait n\'a pas pu être modifié' }, { status: 500 })
  }
  // Sans la v64, le déclencheur de la v41 réécrit le statut : on dit ce que la
  // base contient réellement, pas ce qui a été demandé.
  return NextResponse.json({ package: maj, applique: maj.status === status })
}
