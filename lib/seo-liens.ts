// Construit les liens ville/spécialité réellement pourvus, pour le maillage
// interne de la page d'accueil.
//
// Même règle que le sitemap : une combinaison n'est proposée que si un médecin
// réservable y correspond. Publier des liens vers des pages vides coûte plus
// cher en référencement que de ne rien publier — Google déclasse un site dont
// une part notable des pages n'apporte rien.

import { createAdminClient } from '@/lib/supabase/server'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'
import type { LienSEO } from '@/components/home/MaillageSEO'

export async function chargerLiensSEO(): Promise<{
  villes: LienSEO[]
  specialites: LienSEO[]
  combinaisons: LienSEO[]
}> {
  try {
    const supabase = createAdminClient()
    const { data: doctors } = await supabase
      .from('doctors')
      .select('specialty, specialties, city')
      .eq('status', 'approved')
      .eq('subscription_status', 'actif')

    if (!doctors || doctors.length === 0) return { villes: [], specialites: [], combinaisons: [] }

    const specToSlug = new Map(Object.entries(SPECIALITE_SLUGS).map(([slug, nom]) => [nom, slug]))
    const villeToSlug = new Map(Object.entries(VILLE_SLUGS).map(([slug, nom]) => [nom, slug]))

    // Une combinaison = une page existante. On compte les praticiens par ville
    // et par spécialité pour afficher un volume honnête à côté de chaque lien.
    const parVille = new Map<string, { slug: string; nom: string; n: number; premierSpec: string }>()
    const parSpec = new Map<string, { slug: string; nom: string; n: number; premiereVille: string }>()
    // Une entrée par page RÉELLE (spécialité × ville). Les deux groupements
    // ci-dessus n'en liaient qu'une par ville et une par spécialité, chacune
    // vers la PREMIÈRE combinaison rencontrée — arbitraire. Avec deux dentistes
    // dans deux villes, une seule des deux pages était liée depuis l'accueil, et
    // sous l'intitulé « Dentiste », qui ne ressemble à aucune recherche réelle.
    const parCombo = new Map<string, { href: string; libelle: string; n: number }>()

    for (const d of doctors) {
      const villeSlug = d.city ? villeToSlug.get(d.city) : undefined
      if (!villeSlug || !d.city) continue
      const specs = d.specialties && d.specialties.length > 0
        ? (d.specialties as string[])
        : (d.specialty ? [d.specialty] : [])

      for (const sp of specs) {
        const specSlug = specToSlug.get(sp)
        if (!specSlug) continue

        const v = parVille.get(villeSlug)
        if (v) v.n++
        else parVille.set(villeSlug, { slug: villeSlug, nom: d.city, n: 1, premierSpec: specSlug })

        const s = parSpec.get(specSlug)
        if (s) s.n++
        else parSpec.set(specSlug, { slug: specSlug, nom: sp, n: 1, premiereVille: villeSlug })

        // Intitulé = la requête du patient. « Dentiste à Casablanca » pointant
        // vers /medecin/dentiste/casablanca est un signal de pertinence bien
        // plus fort que « Dentiste » : le texte du lien interne est l'un des
        // rares endroits où l'on dit explicitement à Google de quoi parle la
        // page de destination.
        const cle = `${specSlug}/${villeSlug}`
        const c = parCombo.get(cle)
        if (c) c.n++
        else parCombo.set(cle, {
          href: `/medecin/${cle}`,
          libelle: `${sp} à ${d.city}`,
          n: 1,
        })
      }
    }

    const villes: LienSEO[] = Array.from(parVille.values())
      .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom))
      .map((v) => ({
        href: `/medecin/${v.premierSpec}/${v.slug}`,
        libelle: `Médecin à ${v.nom}`,
        nombre: v.n,
      }))

    const specialites: LienSEO[] = Array.from(parSpec.values())
      .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom))
      .map((s) => ({
        href: `/medecin/${s.slug}/${s.premiereVille}`,
        libelle: s.nom,
        nombre: s.n,
      }))

    const combinaisons: LienSEO[] = Array.from(parCombo.values())
      .sort((a, b) => b.n - a.n || a.libelle.localeCompare(b.libelle))
      .map((c) => ({ href: c.href, libelle: c.libelle, nombre: c.n }))

    return { villes, specialites, combinaisons }
  } catch {
    // Un incident de base ne doit pas empêcher la page d'accueil de s'afficher :
    // le maillage disparaît, le reste de la page vit sa vie.
    return { villes: [], specialites: [], combinaisons: [] }
  }
}
