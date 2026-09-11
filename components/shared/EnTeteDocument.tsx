'use client'

// En-tête commun à TOUS les documents imprimables : ordonnance, certificat,
// facture de consultation, facture de versement sur devis, avoir, devis,
// dossier imprimable. Le texte vient de lib/document-entete.ts (lignesEnTete),
// que le PDF du dossier (lib/dossier.ts) lit aussi : ce composant ne décide
// que de la mise en page.
//
// ── DEUX DISPOSITIONS, UN SEUL EN-TÊTE ──────────────────────────────────────
//
// 'centree'  — ordonnance, certificat, devis. L'identité au centre, filet
//              épais dessous ; le titre du document vient APRÈS l'en-tête,
//              dans la page. Balisage repris à l'identique de l'ordonnance
//              (commit 98935af) : elle doit rester la même à l'écran et à
//              l'impression.
// 'laterale' — factures, avoir, dossier. L'identité à gauche, et à droite le
//              cartouche du document (titre, numéro, date), passé en
//              `children` : il appartient au document, pas à l'en-tête.
//
// Composant client pour une seule raison : le logo. S'il ne se charge pas
// (fichier retiré, réseau coupé), la disposition centrée doit retirer la
// colonne qu'elle lui réservait, sinon l'identité resterait décalée. Aucune
// classe `print:` ici : l'en-tête s'imprime tel qu'il s'affiche, comme avant.

import { useState, type ReactNode } from 'react'
import { LogoEnTete } from '@/components/shared/LogoEnTete'
import { ligneCoordonnees, type LignesEnTete } from '@/lib/document-entete'

interface Props {
  lignes: LignesEnTete
  /** Adresse publique du logo (getCabinetLogoUrl) — null : en-tête sans
   *  logo, exactement celui d'avant la v57. */
  logoUrl: string | null
  disposition: 'centree' | 'laterale'
  /** Disposition latérale uniquement : le cartouche aligné à droite. */
  children?: ReactNode
}

export function EnTeteDocument({ lignes, logoUrl, disposition, children }: Props) {
  // Seul état du composant, déclaré avant toute branche de rendu.
  const [logoEchec, setLogoEchec] = useState(false)
  const avecLogo = !!logoUrl && !logoEchec
  const altLogo = `Logo du cabinet — ${lignes.nom}`

  if (disposition === 'centree') {
    const identite = (
      <>
        <h1 className="text-lg font-bold tracking-tight text-gray-900">{lignes.nom}</h1>
        {lignes.specialite && <p className="text-[13px] text-gray-600 mt-0.5">{lignes.specialite}</p>}
        {/* Paragraphe rendu même vide : c'est sa marge qui espace le filet
            quand ni adresse ni téléphone ne sont renseignés (balisage
            d'origine de l'ordonnance). */}
        <p className="text-xs text-gray-500 mt-2">{ligneCoordonnees(lignes)}</p>
        {lignes.mentions && <p className="text-xs text-gray-400 mt-0.5">{lignes.mentions}</p>}
      </>
    )
    return (
      // Avec logo : trois colonnes — logo | identité | vide de même largeur.
      // La colonne vide garde l'identité au centre de la page, là où elle est
      // sans logo. Le logo est plafonné à max-h-14 (≈ 15 mm imprimés), sous la
      // hauteur du bloc d'identité : il ne rehausse pas l'en-tête et ne
      // repousse pas le corps du document. object-contain garde ses
      // proportions, quel que soit son format.
      <header className={avecLogo
        ? 'flex items-center gap-4 border-b-2 border-gray-800 pb-4 mb-8'
        : 'text-center border-b-2 border-gray-800 pb-4 mb-8'}>
        {avecLogo && (
          <div className="w-28 shrink-0 flex items-center">
            <LogoEnTete
              src={logoUrl!}
              alt={altLogo}
              className="max-h-14 max-w-full w-auto h-auto object-contain"
              onEchec={() => setLogoEchec(true)}
            />
          </div>
        )}
        {avecLogo ? <div className="flex-1 min-w-0 text-center">{identite}</div> : identite}
        {avecLogo && <div className="w-28 shrink-0" aria-hidden />}
      </header>
    )
  }

  const identite = (
    <div>
      <h1 className="text-xl font-bold text-gray-900">{lignes.nom}</h1>
      {lignes.specialite && <p className="text-sm text-gray-500">{lignes.specialite}</p>}
      {lignes.adresse && <p className="text-sm text-gray-500 mt-1">{lignes.adresse}</p>}
      {lignes.telephone && <p className="text-sm text-gray-500 mt-1">{lignes.telephone}</p>}
      {lignes.mentions && <p className="text-xs text-gray-400 mt-1">{lignes.mentions}</p>}
    </div>
  )
  return (
    <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
      {/* Logo à gauche de l'identité, à la même hauteur plafonnée que dans la
          disposition centrée. Ici, un logo en échec disparaît sans rien
          décaler : il n'occupe aucune colonne réservée. */}
      {avecLogo ? (
        <div className="flex items-start gap-4 min-w-0">
          <LogoEnTete
            src={logoUrl!}
            alt={altLogo}
            className="max-h-14 max-w-[7rem] w-auto h-auto object-contain shrink-0"
            onEchec={() => setLogoEchec(true)}
          />
          {identite}
        </div>
      ) : identite}
      <div className="text-right">{children}</div>
    </div>
  )
}
