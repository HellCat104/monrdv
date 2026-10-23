'use client'

// Enregistrer un vaccin, puis imprimer le certificat — un seul écran.
//
// Deux écrans auraient été deux occasions d'oublier le second : le médecin
// qui a imprimé considère l'acte fait, et la trace manquerait au cabinet
// trois ans plus tard, quand on cherche si le rappel est dû.
//
// On enregistre d'abord, on imprime ensuite : un papier remis sans trace est
// un dossier faux, l'inverse n'est qu'un papier à réimprimer.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import { lignesEnTete, type PraticienEnTete } from '@/lib/document-entete'
import { formatDateFr } from '@/lib/utils'
import { VACCINS_ADULTE } from '@/lib/vaccins-adulte'
import { Syringe, Printer, Save, Check, AlertTriangle, ArrowLeft } from 'lucide-react'

const AUTRE = '__autre__'

interface Fait {
  id: string
  libelle: string
  administre_le: string
  lot: string | null
  dose: string | null
  rappel_le: string | null
}

export default function VaccinClient({
  doctor, doctorId, patient, historique, v79, backHref, logoUrl = null,
}: {
  doctor: PraticienEnTete
  doctorId: string
  patient: { id: string; first_name: string; last_name: string; age?: number | null; cin?: string | null }
  historique: Fait[]
  v79: boolean
  backHref: string
  /** Logo du cabinet (v57). Absent : en-tête d'origine, inchangé. */
  logoUrl?: string | null
}) {
  const supabase = createClient()
  const router = useRouter()

  const aujourdhui = new Date().toISOString().slice(0, 10)
  const [choix, setChoix] = useState(VACCINS_ADULTE[0].libelle)
  const [libelleLibre, setLibelleLibre] = useState('')
  const [date, setDate] = useState(aujourdhui)
  const [lot, setLot] = useState('')
  const [dose, setDose] = useState('')
  const [rappel, setRappel] = useState('')
  const [enregistre, setEnregistre] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const [faits, setFaits] = useState<Fait[]>(historique)

  const libelle = choix === AUTRE ? libelleLibre.trim() : choix

  // Rappel pré-rempli depuis le délai habituel du vaccin choisi. Indicatif :
  // le médecin le corrige ou l'efface.
  function choisir(v: string) {
    setChoix(v)
    setErreur('')
    const connu = VACCINS_ADULTE.find((x) => x.libelle === v)
    if (connu?.rappelMois) {
      const d = new Date(`${date}T00:00:00`)
      d.setMonth(d.getMonth() + connu.rappelMois)
      setRappel(d.toISOString().slice(0, 10))
    } else {
      setRappel('')
    }
  }

  async function enregistrer() {
    if (!libelle) { setErreur('Indiquez le vaccin administré.'); return }
    setEnCours(true)
    setErreur('')
    const { data, error } = await supabase
      .from('vaccinations')
      .insert({
        doctor_id: doctorId,
        patient_id: patient.id,
        libelle,
        administre_le: date,
        lot: lot.trim() || null,
        dose: dose.trim() || null,
        rappel_le: rappel || null,
      })
      .select('id, libelle, administre_le, lot, dose, rappel_le')
      .single()
    setEnCours(false)
    if (error || !data) {
      // Comme pour l'ordonnance : on dit ce qui est perdu ET ce qui ne l'est
      // pas. Le formulaire est toujours rempli, rien n'est à retaper.
      setErreur("Le vaccin n'a PAS été enregistré. Vos saisies sont toujours là : vérifiez votre connexion, puis réessayez.")
      return
    }
    setFaits((prev) => [data as Fait, ...prev])
    setEnregistre(true)
  }

  const identite = `${patient.first_name} ${patient.last_name}`

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 print:bg-white print:p-0">
      <div className="max-w-5xl mx-auto mb-4 flex items-center justify-between gap-3 print:hidden">
        <button onClick={() => router.push(backHref)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="flex items-center gap-2">
          {!enregistre ? (
            <Button onClick={enregistrer} disabled={enCours || !libelle}>
              <Save className="h-4 w-4 mr-2" /> {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <Check className="h-4 w-4" /> Enregistré au dossier
              </span>
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Imprimer / PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {erreur && (
        <div role="alert" className="max-w-5xl mx-auto mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm print:hidden">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{erreur}</span>
        </div>
      )}

      {!v79 && (
        <div className="max-w-5xl mx-auto mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm print:hidden">
          L&apos;enregistrement des vaccins n&apos;est pas encore activé sur cette base (migration v79).
        </div>
      )}

      <div className="max-w-5xl mx-auto flex gap-4 items-start print:block">
        {/* Le certificat, tel qu'il s'imprimera */}
        <div className="flex-1 bg-white shadow-sm rounded-lg px-12 py-10 print:shadow-none print:rounded-none print:px-0 print:py-0">
          <EnTeteDocument lignes={lignesEnTete(doctor)} logoUrl={logoUrl} disposition="centree" />

          <div className="text-center mb-6">
            <h2 className="inline-block text-sm font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1">
              Certificat de vaccination
            </h2>
          </div>

          <p className="text-[13px] text-gray-600 text-right mb-4">
            {doctor.city ? `${doctor.city}, le ` : 'Le '}{formatDateFr(new Date())}
          </p>

          <div className="text-[13px] text-gray-900 leading-relaxed space-y-3">
            <p>Je soussigné(e), {doctor.name}, certifie avoir administré ce jour à :</p>
            <p className="font-semibold">
              {identite}
              {patient.age != null && <span className="font-normal text-gray-600"> · {patient.age} ans</span>}
              {patient.cin && <span className="font-normal text-gray-600"> · CIN {patient.cin}</span>}
            </p>
            <p>
              le vaccin <strong>{libelle || '…'}</strong>
              {dose.trim() && <> ({dose.trim()})</>}
              , le <strong>{formatDateFr(date)}</strong>
              {lot.trim() && <> — lot n° {lot.trim()}</>}.
            </p>
            {rappel && <p>Prochain rappel recommandé : <strong>{formatDateFr(rappel)}</strong>.</p>}
            <p>Certificat établi à la demande de l&apos;intéressé(e) pour faire valoir ce que de droit.</p>
          </div>

          <div className="mt-20 flex justify-end">
            <div className="text-center">
              <div className="w-52 border-t border-gray-400 pt-1.5">
                <p className="text-xs text-gray-500">Signature et cachet</p>
              </div>
            </div>
          </div>
        </div>

        {/* Saisie — jamais imprimée */}
        <aside className="w-80 shrink-0 space-y-4 print:hidden">
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Syringe className="h-4 w-4 text-primary-500" /> Le vaccin administré
            </h3>

            <div className="space-y-1.5">
              <Label>Vaccin</Label>
              <Select value={choix} onValueChange={choisir} disabled={enregistre}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VACCINS_ADULTE.map((v) => (
                    <SelectItem key={v.libelle} value={v.libelle}>{v.libelle}</SelectItem>
                  ))}
                  {/* La liste est une aide, pas une contrainte : un vaccin du
                      voyageur ne figure dans aucune liste courte. */}
                  <SelectItem value={AUTRE}>Autre — à saisir</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {choix === AUTRE && (
              <div className="space-y-1.5">
                <Label htmlFor="vac-libre">Nom du vaccin</Label>
                <Input id="vac-libre" value={libelleLibre} onChange={(e) => setLibelleLibre(e.target.value)} disabled={enregistre} placeholder="Encéphalite japonaise…" maxLength={120} />
              </div>
            )}

            <div className="space-y-1.5">
              {/* Date d'ADMINISTRATION, pas de saisie : on rattrape souvent le
                  lendemain, et c'est elle qui compte pour le rappel. */}
              <Label htmlFor="vac-date">Administré le</Label>
              <Input id="vac-date" type="date" value={date} max={aujourdhui} onChange={(e) => setDate(e.target.value)} disabled={enregistre} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="vac-dose">Dose</Label>
                <Input id="vac-dose" value={dose} onChange={(e) => setDose(e.target.value)} disabled={enregistre} placeholder="1re, rappel…" maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vac-lot">Lot</Label>
                <Input id="vac-lot" value={lot} onChange={(e) => setLot(e.target.value)} disabled={enregistre} placeholder="n° de lot" maxLength={60} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vac-rappel">Prochain rappel</Label>
              <Input id="vac-rappel" type="date" value={rappel} onChange={(e) => setRappel(e.target.value)} disabled={enregistre} />
              <p className="text-[11px] text-gray-400">Pré-rempli selon le vaccin. Figure sur le certificat ; pour être rappelé vous-même, ajoutez un rappel de suivi depuis la fiche.</p>
            </div>
          </div>

          {faits.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Déjà administrés ici</h3>
              <ul className="space-y-1.5">
                {faits.map((f) => (
                  <li key={f.id} className="text-xs text-gray-600">
                    <span className="font-medium text-gray-800">{f.libelle}</span>
                    <span className="text-gray-400"> · {formatDateFr(f.administre_le)}</span>
                    {f.rappel_le && <span className="block text-[11px] text-amber-700">rappel : {formatDateFr(f.rappel_le)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
