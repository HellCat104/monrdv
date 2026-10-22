'use client'

// Le POSTE D'ACCUEIL : c'est ici que la secrétaire travaille le plus clair de
// sa journée. Elle fait avancer le patient dans le circuit Arrivé → En
// consultation → Parti, elle encaisse quand il ressort, et elle échange avec
// le médecin. L'agenda, lui, sert à organiser : créer, déplacer, voir la
// semaine.
//
// Tout ce qui est partagé avec l'agenda l'est par des composants communs —
// les boutons de pointage, l'encaissement, le panneau du médecin. Recopier
// l'encaissement aurait été la pire option : le jour où le calcul du reste dû
// change, les deux écrans annonceraient au patient des montants différents.
import { useCallback, useEffect, useState } from 'react'
import { getNowInMaroc, formatTime, minutesDepuis, APPEL_VALIDE_MIN } from '@/lib/utils'
import { etatPatient, resumeEchange } from '@/lib/file-attente'
import BoutonsFile from '@/components/cabinet/BoutonsFile'
import { format } from 'date-fns'
import EncaisserDialog, { type RdvAEncaisser } from '@/components/cabinet/EncaisserDialog'
import PanneauMedecin, { BoutonMedecin, type RdvEchange } from '@/components/cabinet/PanneauMedecin'
import type { StaffPermissions, ConsultationType } from '@/types'
import { Armchair, BellRing, ChevronDown, Banknote, FileText } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Apt = Record<string, any>

export default function WaitingRoomClient() {
  const [appts, setAppts] = useState<Apt[]>([])
  const [loading, setLoading] = useState(true)
  const [replieOuvert, setReplieOuvert] = useState(false)
  const [repartisOuvert, setRepartisOuvert] = useState(false)
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null)
  const [types, setTypes] = useState<ConsultationType[]>([])
  const [payFor, setPayFor] = useState<Apt | null>(null)
  const [motFor, setMotFor] = useState<Apt | null>(null)
  const [doctorName, setDoctorName] = useState('Le médecin')
  const today = format(getNowInMaroc(), 'yyyy-MM-dd')

  const load = useCallback(async () => {
    const res = await fetch(`/api/cabinet/appointments?date=${today}`)
    if (res.ok) {
      const d = await res.json()
      setAppts((d.appointments ?? []).filter((a: Apt) => a.status !== 'cancelled'))
      // Les permissions viennent de la même réponse : la page serveur n'a
      // vérifié que l'accès à l'écran, pas le droit d'encaisser.
      setPermissions(d.permissions ?? null)
      setTypes(d.consultationTypes ?? [])
      if (d.doctorName) setDoctorName(d.doctorName)
    }
    setLoading(false)
  }, [today])

  useEffect(() => {
    load()
    // La file bouge tout le temps : rafraîchit toutes les 60 s
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  async function patch(id: string, champs: Record<string, unknown>) {
    const res = await fetch('/api/cabinet/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...champs }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Échec'); return false }
    // Le select du serveur ne renvoie pas les colonnes de la v76 : sans ce
    // complément, effacer l'appel du médecin ne se voyait qu'au
    // rafraîchissement suivant, et le bandeau semblait ignorer le clic.
    const absents = Object.fromEntries(Object.entries(champs).filter(([c]) => !(c in d)))
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, ...d, ...absents } : a)))
    return true
  }

  const setQueue = (id: string, queue_status: string | null) => patch(id, { queue_status })

  // Le médecin réclame le patient suivant. Le bandeau existait sur l'agenda ;
  // il manquait ICI, qui est pourtant l'écran depuis lequel on fait entrer.
  // Sans la permission « présences », le serveur refusera d'effacer l'appel :
  // montrer la bannière mènerait à un bouton « C'est fait » qui alerte et ne
  // fait rien, sans autre moyen de la faire taire.
  const appels = !permissions?.mark_attendance ? [] : appts.filter((a) => {
    const m = minutesDepuis(a.appel_suivant_le)
    return m != null && m <= APPEL_VALIDE_MIN
  })

  const waiting = appts.filter((a) => a.queue_status === 'arrive')
  const inConsult = appts.filter((a) => a.queue_status === 'en_consultation')

  // Un écran qui s'appelle « salle d'attente » doit montrer QUI EST ENCORE LÀ.
  // Il listait tous les rendez-vous du jour, y compris ceux repartis depuis
  // trois heures : quand la pièce est pleine, c'est la seule liste qu'elle
  // regarde, et elle doit tenir en cinq noms.
  //
  // Les autres ne sont pas effacés — ils se replient. Elle a encore besoin de
  // pointer quelqu'un qu'elle avait oublié, ou de corriger une erreur.
  const presents = appts.filter((a) => a.queue_status === 'arrive' || a.queue_status === 'en_consultation')
  // Ceux qu'on attend encore : pas encore pointés, ou notés en retard. Les
  // patients repartis n'ont plus rien à faire sur cet écran — c'est du passé,
  // et la journée d'un cabinet en accumule vite trente.
  const aVenir = appts.filter((a) => !a.queue_status)
  // Les repartis restent atteignables, derrière un second repli : sans eux, un
  // « Parti » cliqué par erreur serait définitif, l'agenda n'ayant plus de
  // boutons de pointage sur un patient déjà passé.
  const repartis = appts.filter((a) => a.queue_status === 'parti')
  const aAfficher = [...presents, ...(replieOuvert ? aVenir : []), ...(repartisOuvert ? repartis : [])]

  return (
    <div className="space-y-4">
      {appels.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap bg-primary-500 text-white rounded-xl px-4 py-3">
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold flex-1 min-w-0">
            Le médecin demande le patient suivant.
          </span>
          <button
            onClick={() => appels.forEach((a) => patch(a.id, { appel_suivant_le: null }))}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 transition"
          >
            C&apos;est fait
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Le rôle de l'écran, écrit. Deux écrans qui se ressemblent et dont
            on doit deviner la différence, c'est deux écrans qu'on ouvre au
            hasard. */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Armchair className="h-5 w-5 text-primary-500" /> Salle d&apos;attente
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Votre poste : qui est là, qui entre, qui règle.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span><b className="text-blue-600">{waiting.length}</b> en attente</span>
          <span><b className="text-green-600">{inConsult.length}</b> en consultation</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : appts.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          <Armchair className="h-8 w-8 mx-auto mb-2 opacity-40" /> Aucun rendez-vous aujourd&apos;hui.
        </div>
      ) : aAfficher.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">
          <Armchair className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Personne n&apos;attend pour le moment.
          {aVenir.length > 0 && (
            <button onClick={() => setReplieOuvert(true)} className="block mx-auto mt-2 text-xs text-primary-600 hover:underline">
              Voir les {aVenir.length} rendez-vous à venir
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
          {aAfficher.map((a) => {
            return (
              <div key={a.id} className="flex items-center gap-3 p-3.5 flex-wrap">
                <div className="text-sm font-semibold text-gray-900 w-14 shrink-0">{formatTime(a.time)}</div>
                <div className="flex-1 min-w-[140px]">
                  <p className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient'}</span>
                    {/* Les documents se remettent au moment où le patient sort,
                        donc depuis cet écran. Un COMPTE, jamais le contenu. */}
                    {/* Y COMPRIS « parti » : la pastille s'éteignait au clic
                        sur Parti, c'est-à-dire exactement au moment où le
                        patient passe au comptoir chercher son ordonnance. */}
                    {!!a.queue_status
                      && typeof a.documents_a_remettre === 'number' && a.documents_a_remettre > 0 && (
                      <span className="text-[10px] font-semibold bg-primary-50 text-primary-700 border border-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        <FileText className="h-3 w-3 inline mr-0.5" />{a.documents_a_remettre} à remettre
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{a.consultation_type?.name || a.notes || 'Consultation'}</p>
                  {/* Ce que dit le médecin, lisible sans ouvrir le panneau —
                      c'est son poste de travail, elle ne devrait pas avoir à
                      cliquer pour savoir qu'il y a une consigne. */}
                  {resumeEchange(a as never) && (
                    <p className="text-[11px] text-violet-700 truncate">{resumeEchange(a as never)}</p>
                  )}
                </div>

                {/* Même phrase que sur les deux agendas (lib/file-attente) :
                    trois écrans qui nomment différemment le même état, c'est
                    trois choses à apprendre pour une seule. */}
                {etatPatient(a) && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${etatPatient(a)!.couleur}`}>
                    {etatPatient(a)!.label}
                  </span>
                )}

                {permissions?.mark_attendance && (
                  <BoutonsFile
                    queueStatus={a.queue_status}
                    attendance={a.attendance}
                    onQueue={(key) => setQueue(a.id, key)}
                    onAttendance={(key) => patch(a.id, { attendance: key })}
                    libelles
                  />
                )}

                {/* Répondre au médecin sans changer d'écran : c'est ici
                    qu'elle est quand il lui écrit. */}
                <BoutonMedecin rdv={a as RdvEchange} onOpen={() => setMotFor(a)} />

                {/* L'argent, au moment où le patient sort — c'est ici qu'elle
                    le voit partir, pas dans l'agenda. Le rendez-vous rattaché
                    à un devis se règle sur le devis : on l'écrit plutôt que de
                    faire disparaître le bouton sans explication. */}
                {a.quote_id ? (
                  <span className="text-[11px] whitespace-nowrap rounded-full px-2 py-0.5 bg-primary-50 text-primary-700 border border-primary-100">
                    Réglé via le devis
                  </span>
                ) : permissions?.payments ? (
                  a.amount_paid != null ? (() => {
                    const reste = (a.amount_due ?? 0) - a.amount_paid
                    const partiel = a.amount_due != null && reste > 0
                    return (
                      <button
                        onClick={() => setPayFor(a)}
                        title={partiel ? 'Solder le reste' : 'Modifier l\'encaissement'}
                        className={`text-[11px] whitespace-nowrap rounded-full px-2 py-0.5 border ${partiel ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}`}
                      >
                        {partiel ? `${a.amount_paid}/${a.amount_due} DH` : `✓ ${a.amount_paid} DH`}
                      </button>
                    )
                  })() : (
                    <button
                      onClick={() => setPayFor(a)}
                      className="flex items-center gap-1 text-xs text-primary-600 border border-primary-200 rounded-lg px-2 py-1 hover:bg-primary-50 whitespace-nowrap"
                    >
                      <Banknote className="h-3.5 w-3.5" /> Encaisser
                    </button>
                  )
                ) : null}
              </div>
            )
          })}

          {/* La suite de la journée — ceux qu'on attend encore. */}
          {!replieOuvert && aVenir.length > 0 && (
            <button
              onClick={() => setReplieOuvert(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {aVenir.length} rendez-vous à venir aujourd&apos;hui
            </button>
          )}
          {replieOuvert && (
            <button
              onClick={() => setReplieOuvert(false)}
              className="w-full py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            >
              Ne montrer que la salle d&apos;attente
            </button>
          )}

          {/* Les repartis, derrière un second repli et jamais ouverts d'office :
              un « Parti » cliqué par erreur doit pouvoir se corriger, mais la
              journée en accumule trente et ce n'est pas ce qu'elle regarde. */}
          {repartis.length > 0 && (
            <button
              onClick={() => setRepartisOuvert((v) => !v)}
              className="w-full py-2 text-[11px] text-gray-300 hover:text-gray-500 hover:bg-gray-50"
            >
              {repartisOuvert ? 'Masquer les patients repartis' : `${repartis.length} patient${repartis.length > 1 ? 's' : ''} reparti${repartis.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      <PanneauMedecin
        rdv={motFor as RdvEchange | null}
        doctorName={doctorName}
        onClose={() => setMotFor(null)}
        onChange={load}
      />

      <EncaisserDialog
        rdv={payFor as RdvAEncaisser | null}
        tarifMotif={types.find((t) => t.id === payFor?.consultation_type_id)?.default_price ?? null}
        peutModifierPrix={!!permissions?.edit_prices}
        onSave={(patchPaiement) => patch(payFor!.id, patchPaiement)}
        onClose={() => setPayFor(null)}
      />

      <p className="text-[11px] text-gray-400">« Arrivé » pointe automatiquement le patient comme présent dans les statistiques.</p>
    </div>
  )
}
