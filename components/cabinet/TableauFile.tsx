'use client'

// La salle d'attente en TROIS COLONNES : qui doit venir, qui attend, qui est
// avec le médecin.
//
// La liste répond bien à « que dois-je faire sur CE patient » : une ligne, des
// boutons au bout. Elle répond mal à la question que la secrétaire se pose en
// levant les yeux — « où en est-on ? ». Il fallait lire chaque ligne et tenir
// le compte de tête. Ici les trois états sont trois colonnes : la pièce se lit
// d'un coup d'œil, de loin, sans rien cliquer.
//
// UNE SEULE ACTION PAR CARTE, celle qui suit : un patient attendu entre, un
// patient qui attend passe en consultation, un patient en consultation ressort.
// Le reste du circuit se fait dans la vue Liste, qui garde tous les boutons —
// deux écrans qui proposent les mêmes sept gestes, c'est deux écrans à
// apprendre pour un seul métier.
import { LogIn, Stethoscope, LogOut, Banknote, FileText, Armchair, CalendarClock } from 'lucide-react'
import { minutesDepuis } from '@/lib/utils'
import { retardMinutes, resumeEchange } from '@/lib/file-attente'
import { BoutonMedecin, type RdvEchange } from '@/components/cabinet/PanneauMedecin'
import type { StaffPermissions } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

interface Colonne {
  cle: 'attendus' | 'attente' | 'consultation'
  titre: string
  icone: typeof Armchair
  vide: string
  /** Le pointage que pose le bouton de la carte. */
  suivant: string
  libelleAction: string
  iconeAction: typeof LogIn
  accent: string
}

const COLONNES: Colonne[] = [
  {
    cle: 'attendus', titre: 'Rendez-vous aujourd’hui', icone: CalendarClock,
    vide: 'Plus personne n’est attendu.',
    suivant: 'arrive', libelleAction: 'Il est arrivé', iconeAction: LogIn,
    accent: 'text-gray-500',
  },
  {
    cle: 'attente', titre: 'En salle d’attente', icone: Armchair,
    vide: 'La salle est vide.',
    suivant: 'en_consultation', libelleAction: 'Faire entrer', iconeAction: Stethoscope,
    accent: 'text-blue-600',
  },
  {
    cle: 'consultation', titre: 'En consultation', icone: Stethoscope,
    vide: 'Le médecin n’a personne.',
    suivant: 'parti', libelleAction: 'Consultation terminée', iconeAction: LogOut,
    accent: 'text-green-600',
  },
]

export default function TableauFile({
  attendus, attente, consultation, permissions, maintenant,
  appelEnCours, onQueue, onPay, onMot,
}: {
  attendus: Apt[]
  attente: Apt[]
  consultation: Apt[]
  permissions: StaffPermissions | null
  /** L'heure du dernier rafraîchissement, passée depuis le parent pour que
   *  les durées de toutes les cartes soient lues au même instant. */
  maintenant: Date
  /** Le médecin réclame le suivant : on désigne QUI, au lieu de laisser la
   *  secrétaire chercher elle-même le premier de la file. */
  appelEnCours: boolean
  onQueue: (id: string, statut: string) => void
  onPay: (a: Apt) => void
  onMot: (a: Apt) => void
}) {
  const parColonne: Record<Colonne['cle'], Apt[]> = { attendus, attente, consultation }

  const nom = (a: Apt) => (a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient')
  const heure = (a: Apt) => String(a.time ?? '').substring(0, 5)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
      {COLONNES.map((col) => {
        const liste = parColonne[col.cle]
        const Icone = col.icone
        return (
          <div key={col.cle} className="bg-gray-50 border border-gray-100 rounded-xl p-2.5">
            <div className="flex items-center gap-2 px-1 pb-2">
              <Icone className={`h-4 w-4 ${col.accent}`} />
              <h2 className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">{col.titre}</h2>
              <span className={`text-sm font-bold ${col.accent}`}>{liste.length}</span>
            </div>

            {liste.length === 0 ? (
              <p className="text-xs text-gray-400 px-1 py-6 text-center">{col.vide}</p>
            ) : (
              <div className="space-y-2">
                {liste.map((a, i) => {
                  const retard = retardMinutes(a, maintenant)
                  const attendDepuis = minutesDepuis(a.queue_arrived_at)
                  const depuis = minutesDepuis(a.queue_started_at)
                  const consigne = resumeEchange(a as never)
                  // Le médecin sonne : c'est LE premier de la file qui entre.
                  const designe = appelEnCours && col.cle === 'attente' && i === 0
                  const ActionIcone = col.iconeAction
                  return (
                    <div
                      key={a.id}
                      className={`bg-white border rounded-lg p-2.5 space-y-2 ${
                        a.urgent ? 'border-red-300 ring-2 ring-red-100'
                        : designe ? 'border-primary-400 ring-2 ring-primary-100'
                        : retard ? 'border-orange-200'
                        : 'border-gray-100'
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-gray-400 shrink-0">{heure(a)}</span>
                        <span className="font-medium text-gray-900 text-sm truncate flex-1 min-w-0">{nom(a)}</span>
                        {a.urgent && (
                          <span className="text-[9px] font-bold uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
                            Urgent
                          </span>
                        )}
                      </div>

                      {/* Une seule ligne d'état, et elle s'écrit seule : le
                          retard vient de l'horloge, l'attente de l'heure
                          d'arrivée posée au pointage. */}
                      <p className="text-[11px] leading-tight">
                        {col.cle === 'attendus' && (
                          retard != null
                            ? <span className="text-orange-700 font-medium">En retard de {retard} min</span>
                            : <span className="text-gray-400">{a.consultation_type?.name || a.notes || 'Consultation'}</span>
                        )}
                        {col.cle === 'attente' && (
                          <span className="text-blue-700">
                            {attendDepuis != null ? `Attend depuis ${attendDepuis} min` : 'En salle d’attente'}
                          </span>
                        )}
                        {col.cle === 'consultation' && (
                          <span className="text-green-700">
                            {depuis != null ? `Avec le médecin depuis ${depuis} min` : 'Avec le médecin'}
                          </span>
                        )}
                      </p>

                      {designe && (
                        <p className="text-[11px] font-semibold text-primary-700">Le médecin le demande</p>
                      )}

                      {consigne && <p className="text-[11px] text-violet-700 truncate">{consigne}</p>}

                      {typeof a.documents_a_remettre === 'number' && a.documents_a_remettre > 0 && !!a.queue_status && (
                        <p className="text-[11px] text-primary-700">
                          <FileText className="h-3 w-3 inline mr-0.5" />{a.documents_a_remettre} document(s) à remettre
                        </p>
                      )}

                      <div className="flex items-center gap-1.5">
                        {permissions?.mark_attendance && (
                          <button
                            onClick={() => onQueue(a.id, col.suivant)}
                            className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium rounded-lg px-2 py-1.5 transition ${
                              designe
                                ? 'bg-primary-500 text-white hover:bg-primary-600'
                                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <ActionIcone className="h-3.5 w-3.5" /> {col.libelleAction}
                          </button>
                        )}

                        <BoutonMedecin rdv={a as RdvEchange} onOpen={() => onMot(a)} />

                        {/* L'argent au même endroit que dans la liste, et selon
                            les mêmes droits. Un devis se règle sur le devis. */}
                        {!a.quote_id && permissions?.payments && (
                          a.amount_paid != null ? (
                            <button
                              onClick={() => onPay(a)}
                              title="Modifier l’encaissement"
                              className="text-[11px] whitespace-nowrap rounded-lg px-2 py-1.5 border bg-green-50 text-green-700 border-green-200"
                            >
                              ✓ {a.amount_paid}
                            </button>
                          ) : (
                            <button
                              onClick={() => onPay(a)}
                              title="Encaisser"
                              className="rounded-lg px-2 py-1.5 border border-primary-200 text-primary-600 hover:bg-primary-50"
                            >
                              <Banknote className="h-3.5 w-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
