// Logo MonRDV — le monogramme et son tracé cardiaque.
//
// Il était jusqu'ici redessiné dans chaque en-tête : un carré bleu et une icône
// de stéthoscope empruntée à la bibliothèque d'icônes, dupliqués à cinq
// endroits. Une marque qui change d'une page à l'autre n'en est pas une.
//
// En SVG plutôt qu'en PNG : net sur tous les écrans, quelques centaines
// d'octets, et le même fichier sert de favicon.

interface LogoProps {
  /** Côté du monogramme en pixels. 36 dans un en-tête, 32 dans une barre dense. */
  taille?: number
  /** Affiche « MonRDV » à côté du monogramme. */
  avecTexte?: boolean
  className?: string
}

export function LogoMonRDV({ taille = 36, avecTexte = true, className = '' }: LogoProps) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      {/* Dimensions explicites : sans elles, la page saute au chargement de
          l'image, ce que Google mesure et sanctionne. */}
      <img
        src="/logo-monrdv.svg"
        alt=""
        width={taille}
        height={taille}
        className="shrink-0"
        style={{ width: taille, height: taille }}
      />
      {avecTexte && (
        <span className="font-bold text-gray-900" style={{ fontSize: taille * 0.55 }}>
          MonRDV
        </span>
      )}
    </span>
  )
}
