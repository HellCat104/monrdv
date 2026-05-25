import { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://monrdv.vercel.app'

  // Pages statiques
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/recherche`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/inscription`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/politique-confidentialite`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/cgu`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Pages dynamiques des médecins approuvés
  try {
    const supabase = createAdminClient()
    const { data: doctors } = await supabase
      .from('doctors')
      .select('slug, updated_at')
      .eq('status', 'approved')
      .eq('subscription_status', 'actif')

    const doctorPages: MetadataRoute.Sitemap = (doctors ?? []).map((doc) => ({
      url: `${baseUrl}/dr-${doc.slug}`,
      lastModified: new Date(doc.updated_at ?? new Date()),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }))

    // Pages SEO spécialité + ville
    const seoPages: MetadataRoute.Sitemap = []
    for (const specialiteSlug of Object.keys(SPECIALITE_SLUGS)) {
      for (const villeSlug of Object.keys(VILLE_SLUGS)) {
        seoPages.push({
          url: `${baseUrl}/medecin/${specialiteSlug}/${villeSlug}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        })
      }
    }

    return [...staticPages, ...doctorPages, ...seoPages]
  } catch {
    return staticPages
  }
}
