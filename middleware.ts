import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const rateLimitStore = new Map<string, { count: number; start: number }>()

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const { pathname } = req.nextUrl

  // ── Rate limiting simple sur les routes sensibles ─────────────────────────
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim()
  const sensitiveRoutes = [
    '/api/doctors/register',
    '/api/auth',
    '/patient/login',
    '/api/appointments',  // création de RDV publics
    '/api/slots',         // consultation des créneaux
    '/api/search',        // recherche de médecins
    '/api/cancel',        // annulation de RDV
  ]
  if (sensitiveRoutes.some((r) => pathname.startsWith(r))) {
    const key = `rl:${ip}:${pathname}`
    const now = Date.now()
    const windowMs = 60_000 // 1 minute
    const maxRequests = 10
    const current = rateLimitStore.get(key)

    let count = 1
    let windowStart = now

    if (current && now - current.start < windowMs) {
      count = current.count + 1
      windowStart = current.start
    }

    if (count > maxRequests) {
      return new NextResponse(JSON.stringify({ error: 'Trop de requêtes, réessayez dans 1 minute' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    rateLimitStore.set(key, { count, start: windowStart })

    if (rateLimitStore.size > 10_000) {
      rateLimitStore.forEach((value, storedKey) => {
        if (now - value.start >= windowMs) rateLimitStore.delete(storedKey)
      })
    }
  }

  // ── Protection des routes privées ────────────────────────────────────────
  const protectedRoutes = ['/dashboard', '/appointments', '/patients', '/settings', '/abonnement', '/equipe', '/cabinet']
  const adminRoutes = ['/admin']
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r))
  const isAdmin = adminRoutes.some((r) => pathname.startsWith(r))

  if (isProtected || isAdmin) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options as Parameters<typeof res.cookies.set>[2])
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Ces routes (dashboard, settings, appointments, patients, abonnement, admin)
      // sont toutes des routes médecin/admin → login médecin, jamais patient.
      return NextResponse.redirect(new URL('/login', req.url))
    }

    // Vérifie que l'admin est bien l'admin
    if (isAdmin && user.email !== process.env.ADMIN_EMAIL) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
