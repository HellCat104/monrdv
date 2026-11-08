// Feuilles de soins — liste par patient (GET) et établissement (POST).
//
// Médecin uniquement : établir une feuille de soins, c'est attester des actes
// sous sa signature. La secrétaire peut en revanche la retrouver dans le
// dossier (lecture) une fois qu'elle existe — ce n'est pas cette route.
import { NextRequest, NextResponse } from 'next/server'
import {
  normaliserLigne, normaliserCotation, normaliserTypesSoins, totalFeuille,
  nettoyerDonneesAssure, type LigneFeuille, type CotationLigne,
} from '@/lib/feuilles-soins'
import { organismePour } from '@/lib/organismes'
import { requireFeuilleDoctor, FEUILLE_NON_ACTIVEE } from '@/lib/feuilles-soins-server'
import { tableAbsente, lienAbsent, colonneAbsente } from '@/lib/migrations'

export const dynamic = 'force-dynamic'

const MAX_LIGNES = 30
/** Combien de feuilles le dossier montre d'emblée. Les suivantes se chargent
 *  à la demande. Trois : celle du jour, et les deux dernières, de quoi voir
 *  ce qui a déjà été établi pour ce patient sans dérouler son histoire. */
const FEUILLES_RECENTES = 3
/** Le plafond de l'historique complet. Un dossier n'en a jamais autant ; la
 *  borne est là pour qu'une lecture reste bornée. */
const MAX_FEUILLES = 500

export async function GET(req: NextRequest) {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const patientId = req.nextUrl.searchParams.get('patient_id')
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  // ?tout=1 — l'historique entier. Sans ce drapeau, on ne renvoie que les
  // dernières feuilles.
  //
  // POURQUOI : un patient suivi depuis deux ans en a trente. Elles sortaient
  // toutes, avec leurs actes, à chaque ouverture du dossier — une liste qui
  // repoussait hors de l'écran tout ce qui vient après, pour un historique
  // qu'on consulte une fois sur vingt. On montre les dernières, et le
  // praticien charge les précédentes le jour où il les cherche.
  const tout = req.nextUrl.searchParams.get('tout') === '1'

  const lire = (avecActes: boolean) => supabase
    .from('care_sheets')
    .select(avecActes ? '*, items:care_sheet_items(*)' : '*', { count: 'exact' })
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('care_date', { ascending: false })
    // Plusieurs feuilles portent couramment la même date : sans second
    // critère, leur ordre change d'une lecture à l'autre, et « les trois
    // dernières » n'étaient pas toujours les mêmes trois.
    .order('created_at', { ascending: false })
    .limit(tout ? MAX_FEUILLES : FEUILLES_RECENTES)

  let { data, error, count } = await lire(true)
  // La table jointe manque (v65 à moitié passée) ou le cache de schéma n'a pas
  // été rechargé : on relit les feuilles SANS leurs actes. Le praticien voit
  // alors ce qu'il a établi au lieu d'un « aucune feuille » mensonger.
  if (error && lienAbsent(error.code)) {
    console.error('[Feuille de soins] actes illisibles, lecture dégradée :', error.message)
    ;({ data, error, count } = await lire(false))
  }

  if (error) {
    // Sans la migration, le dossier s'affiche sans la carte plutôt que de tomber.
    if (tableAbsente(error.code)) return NextResponse.json({ feuilles: [], activee: false })
    console.error('[Feuille de soins] lecture impossible :', error.message)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  }
  // `total` dit combien le patient en a EN TOUT : c'est lui qui permet à
  // l'écran d'annoncer le nombre de feuilles précédentes, au lieu d'un bouton
  // qui ne dit pas ce qu'il va chercher.
  return NextResponse.json({
    feuilles: data ?? [],
    total: count ?? (data ?? []).length,
    activee: true,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireFeuilleDoctor()
  if ('error' in auth) return auth.error
  const { supabase, doctor } = auth.ctx

  const body = await req.json().catch(() => ({}))
  const patientId = body.patient_id ? String(body.patient_id) : ''
  if (!patientId) return NextResponse.json({ error: 'Patient manquant' }, { status: 400 })

  // Le patient appartient-il au cabinet ? On en profite pour lire l'assuré :
  // la feuille le RECOPIE (migration v65), elle ne le pointe pas.
  const { data: patient } = await supabase
    .from('patients')
    .select('id, mutuelle, insurer_data, first_name, last_name')
    .eq('id', patientId).eq('doctor_id', doctor.id).maybeSingle()
  if (!patient) return NextResponse.json({ error: 'Patient introuvable' }, { status: 404 })

  const brutes = Array.isArray(body.items) ? body.items.slice(0, MAX_LIGNES) : []
  const lignes = brutes
    .map((l: unknown, i: number) => normaliserLigne(l, i))
    .filter((l: LigneFeuille | null): l is LigneFeuille => l !== null)
  if (lignes.length === 0) {
    return NextResponse.json({ error: 'Ajoutez au moins un acte à la feuille.' }, { status: 400 })
  }

  const careDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.care_date ?? ''))
    ? String(body.care_date)
    : new Date().toISOString().slice(0, 10)

  const base = supabase
    .from('care_sheets')
    .insert({
      doctor_id: doctor.id,
      patient_id: patient.id,
      appointment_id: body.appointment_id ? String(body.appointment_id) : null,
      // L'organisme vient de la fiche, sauf si le médecin en choisit un autre
      // sur cette feuille (un patient peut changer de couverture).
      insurer: body.insurer ? String(body.insurer).slice(0, 60) : (patient.mutuelle ?? null),
      // Les champs de l'assuré, tels que l'organisme les demande
      // (lib/organismes.ts). Recopiés, jamais pointés : voir la v65.
      insurer_data: nettoyerDonneesAssure(body.insurer_data ?? patient.insurer_data),
      care_date: careDate,
      total: totalFeuille(lignes),
      notes: body.notes ? String(body.notes).slice(0, 500) : null,
    })

  // ── Ce que la v95 ajoute ──────────────────────────────────────────────────
  // La nature (exécution ou entente préalable), les cases « Type de soins »,
  // le numéro d'accord, et la clé de l'organisme qui commande le gabarit
  // imprimé. Écrits À PART, puis essayés d'un bloc : si la migration n'est pas
  // passée, la feuille s'établit quand même, sous sa forme d'avant. Une
  // migration en retard ne doit jamais empêcher un praticien d'imprimer.
  const insurerNom = body.insurer ? String(body.insurer).slice(0, 60) : (patient.mutuelle ?? null)
  const extras = {
    nature: body.nature === 'entente_prealable' ? 'entente_prealable' : 'execution',
    types_soins: normaliserTypesSoins(body.types_soins),
    entente_no: body.entente_no ? String(body.entente_no).trim().slice(0, 40) || null : null,
    organisme: organismePour(insurerNom)?.cle ?? null,
  }

  let { data: feuille, error } = await base.select('*').single()
  if (error && colonneAbsente(error.code)) {
    // Jamais vu : `base` n'envoie pas les extras. Garde-fou si un jour on les
    // y fond par inadvertance.
    console.error('[Feuille de soins] colonne inconnue sur le tronc commun :', error.message)
  }
  if (!error && feuille) {
    const { data: enrichie, error: errExtras } = await supabase
      .from('care_sheets')
      .update(extras)
      .eq('id', (feuille as { id: string }).id)
      .eq('doctor_id', doctor.id)
      .select('*')
      .single()
    if (errExtras) {
      if (!colonneAbsente(errExtras.code)) {
        console.error('[Feuille de soins] nature et type de soins non enregistrés :', errExtras.message)
      }
      // Migration v95 absente : la feuille existe, sans sa nature. L'écran le
      // déduira, et le document s'imprimera sous sa forme neutre.
    } else if (enrichie) {
      feuille = enrichie
    }
  }

  // L'organisme choisi devant la feuille s'inscrit sur la fiche quand elle
  // n'en portait aucun : sans cela, le praticien le rechoisirait à chaque
  // feuille, et la fiche continuerait de dire « pas de couverture » alors
  // qu'on vient d'établir une feuille CNSS. On n'ÉCRASE jamais une couverture
  // déjà saisie — la feuille peut porter un autre organisme sans que la fiche
  // change de régime.
  if (!error && feuille && insurerNom && !patient.mutuelle) {
    const { error: errFiche } = await supabase
      .from('patients').update({ mutuelle: insurerNom })
      .eq('id', patient.id).eq('doctor_id', doctor.id)
    if (errFiche) console.error('[Feuille de soins] organisme non reporté sur la fiche :', errFiche.message)
  }

  if (error || !feuille) {
    if (tableAbsente(error?.code)) return NextResponse.json({ error: FEUILLE_NON_ACTIVEE }, { status: 503 })
    console.error('[Feuille de soins] création impossible :', error?.message)
    return NextResponse.json({ error: "La feuille n'a pas pu être créée" }, { status: 500 })
  }

  // ── Les actes ─────────────────────────────────────────────────────────────
  // Même précaution : on essaie avec la cotation, on retombe sur la ligne
  // seule si la base ne connaît pas encore ces colonnes.
  const sheetId = (feuille as { id: string }).id
  const cotations: CotationLigne[] = brutes.map((l: unknown) => normaliserCotation(l))
  const sansCotation: Record<string, unknown>[] = lignes.map(
    (l: LigneFeuille) => ({ ...l, sheet_id: sheetId, doctor_id: doctor.id }),
  )
  const avecCotation = sansCotation.map((l, i) => ({ ...l, ...cotations[i] }))

  let { error: errItems } = await supabase.from('care_sheet_items').insert(avecCotation)
  if (errItems && colonneAbsente(errItems.code)) {
    ;({ error: errItems } = await supabase.from('care_sheet_items').insert(sansCotation))
  }
  if (errItems) {
    // Une feuille sans ses actes est un document faux : on ne la laisse pas
    // derrière nous.
    await supabase.from('care_sheets').delete().eq('id', feuille.id).eq('doctor_id', doctor.id)
    console.error('[Feuille de soins] actes non enregistrés :', errItems.message)
    // Cas vu en production : `care_sheets` créée, `care_sheet_items` non. Le
    // praticien recevait « Les actes n'ont pas pu être enregistrés » et
    // recommençait en boucle ; il faut lui dire que c'est la base qu'il faut
    // compléter, pas sa saisie.
    if (tableAbsente(errItems.code) || lienAbsent(errItems.code)) {
      return NextResponse.json({ error: FEUILLE_NON_ACTIVEE }, { status: 503 })
    }
    return NextResponse.json({ error: "Les actes n'ont pas pu être enregistrés" }, { status: 500 })
  }

  return NextResponse.json({ ...feuille, items: lignes }, { status: 201 })
}
