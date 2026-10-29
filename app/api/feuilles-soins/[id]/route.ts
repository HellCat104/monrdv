// Une feuille de soins — lecture, suivi (remise / remboursée), suppression.
import { NextRequest, NextResponse } from 'next/server'
import { STATUTS_FEUILLE, type StatutFeuille } from '@/lib/feuilles-soins'
import { colonneAbsente } from '@/lib/migrations'
import { requireFeuilleDoctor } from '@/lib/feuilles-soins-server'

export const dynamic = 'force-dynamic'

async function laFeuille(id: string) {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return { error: auth.error }
  const { supabase, doctor } = auth.ctx

  const { data } = await supabase
    .from('care_sheets').select('*, items:care_sheet_items(*)')
    .eq('id', id).eq('doctor_id', doctor.id).maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Feuille introuvable' }, { status: 404 }) }

  return { ctx: { supabase, doctor, feuille: data } }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  return NextResponse.json(r.ctx.feuille)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, feuille } = r.ctx

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  // Les champs de la v90 : des dates et un montant. Vides par défaut, jamais
  // devinés — sauf l'horodatage du changement de statut juste en dessous, qui
  // note le jour où le praticien agit, et qu'il peut corriger.
  const jour = (v: unknown): string | null => {
    const t = String(v ?? '').slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  }
  // Le jour au Maroc, lu composante par composante : une date de calendrier
  // passée par toISOString() recule d'un jour dès que le serveur est en avance.
  const maintenant = new Date()
  const aujourdhui = `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}-${String(maintenant.getUTCDate()).padStart(2, '0')}`

  const champsSuivi: Record<string, unknown> = {}
  if ('remise_le' in body)    champsSuivi.remise_le = jour(body.remise_le)
  if ('rembourse_le' in body) champsSuivi.rembourse_le = jour(body.rembourse_le)
  if ('montant_rembourse' in body) {
    const brut = String(body.montant_rembourse ?? '').replace(',', '.').trim()
    if (brut === '') champsSuivi.montant_rembourse = null
    else {
      const m = Number(brut)
      if (!Number.isFinite(m) || m < 0) {
        return NextResponse.json({ error: 'Montant remboursé invalide' }, { status: 400 })
      }
      champsSuivi.montant_rembourse = Math.round(m * 100) / 100
    }
  }

  if ('status' in body) {
    const statut = String(body.status) as StatutFeuille
    if (!STATUTS_FEUILLE.includes(statut)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    patch.status = statut
    // Marquer « remise » sans dire quand laisserait le suivi aveugle le jour
    // même où il commence à servir. On note donc le jour du geste — et il
    // reste modifiable, parce qu'une feuille se saisit parfois le lendemain.
    if (statut === 'remise' && !feuille.remise_le && champsSuivi.remise_le === undefined) {
      champsSuivi.remise_le = aujourdhui
    }
    if (statut === 'remboursee' && !feuille.rembourse_le && champsSuivi.rembourse_le === undefined) {
      champsSuivi.rembourse_le = aujourdhui
    }
  }
  if ('notes' in body) patch.notes = body.notes ? String(body.notes).slice(0, 500) : null

  if (Object.keys(patch).length === 0 && Object.keys(champsSuivi).length === 0) {
    return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
  }

  const ecrire = (champs: Record<string, unknown>) => supabase
    .from('care_sheets').update(champs).eq('id', feuille.id).eq('doctor_id', doctor.id)
    .select('*, items:care_sheet_items(*)').single()

  let { data, error } = await ecrire({ ...patch, ...champsSuivi })

  // Pas de migration, pas de fonctionnalité — mais jamais d'écran cassé :
  // sans la v90, le changement de STATUT doit aboutir quand même. Seules les
  // dates et le montant sont perdus, et l'appelant en est averti.
  let suiviIgnore = false
  if (error && colonneAbsente(error.code) && Object.keys(champsSuivi).length > 0) {
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Le suivi du remboursement attend une migration de la base (v90).' }, { status: 503 })
    }
    suiviIgnore = true
    ;({ data, error } = await ecrire(patch))
  }

  if (error || !data) return NextResponse.json({ error: 'Modification impossible' }, { status: 500 })
  return NextResponse.json(suiviIgnore ? { ...data, suiviIgnore: true } : data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await laFeuille(params.id)
  if ('error' in r) return r.error
  const { supabase, doctor, feuille } = r.ctx

  const { error } = await supabase.from('care_sheets').delete().eq('id', feuille.id).eq('doctor_id', doctor.id)
  if (error) return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 })
  return NextResponse.json({ success: true })
}
