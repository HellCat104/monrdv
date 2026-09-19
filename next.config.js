/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Empreinte du CONTENU de chaque fichier de public/, calculée à chaque build.
//
// Ces fichiers sont servis sous un nom fixe (/documentation-monrdv.pdf…). Or
// Safari — sur iPhone comme sur Mac — garde un PDF associé à son adresse et
// continue de l'afficher même après rechargement : le 19-09-2026, le prix
// retiré de la documentation restait visible. Une adresse qui porte
// l'empreinte du contenu change D'ELLE-MÊME dès que le fichier change, et
// reste identique sinon. Personne n'a plus rien à penser à modifier.
//
// Lu par lib/fichiers-publics.ts ; toute référence à un fichier public DOIT
// passer par `fichierPublic()` — scripts/verifier-fichiers-publics.js bloque
// le build sinon.
function empreintesFichiersPublics() {
  const racine = path.join(__dirname, 'public')
  const empreintes = {}
  const parcourir = (dossier) => {
    for (const nom of fs.readdirSync(dossier)) {
      const complet = path.join(dossier, nom)
      if (fs.statSync(complet).isDirectory()) { parcourir(complet); continue }
      const cle = '/' + path.relative(racine, complet).split(path.sep).join('/')
      empreintes[cle] = crypto.createHash('sha256').update(fs.readFileSync(complet)).digest('hex').slice(0, 12)
    }
  }
  if (fs.existsSync(racine)) parcourir(racine)
  return empreintes
}

const securityHeaders = [
  // Anti-clickjacking : empêche d'intégrer le site dans une iframe
  { key: 'X-Frame-Options', value: 'DENY' },
  // Empêche le navigateur de deviner le type de fichier
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Active la protection XSS du navigateur
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  // Contrôle les infos envoyées lors des redirections
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Désactive les fonctionnalités sensibles inutiles
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Force HTTPS pendant 1 an
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Empêche les injections de scripts externes
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://api.resend.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

// Contrôle de build : aucun lien direct vers un fichier de public/ (voir
// scripts/verifier-fichiers-publics.js). Ici plutôt que dans un script npm :
// next.config.js est exécuté par TOUT `next build` et `next dev`, quelle que
// soit la commande que lance Vercel. Au runtime, les sources ne sont pas
// déployées — le contrôle ne s'exécute donc que s'il les trouve.
if (fs.existsSync(path.join(__dirname, 'app'))) {
  const erreurs = require('./scripts/verifier-fichiers-publics').verifier()
  if (erreurs.length) {
    throw new Error('\n\n✖ Fichiers publics — build refusé :\n  ' + erreurs.join('\n  ') + '\n')
  }
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_EMPREINTES_FICHIERS: JSON.stringify(empreintesFichiersPublics()),
  },
  experimental: {
    // pdfkit doit rester externe : ses fichiers de police (.afm) ne survivent pas
    // au bundling webpack et provoqueraient une erreur au runtime serverless.
    serverComponentsExternalPackages: ['twilio', 'pdfkit'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080],
    imageSizes: [64, 128, 256],
  },
  compress: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  // Organisation et projet Sentry (optionnel — pour les source maps)
  silent: true,
  // Désactive le tunnel Sentry pour ne pas alourdir le bundle
  tunnelRoute: undefined,
  // Ne pas envoyer les source maps au build (économise du temps)
  widenClientFileUpload: false,
  hideSourceMaps: true,
})
