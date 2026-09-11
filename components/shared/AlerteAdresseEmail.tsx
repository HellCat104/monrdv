// « Cette adresse ne fonctionne pas » — un seul composant pour tous les écrans.
//
// Le drapeau (migration v59) est posé par le webhook Resend quand un message
// a rebondi, a été signalé comme indésirable, ou n'a même pas été tenté parce
// que l'adresse était déjà bloquée. Il s'affiche sur QUATRE écrans : fiche de
// la secrétaire (« Mon équipe »), dossier patient complet, dossier du forfait
// Agenda, fiche patient côté secrétaire. Ce produit a déjà connu des écrans
// jumeaux qui divergent (l'un corrigé, l'autre oublié) : les mots vivent donc
// ICI, une fois, et chaque écran ne fait que placer le bandeau à côté de son
// champ e-mail.
//
// Pas de 'use client' ni de hook : un composant d'affichage pur, utilisable
// depuis n'importe quel écran, client ou serveur.
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatDateFr } from '@/lib/utils'
import type { EmailBounceReason } from '@/types'

type Cible = 'patient' | 'secretaire'

/** La phrase, seule — pour un écran qui voudrait l'afficher autrement. */
export function messageAdresseEnEchec(raison: EmailBounceReason, cible: Cible): string {
  if (cible === 'secretaire') {
    if (raison === 'complained') {
      return 'Cette adresse a classé nos e-mails comme indésirables : l’invitation et les messages suivants ne lui sont plus remis.'
    }
    if (raison === 'suppressed') {
      return 'L’invitation n’a pas pu être remise : cette adresse a déjà échoué, plus aucun e-mail ne lui est envoyé.'
    }
    return 'L’invitation n’a pas pu être remise : cette adresse n’existe pas.'
  }
  if (raison === 'complained') {
    return 'Ce patient a classé nos e-mails comme indésirables : les confirmations et rappels ne lui parviennent plus. Demandez-lui une autre adresse.'
  }
  // `bounced` et `suppressed` disent la même chose au cabinet : l'adresse ne
  // reçoit rien, il faut la corriger. La nuance ne sert qu'au support.
  return 'Cette adresse ne fonctionne pas : les confirmations et rappels ne lui parviennent pas. Corrigez-la.'
}

/** Vrai si le drapeau concerne encore l'adresse affichée dans le champ. */
export function memeAdresse(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

export default function AlerteAdresseEmail({
  raison, depuis, cible, compact = false, children,
}: {
  raison: EmailBounceReason | null | undefined
  depuis?: string | null
  cible: Cible
  /** Version réduite pour les colonnes étroites (dossier patient). */
  compact?: boolean
  /** Bouton ou lien qui mène à la correction. */
  children?: ReactNode
}) {
  if (!raison) return null
  // Une date illisible ne doit pas faire planter l'écran qui affiche l'alerte.
  let quand = ''
  if (depuis) {
    try { quand = formatDateFr(depuis) } catch { quand = '' }
  }
  return (
    <div role="alert" className={`rounded-lg border border-red-200 bg-red-50 text-red-800 ${compact ? 'px-2.5 py-2 text-[12px]' : 'px-3 py-2.5 text-sm'}`}>
      <p className="flex items-start gap-1.5 leading-snug">
        <AlertTriangle className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0 mt-0.5`} />
        <span>
          {messageAdresseEnEchec(raison, cible)}
          {quand && <span className="block text-[11px] text-red-600/80 mt-0.5">Signalé par le service d’envoi le {quand}.</span>}
        </span>
      </p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
