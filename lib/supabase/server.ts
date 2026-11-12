// Client Supabase côté serveur (Server Components et API Routes)
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'

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

// ── UNE VÉRIFICATION DE SESSION PAR PAGE, ET NON DEUX ───────────────────────
//
// `auth.getUser()` n'est pas une lecture locale : c'est un aller-retour vers
// le serveur d'authentification, qui vérifie le jeton. Or une page protégée le
// demandait deux fois — une fois dans le cadre commun (le layout), une fois
// dans la page elle-même — avec deux clients distincts, donc deux
// allers-retours pour la même question et la même réponse. Sur une connexion
// de téléphone partagée, c'est une attente de plus à chaque clic.
//
// Deux choses changent, et aucune ne touche à CE QUI est vérifié :
//
//   1. `createClient()` rend le MÊME client pendant tout le rendu d'une page
//      (React `cache`, dont la portée est la requête en cours — jamais
//      partagée entre deux visiteurs). Hors du rendu d'une page — routes
//      d'API, actions serveur — `cache` ne retient rien et chaque appel crée
//      son client, comme avant.
//   2. Sur ce client, la réponse de `getUser()` est retenue : le layout pose
//      la question, la page réutilise la réponse.
//
// Effet de bord voulu : quand le jeton arrive à expiration, layout et page le
// renouvelaient EN MÊME TEMPS avec le même jeton de renouvellement — ce que
// le serveur d'authentification peut prendre pour un vol de session. Il n'y a
// plus qu'un renouvellement.
//
// Ce qui n'est PAS retenu : une réponse sans utilisateur, ou en erreur. Et la
// mémoire est vidée à tout changement de session (connexion, déconnexion,
// échange de code, mise à jour du compte) : une route qui connecte quelqu'un
// puis relit l'utilisateur sur le même client doit voir le nouveau, pas
// l'ancien.
//
// Rien ici ne dépend de l'hébergeur : le gain vaut sur Vercel aujourd'hui
// comme sur un serveur au Maroc demain.
function construireClient() {
  const cookieStore = cookies()

  const client = createServerClient(
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

  const lire = client.auth.getUser.bind(client.auth)
  let retenu: ReturnType<typeof lire> | null = null

  // Tout ce qui CHANGE la session vide la mémoire. Les méthodes sont
  // enveloppées une à une plutôt qu'écoutées par `onAuthStateChange` : cet
  // écouteur relit la session à son installation, et peut déclencher de
  // lui-même un renouvellement de jeton — un effet de bord dont une simple
  // mémoire n'a pas à prendre le risque.
  const auth = client.auth as unknown as Record<string, unknown>
  for (const nom of [
    'signInWithPassword', 'signInWithOtp', 'signUp', 'signOut', 'verifyOtp',
    'exchangeCodeForSession', 'setSession', 'refreshSession', 'updateUser',
  ]) {
    const origine = auth[nom]
    if (typeof origine !== 'function') continue
    auth[nom] = (...args: unknown[]) => {
      retenu = null
      const suite = (origine as (...a: unknown[]) => Promise<unknown>).apply(client.auth, args)
      // Vidée avant ET après : un `getUser()` lancé pendant que la connexion
      // est en cours ne doit pas laisser derrière lui l'ancienne réponse.
      Promise.resolve(suite).finally(() => { retenu = null }).catch(() => {})
      return suite
    }
  }
  client.auth.getUser = ((jwt?: string) => {
    // Un jeton passé explicitement est une autre question : on ne mélange pas.
    if (jwt) return lire(jwt)
    if (retenu) return retenu
    const demande = lire()
    retenu = demande
    demande
      .then(({ data, error }) => { if ((error || !data?.user) && retenu === demande) retenu = null })
      .catch(() => { if (retenu === demande) retenu = null })
    return demande
  }) as typeof client.auth.getUser

  return client
}

// `cache` n'existe que dans le React que Next embarque pour ses pages. Si ce
// fichier était un jour chargé ailleurs (un script, un outil), `cache` y
// serait absent et le simple fait de l'importer planterait : on retombe alors
// sur un client par appel — le comportement d'avant, sans la mémoire.
export const createClient: typeof construireClient =
  typeof cache === 'function' ? cache(construireClient) : construireClient

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
