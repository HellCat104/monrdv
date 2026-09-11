// Webhook Resend : rebonds, plaintes et suppressions d'adresses e-mail.
//
// ── POURQUOI CETTE ROUTE EXISTE ─────────────────────────────────────────────
//
// Resend ACCEPTE un message, l'application affiche « envoyé »… puis, une
// minute plus tard, le serveur du destinataire le renvoie : l'adresse n'existe
// pas. Resend place alors l'adresse en liste de suppression et ne lui remettra
// plus rien — ni invitation, ni confirmation, ni rappel. Ce refus arrive APRÈS
// l'envoi : aucune valeur de retour de l'API ne peut le dire. Seul ce webhook
// l'apprend, et il l'écrit sur les fiches (migration v59) pour que l'écran où
// l'adresse se corrige puisse le montrer.
//
// ── POURQUOI LA SIGNATURE N'EST PAS NÉGOCIABLE ──────────────────────────────
//
// Cette URL est publique et n'exige aucune session : c'est Resend qui appelle,
// pas un utilisateur. Sans vérification, n'importe qui pourrait poster
// « email.bounced » pour l'adresse d'une secrétaire ou d'un patient réels et
// faire afficher « cette adresse ne fonctionne pas » sur une adresse valide —
// de quoi pousser un cabinet à « corriger » une bonne adresse, donc à couper
// lui-même ses communications. Rien n'est lu, parsé ni écrit avant que la
// signature ait été vérifiée sur le corps BRUT.
//
// La vérification est celle du SDK `resend` installé (resend.webhooks.verify,
// qui délègue à `svix`, dépendance directe de `resend` — rien à ajouter à
// package.json). Elle contrôle :
//   · la signature HMAC-SHA256 de « svix-id.svix-timestamp.corps », comparée en
//     temps constant, avec le secret du point de terminaison ;
//   · l'horodatage : refusé s'il s'écarte de plus de 5 minutes de l'heure du
//     serveur, dans un sens ou dans l'autre. Une requête authentique capturée
//     ne peut donc pas être rejouée plus tard.
// Dans la fenêtre des 5 minutes, le rejeu d'une requête authentique est
// neutralisé par l'idempotence : `svix-id` fait partie du contenu signé (on ne
// peut pas le changer sans casser la signature) et il est UNIQUE en base.
//
// ── RÉPONDRE VITE, ET DIRE LA VÉRITÉ À RESEND ───────────────────────────────
//
// Svix attend une réponse en quelques secondes et réessaie tout ce qui n'est
// pas un 2xx, pendant environ une journée. Donc :
//   · événement non traité ici (ouverture, clic, remise…) → 200 : sinon Resend
//     le renverrait en boucle pour rien ;
//   · écriture en base impossible (migration pas encore passée, base
//     indisponible) → 500 : Resend réessaiera, et le rebond ne sera pas perdu ;
//   · un seul appel à la base, une seule transaction (fonction SQL
//     enregistrer_evenement_email) : journal et fiches passent ensemble ou pas
//     du tout. Voir la migration v59, §3, pour le piège que ça évite.
//
// Le middleware ne limite pas le débit de cette route (elle n'est pas dans
// `sensitiveRoutes`) et ne lui demande aucune session (elle n'est pas dans
// `protectedRoutes`) : Resend peut livrer une rafale après une campagne de
// rappels, et il n'a pas de cookie.
import { NextRequest, NextResponse } from 'next/server'
import { Resend, type WebhookEventPayload } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import type { EmailBounceReason } from '@/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Un événement Resend pèse quelques kilo-octets. Au-delà, ce n'est pas Resend :
// on refuse avant même de calculer un HMAC sur le corps.
const TAILLE_MAX = 256 * 1024

// Les seuls événements qui disent « cette adresse ne reçoit plus rien ».
// `email.suppressed` s'ajoute aux deux attendus : c'est l'événement que Resend
// émet quand il REFUSE d'essayer, l'adresse étant déjà sur sa liste. Sans lui,
// une fiche créée APRÈS le premier rebond avec la même adresse fautive (même
// patient qui réserve à nouveau, secrétaire retirée puis réinvitée) ne serait
// jamais signalée.
const RAISONS: Partial<Record<WebhookEventPayload['type'], EmailBounceReason>> = {
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.suppressed': 'suppressed',
}

function texteCourt(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  // Sans secret configuré, il n'y a rien contre quoi vérifier. Accepter
  // quand même reviendrait à croire n'importe qui : une valeur absente est la
  // première qu'un attaquant essaie. On refuse explicitement, et bruyamment.
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook resend] RESEND_WEBHOOK_SECRET absent : événement refusé')
    return NextResponse.json({ error: 'Webhook non configuré' }, { status: 500 })
  }

  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'En-têtes de signature manquants' }, { status: 400 })
  }

  const annonce = Number(req.headers.get('content-length') ?? 0)
  if (annonce > TAILLE_MAX) {
    return NextResponse.json({ error: 'Corps trop volumineux' }, { status: 413 })
  }

  // Le corps BRUT, octet pour octet : c'est lui qui a été signé. Un
  // `req.json()` puis `JSON.stringify` changerait les espaces ou l'ordre des
  // clés, et une signature authentique ne correspondrait plus.
  const corps = await req.text()
  if (corps.length > TAILLE_MAX) {
    return NextResponse.json({ error: 'Corps trop volumineux' }, { status: 413 })
  }

  let evenement: WebhookEventPayload
  try {
    // Le constructeur du SDK exige une clé d'API, que verify() n'utilise pas.
    // On lui en donne une qui n'en est pas une, plutôt que la vraie : cette
    // instance-ci ne doit pouvoir QUE vérifier — jamais envoyer.
    evenement = new Resend('verification-webhook-uniquement').webhooks.verify({
      payload: corps,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    })
  } catch (e) {
    // Signature fausse, horodatage hors fenêtre, secret mal copié. On note la
    // raison (jamais le secret, jamais le corps) : un secret mal collé dans
    // Vercel se reconnaît à une série de refus sur des envois authentiques.
    console.warn('[webhook resend] signature refusée :', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  const raison = RAISONS[evenement.type]
  if (!raison) {
    // Ouverture, clic, remise… : rien à faire, mais un 2xx pour que Resend
    // n'insiste pas. Le point de terminaison ne devrait de toute façon être
    // abonné qu'aux trois événements ci-dessus.
    return NextResponse.json({ ok: true, ignore: evenement.type })
  }

  // À partir d'ici, `evenement` est l'un des trois types d'e-mail : `data`
  // porte les destinataires. Les champs sont relus défensivement — le contenu
  // est authentique, mais son format appartient à Resend et peut évoluer.
  const data = evenement.data as {
    email_id?: unknown
    to?: unknown
    bounce?: { type?: unknown; subType?: unknown; message?: unknown }
    suppressed?: { type?: unknown; message?: unknown }
  }
  const destinataires = (Array.isArray(data.to) ? data.to : [data.to])
    .filter((a): a is string => typeof a === 'string')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))
    .slice(0, 50)

  const typeRebond = texteCourt(data.bounce?.type, 40)
  const sousType = texteCourt(data.bounce?.subType ?? data.suppressed?.type, 40)
  const detail = texteCourt(data.bounce?.message ?? data.suppressed?.message, 500)

  // Un rebond TEMPORAIRE (boîte pleine, serveur momentanément indisponible)
  // ne dit pas que l'adresse est fausse : l'afficher comme « cette adresse ne
  // fonctionne pas » pousserait à corriger une adresse juste. On le journalise
  // sans marquer les fiches (raison NULL). Resend documente `email.bounced`
  // comme un refus définitif ; ce filtre ne sert que si ce n'était pas le cas.
  const temporaire = evenement.type === 'email.bounced' && typeRebond?.toLowerCase() === 'transient'

  const survenu = new Date(evenement.created_at)
  const { data: resultat, error } = await createAdminClient().rpc('enregistrer_evenement_email', {
    p_svix_id: svixId,
    p_event_type: evenement.type,
    p_email_id: texteCourt(data.email_id, 100),
    p_recipients: destinataires,
    p_reason: temporaire ? null : raison,
    p_bounce_type: typeRebond,
    p_bounce_sub: sousType,
    p_detail: detail,
    p_occurred_at: isNaN(survenu.getTime()) ? null : survenu.toISOString(),
  })

  if (error) {
    // 500 et non 200 : Resend réessaiera. Répondre 200 ici, c'est perdre le
    // rebond pour de bon — la fiche resterait muette alors que l'adresse est
    // bloquée. Cas attendu : la migration v59 n'a pas encore été lancée.
    console.error('[webhook resend] enregistrement impossible, Resend va réessayer :', error.code, error.message)
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }

  const r = (resultat ?? {}) as { deja_traite?: boolean; patients?: number; secretaires?: number }
  if (r.deja_traite) {
    return NextResponse.json({ ok: true, deja_traite: true })
  }
  if (!temporaire && destinataires.length > 0 && !r.patients && !r.secretaires) {
    // Pas une erreur — l'adresse peut appartenir au médecin lui-même, à
    // l'admin, ou avoir été corrigée entre l'envoi et le rebond — mais la
    // trace permet de le constater dans le journal plutôt que de le supposer.
    console.info(`[webhook resend] ${evenement.type} : aucune fiche ne porte cette adresse`)
  }
  return NextResponse.json({ ok: true, patients: r.patients ?? 0, secretaires: r.secretaires ?? 0 })
}
