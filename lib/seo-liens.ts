// Construit les liens ville/spécialité réellement pourvus, pour le maillage
// interne de la page d'accueil.
//
// Même règle que le sitemap : une combinaison n'est proposée que si un médecin
// réservable y correspond. Publier des liens vers des pages vides coûte plus
// cher en référencement que de ne rien publier — Google déclasse un site dont
// une part notable des pages n'apporte rien.

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'
import type { LienSEO } from '@/components/home/MaillageSEO'

interface LiensSEO {
  villes: LienSEO[]
  specialites: LienSEO[]
  combinaisons: LienSEO[]
}

const AUCUN_LIEN: LiensSEO = { villes: [], specialites: [], combinaisons: [] }

// ── POURQUOI CE CALCUL EST GARDÉ UNE HEURE ──────────────────────────────────
//
// La page d'accueil annonce `revalidate = 3600` : calculée une fois, servie à
// tous pendant une heure. Elle ne l'a jamais été. Tous les appels à la base
// partent avec `cache: 'no-store'` (lib/supabase/server.ts) — précaution
// juste pour un dossier patient, qui ne doit jamais sortir d'un cache — et un
// seul appel de ce genre suffit à rendre TOUTE la page dynamique. L'accueil
// était donc recalculé à chaque visite : un aller-retour jusqu'au serveur, un
// autre jusqu'à la base, et une seconde d'attente quand le serveur dormait.
// Pour la page que voit en premier quelqu'un qui découvre MonRDV.
//
// `unstable_cache` garde le RÉSULTAT du calcul, quoi que fassent les appels à
// l'intérieur. La liste des villes et des spécialités pourvues n'a rien de
// personnel et change quand un médecin s'inscrit : une heure de retard n'y
// coûte rien.
//
// Une erreur n'entre PAS dans le cache : la fonction lève, et c'est
// `chargerLiensSEO` qui rattrape. Sans cela, une base injoignable dix secondes
// laisserait l'accueil sans maillage pendant une heure.
//
// Fonction de Next.js, pas de l'hébergeur : elle se comporte pareil sur un
// serveur au Maroc.
const liensEnCache = unstable_cache(calculerLiensSEO, ['liens-seo-accueil'], { revalidate: 3600 })

export async function chargerLiensSEO(): Promise<LiensSEO> {
  try {
    return await liensEnCache()
  } catch {
    // Un incident de base ne doit pas empêcher la page d'accueil de s'afficher :
    // le maillage disparaît, le reste de la page vit sa vie.
    return AUCUN_LIEN
  }
}

async function calculerLiensSEO(): Promise<LiensSEO> {
  {
    const supabase = createAdminClient()
    const { data: doctors, error } = await supabase
      .from('doctors')
      .select('specialty, specialties, city')
      .eq('status', 'approved')
      .eq('subscription_status', 'actif')

    if (error) throw new Error(error.message)
    if (!doctors || doctors.length === 0) return AUCUN_LIEN

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
  }
}
