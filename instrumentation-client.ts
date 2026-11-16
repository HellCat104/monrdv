import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Pas de suivi des performances dans le navigateur : son code est retiré à
  // la compilation (`__SENTRY_TRACING__`, voir next.config.js) — 100 % des
  // visiteurs le téléchargeaient pour 10 % de mesures. Les ERREURS du
  // navigateur restent toutes remontées ; le côté serveur n'est pas concerné.

  // Capture 100% des replays sur erreur, 0% en navigation normale
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  // N'affiche rien dans la console en production
  debug: false,

  // Ignore les erreurs réseau communes (connexion coupée, etc.)
  ignoreErrors: [
    'Network request failed',
    'Failed to fetch',
    'NetworkError',
    'AbortError',
    'ResizeObserver loop limit exceeded',
  ],

  // Les scripts qui ne sont pas les nôtres mais qui s'exécutent dans la page :
  // extensions de navigateur, antivirus à bouclier web, barres d'outils.
  denyUrls: [
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-(web-)?extension:\/\//i,
    /^ext:\//i,
  ],

  /**
   * Ne remonte que ce qui vient de NOTRE code.
   *
   * POURQUOI : Sentry écoute `onunhandledrejection` sur la page, et cet
   * écouteur attrape TOUT ce qui s'y exécute — y compris les extensions du
   * navigateur du visiteur. Le 4 novembre 2026, une alerte « Cannot read
   * properties of undefined (reading 'getReader') » est arrivée depuis la page
   * d'accueil : aucune ligne de MonRDV n'appelle `getReader`, la pile ne
   * citait aucun de nos fichiers, et l'une de ses images était
   * `ext:core/01_core.js` — un module interne qui n'existe pas dans un
   * navigateur. C'était l'extension d'un visiteur, sous Chrome, sous Windows.
   *
   * Ce bruit a un coût réel : il consomme le quota, et surtout il entraîne à
   * ne plus ouvrir les alertes — celle qui compte passe alors inaperçue.
   *
   * CE QUI EST ÉCARTÉ : uniquement un événement dont la pile est ENTIÈREMENT
   * étrangère. Dès qu'une seule image vient de notre domaine ou de /_next/,
   * l'événement passe. Une erreur sans pile du tout passe aussi : mieux vaut
   * la voir et trancher que la perdre.
   */
  beforeSend(event) {
    const images = (event.exception?.values ?? []).flatMap(
      (v) => v.stacktrace?.frames ?? [],
    )
    if (images.length === 0) return event
    const origine = typeof window !== 'undefined' ? window.location.origin : ''
    const chezNous = images.some((f) => {
      const nom = f.filename ?? ''
      return nom.includes('/_next/') || (!!origine && nom.startsWith(origine))
    })
    return chezNous ? event : null
  },
})
