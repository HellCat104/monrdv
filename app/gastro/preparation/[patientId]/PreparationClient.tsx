'use client'

// Choisir un protocole, l'adapter à CE patient, l'imprimer, le ranger.
//
// L'adaptation se fait sur une COPIE : le protocole d'origine n'est pas touché.
// Un médecin qui décale un horaire pour un patient opéré ne doit pas modifier
// le protocole qu'il utilisera demain sur quelqu'un d'autre.
//
// Rien ici ne recommande d'arrêter un traitement. Le champ « vos médicaments
// habituels » porte le texte du praticien, et l'écran le rappelle : une
// adaptation relève de son évaluation, pas d'une phrase toute faite.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Printer, Save, Check, ClipboardList } from 'lucide-react'
import { assemblerPreparation } from '@/lib/gastro'
import { formatDateFr, formatTime } from '@/lib/utils'
import type { ProtocolePreparation } from '@/types'
import { EnTeteDocument } from '@/components/shared/EnTeteDocument'
import type { LignesEnTete } from '@/lib/document-entete'

interface PatientLite { id: string; first_name: string; last_name: string; age?: number | null }

export default function PreparationClient({
  doctorId, patient, rdv, protocoles, lignes, logoUrl,
}: {
  doctorId: string
  patient: PatientLite
  rdv: { id: string; date: string; time: string } | null
  protocoles: ProtocolePreparation[]
  lignes: LignesEnTete
  logoUrl: string | null
}) {
  const supabase = createClient()
  const router = useRouter()

  const [choisi, setChoisi] = useState<ProtocolePreparation | null>(null)
  const [copie, setCopie] = useState<ProtocolePreparation | null>(null)
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const heureExamen = rdv ? `${formatDateFr(rdv.date)} à ${formatTime(rdv.time)}` : null

  function selectionner(p: ProtocolePreparation) {
    setChoisi(p)
    // Copie profonde des horaires : sans elle, modifier une ligne de la fiche
    // modifierait le tableau du protocole chargé en mémoire.
    setCopie({ ...p, horaires: (p.horaires ?? []).map((h) => ({ ...h })) })
  }

  async function rangerAuDossier() {
    if (!copie) return
    setEnCours(true); setErreur('')
    const { blocs } = assemblerPreparation(copie, heureExamen)
    const contenu = blocs.map((b) => `${b.titre}\n${b.texte}`).join('\n\n')
    const { error } = await supabase.from('certificates').insert({
      doctor_id: doctorId,
      patient_id: patient.id,
      appointment_id: rdv?.id ?? null,
      type: 'preparation_coloscopie',
      title: 'Préparation à la coloscopie',
      motif: copie.nom,
      content: contenu,
    })
    setEnCours(false)
    if (error) { setErreur('L’enregistrement au dossier a échoué.'); return }
    setEnregistre(true); setTimeout(() => setEnregistre(false), 3000)
  }

  const apercu = copie ? assemblerPreparation(copie, heureExamen) : null

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-16">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={() => router.back()} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Préparation à la coloscopie</h1>
          <p className="text-sm text-gray-500">
            {patient.first_name} {patient.last_name}
            {heureExamen ? ` · examen le ${heureExamen}` : ' · aucun rendez-vous rattaché'}
          </p>
        </div>
        {copie && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={rangerAuDossier} disabled={enCours}>
              {enregistre ? <><Check className="h-4 w-4 mr-1.5" /> Rangé au dossier</> : <><Save className="h-4 w-4 mr-1.5" /> Ranger au dossier</>}
            </Button>
            <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" /> Imprimer / PDF</Button>
          </div>
        )}
      </div>

      {erreur && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 print:hidden">{erreur}</p>}

      {protocoles.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-sm text-gray-500 print:hidden">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>Vous n’avez pas encore de protocole de préparation.</p>
          <p className="text-xs text-gray-400 mt-1">
            MonRDV n’en propose aucun : produits, volumes et horaires relèvent de vous.
          </p>
          <Button size="sm" className="mt-3" onClick={() => router.push('/modeles')}>Créer un protocole</Button>
        </div>
      ) : !copie ? (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50 print:hidden">
          {protocoles.map((p) => (
            <button key={p.id} onClick={() => selectionner(p)} className="w-full text-left p-3.5 hover:bg-gray-50 transition">
              <p className="font-medium text-gray-900 text-sm">{p.nom}</p>
              <p className="text-[11px] text-gray-400 truncate">{p.produit || 'Protocole de préparation'}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 print:hidden">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary-600">Adapter pour {patient.first_name}</p>
              <button onClick={() => { setChoisi(null); setCopie(null) }} className="text-xs text-gray-400 hover:text-gray-600">Changer de protocole</button>
            </div>
            <p className="text-[11px] text-gray-400">
              Vous modifiez une copie : le protocole « {choisi?.nom} » reste intact pour vos autres patients.
            </p>

            <Zone label="Régime alimentaire" value={copie.regime ?? ''} rows={3} onChange={(v) => setCopie({ ...copie, regime: v })} />
            <Zone label="Produit de préparation" value={copie.produit ?? ''} rows={2} onChange={(v) => setCopie({ ...copie, produit: v })} />
            <Zone label="Modalités de prise" value={copie.modalites ?? ''} rows={3} onChange={(v) => setCopie({ ...copie, modalites: v })} />

            <div>
              <Label className="text-[11px] text-gray-400">Horaires</Label>
              <div className="space-y-1.5 mt-1">
                {(copie.horaires ?? []).map((h, i) => (
                  <div key={i} className="grid grid-cols-2 gap-1.5">
                    <Input value={h.quand ?? ''} className="h-8 text-xs" placeholder="Quand"
                      onChange={(e) => { const s = [...copie.horaires]; s[i] = { ...s[i], quand: e.target.value }; setCopie({ ...copie, horaires: s }) }} />
                    <Input value={h.quoi ?? ''} className="h-8 text-xs" placeholder="Quoi"
                      onChange={(e) => { const s = [...copie.horaires]; s[i] = { ...s[i], quoi: e.target.value }; setCopie({ ...copie, horaires: s }) }} />
                  </div>
                ))}
              </div>
              {heureExamen && <p className="text-[11px] text-gray-400 mt-1">Examen prévu le {heureExamen} — ajustez les heures en conséquence.</p>}
            </div>

            <Zone label="Vos médicaments habituels" value={copie.consignes_medicaments ?? ''} rows={3}
              onChange={(v) => setCopie({ ...copie, consignes_medicaments: v })}
              aide="Toute adaptation d’un traitement relève de votre évaluation : MonRDV n’écrit rien ici." />
            <Zone label="Consignes pratiques" value={copie.consignes_pratiques ?? ''} rows={3} onChange={(v) => setCopie({ ...copie, consignes_pratiques: v })} />
          </div>

          {/* La feuille remise au patient. Elle porte les coordonnées du
              cabinet par l'en-tête commun, comme tous les documents. */}
          {apercu && (
            <FeuillePreparation
              titre={apercu.titre}
              blocs={apercu.blocs}
              patient={`${patient.first_name} ${patient.last_name}`}
              lignes={lignes}
              logoUrl={logoUrl}
            />
          )}
        </>
      )}
    </div>
  )
}

function Zone({ label, value, onChange, rows = 2, aide }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; aide?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-gray-400">{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary-300" />
      {aide && <p className="text-[11px] text-gray-400">{aide}</p>}
    </div>
  )
}

/** L'aperçu, qui est AUSSI la feuille imprimée : ce que le médecin voit à
 *  l'écran est ce que le patient emporte. Un aperçu qui diffère du papier est
 *  un aperçu qu'on cesse de regarder. */
function FeuillePreparation({ titre, blocs, patient, lignes, logoUrl }: {
  titre: string; blocs: { titre: string; texte: string }[]; patient: string
  lignes: LignesEnTete; logoUrl: string | null
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-8 py-6 print:border-0 print:rounded-none print:px-0 print:py-0">
      <EnTeteDocument lignes={lignes} logoUrl={logoUrl} disposition="centree" />
      <h2 className="text-center text-sm font-bold uppercase tracking-[0.18em] text-gray-900 border-b-2 border-gray-800 pb-1 mb-5 inline-block w-full">{titre}</h2>
      <p className="text-[13px] text-gray-700 mb-5"><span className="text-gray-500">Patient :</span> <b>{patient}</b></p>
      <div className="space-y-4 text-[13px] text-gray-900 leading-relaxed">
        {blocs.length === 0 ? (
          <p className="text-gray-400 italic">Ce protocole ne contient encore aucune consigne.</p>
        ) : blocs.map((b) => (
          <section key={b.titre}>
            <h3 className="font-semibold mb-0.5">{b.titre}</h3>
            <p className="whitespace-pre-wrap">{b.texte}</p>
          </section>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-gray-500">
        En cas de doute ou de difficulté pendant la préparation, contactez le cabinet aux coordonnées figurant en haut de cette feuille.
      </p>
    </div>
  )
}
