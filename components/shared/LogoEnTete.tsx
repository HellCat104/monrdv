'use client'

// Logo du cabinet (v57) dans l'en-tête d'un document imprimable rendu côté
// serveur. Composant client pour une seule raison : réagir à l'échec du
// chargement (fichier retiré entre-temps, réseau coupé). Un composant serveur
// ne peut pas porter de gestionnaire `onError` ; sans lui, un logo introuvable
// imprimerait l'icône d'image cassée en tête d'un document médical. Ici, il
// disparaît, et le document retrouve son en-tête d'origine.

import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  alt: string
  className?: string
  /** Prévient le parent de l'échec, s'il doit revenir à sa mise en page sans
   *  logo (l'ordonnance réserve une colonne au logo). */
  onEchec?: () => void
}

export function LogoEnTete({ src, alt, className, onEchec }: Props) {
  const [echec, setEchec] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  // Dernière version du rappel, sans en faire une dépendance de l'effet.
  const onEchecRef = useRef(onEchec)
  onEchecRef.current = onEchec

  function signalerEchec() {
    setEchec(true)
    onEchecRef.current?.()
  }

  // L'image est dans le HTML envoyé par le serveur : elle peut avoir échoué
  // AVANT que React ne s'attache à la page, et `onError` ne se déclenche alors
  // jamais. Une image terminée (`complete`) sans aucune largeur est une image
  // en échec : on la constate au montage.
  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) signalerEchec()
    // Constat unique au montage ; signalerEchec ne lit que des références stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (echec) return null
  return (
    // <img> et non next/image : on veut le fichier tel quel, à sa proportion,
    // sans réencodage par l'optimiseur ni dimensions imposées.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt={alt} className={className} onError={signalerEchec} />
  )
}
