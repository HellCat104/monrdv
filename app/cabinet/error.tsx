'use client'

// Filet de sécurité de l'espace cabinet.
//
// Les pages de cet espace appellent `getStaffContext()` pour leur propre compte,
// en parallèle du layout. Depuis que ce contrôle LÈVE une exception quand la
// base ne répond pas — au lieu de faire semblant que la personne n'a pas de
// droits et de la renvoyer vers /login —, il faut quelqu'un pour l'attraper à
// ce niveau aussi. Sans cela, une secrétaire verrait l'écran d'erreur générique
// de Next au lieu d'un message clair et d'un bouton « Réessayer ».
import ServiceIndisponible from '@/components/ServiceIndisponible'

export default function CabinetError({ error }: { error: Error & { digest?: string } }) {
  const panne = error.name === 'BaseInjoignable'
  return <ServiceIndisponible detail={panne ? error.message : undefined} />
}
