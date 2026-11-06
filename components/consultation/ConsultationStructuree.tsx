'use client'

// La consultation structurée, rubrique par rubrique — PARTAGÉE PAR LES
// BRANCHES.
//
// Gastro-entérologie et dentisterie remplissent le même dossier (table
// `consultations`, v81) avec des rubriques et des trames différentes : un
// dentiste ne lit pas son dossier comme un gastro-entérologue. Le composant
// reçoit donc ses rubriques et ses trames ; il ne les connaît pas.
//
// Une seconde copie de cet écran par spécialité aurait voulu dire : deux
// endroits à corriger le jour où l'enregistrement change, et deux écrans qui
// divergent lentement.
//
// ── CE QUI EST PRÉ-REMPLI, ET CE QUI NE L'EST JAMAIS ────────────────────────
//
// Pré-rempli : ce que le DOSSIER sait déjà — antécédents, allergies, dernières
// constantes. Le médecin les amende pour ce jour-là plutôt que de les retaper.
//
// Jamais pré-rempli : une constatation. Les trames par motif (reflux, douleurs
// abdominales, diarrhée chronique…) ne déposent que des INTITULÉS suivis de
// « : » — « Pyrosis : », « Dysphagie : ». Elles évitent d'oublier une
// question, elles n'y répondent pas. Une trame qui écrirait « Pyrosis : oui »
// ferait signer au praticien un symptôme qu'il n'a pas constaté.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import BandeauRisques from '@/components/dashboard/BandeauRisques'
import type { Risque as RisqueAlerte } from '@/lib/anamnese'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, Check, Eye, FileText } from 'lucide-react'
import type { RubriqueConsultation, TrameConsultation } from '@/lib/gastro'
import { FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT } from '@/lib/dental'
// Reconnaître « la migration n'est pas passée » se fait en UN endroit : les
// codes de PostgREST changent de version en version, et trois copies de la
// liste, c'est deux qui finissent périmées.
import { colonneAbsente, tableAbsente } from '@/lib/migrations'

interface PatientLite { id: string; first_name: string; last_name: string; age?: number | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Existant = Record<string, any> | null

export default function ConsultationStructuree({
  doctorId, patient, appointmentId, existant, dossier,
  rubriques, trames, retourCr, dentaire = false, alertes,
  colonnesFacultatives = [], pleineLargeur = false,
}: {
  doctorId: string
  patient: PatientLite
  appointmentId: string | null
  existant: Existant
  dossier: { antecedents: string; allergies: string; mesures: string }
  /** Les rubriques de CETTE spécialité, dans son ordre de lecture. */
  rubriques: RubriqueConsultation[]
  trames: TrameConsultation[]
  /** Où mène l'aperçu du compte rendu (la route diffère par branche). */
  retourCr: string
  /** Les risques à signaler AVANT le geste (anamnèse + allergies du dossier).
   *  Absent = pas de bannière : c'est la branche qui décide, pas ce composant,
   *  et une branche sans questionnaire n'a pas à être invitée à le remplir. */
  alertes?: {
    risques: RisqueAlerte[]
    verifier: RisqueAlerte[]
    remplie: boolean
    ancienne: boolean
    maj: string | null
  }
  /** Dentisterie : les dents concernées et les matériaux employés, deux
   *  colonnes qui n'existent qu'au fauteuil (v85). */
  dentaire?: boolean
  /** Les rubriques dont la colonne peut ne pas exister encore en base.
   *
   *  Règle de la maison : une fonctionnalité dont la migration n'est pas
   *  passée se DÉSACTIVE, elle ne plante pas. Si l'enregistrement échoue sur
   *  une colonne absente, on la retire et on réessaie — le reste de la
   *  consultation est enregistré, et l'écran dit ce qui n'a pas été gardé.
   *
   *  Ex. « arret_travail » (v96) chez le généraliste. */
  colonnesFacultatives?: string[]
  /** Le formulaire occupe toute la place qu'on lui donne, au lieu de se
   *  centrer dans une colonne de 48 rem.
   *
   *  Chez le généraliste il vit à côté d'un rail de navigation : la colonne
   *  centrée laissait alors une bande blanche à droite, et les rubriques
   *  devenaient plus étroites à mesure qu'on élargissait la fenêtre. */
  pleineLargeur?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()

  const [id, setId] = useState<string | null>(existant?.id ?? null)
  const [date, setDate] = useState<string>(existant?.date_consultation ?? new Date().toISOString().slice(0, 10))
  const [champs, setChamps] = useState<Record<string, string>>(() => {
    const depart: Record<string, string> = {}
    for (const r of rubriques) depart[r.cle] = existant?.[r.cle] ?? ''
    // Une consultation neuve part du dossier. Une consultation reprise garde
    // ce qui y avait été écrit : on n'écrase pas le travail du médecin.
    if (!existant) {
      depart.antecedents = dossier.antecedents
      depart.allergies = dossier.allergies
      depart.mesures = dossier.mesures
    }
    return depart
  })
  const [prochainControle, setProchainControle] = useState<string>(existant?.prochain_controle ?? '')
  const [dents, setDents] = useState<string[]>(existant?.dents ?? [])
  const [materiaux, setMateriaux] = useState<string>(existant?.materiaux ?? '')
  const [enCours, setEnCours] = useState(false)
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState('')
  /** Les rubriques que la base n'a pas pu garder, faute de colonne. */
  const [abandonnees, setAbandonnees] = useState<string[]>([])

  const maj = (cle: string, v: string) => setChamps((prev) => ({ ...prev, [cle]: v }))

  // ── LES TRAMES, ET LE DROIT DE SE TROMPER ─────────────────────────────────
  //
  // Une trame ne remplit que les rubriques VIDES : si le médecin a déjà écrit
  // l'histoire de la maladie, son texte reste. Cette règle ne se négocie pas.
  //
  // Mais prise seule, elle rendait un mauvais clic irréversible. On cliquait
  // « Hypertension » au lieu de « Diabète », les onze rubriques se
  // remplissaient, et la bonne trame ne trouvait plus rien de vide : elle ne
  // faisait rien. Il fallait vider chaque case à la main, au milieu de la
  // consultation.
  //
  // D'où la distinction, qui est la seule idée de tout ce bloc :
  //
  //   · ce que LA TRAME a déposé et que personne n'a touché → remplaçable
  //   · ce que LE MÉDECIN a écrit ou corrigé → intouchable, toujours
  //
  // On se souvient donc, texte par texte, de ce qu'on a déposé. Une rubrique
  // dont le contenu est encore MOT POUR MOT celui de la trame n'a pas été
  // relue ; dès qu'elle diffère d'un caractère, elle appartient au médecin.

  /** La trame affichée comme active, s'il y en a une. */
  const [trameActive, setTrameActive] = useState<string | null>(null)
  /** Ce que cette trame a déposé, rubrique par rubrique. */
  const [deposeParTrame, setDeposeParTrame] = useState<Record<string, string>>({})

  /** Cette rubrique contient-elle encore, mot pour mot, ce que la trame y a
   *  mis ? Si oui, elle n'a pas été relue, et on peut la remplacer. */
  const intacte = (cle: string, valeurActuelle: string) =>
    deposeParTrame[cle] !== undefined && valeurActuelle === deposeParTrame[cle]

  /** Poser une trame — ou la retirer si on reclique sur celle qui est active.
   *
   *  Le reclic est volontaire : c'est le geste qu'on tente spontanément quand
   *  on s'est trompé, et il n'y a rien à apprendre. */
  function appliquerTrame(cle: string) {
    if (cle === trameActive) { retirerTrame(); return }
    const t = trames.find((x) => x.cle === cle)
    if (!t) return

    // Calculé d'un bloc, puis posé : on a besoin de savoir ce qu'on a
    // RÉELLEMENT déposé, et ça ne se lit pas depuis un setState.
    const suivant = { ...champs }

    // 1. Effacer ce que la trame PRÉCÉDENTE avait déposé et que personne n'a
    //    touché. Sans ça, une rubrique de l'ancienne trame absente de la
    //    nouvelle resterait là, orpheline, et on signerait un examen clinique
    //    qui n'a rien à voir avec le motif.
    for (const k of Object.keys(deposeParTrame)) {
      if (intacte(k, suivant[k] ?? '')) suivant[k] = ''
    }

    // 2. Poser la nouvelle, dans les rubriques désormais vides — et retenir
    //    CELLES-LÀ seulement. Une rubrique déjà écrite par le médecin n'a pas
    //    été remplie par nous : il ne faudra jamais croire qu'on peut
    //    l'effacer.
    const depose: Record<string, string> = {}
    for (const [k, v] of Object.entries(t.champs)) {
      if (!(suivant[k] ?? '').trim() && v) { suivant[k] = v; depose[k] = v }
    }

    setChamps(suivant)
    setDeposeParTrame(depose)
    setTrameActive(cle)
  }

  /** Retirer la trame : on reprend ce qu'on a mis, et rien d'autre. */
  function retirerTrame() {
    setChamps((prev) => {
      const suivant = { ...prev }
      for (const k of Object.keys(deposeParTrame)) {
        if (intacte(k, suivant[k] ?? '')) suivant[k] = ''
      }
      return suivant
    })
    setDeposeParTrame({})
    setTrameActive(null)
  }

  /** Combien de rubriques la trame peut encore reprendre. Zéro = le médecin a
   *  tout relu, et le bouton « retirer » n'a plus rien à faire : on le dit
   *  plutôt que de laisser un bouton qui ne répond pas. */
  const reprenables = Object.keys(deposeParTrame)
    .filter((k) => intacte(k, champs[k] ?? '')).length

  function corps(statut: 'brouillon' | 'validee', omettre: string[] = []) {
    const base: Record<string, unknown> = {
      doctor_id: doctorId, patient_id: patient.id, appointment_id: appointmentId,
      date_consultation: date, prochain_controle: prochainControle || null, statut,
      ...(statut === 'validee' ? { validee_le: new Date().toISOString() } : {}),
    }
    for (const r of rubriques) {
      if (omettre.includes(r.cle)) continue
      base[r.cle] = (champs[r.cle] ?? '').trim() || null
    }
    // Colonnes dentaires : écrites SEULEMENT en dentisterie. Les envoyer
    // ailleurs ferait échouer l'enregistrement sur une base où la v85 n'est
    // pas passée, et sans raison — un gastro-entérologue ne note pas de dent.
    if (dentaire) {
      base.dents = dents
      base.materiaux = materiaux.trim() || null
    }
    return base
  }

  /** Un envoi, qui retente une fois SANS les rubriques facultatives si la base
   *  ne les connaît pas encore. */
  async function envoyer(statut: 'brouillon' | 'validee', courant: string | null) {
    const unCoup = async (omettre: string[]) => {
      if (courant) {
        const { error } = await supabase.from('consultations').update(corps(statut, omettre)).eq('id', courant)
        if (error) throw error
        return courant
      }
      const { data, error } = await supabase.from('consultations').insert(corps(statut, omettre)).select('id').single()
      if (error) throw error
      return data.id as string
    }

    try {
      const idFinal = await unCoup([])
      setAbandonnees([])
      return idFinal
    } catch (e) {
      // Pas une colonne manquante, ou rien de facultatif à retirer : l'erreur
      // est réelle et doit remonter.
      if (!colonneAbsente((e as { code?: string })?.code) || colonnesFacultatives.length === 0) throw e
      const idFinal = await unCoup(colonnesFacultatives)
      // On ne dit « abandonné » que pour ce qui avait été écrit : une rubrique
      // laissée vide n'a rien perdu.
      setAbandonnees(colonnesFacultatives.filter((c) => (champs[c] ?? '').trim()))
      return idFinal
    }
  }

  async function enregistrer(statut: 'brouillon' | 'validee') {
    if (statut === 'validee' && !confirm('Valider cette consultation ? Elle ne pourra plus être modifiée.')) return
    setEnCours(true); setErreur('')
    try {
      const courant = await envoyer(statut, id)
      if (courant !== id) setId(courant)
      if (statut === 'validee') { router.push(`${retourCr}/${courant}`); return }
      setEnregistre(true); setTimeout(() => setEnregistre(false), 2500)
    } catch (e) {
      setErreur(tableAbsente((e as { code?: string })?.code)
        ? 'Les consultations structurées attendent une migration de la base (v81).'
        : 'L’enregistrement a échoué. Réessayez.')
    } finally { setEnCours(false) }
  }

  return (
    <div className={`space-y-4 pb-16 ${pleineLargeur ? '' : 'max-w-3xl mx-auto'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Consultation</h1>
          <p className="text-sm text-gray-500">{patient.first_name} {patient.last_name}{patient.age != null ? ` · ${patient.age} ans` : ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {id && <Button variant="outline" size="sm" onClick={() => router.push(`${retourCr}/${id}`)}><Eye className="h-4 w-4 mr-1.5" /> Aperçu</Button>}
          <Button variant="outline" size="sm" onClick={() => enregistrer('brouillon')} disabled={enCours}>
            {enregistre ? <><Check className="h-4 w-4 mr-1.5" /> Enregistré</> : <><Save className="h-4 w-4 mr-1.5" /> Brouillon</>}
          </Button>
          <Button size="sm" onClick={() => enregistrer('validee')} disabled={enCours}>Valider</Button>
        </div>
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erreur}</p>}

      {/* La consultation est enregistrée, mais une rubrique n'a pas pu l'être.
          Le dire explicitement : un praticien qui croit avoir noté un arrêt de
          travail et ne le retrouve pas le mois suivant perd sa confiance dans
          tout le dossier. */}
      {abandonnees.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Enregistré, sauf&nbsp;:{' '}
          <b>{abandonnees.map((c) => rubriques.find((r) => r.cle === c)?.label ?? c).join(', ')}</b>.
          Cette rubrique attend une migration de la base (v96) — recopiez-la ailleurs en attendant.
        </p>
      )}

      {/* AVANT la trame et avant la première rubrique. Une alerte d'hémostase
          placée après l'examen clinique arrive après la décision. */}
      {alertes && (
        <BandeauRisques
          risques={alertes.risques} verifier={alertes.verifier}
          remplie={alertes.remplie} ancienne={alertes.ancienne} maj={alertes.maj}
        />
      )}

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-[11px] text-gray-400">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
          </div>
          <div className="flex-1 min-w-[16rem]">
            <Label className="text-[11px] text-gray-400 flex items-center gap-1"><FileText className="h-3 w-3" /> Trame de consultation</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {trames.map((t) => {
                const active = t.cle === trameActive
                return (
                  <button key={t.cle} type="button" onClick={() => appliquerTrame(t.cle)}
                    title={active ? 'Cliquez à nouveau pour la retirer' : undefined}
                    className={`text-[11px] px-2 py-1 rounded-lg border transition ${
                      active
                        ? 'bg-primary-500 border-primary-500 text-white font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                    }`}>
                    {t.nom}
                    {/* La croix n'est pas un second bouton : elle montre que
                        le clic qu'on vient de faire se défait. */}
                    {active && reprenables > 0 && <span className="ml-1.5 opacity-70">×</span>}
                  </button>
                )
              })}
            </div>

            {/* Ce que le bouton fait, dit au moment où il peut le faire. Un
                mauvais clic au milieu d'une consultation, c'est onze cases à
                vider à la main si on ne le dit pas ici. */}
            {trameActive && reprenables > 0 ? (
              <p className="text-[11px] text-gray-500 mt-1">
                Trame posée. Cliquez une autre trame pour la remplacer, ou{' '}
                <button type="button" onClick={retirerTrame} className="underline hover:text-gray-700">
                  retirez-la
                </button>
                . Ce que vous avez écrit vous-même ne bougera pas.
              </p>
            ) : trameActive ? (
              <p className="text-[11px] text-gray-400 mt-1">
                Vous avez repris toutes les rubriques de cette trame : elles vous appartiennent, plus rien n’est effacé automatiquement.
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-1">
                Dépose les questions à poser dans les rubriques encore vides. Aucune réponse n’est pré-cochée.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
        {rubriques.map((r) => (
          <div key={r.cle} className="space-y-1">
            <Label className="text-[11px] text-gray-400">{r.label}</Label>
            <textarea value={champs[r.cle] ?? ''} onChange={(e) => maj(r.cle, e.target.value)} rows={r.lignes}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300" />
            {r.aide && <p className="text-[11px] text-gray-400">{r.aide}</p>}
          </div>
        ))}

        {/* DENTISTERIE — les dents touchées ce jour-là, et avec quoi.
            Le schéma dentaire dit l'état du patient dans la durée ; la
            consultation dit ce qu'on a fait pendant CETTE séance. */}
        {dentaire && (
          <>
            <div className="space-y-1">
              <Label className="text-[11px] text-gray-400">Dents concernées par cette séance</Label>
              <div className="space-y-1">
                {[FDI_UPPER, FDI_LOWER, FDI_UPPER_LAIT, FDI_LOWER_LAIT].map((arcade, i) => (
                  <div key={i} className="flex flex-wrap gap-1">
                    {arcade.map((n) => {
                      const cle = String(n)
                      const on = dents.includes(cle)
                      return (
                        <button key={cle} type="button"
                          onClick={() => setDents(on ? dents.filter((d) => d !== cle) : [...dents, cle].sort())}
                          className={`text-[11px] w-8 py-1 rounded border transition ${
                            on ? 'bg-primary-500 border-primary-500 text-white font-semibold'
                               : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          {n}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">
                {dents.length === 0 ? 'Aucune dent sélectionnée.' : `${dents.length} dent(s) : ${dents.join(', ')}`}
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-gray-400">Matériaux et informations techniques</Label>
              <textarea value={materiaux} onChange={(e) => setMateriaux(e.target.value)} rows={2}
                placeholder="Ex : composite A2, ciment verre ionomère, longueur de travail 21 mm"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300" />
              <p className="text-[11px] text-gray-400">
                C’est ce qu’on cherche trois ans plus tard quand une restauration se descelle.
              </p>
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label className="text-[11px] text-gray-400">Prochain contrôle</Label>
          <Input type="date" value={prochainControle} onChange={(e) => setProchainControle(e.target.value)} className="h-9 w-48" />
          <p className="text-[11px] text-gray-400">
            À fixer par vous. Depuis le dossier, « Suivis » transforme cette date en rappel.
          </p>
        </div>
      </div>
    </div>
  )
}
