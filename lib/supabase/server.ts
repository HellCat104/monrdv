// Client Supabase côté serveur (Server Components et API Routes)
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Un appel Supabase qui ne répond JAMAIS immobilisait la fonction Vercel
// jusqu'à son expiration — une quarantaine de secondes observées les 12 et
// 13 septembre. Pendant ce temps la page « charge » sans rien afficher, et
// l'utilisateur n'a aucun moyen de savoir qu'il attend pour rien.
//
// Avec cette limite, l'appel échoue vite et FRANCHEMENT : `error` est renseigné,
// et le code appelant peut enfin distinguer « la base n'a pas répondu » de
// « cette personne n'a pas ce droit » — deux situations que le silence
// confondait, en renvoyant vers la page de connexion quelqu'un de parfaitement
// autorisé. Mieux vaut un message « réessayez » en huit secondes qu'une roue
// qui tourne pendant quarante.
const DELAI_MAX_MS = 8000

function fetchAvecDelai(url: RequestInfo | URL, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    // Désactive le cache Vercel sur tous les appels Supabase.
    cache: 'no-store',
    // Un signal fourni par l'appelant (`.abortSignal()`) reste prioritaire.
    signal: options.signal ?? AbortSignal.timeout(DELAI_MAX_MS),
  })
}

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchAvecDelai },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          } catch {
            // Ignoré dans les Server Components (lecture seule)
          }
        },
      },
    }
  )
}

// Client avec droits admin (service_role) — bypass total des RLS, no cache
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: fetchAvecDelai },
    }
  )
}
