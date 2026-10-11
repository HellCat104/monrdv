// « Ajouter à la compta » — le coût du laboratoire devient une dépense.
//
// POURQUOI UN GESTE EXPLICITE, ET PAS UN AUTOMATISME
//
// Le montant d'un travail est connu à l'envoi, mais la facture du prothésiste
// arrive plus tard, parfois différente, parfois groupée sur le mois. Créer la
// dépense automatiquement ferait entrer en comptabilité une somme que personne
// n'a encore payée. Le praticien décide donc, et une seule fois : la dépense
// créée est mémorisée sur le travail (`cost_expense_id`), ce qui empêche de
// compter deux fois le même laboratoire.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'
import { titreTravail } from '@/lib/labo'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const { data: travail } = await supabase
    .from('lab_works').select('*, patient:patients(first_name, last_name)')
    .eq('id', params.id).eq('doctor_id', doctor.id).maybeSingle()
  if (!travail) return NextResponse.json({ error: 'Travail introuvable' }, { status: 404 })

  if (travail.cost_expense_id) {
    return NextResponse.json({ error: 'Ce travail est déjà en comptabilité.' }, { status: 409 })
  }
  const cout = Number(travail.cost ?? 0)
  if (!Number.isFinite(cout) || cout <= 0) {
    return NextResponse.json({ error: 'Indiquez d\'abord le coût facturé par le laboratoire.' }, { status: 400 })
  }

  const patient = Array.isArray(travail.patient) ? travail.patient[0] : travail.patient
  const nom = `${patient?.first_name ?? ''} ${patient?.last_name ?? ''}`.trim()
  const intitule = [
    travail.lab_name?.trim() || 'Laboratoire',
    titreTravail({ work_type: travail.work_type, teeth: travail.teeth ?? [] }),
    nom,
  ].filter(Boolean).join(' — ').slice(0, 200)

  const { data: depense, error } = await supabase
    .from('expenses')
    .insert({
      doctor_id: doctor.id,
      // La date de la dépense est celle de la réception quand elle est connue :
      // c'est le moment où le cabinet doit l'argent.
      date: travail.received_at ?? travail.sent_at ?? new Date().toISOString().slice(0, 10),
      label: intitule,
      category: 'Laboratoire',
      amount: cout,
    })
    .select('id')
    .single()

  if (error || !depense) {
    console.error('[Laboratoire] dépense non créée :', error?.message)
    return NextResponse.json({ error: "La dépense n'a pas pu être créée" }, { status: 500 })
  }

  const { data: maj, error: errLien } = await supabase
    .from('lab_works').update({ cost_expense_id: depense.id, updated_at: new Date().toISOString() })
    .eq('id', travail.id).eq('doctor_id', doctor.id).select('*').single()

  if (errLien || !maj) {
    // La dépense existe mais le lien n'a pas pu être posé : on la retire plutôt
    // que de laisser une ligne comptable que rien ne rattache à son travail —
    // elle serait ajoutée une seconde fois au prochain clic.
    await supabase.from('expenses').delete().eq('id', depense.id).eq('doctor_id', doctor.id)
    return NextResponse.json({ error: "La dépense n'a pas pu être rattachée au travail" }, { status: 500 })
  }

  return NextResponse.json({ travail: maj, expense_id: depense.id })
}
