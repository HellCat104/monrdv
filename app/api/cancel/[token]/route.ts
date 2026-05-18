// API : annulation de RDV via le lien SMS
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/cancel/[token] — annule le RDV et redirige vers une page de confirmation
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createAdminClient()

  const { data: appointment, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('cancel_token', params.token)
    .neq('status', 'cancelled')
    .select('date, time, patient:patients(first_name, last_name)')
    .single()

  if (error || !appointment) {
    // Redirige vers une page d'erreur avec message
    const url = new URL('/cancel-result', req.url)
    url.searchParams.set('status', 'error')
    return NextResponse.redirect(url)
  }

  const url = new URL('/cancel-result', req.url)
  url.searchParams.set('status', 'success')
  url.searchParams.set('date', appointment.date)
  url.searchParams.set('time', appointment.time)
  return NextResponse.redirect(url)
}
