import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma').replace(/\/$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/dashboard',
          '/appointments',
          '/patients',
          '/settings',
          '/abonnement',
          '/api/',
          '/choisir',
          '/login',
          '/patient/login',
          '/patient/dashboard',
          '/patient/mes-donnees',
          '/reset-password',
          '/forgot-password',
          '/cancel-result',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
