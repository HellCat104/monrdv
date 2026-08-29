/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs')

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

const nextConfig = {
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
