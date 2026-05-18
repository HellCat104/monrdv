import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { AppointmentList } from '@/components/dashboard/AppointmentList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Users, TrendingDown, CheckCircle } from 'lucide-react'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

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

  // RDV du jour
  const { data: todayAppointments } = await supabase
    .from('appointments')
    .select('*, patient:patients(*)')
    .eq('doctor_id', doctor.id)
    .eq('date', today)
    .neq('status', 'cancelled')
    .order('time', { ascending: true })

  // Stats du mois
  const { data: monthAppointments } = await supabase
    .from('appointments')
    .select('status')
    .eq('doctor_id', doctor.id)
    .gte('date', firstOfMonth)
    .lte('date', today)

  const monthTotal = monthAppointments?.length ?? 0
  const monthCancelled = monthAppointments?.filter((a) => a.status === 'cancelled').length ?? 0
  const absenceRate = monthTotal > 0 ? Math.round((monthCancelled / monthTotal) * 100) : 0

  // Prochain RDV
  const { data: upcomingAppointments } = await supabase
    .from('appointments')
    .select('*, patient:patients(*)')
    .eq('doctor_id', doctor.id)
    .gt('date', today)
    .neq('status', 'cancelled')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(5)

  const todayFormatted = format(getNowInMaroc(), 'EEEE d MMMM yyyy', { locale: fr })

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, Dr. {doctor.name.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1 capitalize">{todayFormatted}</p>
      </div>

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
          title="Taux d'absence"
          value={`${absenceRate}%`}
          subtitle={monthTotal > 0 ? `sur ${monthTotal} RDV` : 'aucun RDV'}
          icon={Users}
          color={absenceRate > 20 ? 'red' : 'green'}
        />
      </div>

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
            <AppointmentList appointments={todayAppointments ?? []} />
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
            <AppointmentList appointments={upcomingAppointments ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
