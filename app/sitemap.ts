import { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'

// Régénéré au maximum une fois par heure (ISR) pour refléter les médecins actifs
export const revalidate = 3600

// `lastModified` est volontairement ABSENT de tout ce sitemap.
//
// Il valait `new Date()` pour chaque URL, et le fichier se régénère toutes les
// heures : le sitemap affirmait donc que la totalité du site avait changé il y
// a moins d'une heure, en permanence. C'est le signal que Google apprend à
// ignorer — et il l'ignore alors pour TOUT le site, y compris les pages qui
// changent réellement. Une date absente est traitée neutrement ; une date
// systématiquement fausse décrédibilise le fichier entier.
//
// Rien ici ne permet de connaître la vraie date : `doctors` n'a pas de colonne
// `updated_at`, et une fiche change surtout par ses créneaux, qui ne sont pas
// datés non plus. Le jour où cette colonne existera, c'est elle qu'il faudra
// mettre — pas l'heure de génération.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma').replace(/\/$/, '')

  // Pages statiques (indexables)
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/inscription`, changeFrequency: 'monthly', priority: 0.7 },
    // /recherche n'est PAS listée : la page se déclare en noindex (ses pages de
    // résultats sont du contenu dupliqué). Une URL en noindex dans un sitemap
    // est signalée comme une erreur par la Search Console.
    { url: `${base}/cgu`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/politique-confidentialite`, changeFrequency: 'yearly', priority: 0.2 },
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
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
    }
  } catch {
    // En cas d'erreur DB, on renvoie au moins les pages statiques (sitemap jamais vide)
  }

  return [...staticPages, ...doctorPages, ...seoPages]
}
