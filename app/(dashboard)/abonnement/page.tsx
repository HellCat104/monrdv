'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PLAN_LABELS, PLAN_PRICES_DHS, normalizePlan, type DoctorPlan } from '@/lib/plan'
import { displayName } from '@/lib/profession'
import { CreditCard, CheckCircle2, AlertTriangle, XCircle, Clock, ArrowUpRight, Check } from 'lucide-react'

interface DoctorSub {
  name: string
  specialty: string | null
  date_expiration: string | null
  subscription_status: string
  plan: string | null
  pending_plan: string | null
  price_hidden: boolean | null
}

// Ce que chaque forfait débloque (aligné sur lib/plan.ts)
const PLAN_FEATURES: Record<DoctorPlan, string[]> = {
  agenda: [
    'Page de réservation en ligne 24h/24',
    'Agenda et gestion des rendez-vous',
    'Salle d\'attente et présences',
    'Fiche patient : nom, téléphone, notes',
    'Rappels automatiques et agenda du matin',
    'Suivi d\'activité : présences, retards, absences',
    'Encaissements, caisse et dépenses',
  ],
  complet: [
    'Tout le forfait Agenda',
    'Dossiers patients complets (antécédents, constantes)',
    'Consultation et notes médicales',
    'Ordonnances et certificats',
    'Factures conformes, avoirs et pack comptable',
    'Modules par spécialité',
  ],
}

export default function AbonnementPage() {
  const [doctor, setDoctor] = useState<DoctorSub | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [requesting, setRequesting] = useState(false)

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('doctors')
      .select('name, specialty, date_expiration, subscription_status, plan, pending_plan, price_hidden')
      .eq('email', user.email)
      .single()
    if (data) {
      setDoctor(data)
      if (data.date_expiration) {
        const [year, month, day] = data.date_expiration.split('-').map(Number)
        const exp = new Date(year, month - 1, day)
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        setDaysLeft(Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      }
    }
  }

  useEffect(() => {
    load()
  }, [])

  const isLoaded = doctor !== null
  const isExpired = daysLeft !== null && daysLeft <= 0
  const isRed     = daysLeft !== null && daysLeft > 0 && daysLeft <= 5
  const isWarning = daysLeft !== null && daysLeft > 5 && daysLeft <= 15

  const plan = normalizePlan(doctor?.plan)
  const priceHidden = doctor?.price_hidden === true
  const pendingUpgrade = doctor?.pending_plan === 'complet' && plan !== 'complet'
  const price = PLAN_PRICES_DHS[plan]

  // Enregistre la DEMANDE de passage au forfait Cabinet. Le changement réel de
  // forfait est appliqué par l'admin après confirmation du virement (le champ
  // `plan` est verrouillé en base pour le médecin).
  async function requestUpgrade() {
    setRequesting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('doctors').update({ pending_plan: 'complet' }).eq('email', user.email)
      await load()
    }
    setRequesting(false)
  }

  const whatsappMessage = encodeURIComponent(
    priceHidden
      ? `Bonjour, je suis ${displayName(doctor?.name ?? '', doctor?.specialty)} sur MonRDV. Je viens d'effectuer le paiement pour renouveler mon abonnement.`
      : `Bonjour, je suis ${displayName(doctor?.name ?? '', doctor?.specialty)} sur MonRDV. Je viens d'effectuer le paiement de ${price} DHS pour renouveler mon abonnement (forfait ${PLAN_LABELS[plan]}).`
  )

  const upgradeMessage = encodeURIComponent(
    `Bonjour, je suis ${displayName(doctor?.name ?? '', doctor?.specialty)} sur MonRDV. Je souhaite passer au forfait Cabinet complet${priceHidden ? '' : ` (${PLAN_PRICES_DHS.complet} DHS / mois)`}.`
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mon abonnement</h1>
        <p className="text-sm text-gray-500 mt-1">Gérez votre abonnement MonRDV</p>
      </div>

      {/* Statut abonnement */}
      <Card className={`border-2 ${isExpired || isRed ? 'border-red-200 bg-red-50' : isWarning ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {isExpired || isRed ? (
              <XCircle className="h-10 w-10 text-red-500 shrink-0" />
            ) : isWarning ? (
              <AlertTriangle className="h-10 w-10 text-orange-500 shrink-0" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-green-500 shrink-0" />
            )}
            <div>
              <p className={`font-bold text-lg ${isExpired || isRed ? 'text-red-700' : isWarning ? 'text-orange-700' : 'text-green-700'}`}>
                {!isLoaded
                  ? 'Chargement…'
                  : isExpired
                  ? 'Abonnement expiré'
                  : isWarning
                  ? `Plus que ${daysLeft} jour${daysLeft! > 1 ? 's' : ''} !`
                  : daysLeft !== null
                  ? `Actif — ${daysLeft} jours restants`
                  : 'Actif'}
              </p>
              <p className={`text-sm mt-0.5 ${isExpired || isRed ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-green-600'}`}>
                {doctor?.date_expiration
                  ? `${isExpired ? 'Expiré le' : 'Expire le'} ${new Date(doctor.date_expiration).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Aucune date d\'expiration définie — contactez le support'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Les deux forfaits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary-500" />
            Votre forfait
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['agenda', 'complet'] as DoctorPlan[]).map((p) => {
              // Tant que le médecin n'est pas chargé, `plan` vaut la valeur par
              // défaut : la pastille se posait sur la mauvaise carte puis sautait.
              const current = isLoaded && plan === p
              return (
                <div
                  key={p}
                  className={`rounded-xl border-2 p-5 ${current ? 'border-primary-500 bg-primary-50/40' : 'border-gray-200'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-gray-900">{PLAN_LABELS[p]}</h3>
                    {current && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide bg-primary-500 text-white px-2 py-0.5 rounded-full">
                        Votre forfait
                      </span>
                    )}
                  </div>

                  {!isLoaded ? (
                    // Réserve la place exacte du tarif : sans ce gabarit, la
                    // liste des fonctionnalités remonterait puis redescendrait.
                    <div className="mb-3 h-9 w-32 rounded-lg bg-gray-100 animate-pulse" />
                  ) : !priceHidden ? (
                    <div className="flex items-baseline gap-1.5 mb-3">
                      <span className="text-3xl font-bold text-gray-900">{PLAN_PRICES_DHS[p]}</span>
                      <span className="text-sm text-gray-500">DHS / mois</span>
                    </div>
                  ) : null}

                  <ul className="space-y-1.5">
                    {PLAN_FEATURES[p].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {/* Passage au forfait supérieur */}
          {plan === 'agenda' && (
            <div className="mt-5 rounded-xl bg-gray-50 p-5">
              {pendingUpgrade ? (
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Demande de changement en cours</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Votre passage au forfait Cabinet complet sera activé dès confirmation de votre paiement.
                      Prévenez-nous sur WhatsApp pour accélérer l&apos;activation.
                    </p>
                    <a
                      href={`https://wa.me/212621900874?text=${upgradeMessage}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-3 text-sm font-semibold text-green-600 hover:text-green-700"
                    >
                      Prévenir sur WhatsApp <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Besoin des dossiers patients et de la facturation ?</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Passez au forfait Cabinet complet — vos données restent intactes, tout se débloque aussitôt.
                    </p>
                  </div>
                  <Button onClick={requestUpgrade} disabled={requesting} className="shrink-0">
                    {requesting ? 'Envoi…' : 'Passer au forfait Cabinet'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions paiement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary-500" />
            Comment payer ?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p className="text-sm text-gray-700">
                {/* Pendant le chargement on s'en tient à la formule sans montant :
                    afficher le tarif pour le retirer ensuite, c'est exactement
                    le clignotement qu'on cherche à supprimer. */}
                {!isLoaded || priceHidden
                  ? <>Effectuez votre virement bancaire sur le compte suivant :</>
                  : <>Effectuez un virement bancaire de <strong>{price} DHS</strong> sur le compte suivant :</>}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 ml-9 space-y-1 text-sm">
              <p><span className="text-gray-500">Bénéficiaire :</span> <strong>MonRDV</strong></p>
              <p><span className="text-gray-500">Banque :</span> <strong>À confirmer</strong></p>
              <p><span className="text-gray-500">RIB :</span> <strong>À confirmer</strong></p>
              <p><span className="text-gray-500">Motif :</span> <strong>Abonnement MonRDV – {doctor?.name ?? 'votre nom'}</strong></p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p className="text-sm text-gray-700">Une fois le virement effectué, cliquez sur le bouton ci-dessous pour nous prévenir :</p>
            </div>
          </div>

          <a
            href={`https://wa.me/212621900874?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            J&apos;ai payé — Envoyer sur WhatsApp
          </a>

          <p className="text-xs text-gray-400 text-center">
            Votre abonnement sera activé sous 24h après confirmation du paiement.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
