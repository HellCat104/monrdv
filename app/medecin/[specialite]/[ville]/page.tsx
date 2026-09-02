// Page « {spécialité} à {ville} » — c'est elle qui doit sortir sur une requête
// du type « médecin esthétique casa », pas la page d'accueil.
//
// Trois défauts la desservaient :
//
// 1. Elle ne retenait un médecin que par la colonne `specialties`, alors que le
//    sitemap et le maillage de l'accueil acceptent aussi `specialty` seule. Un
//    praticien dont `specialties` est vide était donc annoncé partout et absent
//    de la page : Google indexait « Aucun médecin disponible ». Une source
//    unique règle la contradiction — les deux listes viennent maintenant du
//    même chargement.
// 2. Les liens « autres villes / autres spécialités » pointaient vers les huit
//    premiers slugs de la table, pourvus ou non. Des dizaines de liens vers des
//    pages vides : c'est exactement ce que Google sanctionne.
// 3. Une page sans médecin restait indexable. Tant qu'elle est vide, elle est
//    en noindex — elle reviendra dans l'index le jour où elle aura du contenu.
import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import { displayName } from '@/lib/profession'
import Link from 'next/link'
import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getSpecialiteFromSlug, getVilleFromSlug, praticienDepuisSlug,
  SPECIALITE_SLUGS, VILLE_SLUGS, SPECIALITE_ALIAS, VILLE_ALIAS,
} from '@/lib/seo-slugs'
import { MapPin, Clock } from 'lucide-react'
import { LogoMonRDV } from '@/components/shared/LogoMonRDV'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma').replace(/\/$/, '')

// Pas de `revalidate` ici : `createAdminClient` impose `cache: 'no-store'` sur
// chacun de ses appels, ce qui rend la route dynamique quoi qu'on déclare. La
// page est donc rendue à chaque requête, comme avant. La mettre en cache une
// heure serait un vrai gain de vitesse — donc de référencement — mais cela
// suppose de toucher au client admin partagé par toute l'application.

interface Props {
  params: { specialite: string; ville: string }
}

interface Praticien {
  id: string
  name: string
  specialty: string | null
  specialties: string[] | null
  slug: string
  city: string | null
  appointment_duration: number | null
}

// Un seul chargement par rendu, partagé par generateMetadata, la liste et les
// liens internes : impossible qu'ils se contredisent.
const tousLesPraticiens = cache(async (): Promise<Praticien[]> => {
  // Un incident de base ne doit pas produire une 500 sur une page publique :
  // Google interprète une erreur serveur comme un signal durable et finit par
  // sortir l'URL de son index. La page se replie sur son état vide, qui est
  // déjà en noindex — donc réversible dès que la base répond de nouveau.
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('doctors')
      .select('id, name, specialty, specialties, slug, city, appointment_duration')
      .eq('status', 'approved')
      .eq('subscription_status', 'actif')
    if (error) {
      console.error('[seo ville/spécialité] lecture impossible :', error.message)
      return []
    }
    return (data ?? []) as Praticien[]
  } catch (e) {
    console.error('[seo ville/spécialité] lecture impossible :', e)
    return []
  }
})

// Même règle de repli que le sitemap : `specialties` si elle est renseignée,
// `specialty` sinon.
function specialitesDe(d: Praticien): string[] {
  if (Array.isArray(d.specialties) && d.specialties.length > 0) return d.specialties
  return d.specialty ? [d.specialty] : []
}

/** Slugs canoniques, ou null si l'URL ne correspond à rien de connu. */
function resoudre(params: Props['params']) {
  const specialite = SPECIALITE_SLUGS[params.specialite] ? params.specialite : SPECIALITE_ALIAS[params.specialite]
  const ville = VILLE_SLUGS[params.ville] ? params.ville : VILLE_ALIAS[params.ville]
  if (!specialite || !ville) return null
  const redirige = specialite !== params.specialite || ville !== params.ville
  return { specialite, ville, redirige }
}

const praticiensDe = cache(async (specialiteSlug: string, villeSlug: string) => {
  const specialite = getSpecialiteFromSlug(specialiteSlug)
  const ville = getVilleFromSlug(villeSlug)
  const tous = await tousLesPraticiens()
  return tous
    .filter((d) => d.city === ville && specialitesDe(d).includes(specialite ?? ''))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
})

/** Combinaisons réellement pourvues — les seules vers lesquelles on fait un lien. */
const combosPourvus = cache(async () => {
  const tous = await tousLesPraticiens()
  const specVersSlug = new Map(Object.entries(SPECIALITE_SLUGS).map(([slug, nom]) => [nom, slug]))
  const villeVersSlug = new Map(Object.entries(VILLE_SLUGS).map(([slug, nom]) => [nom, slug]))
  const combos = new Set<string>()
  for (const d of tous) {
    const villeSlug = d.city ? villeVersSlug.get(d.city) : undefined
    if (!villeSlug) continue
    for (const sp of specialitesDe(d)) {
      const specSlug = specVersSlug.get(sp)
      if (specSlug) combos.add(`${specSlug}/${villeSlug}`)
    }
  }
  return combos
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = resoudre(params)
  if (!r) return { robots: { index: false } }
  // L'URL alias redirige : ses métadonnées ne sont jamais servies.
  if (r.redirige) return { robots: { index: false } }

  const specialite = getSpecialiteFromSlug(r.specialite)!
  const ville = getVilleFromSlug(r.ville)!
  const praticien = praticienDepuisSlug(r.specialite)
  const liste = await praticiensDe(r.specialite, r.ville)

  const title = `${praticien.charAt(0).toUpperCase()}${praticien.slice(1)} à ${ville} — Prendre RDV en ligne`
  const description = liste.length > 0
    ? `${liste.length} ${praticien}${liste.length > 1 ? 's' : ''} à ${ville} sur MonRDV. Consultez les créneaux disponibles et réservez en ligne en deux minutes, gratuitement, sans appeler le cabinet.`
    : `Prenez rendez-vous avec un ${praticien} à ${ville} sur MonRDV. Réservation en ligne gratuite, confirmation immédiate.`

  return {
    title,
    description,
    keywords: [
      `${praticien} ${ville}`,
      `${specialite} ${ville}`,
      `rendez-vous ${praticien} ${ville}`,
      `meilleur ${praticien} ${ville}`,
      `médecin ${ville}`,
    ],
    alternates: { canonical: `${APP_URL}/medecin/${r.specialite}/${r.ville}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${APP_URL}/medecin/${r.specialite}/${r.ville}`,
    },
    // Une page sans praticien n'a rien à faire dans l'index : elle abaisse la
    // note de qualité de tout le domaine. Les liens, eux, restent suivis.
    ...(liste.length === 0 && { robots: { index: false, follow: true } }),
  }
}

export default async function MedecinSpecialiteVillePage({ params }: Props) {
  const r = resoudre(params)
  if (!r) notFound()
  if (r.redirige) permanentRedirect(`/medecin/${r.specialite}/${r.ville}`)

  const specialite = getSpecialiteFromSlug(r.specialite)!
  const ville = getVilleFromSlug(r.ville)!
  const praticien = praticienDepuisSlug(r.specialite)
  const liste = await praticiensDe(r.specialite, r.ville)
  const combos = await combosPourvus()

  const url = `${APP_URL}/medecin/${r.specialite}/${r.ville}`

  // Le fil d'Ariane apparaît sous le titre dans les résultats Google.
  const filAriane = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'MonRDV', item: APP_URL },
      { '@type': 'ListItem', position: 2, name: 'Rechercher un médecin', item: `${APP_URL}/recherche` },
      { '@type': 'ListItem', position: 3, name: `${specialite} à ${ville}`, item: url },
    ],
  }

  // ItemList de Physician : le type correct pour une page de liste. L'ancien
  // MedicalBusiness décrivait la page comme un cabinet — ce qu'elle n'est pas.
  const listeJsonLd = liste.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${praticien.charAt(0).toUpperCase()}${praticien.slice(1)} à ${ville}`,
    numberOfItems: liste.length,
    itemListElement: liste.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Physician',
        name: displayName(d.name, d.specialty),
        medicalSpecialty: specialite,
        url: `${APP_URL}/dr-${d.slug}`,
        address: { '@type': 'PostalAddress', addressLocality: ville, addressCountry: 'MA' },
      },
    })),
  } : null

  const autresVilles = Object.entries(VILLE_SLUGS)
    .filter(([slug]) => slug !== r.ville && combos.has(`${r.specialite}/${slug}`))
    .slice(0, 10)
  const autresSpecialites = Object.entries(SPECIALITE_SLUGS)
    .filter(([slug]) => slug !== r.specialite && combos.has(`${slug}/${r.ville}`))
    .slice(0, 10)

  return (
    <>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(filAriane).replace(/</g, '\\u003c') }} />
      {listeJsonLd && (
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listeJsonLd).replace(/</g, '\\u003c') }} />
      )}

      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-2">
            <Link href="/"><LogoMonRDV taille={34} /></Link>
            <span className="text-gray-300">/</span>
            <Link href="/recherche" className="text-gray-500 text-sm hover:text-primary-500">Recherche</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-700 text-sm">{specialite} à {ville}</span>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {praticien.charAt(0).toUpperCase()}{praticien.slice(1)} à {ville}
            </h1>
            <p className="text-gray-500">
              {liste.length > 0
                ? `${liste.length} praticien${liste.length > 1 ? 's' : ''} disponible${liste.length > 1 ? 's' : ''} — prenez rendez-vous en ligne gratuitement`
                : `Prenez rendez-vous avec un ${praticien} à ${ville} en ligne`}
            </p>
          </div>

          {liste.length > 0 ? (
            <div className="space-y-4">
              {liste.map((d) => (
                <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-xl shrink-0">
                      {d.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{displayName(d.name, d.specialty)}</h2>
                      <p className="text-sm text-primary-600">{specialite}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {d.city}</span>
                        {d.appointment_duration && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {d.appointment_duration} min</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link href={`/dr-${d.slug}`}
                    className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
                    Prendre RDV
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <p className="text-gray-500 mb-4">Aucun {praticien} disponible à {ville} pour le moment.</p>
              <Link href={`/recherche?q=${encodeURIComponent(specialite)}`} className="text-primary-500 hover:underline text-sm">
                Voir tous les praticiens en {specialite.toLowerCase()} au Maroc →
              </Link>
            </div>
          )}

          <div className="mt-12 bg-white rounded-2xl border border-gray-100 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Comment prendre rendez-vous avec un {praticien} à {ville} ?
            </h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Choisissez votre praticien dans la liste ci-dessus, consultez ses créneaux réellement
              disponibles et réservez celui qui vous convient. La prise de rendez-vous prend moins de
              deux minutes, se fait à toute heure et ne nécessite aucun appel au cabinet.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              MonRDV référence des professionnels de santé exerçant à {ville} et dans les principales
              villes du Maroc. Chaque cabinet gère lui-même son agenda : les créneaux affichés sont
              donc les disponibilités réelles du praticien, mises à jour en continu.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Le service est <strong>gratuit pour les patients</strong> et accessible
              <strong> 24h/24 et 7j/7</strong>. Vous recevez une confirmation immédiate par e-mail,
              puis un rappel avant la consultation. En cas d&apos;imprévu, un lien vous permet
              d&apos;annuler ou de libérer votre créneau en un clic.
            </p>
          </div>

          {autresVilles.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {praticien.charAt(0).toUpperCase()}{praticien.slice(1)} dans d&apos;autres villes
              </h3>
              <div className="flex flex-wrap gap-2">
                {autresVilles.map(([slug, nom]) => (
                  <Link key={slug} href={`/medecin/${r.specialite}/${slug}`}
                    className="text-sm bg-white border border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600 px-3 py-1.5 rounded-lg transition-colors">
                    {nom}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {autresSpecialites.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Autres spécialités à {ville}</h3>
              <div className="flex flex-wrap gap-2">
                {autresSpecialites.map(([slug, nom]) => (
                  <Link key={slug} href={`/medecin/${slug}/${r.ville}`}
                    className="text-sm bg-white border border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600 px-3 py-1.5 rounded-lg transition-colors">
                    {nom}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </main>

        <footer className="border-t border-gray-100 py-6 px-4 text-center text-sm text-gray-400 mt-8">
          <Link href="/" className="hover:text-primary-500">← Retour à l&apos;accueil</Link>
        </footer>
      </div>
    </>
  )
}
