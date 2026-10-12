// Relevés parodontaux — liste par patient et enregistrement d'un nouveau relevé.
//
// Médecin uniquement : un relevé parodontal est un acte d'examen. La
// secrétaire ne le saisit pas, et n'en a pas besoin.
import { NextRequest, NextResponse } from 'next/server'
import { requireLaboDoctor } from '@/lib/labo-server'
import { PERIO_MODES, type PerioMode, type PerioTeeth } from '@/lib/perio'
import { isValidTooth } from '@/lib/dental'
import { tableAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'


const PERIO_NON_ACTIVE =
  "Les relevés parodontaux ne sont pas encore activés sur votre base (migration v69)."

/** Assainissement : on n'écrit que des numéros FDI valides et des mesures
 *  plausibles. Une poche de 40 mm est une faute de frappe, pas une mesure. */
function nettoyerDents(brut: unknown): PerioTeeth {
  if (!brut || typeof brut !== 'object') return {}
  const out: PerioTeeth = {}
  const mm = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 && n <= 20 ? Math.round(n) : null
  }

  for (const [dent, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (!isValidTooth(dent) || !valeur || typeof valeur !== 'object') continue
    const v = valeur as Record<string, unknown>
    const sortie: Record<string, unknown> = {}

    if (Array.isArray(v.pd)) sortie.pd = v.pd.slice(0, 6).map(mm)
    else if (v.pdMax !== undefined) sortie.pdMax = mm(v.pdMax)

    if (Array.isArray(v.rec)) sortie.rec = v.rec.slice(0, 6).map(mm)

    if (Array.isArray(v.bop)) sortie.bop = v.bop.slice(0, 6).map((b) => b === true)
    else if (v.bop !== undefined) sortie.bop = v.bop === true

    if (v.mob !== undefined) {
      const m = Number(v.mob)
      sortie.mob = Number.isInteger(m) && m >= 0 && m <= 3 ? m : null
    }

    // Une dent sans aucune mesure n'a rien à faire dans le relevé.
    const aQuelqueChose =
      sortie.pd !== undefined || sortie.pdMax !== undefined ||
      sortie.bop === true || (Array.isArray(sortie.bop) && (sortie.bop as boolean[]).some(Boolean)) ||
      ((sortie.mob as number | null) ?? 0) > 0
    if (aQuelqueChose) out[dent] = sortie as PerioTeeth[string]
  }
  return out
}

export async function GET(req: NextRequest) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = req.nextUrl.searchParams.get('patient_id')
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data, error } = await supabase
    .from('perio_charts')
    .select('*')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('charted_at', { ascending: false })
    .limit(30)

  if (error) {
    if (tableAbsente(error.code)) return NextResponse.json({ releves: [], activee: false })
    console.error('[Parodonte] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  return NextResponse.json({ releves: data ?? [], activee: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireLaboDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const patientId = body.patient_id ? String(body.patient_id) : ''
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  const { data: patient } = await supabase
    .from('patients').select('id').eq('id', patientId).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const teeth = nettoyerDents(body.teeth)
  if (Object.keys(teeth).length === 0) {
    return NextResponse.json({ error: 'Relevez au moins une dent.' }, { status: 400 })
  }

  const mode: PerioMode = PERIO_MODES.includes(body.mode) ? body.mode : 'simple'
  const plaque = body.plaque_index === null || body.plaque_index === undefined || body.plaque_index === ''
    ? null
    : Math.min(100, Math.max(0, Number(body.plaque_index)))

  const { data, error } = await supabase
    .from('perio_charts')
    .insert({
      doctor_id: doctor.id,
      patient_id: patient.id,
      charted_at: /^\d{4}-\d{2}-\d{2}$/.test(String(body.charted_at ?? ''))
        ? String(body.charted_at)
        : new Date().toISOString().slice(0, 10),
      mode,
      teeth,
      plaque_index: Number.isFinite(plaque as number) ? plaque : null,
      notes: body.notes ? String(body.notes).slice(0, 1000) : null,
    })
    .select('*')
    .single()

  if (error || !data) {
    if (tableAbsente(error?.code)) return NextResponse.json({ error: PERIO_NON_ACTIVE }, { status: 503 })
    console.error('[Parodonte] enregistrement impossible :', error?.message)
    return NextResponse.json({ error: "Le relevé n'a pas pu être enregistré" }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
