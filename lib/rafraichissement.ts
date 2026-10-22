'use client'

// Rafraîchissement automatique d'un écran de cabinet.
//
// Trois écrans se rechargeaient à intervalle fixe — trente secondes pour
// l'agenda de la secrétaire, soixante pour la salle d'attente, quarante-cinq
// pour l'agenda du médecin. Deux défauts :
//
// 1. L'ATTENTE. Elle pointe une arrivée, le médecin regarde son écran : il
//    peut s'écouler une demi-minute avant qu'il la voie. Sur un poste
//    d'accueil, une demi-minute est une éternité.
//
// 2. LE GASPILLAGE. L'intervalle tournait même onglet en arrière-plan. Un
//    cabinet qui laisse MonRDV ouvert toute la journée derrière sa boîte mail
//    interrogeait la base deux mille fois pour rien.
//
// On fait donc l'inverse des deux : plus court quand l'écran est regardé,
// RIEN quand il ne l'est pas. Et surtout, un rafraîchissement IMMÉDIAT au
// retour sur l'onglet — c'est là que se jouait vraiment l'impression de
// lenteur : on revient à l'écran et on attend le prochain tour.
import { useEffect, useRef } from 'react'

export const RYTHME_CABINET_MS = 10000

export function useRafraichissement(action: () => void, delai = RYTHME_CABINET_MS) {
  // L'action change à chaque rendu (fonction recréée) : on la garde dans une
  // référence pour ne pas relancer la minuterie à chaque fois.
  const derniere = useRef(action)
  derniere.current = action

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const demarrer = () => {
      if (timer) return
      timer = setInterval(() => derniere.current(), delai)
    }
    const arreter = () => {
      if (!timer) return
      clearInterval(timer)
      timer = null
    }

    const auChangementDeVisibilite = () => {
      if (document.visibilityState === 'visible') {
        derniere.current()   // tout de suite, sans attendre le prochain tour
        demarrer()
      } else {
        arreter()
      }
    }

    if (document.visibilityState === 'visible') demarrer()
    document.addEventListener('visibilitychange', auChangementDeVisibilite)
    // `focus` en plus : revenir d'une autre fenêtre ne déclenche pas toujours
    // un changement de visibilité selon le navigateur.
    window.addEventListener('focus', auChangementDeVisibilite)

    return () => {
      arreter()
      document.removeEventListener('visibilitychange', auChangementDeVisibilite)
      window.removeEventListener('focus', auChangementDeVisibilite)
    }
  }, [delai])
}
