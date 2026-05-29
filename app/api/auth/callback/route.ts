import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Chemins autorisés pour le paramètre ?next= (évite les redirections ouvertes)
const ALLOWED_NEXT_PATHS = [
  '/patient/dashboard',
  '/patient/profile',
  '/patient/data',
]

function getSafeNext(next: string | null): string {
  if (!next) return '/patient/dashboard'
  // N'accepte que les chemins internes commençant par /
  // et figurant dans la liste blanche
  if (ALLOWED_NEXT_PATHS.includes(next)) return next
  return '/patient/dashboard'
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const safeNext = getSafeNext(searchParams.get('next'))

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

      const destination = doctor ? '/dashboard' : safeNext
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/patient/login?error=auth`)
}
