// L'ANNUAIRE DES LABORATOIRES — liste et création.
//
// Médecin uniquement : à qui le cabinet confie ses prothèses, à quel délai et
// à quel contact, relève de son organisation. La secrétaire s'en sert pour
// appeler ; elle ne décide pas du prothésiste.
//
// L'annuaire se remplit TOUT SEUL : enregistrer un travail avec un nom de
// laboratoire inconnu y crée l'entrée (voir POST plus bas, appelé par la
// fiche de travail). Aucun écran de paramétrage à visiter d'abord — c'est ce
// qui faisait que le carnet restait vide.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccess } from '@/lib/plan'
import { tableLaboAbsente, LABO_NON_ACTIVE } from '@/lib/laboratoires'

export const dynamic = 'force-dynamic'

const CHAMPS = 'id, nom, telephone, contact, email, adresse, delai_jours, notes, actif'

async function medecin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }
  const { data: doctor } = await supabase
    .from('doctors').select('id, plan').eq('email', user.email).single()
  if (!doctor) return { error: NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 }) }
  // Le laboratoire fait partie du dossier de soins, comme le travail qu'il
  // réalise : même fonctionnalité de forfait que lab_works.
  if (!canAccess(doctor.plan, 'records')) {
    return { error: NextResponse.json({ error: 'Forfait insuffisant' }, { status: 403 }) }
  }
  return { ctx: { supabase, doctor } }
}

export async function GET(req: NextRequest) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  let q = supabase.from('cabinet_laboratoires').select(CHAMPS).eq('doctor_id', doctor.id)
  if (req.nextUrl.searchParams.get('tous') !== '1') q = q.eq('actif', true)

  const { data, error } = await q.order('nom', { ascending: true })
  if (error) {
    if (tableLaboAbsente(error)) return NextResponse.json({ laboratoires: [], activee: false })
    console.error('[Laboratoires] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ laboratoires: data ?? [], activee: true })
}

export async function POST(req: NextRequest) {
  const auth = await medecin()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const nom = String(body.nom ?? '').trim()
  if (!nom) return NextResponse.json({ error: 'Donnez un nom au laboratoire.' }, { status: 400 })
  if (nom.length > 120) return NextResponse.json({ error: 'Nom trop long (120 caractères).' }, { status: 400 })

  const texte = (v: unknown, n: number) => (v ? String(v).slice(0, n) : null)
  const delai = body.delai_jours === '' || body.delai_jours == null ? null : Number(body.delai_jours)
  if (delai != null && (!Number.isFinite(delai) || delai < 0 || delai > 365)) {
    return NextResponse.json({ error: 'Délai invalide (0 à 365 jours).' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('cabinet_laboratoires')
    .insert({
      doctor_id: doctor.id,
      nom,
      telephone: texte(body.telephone, 30),
      contact:   texte(body.contact, 120),
      email:     texte(body.email, 254),
      adresse:   texte(body.adresse, 200),
      delai_jours: delai == null ? null : Math.trunc(delai),
      notes:     texte(body.notes, 500),
    })
    .select(CHAMPS).single()

  if (error || !data) {
    // Le cas nommé d'abord. Un nom déjà pris n'est PAS une erreur ici : on
    // renvoie l'entrée existante, parce que l'appelant vient d'enregistrer un
    // travail et veut simplement le rattacher au bon laboratoire.
    if (error?.code === '23505') {
      const { data: existant } = await supabase
        .from('cabinet_laboratoires').select(CHAMPS)
        .eq('doctor_id', doctor.id).ilike('nom', nom).eq('actif', true).maybeSingle()
      if (existant) return NextResponse.json({ laboratoire: existant, existait: true })
      return NextResponse.json({ error: `« ${nom} » existe déjà.` }, { status: 409 })
    }
    if (tableLaboAbsente(error)) {
      return NextResponse.json({ error: LABO_NON_ACTIVE }, { status: 503 })
    }
    console.error('[Laboratoires] création impossible :', error?.message)
    return NextResponse.json({ error: 'Le laboratoire n’a pas pu être créé' }, { status: 500 })
  }
  return NextResponse.json({ laboratoire: data })
}
