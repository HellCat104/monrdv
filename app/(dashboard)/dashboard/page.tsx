import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { AppointmentList } from '@/components/dashboard/AppointmentList'
import { withConsultationSummary } from '@/lib/consultation-summary'
import { canAccess } from '@/lib/plan'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Users, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
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
  const firstOfMonth = format(getNowInMaroc(), 'yyyy-MM-01')

  // Ces trois requêtes sont indépendantes : les enchaîner ajoutait inutilement
  // leurs temps de réponse les uns aux autres.
  const [
    { data: todayAppointments },
    { data: monthAppointments },
    { data: upcomingAppointments },
  ] = await Promise.all([
    // RDV du jour
    supabase.from('appointments')
      .select('*, patient:patients(*)')
      .eq('doctor_id', doctor.id).eq('date', today).neq('status', 'cancelled')
      .order('time', { ascending: true }),
    // Stats du mois
    supabase.from('appointments')
      .select('status, attendance')
      .eq('doctor_id', doctor.id).gte('date', firstOfMonth).lte('date', today),
    // Prochains RDV
    supabase.from('appointments')
      .select('*, patient:patients(*)')
      .eq('doctor_id', doctor.id).gt('date', today).neq('status', 'cancelled')
      .order('date', { ascending: true }).order('time', { ascending: true })
      .limit(5),
  ])

  const monthTotal = monthAppointments?.length ?? 0
  const monthCancelled = monthAppointments?.filter((a) => a.status === 'cancelled').length ?? 0
  // Absentéisme = patients réellement non venus (pointage), pas les annulations —
  // c'est la définition utilisée dans les Statistiques, on s'aligne dessus.
  const monthAbsent = monthAppointments?.filter((a) => a.attendance === 'absent').length ?? 0
  const absenceRate = monthTotal > 0 ? Math.round((monthAbsent / monthTotal) * 100) : 0


  // Résumé des consultations clôturées (sinon les cartes affichent « Aucune note »).
  // Jamais en forfait Agenda : ces données de santé n'ont pas à quitter la base.
  const acces = canAccess(doctor.plan, 'consultation')
  const [todaySummarised, upcomingSummarised] = acces
    ? await Promise.all([
        withConsultationSummary(supabase, todayAppointments ?? []),
        withConsultationSummary(supabase, upcomingAppointments ?? []),
      ])
    : [todayAppointments ?? [], upcomingAppointments ?? []]

  const todayFormatted = format(getNowInMaroc(), 'EEEE d MMMM yyyy', { locale: fr })

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

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="RDV aujourd'hui"
          value={todayAppointments?.length ?? 0}
          subtitle={`${todayAppointments?.filter((a) => a.status === 'confirmed').length ?? 0} confirmés`}
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
        <StatsCard
          title="Annulés ce mois"
          value={monthCancelled}
          icon={TrendingDown}
          color="orange"
        />
        <StatsCard
          title="Patients absents"
          value={`${absenceRate}%`}
          subtitle={monthTotal > 0 ? `${monthAbsent} sur ${monthTotal} RDV ce mois` : 'aucun RDV'}
          icon={Users}
          color={absenceRate > 20 ? 'red' : 'green'}
        />
      </div>

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
            <AppointmentList appointments={todaySummarised} plan={doctor.plan === 'complet' ? 'complet' : 'agenda'} />
          </CardContent>
        </Card>

        {/* Prochains RDV */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-500" />
              Prochains rendez-vous
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
