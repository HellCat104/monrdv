import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/dashboard', '/appointments', '/patients', '/settings', '/abonnement', '/api/'],
      },
    ],
    sitemap: 'https://monrdv.vercel.app/sitemap.xml',
  }
}
