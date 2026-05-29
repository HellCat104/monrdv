import { MetadataRoute } from 'next'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'

// Force la génération à la requête (jamais au build)
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://monrdv.vercel.app').replace(/\/$/, '')

  // Pages statiques
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl,                                    lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${baseUrl}/inscription`,                   lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/politique-confidentialite`,     lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.2 },
    { url: `${baseUrl}/cgu`,                           lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.2 },
  ]

  // Pages SEO spécialité × ville (960 pages — générées en mémoire, aucun appel réseau)
  const seoPages: MetadataRoute.Sitemap = []
  for (const specialiteSlug of Object.keys(SPECIALITE_SLUGS)) {
    for (const villeSlug of Object.keys(VILLE_SLUGS)) {
      seoPages.push({
        url: `${baseUrl}/medecin/${specialiteSlug}/${villeSlug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  return [...staticPages, ...seoPages]
}
