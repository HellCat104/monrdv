import { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/server'

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

    return [...staticPages, ...doctorPages]
  } catch {
    return staticPages
  }
}
