// API : émission d'une facture d'avoir sur un RDV déjà facturé.
// Conformité fiscale MA : on n'annule jamais une facture, on émet un avoir
// numéroté (AV-AAAA-NNNN) qui la référence.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: doctor } = await supabase
    .from('doctors').select('id').eq('email', user.email).single()
  if (!doctor) return NextResponse.json({ error: 'Médecin introuvable' }, { status: 404 })

  // Le RDV doit appartenir au médecin ET être facturé.
  const { data: apt } = await supabase
    .from('appointments')
    .select('id, invoice_no, amount_paid, amount_due, patient:patients(first_name, last_name)')
    .eq('id', params.id)
    .eq('doctor_id', doctor.id)
    .single()

  if (!apt) return NextResponse.json({ error: 'RDV introuvable' }, { status: 404 })
  if (!apt.invoice_no) {
    return NextResponse.json({ error: 'Ce rendez-vous n\'est pas facturé : aucun avoir possible.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const reason: string | null = body.reason ? String(body.reason).slice(0, 500) : null

  // Montant facturé = montant encaissé (ou dû à défaut).
  const invoiceAmount = Number(apt.amount_paid ?? apt.amount_due ?? 0)

  // Avoirs déjà émis sur cette facture (pour ne pas dépasser le montant facturé).
  const { data: existing } = await supabase
    .from('credit_notes').select('amount').eq('appointment_id', apt.id)
  const alreadyCredited = (existing ?? []).reduce((s: number, c: { amount: number }) => s + Number(c.amount), 0)
  const remaining = Math.round((invoiceAmount - alreadyCredited) * 100) / 100

  if (remaining <= 0) {
    return NextResponse.json({ error: 'Cette facture est déjà entièrement avoirée.' }, { status: 400 })
  }

  // Montant de l'avoir : par défaut le restant, sinon celui demandé (borné).
  const requested = body.amount === undefined || body.amount === null ? remaining : Number(body.amount)
  if (isNaN(requested) || requested <= 0) {
    return NextResponse.json({ error: 'Montant d\'avoir invalide.' }, { status: 400 })
  }
  if (requested > remaining) {
    return NextResponse.json({ error: `Le montant de l'avoir ne peut pas dépasser ${remaining} DH.` }, { status: 400 })
  }

  const patient = apt.patient as { first_name?: string; last_name?: string } | null
  const patientName = patient ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() : null

  const { data: credit, error } = await supabase
    .from('credit_notes')
    .insert({
      doctor_id: doctor.id,
      appointment_id: apt.id,
      original_invoice_no: apt.invoice_no,
      patient_name: patientName,
      amount: requested,
      reason,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Avoir] insert error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'émission de l\'avoir' }, { status: 500 })
  }

  return NextResponse.json(credit, { status: 201 })
}
