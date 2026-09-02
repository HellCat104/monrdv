import { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'

// Régénéré au maximum une fois par heure (ISR) pour refléter les médecins actifs
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma').replace(/\/$/, '')
  const now = new Date()

  // Pages statiques (indexables)
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/inscription`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    // /recherche n'est PAS listée : la page se déclare en noindex (ses pages de
    // résultats sont du contenu dupliqué). Une URL en noindex dans un sitemap
    // est signalée comme une erreur par la Search Console.
    { url: `${base}/cgu`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/politique-confidentialite`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ]

  let doctorPages: MetadataRoute.Sitemap = []
  let seoPages: MetadataRoute.Sitemap = []

  try {
    const supabase = createAdminClient()
    // Seuls les médecins réservables sont indexés (contenu réel, pas de page vide)
    const { data: doctors } = await supabase
      .from('doctors')
      .select('slug, specialty, specialties, city')
      .eq('status', 'approved')
      .eq('subscription_status', 'actif')

    if (doctors && doctors.length > 0) {
      // Maps inverses nom → slug (pour reconstruire les URLs SEO)
      const specToSlug = new Map(Object.entries(SPECIALITE_SLUGS).map(([slug, name]) => [name, slug]))
      const villeToSlug = new Map(Object.entries(VILLE_SLUGS).map(([slug, name]) => [name, slug]))

      // Une page par médecin (URL canonique avec préfixe dr-)
      doctorPages = doctors.map((d) => ({
        url: `${base}/dr-${d.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))

      // Pages ville/spécialité UNIQUEMENT si au moins un médecin actif y correspond
      const combos = new Set<string>()
      for (const d of doctors) {
        const villeSlug = d.city ? villeToSlug.get(d.city) : undefined
        if (!villeSlug) continue
        const specs = d.specialties && d.specialties.length > 0
          ? d.specialties
          : (d.specialty ? [d.specialty] : [])
        for (const sp of specs) {
          const specSlug = specToSlug.get(sp)
          if (specSlug) combos.add(`${specSlug}/${villeSlug}`)
        }
      }
      seoPages = Array.from(combos).map((c) => ({
        url: `${base}/medecin/${c}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    }
  } catch {
    // En cas d'erreur DB, on renvoie au moins les pages statiques (sitemap jamais vide)
  }

  return [...staticPages, ...doctorPages, ...seoPages]
}
