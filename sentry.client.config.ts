import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% des transactions en production pour limiter le quota
  tracesSampleRate: 0.1,

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
})
