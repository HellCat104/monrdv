import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/patient/dashboard'

  if (code) {
    const supabase = createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // Si c'est un médecin → rediriger vers son dashboard
      const { data: doctor } = await supabase
        .from('doctors')
        .select('id')
        .eq('email', data.user.email)
        .single()

      const destination = doctor ? '/dashboard' : next
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/patient/login?error=auth`)
}
