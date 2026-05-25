import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const { pathname } = req.nextUrl

  // ── Rate limiting simple sur les routes sensibles ─────────────────────────
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const sensitiveRoutes = ['/api/doctors/register', '/api/auth', '/patient/login']
  if (sensitiveRoutes.some((r) => pathname.startsWith(r))) {
    const key = `rl:${ip}:${pathname}`
    const now = Date.now()
    const windowMs = 60_000 // 1 minute
    const maxRequests = 10

    // Utilise les cookies pour tracker (simple, sans Redis)
    const rlCookie = req.cookies.get(key)
    let count = 1
    let windowStart = now

    if (rlCookie) {
      try {
        const parsed = JSON.parse(rlCookie.value)
        if (now - parsed.start < windowMs) {
          count = parsed.count + 1
          windowStart = parsed.start
        }
      } catch { /* reset */ }
    }

    if (count > maxRequests) {
      return new NextResponse(JSON.stringify({ error: 'Trop de requêtes, réessayez dans 1 minute' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    res.cookies.set(key, JSON.stringify({ count, start: windowStart }), {
      maxAge: 60,
      httpOnly: true,
      sameSite: 'strict',
    })
  }

  // ── Protection des routes privées ────────────────────────────────────────
  const protectedRoutes = ['/dashboard', '/appointments', '/patients', '/settings', '/abonnement']
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
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      const loginUrl = isAdmin
        ? new URL('/login', req.url)
        : new URL('/patient/login', req.url)
      return NextResponse.redirect(loginUrl)
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
