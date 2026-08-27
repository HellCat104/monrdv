import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const rateLimitStore = new Map<string, { count: number; start: number }>()

/**
 * Compteur atomique partagé entre les instances Edge via Upstash Redis.
 * En production, l'absence de configuration refuse les routes sensibles : un
 * Map en mémoire ne protège pas un déploiement serverless multi-instance.
 */
async function rateLimit(key: string, max: number, windowMs: number): Promise<'ok' | 'limited' | 'unconfigured'> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    try {
      // Pipeline unique : le TTL est renouvelé à chaque tentative (fenêtre
      // glissante) et aucune clé ne peut rester sans expiration après un échec.
      const response = await fetch(`${url}/pipeline`, {
        method: 'POST', headers,
        body: JSON.stringify([['INCR', key], ['PEXPIRE', key, windowMs]]),
      })
      if (!response.ok) throw new Error('Upstash pipeline failed')
      const result = await response.json() as { result?: unknown }[]
      const count = Number(result[0]?.result)
      return count > max ? 'limited' : 'ok'
    } catch {
      // Ne jamais basculer silencieusement sur un Map local en production.
      return process.env.NODE_ENV === 'production' ? 'unconfigured' : 'ok'
    }
  }

  if (process.env.NODE_ENV === 'production') return 'unconfigured'
  const now = Date.now()
  const current = rateLimitStore.get(key)
  const count = current && now - current.start < windowMs ? current.count + 1 : 1
  rateLimitStore.set(key, { count, start: current && now - current.start < windowMs ? current.start : now })
  return count > max ? 'limited' : 'ok'
}

/** Reporte sur `to` les cookies écrits sur `from` (jetons rafraîchis). */
function withCookies(to: NextResponse, from: NextResponse): NextResponse {
  from.cookies.getAll().forEach((c) => to.cookies.set(c))
  return to
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const { pathname } = req.nextUrl

  // Ancienne URL de production → domaine officiel (301, bon pour le SEO).
  // Les previews de branche (monrdv-git-*.vercel.app) ne sont PAS redirigées.
  const host = req.headers.get('host') ?? ''
  if (host === 'monrdv.vercel.app') {
    const url = req.nextUrl.clone()
    url.protocol = 'https:'
    url.host = 'www.monrdv.co.ma'
    url.port = ''
    return NextResponse.redirect(url, 301)
  }

  // ── Rate limiting distribué sur les routes sensibles ──────────────────────
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
    const windowMs = 60_000 // 1 minute
    // Lecture de créneaux : quota large (un patient parcourt plusieurs dates,
    // et un cabinet entier peut partager la même IP). Écritures : quota strict.
    const maxRequests = (pathname.startsWith('/api/slots') || pathname.startsWith('/api/search')) ? 40 : 10
    const result = await rateLimit(key, maxRequests, windowMs)
    if (result === 'unconfigured') {
      return new NextResponse(JSON.stringify({ error: 'Service de protection temporairement indisponible' }), {
        status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }
    if (result === 'limited') {
      return new NextResponse(JSON.stringify({ error: 'Trop de requêtes, réessayez dans 1 minute' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // ── Protection des routes privées ────────────────────────────────────────
  const protectedRoutes = ['/dashboard', '/appointments', '/patients', '/settings', '/abonnement',
    '/equipe', '/cabinet', '/statistiques', '/factures', '/consultation']
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
      // On reporte les cookies de `res` : Supabase vient peut-être d'y écrire
      // des jetons rafraîchis, et une réponse neuve les perdrait — la session
      // serait alors cassée au chargement suivant.
      return withCookies(NextResponse.redirect(new URL('/login', req.url)), res)
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
