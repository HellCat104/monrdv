// Page de l'offre de liste d'attente (lien reçu par e-mail). LECTURE SEULE :
// la réservation se fait par un POST déclenché par un clic explicite (voir
// app/api/waitlist/[token]). Sur le modèle de /annuler/[token].
//
// Chaque refus a SA phrase (lib/waitlist.ts → messagePour) : un patient à qui
// l'on répond « lien invalide » alors que la place vient simplement d'être
// prise croit le site cassé et appelle le cabinet. Et chaque phrase de refus
// rappelle ce qui compte le plus pour lui : son rendez-vous actuel est maintenu.
import type { Metadata } from 'next'
import { XCircle, CalendarClock, CheckCircle2 } from 'lucide-react'
import { evaluerOffre, type EtatOffre } from '@/lib/waitlist'
import { ReserverCreneau, DesinscriptionListe } from './ReserverCreneau'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Une place s\'est libérée plus tôt',
  robots: { index: false, follow: false },
}

const TITRES: Record<EtatOffre, string> = {
  inconnue: 'Lien invalide',
  deja_utilisee: 'Offre déjà utilisée',
  close: 'Offre plus valable',
  desactivee: 'Offre plus valable',
  passee: 'Ce créneau est passé',
  plus_utile: 'Rien à avancer',
  reglee: 'Contactez le cabinet',
  prise: 'Ce créneau vient d\'être pris',
  indisponible: 'Ce créneau n\'est plus disponible',
  erreur: 'Une erreur est survenue',
  disponible: 'Une place s\'est libérée plus tôt',
}

export default async function CreneauPage({ params }: { params: { token: string } }) {
  const vue = await evaluerOffre(params.token)
  const a = vue.affichage

  if (vue.etat !== 'disponible' || !a) {
    // L'inscription est encore active dans ces deux cas : on laisse au patient
    // le moyen d'arrêter les offres depuis la page même.
    const peutSeDesinscrire = vue.etat === 'prise' || vue.etat === 'indisponible'
      || vue.etat === 'passee' || vue.etat === 'plus_utile'
    const Icone = vue.etat === 'deja_utilisee' ? CheckCircle2
      : (vue.etat === 'passee' || vue.etat === 'prise' || vue.etat === 'indisponible') ? CalendarClock
      : XCircle
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
          <Icone className={`h-16 w-16 mx-auto mb-4 ${vue.etat === 'deja_utilisee' ? 'text-green-400' : vue.etat === 'inconnue' || vue.etat === 'erreur' ? 'text-red-400' : 'text-gray-300'}`} />
          <h1 className="text-xl font-bold text-gray-900">{TITRES[vue.etat]}</h1>
          <p className="text-gray-500 text-sm mt-2 mb-5">{vue.message}</p>
          <div className="flex flex-col gap-2">
            {a?.slug && (vue.etat === 'close' || vue.etat === 'desactivee') ? (
              <a
                href={`/dr-${a.slug}`}
                className="inline-block bg-primary-500 hover:bg-primary-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                Prendre un rendez-vous
              </a>
            ) : null}
            <a
              href="/"
              className="inline-block border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              Retour à l&apos;accueil
            </a>
            {peutSeDesinscrire && <DesinscriptionListe token={params.token} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Avancer votre rendez-vous ?</h1>
        <p className="text-sm text-gray-500">
          {a.medecin}{a.specialite ? ` — ${a.specialite}` : ''}
        </p>

        <div className="bg-green-50 border-l-4 border-green-500 rounded-r-xl p-4 my-4 text-left">
          <p className="text-xs font-bold text-green-700">PLACE DISPONIBLE</p>
          <p className="text-base font-bold text-green-900 mt-0.5">{a.creneau}</p>
        </div>
        {a.actuel && (
          <div className="bg-gray-50 border-l-4 border-gray-300 rounded-r-xl p-3 mb-4 text-left">
            <p className="text-xs text-gray-400">Votre rendez-vous actuel</p>
            <p className="text-sm text-gray-600">{a.actuel}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-4 text-left">
          Premier arrivé, premier servi : cette place a été proposée à plusieurs patients.
          Votre rendez-vous actuel ne sera annulé qu&apos;une fois la nouvelle place confirmée —
          si elle est prise avant vous, vous gardez votre rendez-vous.
        </p>

        <ReserverCreneau token={params.token} />
      </div>
    </div>
  )
}
