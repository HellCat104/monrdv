import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatsCard } from '@/components/dashboard/StatsCard'
import SuiviLabo from '@/components/dashboard/SuiviLabo'
import BandeauStock from '@/components/dashboard/BandeauStock'
import RappelsDus from '@/components/dashboard/RappelsDus'
import ConversationsAReprendre from '@/components/dashboard/ConversationsAReprendre'
import { AppointmentList } from '@/components/dashboard/AppointmentList'
import { withConsultationSummary } from '@/lib/consultation-summary'
import { canAccess } from '@/lib/plan'
import { isDentalDoctor } from '@/lib/dental'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, CheckCircle, AlertTriangle, ChevronRight, Banknote } from 'lucide-react'
import Link from 'next/link'
import { getNowInMaroc } from '@/lib/utils'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { displayName } from '@/lib/profession'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Récupère le profil médecin
  const { data: doctor } = await supabase
    .from('doctors')
    .select('*')
    .eq('email', user.email)
    .single()

  if (!doctor) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Profil médecin introuvable. Contactez l&apos;administrateur.</p>
      </div>
    )
  }

  const today = format(getNowInMaroc(), 'yyyy-MM-dd')
  const demain = format(addDays(getNowInMaroc(), 1), 'yyyy-MM-dd')
  const firstOfMonth = format(getNowInMaroc(), 'yyyy-MM-01')

  // Ces trois requêtes sont indépendantes : les enchaîner ajoutait inutilement
  // leurs temps de réponse les uns aux autres.
  const [
    { data: todayAppointments },
    { data: monthAppointments },
    { data: demainAppointments },
    { data: reglesAujourdhui },
    { data: versementsAujourdhui },
  ] = await Promise.all([
    // RDV du jour
    supabase.from('appointments')
      .select('*, patient:patients(*)')
      .eq('doctor_id', doctor.id).eq('date', today).neq('status', 'cancelled')
      .order('time', { ascending: true }),
    // Stats du mois
    supabase.from('appointments')
      .select('status')
      .eq('doctor_id', doctor.id).gte('date', firstOfMonth).lte('date', today),
    // Demain — et non « les cinq prochains », qui mélangeaient après-demain,
    // la semaine prochaine et l'an prochain. Un praticien ne se demande pas
    // quels sont ses cinq prochains rendez-vous : il se demande à quoi
    // ressemble sa journée de demain, pour savoir s'il peut ouvrir un créneau.
    supabase.from('appointments')
      .select('*, patient:patients(*)')
      .eq('doctor_id', doctor.id).eq('date', demain).neq('status', 'cancelled')
      .order('time', { ascending: true }),
    // L'argent du jour : les consultations réglées…
    supabase.from('appointments')
      .select('amount_paid')
      .eq('doctor_id', doctor.id).eq('date', today).not('amount_paid', 'is', null),
    // …et les versements sur devis, qui sont de l'argent reçu au même titre.
    supabase.from('quote_payments')
      .select('amount')
      .eq('doctor_id', doctor.id).gte('paid_at', `${today}T00:00:00`).lte('paid_at', `${today}T23:59:59`),
  ])

  const monthTotal = monthAppointments?.length ?? 0


  // Résumé des consultations clôturées (sinon les cartes affichent « Aucune note »).
  // Jamais en forfait Agenda : ces données de santé n'ont pas à quitter la base.
  const acces = canAccess(doctor.plan, 'consultation')
  // Le stock a sa propre fonctionnalité de forfait : s'appuyer sur celle de
  // la consultation marcherait aujourd'hui et se tromperait le jour où les
  // deux ne vont plus ensemble.
  const accesStock = canAccess(doctor.plan, 'stock')
  // Ce qui reste à faire aujourd'hui, et ce qui est fait.
  //
  // « Fait » ne veut pas dire « l'heure est passée » : à 13 h, le patient de
  // 9 h 20 peut être encore assis dans la salle d'attente. C'est le pointage
  // « parti » qui tranche, pas l'horloge — sinon on masquerait justement
  // celui qu'il faut recevoir.
  const estFait = (a: { queue_status?: string | null }) => a.queue_status === 'parti'
  const todayAVenir = (todayAppointments ?? []).filter((a) => !estFait(a))
  const todayPasses = (todayAppointments ?? []).filter(estFait)

  // Encaissé aujourd'hui : les consultations réglées ET les versements sur
  // devis. Ne prendre que les premières afficherait un chiffre faux chez un
  // dentiste, dont l'essentiel de la recette passe par les plans de traitement.
  const encaisseAujourdhui =
    (reglesAujourdhui ?? []).reduce((t, a) => t + Number(a.amount_paid ?? 0), 0) +
    (versementsAujourdhui ?? []).reduce((t, v) => t + Number(v.amount ?? 0), 0)
  const nbRegles = (reglesAujourdhui?.length ?? 0) + (versementsAujourdhui?.length ?? 0)

  const [todaySummarised, passesSummarised, upcomingSummarised] = acces
    ? await Promise.all([
        withConsultationSummary(supabase, todayAVenir),
        withConsultationSummary(supabase, todayPasses),
        withConsultationSummary(supabase, demainAppointments ?? []),
      ])
    : [todayAVenir, todayPasses, demainAppointments ?? []]

  const todayFormatted = format(getNowInMaroc(), 'EEEE d MMMM yyyy', { locale: fr })
  const estDentiste = isDentalDoctor([doctor.specialty, ...((doctor.specialties as string[] | null) ?? [])])

  // Calcul jours restants d'abonnement
  let daysLeft: number | null = null
  if (doctor.date_expiration) {
    const exp = new Date(doctor.date_expiration)
    const now = getNowInMaroc()
    now.setHours(0, 0, 0, 0)
    daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Profil incomplet : champs importants pour des ordonnances/certificats conformes
  const missingProfile: string[] = []
  if (!doctor.address) missingProfile.push('adresse du cabinet')
  if (!doctor.phone) missingProfile.push('téléphone')
  if (!doctor.inpe) missingProfile.push('INPE')
  if (!doctor.cnom_number) missingProfile.push('n° Ordre (CNOM)')

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {displayName(doctor.name.split(' ')[0], doctor.specialty)} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">{todayFormatted}</p>
      </div>

      {/* Rappel de profil incomplet (disparaît une fois les champs remplis) */}
      {missingProfile.length > 0 && (
        <Link href="/settings" className="block bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Complétez votre profil pour des documents conformes</p>
              <p className="text-amber-700 mt-0.5">
                Il manque : <strong>{missingProfile.join(', ')}</strong>. Ces informations apparaissent sur vos ordonnances et certificats.
                <span className="underline ml-1">Compléter maintenant →</span>
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* Bandeau abonnement — visible uniquement si date_expiration définie */}
      {daysLeft !== null && (
        <div className={`text-sm font-medium px-4 py-2 rounded-lg border ${
          daysLeft <= 3
            ? 'bg-red-50 border-red-200 text-red-600'
            : daysLeft <= 7
            ? 'bg-orange-50 border-orange-200 text-orange-600'
            : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}>
          {daysLeft <= 0
            ? '⚠️ Votre abonnement a expiré. Contactez l\'administrateur.'
            : `⏳ Il vous reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''} d'abonnement.`}
        </div>
      )}

      {/* Rappels de suivi puis laboratoire : deux encarts qui rendent null
          quand il n'y a rien à faire, donc aucun espace perdu le reste du
          temps. Les rappels passent devant — un « revoir dans 6 mois » oublié
          est un patient qui ne revient pas, pas un travail qui attend. */}
      {/* WhatsApp en premier : une personne ATTEND une réponse maintenant,
          là où un rappel de suivi porte sur les mois à venir. L'encart rend
          null quand rien n'attend, donc il ne coûte rien le reste du temps. */}
      <ConversationsAReprendre />
      <RappelsDus />
      {/* Laboratoire : couronnes, bridges, prothèses — un objet de cabinet
          dentaire. La carte ne s'affichait déjà que s'il y avait un travail en
          cours, mais rien n'empêchait un généraliste de la voir. On la réserve
          désormais aux praticiens que ça concerne. */}
      {estDentiste && <SuiviLabo />}

      {/* Stock : ce qu'il faut commander, et ce qui périme. Un stock qu'il
          faut aller consulter ne sert à rien — on s'en aperçoit au fauteuil,
          et il est trop tard. L'encart ne s'affiche que s'il y a quelque
          chose à dire. */}
      {estDentiste && accesStock && <BandeauStock />}

      {/* Les trois chiffres du mois, en tête — c'est la place que la
          praticienne leur a choisie. Le taux d'absentéisme, lui, ne revient
          pas : il est déjà dans Statistiques avec les présences et les
          absences, et il n'apprenait rien d'actionnable le matin. */}
      <div className="grid grid-cols-3 gap-4">
        {/* Un chiffre qui BOUGE pendant la journée : à 15 h, « 11 » ne dit
            plus rien, « 4 à recevoir » dit s'il finit à 17 h ou à 19 h. */}
        <StatsCard
          title="Aujourd'hui"
          value={todayAppointments?.length ?? 0}
          subtitle={`${todayAVenir.length} à recevoir`}
          icon={Calendar}
          color="blue"
        />
        <StatsCard
          title="Total ce mois"
          value={monthTotal}
          subtitle="rendez-vous"
          icon={CheckCircle}
          color="green"
        />
        {/* Le chiffre qu'un praticien regarde en fermant son cabinet, et qu'il
            ne pouvait voir nulle part sans ouvrir les statistiques. Remplace
            « Annulés ce mois », sur lequel personne n'agissait jamais. */}
        <StatsCard
          title="Encaissé aujourd'hui"
          value={`${encaisseAujourdhui.toLocaleString('fr-FR')} DH`}
          subtitle={nbRegles > 0 ? `${nbRegles} règlement${nbRegles > 1 ? 's' : ''}` : 'aucun règlement'}
          icon={Banknote}
          color="green"
        />
      </div>

      {/* Lien vers le détail : les chiffres du mois posent toujours la même
          question suivante (« et par rapport au mois dernier ? »). */}
      <Link href="/statistiques" className="block text-center text-sm text-primary-600 hover:text-primary-700 hover:underline">
        Voir toutes les statistiques →
      </Link>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* RDV du jour */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary-500" />
              Rendez-vous aujourd&apos;hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Les rendez-vous déjà faits sont REPLIÉS, au-dessus de la liste.
                En fin de journée ils occupaient toute la carte et il fallait
                faire défiler pour trouver le patient suivant — alors que
                c'est la seule chose qu'on vient chercher ici.

                Un <details> plutôt qu'un composant client : ils sont déjà
                chargés, le volet s'ouvre sans aller-retour ni attente. */}
            {passesSummarised.length > 0 && (
              <details className="mb-3 group">
                <summary className="cursor-pointer list-none text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 py-1">
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                  {passesSummarised.length} rendez-vous passé{passesSummarised.length > 1 ? 's' : ''}
                </summary>
                <div className="mt-2 opacity-70">
                  <AppointmentList appointments={passesSummarised} plan={doctor.plan === 'complet' ? 'complet' : 'agenda'} />
                </div>
              </details>
            )}
            <AppointmentList appointments={todaySummarised} plan={doctor.plan === 'complet' ? 'complet' : 'agenda'} />
          </CardContent>
        </Card>

        {/* Prochains RDV */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-500" />
              Demain
              {demainAppointments && demainAppointments.length > 0 && (
                <span className="text-xs font-normal text-gray-400">
                  · {demainAppointments.length} rendez-vous, à partir de {String(demainAppointments[0].time).slice(0, 5)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AppointmentList appointments={upcomingSummarised} plan={doctor.plan === 'complet' ? 'complet' : 'agenda'} />
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
