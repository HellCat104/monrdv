import { NextResponse } from 'next/server'
import { SPECIALITE_SLUGS, VILLE_SLUGS } from '@/lib/seo-slugs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://monrdv.vercel.app').replace(/\/$/, '')
  const now = new Date().toISOString().split('T')[0]

  const staticUrls = [
    { loc: baseUrl, priority: '1.0', changefreq: 'weekly' },
    { loc: `${baseUrl}/inscription`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${baseUrl}/politique-confidentialite`, priority: '0.2', changefreq: 'yearly' },
    { loc: `${baseUrl}/cgu`, priority: '0.2', changefreq: 'yearly' },
  ]

  const seoUrls: { loc: string; priority: string; changefreq: string }[] = []
  for (const specialiteSlug of Object.keys(SPECIALITE_SLUGS)) {
    for (const villeSlug of Object.keys(VILLE_SLUGS)) {
      seoUrls.push({
        loc: `${baseUrl}/medecin/${specialiteSlug}/${villeSlug}`,
        priority: '0.7',
        changefreq: 'weekly',
      })
    }
  }

  const allUrls = [...staticUrls, ...seoUrls]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
