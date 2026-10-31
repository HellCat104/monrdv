// Un formulaire officiel, rempli par-dessus.
//
// ── POURQUOI ON NE REDESSINE PLUS LES IMPRIMÉS ──────────────────────────────
//
// La première approche reconstruisait chaque formulaire en HTML : les cadres,
// les bandeaux, les libellés dans les deux langues. Le résultat ressemblait au
// document sans jamais l'être — il manquait toujours l'emblème, la fonte, un
// filet intérieur, un sous-titre arabe. Et chaque écart se payait d'un
// aller-retour avec le cabinet, qui posait la feuille à côté de l'originale et
// voyait la différence en une seconde.
//
// Ici, le fond EST l'imprimé officiel, scanné. On ne pose dessus que ce que le
// praticien y écrirait : des valeurs, des croix, des ratures. Il n'y a donc
// plus d'écart possible sur la trame — elle n'est pas reproduite, elle est là.
//
// ── POURQUOI DU SVG ET NON DU TEXTE POSITIONNÉ ──────────────────────────────
//
// Les valeurs doivent suivre l'image quelle que soit sa taille : à l'écran
// dans une fenêtre étroite, et sur la page à l'impression. Un SVG qui porte le
// même rapport largeur/hauteur que le scan s'étire exactement comme lui, et
// ses coordonnées restent valables partout. Le texte reste du texte, donc net
// à l'impression — contrairement à une image de texte.
//
// Les coordonnées sont en MILLIÈMES DE LA LARGEUR de la page : x va de 0 à
// 1000, y de 0 à 1000 × (hauteur / largeur). On les relève une fois sur le
// scan, et elles ne bougent plus.
import { PrintButton } from '@/app/facture/[id]/PrintButton'

export interface MarqueFormulaire {
  x: number
  y: number
  /** Ce qui s'écrit à cet endroit. */
  texte?: string | null
  /** Un signe plutôt qu'un texte : la croix d'une case à cocher, le cercle
   *  autour d'une dent, le trait qui raye une mention inutile. */
  signe?: 'croix' | 'cercle' | 'rature'
  /** Hauteur de police, en millièmes de largeur de page. 14 ≈ 10 pt sur A4. */
  taille?: number
  gras?: boolean
  /** Où `x` tombe dans le texte. Par défaut au début. */
  ancre?: 'start' | 'middle' | 'end'
  /** Rature : longueur du trait. Cercle : diamètre. */
  largeur?: number
  /** Écrit un caractère tous les `pas` millièmes : pour les grilles de cases
   *  à un chiffre, où chaque chiffre a sa case. */
  pas?: number
}

export interface PageFormulaire {
  /** Chemin public du scan, par exemple « /formulaires/far-1.jpg ». */
  image: string
  /** Dimensions du scan, en pixels : elles donnent le rapport de la page. */
  largeur: number
  hauteur: number
  marques: MarqueFormulaire[]
}

/** Trace une marque. Rendue à part pour que la grille de calage puisse
 *  réutiliser exactement le même dessin. */
function Marque({ m, unite }: { m: MarqueFormulaire; unite: number }) {
  const taille = m.taille ?? 14

  if (m.signe === 'croix') {
    const r = (m.largeur ?? 14) / 2
    return (
      <g stroke="#111" strokeWidth={unite * 1.6} strokeLinecap="round">
        <line x1={m.x - r} y1={m.y - r} x2={m.x + r} y2={m.y + r} />
        <line x1={m.x + r} y1={m.y - r} x2={m.x - r} y2={m.y + r} />
      </g>
    )
  }
  if (m.signe === 'cercle') {
    return (
      <ellipse cx={m.x} cy={m.y} rx={(m.largeur ?? 18) / 2} ry={(m.largeur ?? 18) / 2}
        fill="none" stroke="#111" strokeWidth={unite * 1.6} />
    )
  }
  if (m.signe === 'rature') {
    return (
      <line x1={m.x} y1={m.y} x2={m.x + (m.largeur ?? 60)} y2={m.y}
        stroke="#111" strokeWidth={unite * 1.6} strokeLinecap="round" />
    )
  }

  const texte = String(m.texte ?? '')
  if (!texte) return null

  // Une valeur à écrire case par case : chaque caractère reçoit sa position,
  // sinon les chiffres dérivent dès le troisième et débordent de la grille.
  if (m.pas) {
    return (
      <>
        {texte.replace(/\s/g, '').split('').map((c, i) => (
          <text key={i} x={m.x + i * m.pas!} y={m.y} fontSize={taille} textAnchor="middle"
            fontFamily="ui-monospace, Menlo, monospace" fill="#111" fontWeight={m.gras ? 700 : 400}>
            {c}
          </text>
        ))}
      </>
    )
  }

  return (
    <text x={m.x} y={m.y} fontSize={taille} textAnchor={m.ancre ?? 'start'}
      fontFamily="Helvetica, Arial, sans-serif" fill="#111" fontWeight={m.gras ? 700 : 400}>
      {texte}
    </text>
  )
}

export default function FormulaireImprime({
  pages, retourHref, orientation = 'portrait', grille = false,
}: {
  pages: PageFormulaire[]
  retourHref: string
  orientation?: 'portrait' | 'landscape'
  /** Trame de calage : n'est jamais vraie en production. Elle sert à relever
   *  les coordonnées d'un nouveau formulaire, une fois, à l'écran. */
  grille?: boolean
}) {
  return (
    <div className="bg-gray-100 print:bg-white py-6 print:py-0">
      {/* Marge nulle : le scan EST la page, bords compris. */}
      <style>{`
        @page { size: A4 ${orientation}; margin: 0; }
        @media print {
          .feuille-page { height: 100vh; page-break-after: always; }
          .feuille-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="max-w-[1100px] mx-auto mb-3 flex items-center justify-between print:hidden px-4">
        <a href={retourHref} className="text-sm text-gray-500 hover:text-gray-700">← Retour au patient</a>
        <PrintButton />
      </div>

      {pages.map((page, i) => {
        // Le repère du SVG : 1000 de large, la hauteur suit le scan.
        const hauteur = Math.round((1000 * page.hauteur) / page.largeur)
        // L'épaisseur d'un trait de stylo, à l'échelle de la page.
        const unite = 1000 / page.largeur
        return (
          <div key={i} className="feuille-page flex items-center justify-center mb-6 print:mb-0">
            <div className="relative inline-block bg-white shadow-sm print:shadow-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.image} alt="" className="block w-auto h-auto max-w-full"
                style={{ maxHeight: '100vh' }} />
              <svg viewBox={`0 0 1000 ${hauteur}`} className="absolute inset-0 w-full h-full">
                {grille && (
                  <g>
                    {Array.from({ length: 21 }).map((_, k) => (
                      <g key={`v${k}`}>
                        <line x1={k * 50} y1={0} x2={k * 50} y2={hauteur}
                          stroke={k % 2 ? '#93c5fd' : '#2563eb'} strokeWidth={0.6} opacity={0.75} />
                        {k % 2 === 0 && (
                          <text x={k * 50 + 2} y={12} fontSize={9} fill="#1d4ed8">{k * 50}</text>
                        )}
                      </g>
                    ))}
                    {Array.from({ length: Math.ceil(hauteur / 50) + 1 }).map((_, k) => (
                      <g key={`h${k}`}>
                        <line x1={0} y1={k * 50} x2={1000} y2={k * 50}
                          stroke={k % 2 ? '#fca5a5' : '#dc2626'} strokeWidth={0.6} opacity={0.75} />
                        {k % 2 === 0 && (
                          <text x={2} y={k * 50 - 2} fontSize={9} fill="#b91c1c">{k * 50}</text>
                        )}
                      </g>
                    ))}
                  </g>
                )}
                {page.marques.map((m, j) => <Marque key={j} m={m} unite={unite} />)}
              </svg>
            </div>
          </div>
        )
      })}
    </div>
  )
}
