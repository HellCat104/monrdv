// Les postes de travail d'un cabinet — liste et création.
//
// Médecin uniquement : combien de fauteuils le cabinet possède et comment ils
// s'appellent est une décision d'organisation, pas un geste de comptoir. La
// secrétaire s'en sert pour placer un rendez-vous ; elle ne les crée pas.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tablePostesAbsente, POSTES_NON_ACTIVES } from '@/lib/postes'

export const dynamic = 'force-dynamic'

const CHAMPS = 'id, nom, ordre, couleur, actif'

async function medecin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  return { ctx: { supabase, doctor } }
}

export async function GET(req: NextRequest) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  let q = supabase.from('cabinet_postes').select(CHAMPS).eq('doctor_id', doctor.id)
  if (req.nextUrl.searchParams.get('tous') !== '1') q = q.eq('actif', true)

  const { data, error } = await q.order('ordre', { ascending: true }).order('nom', { ascending: true })
  if (error) {
    if (tablePostesAbsente(error)) return NextResponse.json({ postes: [], activee: false })
    console.error('[Postes] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ postes: data ?? [], activee: true })
}

export async function POST(req: NextRequest) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const nom = String(body.nom ?? '').trim()
  if (!nom) return NextResponse.json({ error: 'Donnez un nom à ce poste.' }, { status: 400 })
  if (nom.length > 60) return NextResponse.json({ error: 'Nom trop long (60 caractères).' }, { status: 400 })

  const { data, error } = await supabase
    .from('cabinet_postes')
    .insert({
      doctor_id: doctor.id,
      nom,
      ordre: Number.isFinite(Number(body.ordre)) ? Math.trunc(Number(body.ordre)) : 0,
      couleur: body.couleur ? String(body.couleur).slice(0, 20) : null,
    })
    .select(CHAMPS).single()

  if (error || !data) {
    // Le cas nommé d'abord — leçon du stock : un refus légitime ne doit jamais
    // être présenté comme une base en retard.
    if (error?.code === '23505') {
      return NextResponse.json({ error: `« ${nom} » existe déjà.` }, { status: 409 })
    }
    if (tablePostesAbsente(error)) {
      return NextResponse.json({ error: POSTES_NON_ACTIVES }, { status: 503 })
    }
    console.error('[Postes] création impossible :', error?.message)
    return NextResponse.json({ error: 'Le poste n’a pas pu être créé' }, { status: 500 })
  }
  return NextResponse.json({ poste: data })
}
