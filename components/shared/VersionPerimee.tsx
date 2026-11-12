'use client'

// Quand l'onglet tourne sur une version de MonRDV qui n'existe plus.
//
// ── CE QUI SE PASSAIT ───────────────────────────────────────────────────────
//
// MonRDV est découpé en morceaux de code que le navigateur va chercher au fur
// et à mesure — l'écran des patients n'est téléchargé que si l'on y va. Chaque
// mise en ligne renomme ces morceaux. Un onglet resté ouvert depuis le matin
// demande alors, au premier clic, un fichier qui n'existe plus : la page reste
// blanche, ou affiche « Une erreur est survenue », jusqu'à ce que la personne
// pense à actualiser. Parfois deux fois.
//
// Un cabinet garde MonRDV ouvert toute la journée. Le jour où il y a eu douze
// mises en ligne, il a rencontré douze fois ce mur.
//
// ── CE QUE FAIT CE COMPOSANT ────────────────────────────────────────────────
//
// Il reconnaît cette panne-là, et aucune autre — un morceau de code de MonRDV
// qui refuse de se charger — et recharge la page à la place de la personne.
// Après le rechargement, l'onglet est sur la version en ligne et tout existe.
//
// ── LES DEUX GARDE-FOUS ─────────────────────────────────────────────────────
//
// 1. JAMAIS pendant une saisie. Si le curseur est dans un champ, recharger
//    effacerait une note de consultation en cours. On affiche alors un bandeau
//    « Nouvelle version — Recharger » et la personne choisit son moment.
//
// 2. JAMAIS en boucle. Si le fichier manque pour une autre raison (une mise en
//    ligne ratée, un réseau qui filtre), recharger ne répare rien : au-delà de
//    deux rechargements en dix minutes, on s'arrête et on montre le bandeau.
//
// Rien ici ne dépend de l'hébergeur : le problème est le même sur n'importe
// quel serveur qui remplace une version par une autre.
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const CLE = 'monrdv-rechargements'
const FENETRE_MS = 10 * 60 * 1000
const MAX_AUTOMATIQUES = 2

/** Les rechargements automatiques récents de CET onglet. sessionStorage peut
 *  être indisponible (navigation privée stricte) : on fait alors comme s'il y
 *  en avait déjà trop, et on laisse la main à la personne. */
function rechargementsRecents(): number[] | null {
  try {
    const brut = JSON.parse(sessionStorage.getItem(CLE) ?? '[]')
    const maintenant = Date.now()
    return (Array.isArray(brut) ? brut : []).filter((t) => typeof t === 'number' && maintenant - t < FENETRE_MS)
  } catch {
    return null
  }
}

/** L'erreur vient-elle d'un morceau de code de MonRDV introuvable ? */
function estMorceauManquant(raison: unknown): boolean {
  const e = raison as { name?: string; message?: string } | null
  const texte = `${e?.name ?? ''} ${e?.message ?? ''} ${typeof raison === 'string' ? raison : ''}`
  return /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(texte)
}

/** La personne est-elle en train d'écrire ? */
function saisieEnCours(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
    || (el.tagName === 'INPUT' && !['button', 'submit', 'checkbox', 'radio'].includes((el as HTMLInputElement).type))
}

export default function VersionPerimee() {
  const [bandeau, setBandeau] = useState(false)

  useEffect(() => {
    function traiter() {
      const recents = rechargementsRecents()
      if (recents === null || recents.length >= MAX_AUTOMATIQUES || saisieEnCours()) {
        setBandeau(true)
        return
      }
      try { sessionStorage.setItem(CLE, JSON.stringify([...recents, Date.now()])) } catch { /* voir plus haut */ }
      window.location.reload()
    }

    // Un <script> ou une feuille de style de MonRDV qui ne se charge pas.
    // L'évènement ne « remonte » pas : il faut l'attraper à la descente.
    function surErreur(ev: Event) {
      const cible = ev.target as (HTMLScriptElement & HTMLLinkElement) | null
      const adresse = cible?.src || cible?.href || ''
      if (cible && (cible.tagName === 'SCRIPT' || cible.tagName === 'LINK') && adresse.includes('/_next/static/')) {
        traiter()
        return
      }
      if (estMorceauManquant((ev as ErrorEvent).error ?? (ev as ErrorEvent).message)) traiter()
    }
    function surRejet(ev: PromiseRejectionEvent) {
      if (estMorceauManquant(ev.reason)) traiter()
    }

    window.addEventListener('error', surErreur, true)
    window.addEventListener('unhandledrejection', surRejet)
    return () => {
      window.removeEventListener('error', surErreur, true)
      window.removeEventListener('unhandledrejection', surRejet)
    }
  }, [])

  if (!bandeau) return null
  return (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] print:hidden
      flex items-center gap-3 rounded-xl border border-primary-200 bg-white px-4 py-3 shadow-lg max-w-[calc(100%-2rem)]">
      <p className="text-sm text-gray-700">
        Une nouvelle version de MonRDV est en ligne. Enregistrez ce que vous écrivez, puis rechargez la page.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-600"
      >
        <RefreshCw className="h-4 w-4" /> Recharger
      </button>
    </div>
  )
}
