import { MetadataRoute } from 'next'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'

// IMPORTANT : force la génération à la requête (pas au build)
// Evite le crash si les env vars Supabase ne sont pas dispo au build time sur Vercel
export const dynamic = 'force-dynamic'
export const revalidate = 3600 // Re-généré toutes les heures max

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://monrdv.vercel.app').replace(/\/$/, '')

  // Pages statiques indexables (toujours disponibles, pas de DB)
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/inscription`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/politique-confidentialite`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/cgu`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]

  // Pages SEO spécialité × ville (statiques, pas de DB)
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

  // Pages dynamiques des médecins (nécessite Supabase)
  let doctorPages: MetadataRoute.Sitemap = []
  try {
    // Import dynamique pour éviter tout crash au build time
    const { createAdminClient } = await import('@/lib/supabase/server')

    // Vérifie que les env vars sont bien présentes avant d'appeler Supabase
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[Sitemap] Variables Supabase manquantes — pages médecins omises')
    } else {
      const supabase = createAdminClient()
      const { data: doctors, error } = await supabase
        .from('doctors')
        .select('slug, updated_at')
        .eq('status', 'approved')
        .eq('subscription_status', 'actif')

      if (error) {
        console.error('[Sitemap] Erreur Supabase:', error.message)
      } else {
        doctorPages = (doctors ?? []).map((doc) => ({
          url: `${baseUrl}/dr-${doc.slug}`,
          lastModified: new Date(doc.updated_at ?? new Date()),
          changeFrequency: 'weekly' as const,
          priority: 0.9,
        }))
      }
    }
  } catch (err) {
    // Ne jamais crasher le sitemap à cause de la DB — les pages statiques suffisent
    console.error('[Sitemap] Exception lors de la récupération des médecins:', err)
  }

  return [...staticPages, ...doctorPages, ...seoPages]
}
