// API : inscription d'un nouveau médecin
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminNotificationEmail, sendPendingEmail } from '@/lib/email'
import { sanitizeString, sanitizeEmail, sanitizePhone, isValidEmail, isValidSlug } from '@/lib/sanitize'

// Adresses qui correspondent à des pages du site : aucune page de médecin ne
// peut les occuper. Le préfixe « dr- » les met déjà hors d'atteinte, mais la
// liste reste la garantie si le préfixe change un jour.
const RESERVED_SLUGS = [
  'login', 'admin', 'api', 'inscription', 'recherche', 'patient', 'patients',
  'dashboard', 'appointments', 'settings', 'abonnement', 'factures', 'facture',
  'statistiques', 'equipe', 'cabinet', 'cgu', 'politique-confidentialite',
  'annuler', 'cancel-result', 'choisir', 'medecin', 'dossier', 'ordonnance',
  'avoir', 'reset-password', 'forgot-password', 'sitemap', 'robots', 'favicon',
]

/** « Dr. Hassan Alami » → « hassan-alami ».
 *
 *  Le « dr- » n'est PAS dans le slug stocké : l'adresse publique s'écrit
 *  `/dr-${slug}` partout dans le site, et un slug qui le porte déjà donne
 *  `/dr-dr-hassan-alami` — le défaut que `app/[slug]/page.tsx` doit rattraper
 *  par une redirection. D'où le retrait des titres écrits dans le nom. */
function slugDepuisNom(nom: string): string {
  const base = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(dr|docteur|pr|professeur)\b\.?/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Un nom entièrement en arabe ne laisse rien après ce filtrage : plutôt
  // qu'une adresse vide, un mot générique que le numéro distinguera.
  return (base || 'medecin').slice(0, 80).replace(/-+$/, '')
}

/** La première adresse libre à partir du nom : `hassan-alami`, puis
 *  `hassan-alami-2`, `-3`… Renvoie null si même 50 variantes sont prises,
 *  ce qui signalerait tout autre chose qu'un homonyme. */
async function slugLibre(
  supabase: ReturnType<typeof createAdminClient>,
  nom: string,
): Promise<string | null> {
  const base = slugDepuisNom(nom)
  for (let n = 1; n <= 50; n++) {
    const candidat = n === 1 ? base : `${base}-${n}`
    if (!isValidSlug(candidat) || RESERVED_SLUGS.includes(candidat)) continue
    const { data } = await supabase.from('doctors').select('id').eq('slug', candidat).maybeSingle()
    if (!data) return candidat
  }
  return null
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const name        = sanitizeString(formData.get('name'))
  const email       = sanitizeEmail(formData.get('email'))
  const password    = formData.get('password') as string
  const specialty   = sanitizeString(formData.get('specialty'))
  const phone       = sanitizePhone(formData.get('phone'))
  const city        = sanitizeString(formData.get('city'))
  // Ni l'adresse de la page ni le n° d'Ordre ne sont demandés à l'inscription :
  // l'adresse se déduit du nom, et le CNOM est réclamé sur le tableau de bord,
  // là où le médecin a le temps d'aller le chercher. Un formulaire d'entrée
  // qui pose huit questions se remplit moins souvent qu'un qui en pose cinq.

  // Le forfait n'est pas demandé à l'inscription : la colonne `plan` démarre à
  // 'agenda' (défaut SQL). Le passage au Cabinet complet se fait ensuite depuis
  // Abonnement (demande du médecin, confirmée par l'admin après paiement).

  // Ni le code délégué ni la secrétaire ne sont demandés ici. « Mon équipe »
  // est désormais toujours dans le menu : le médecin déclare sa secrétaire
  // quand il en a une, depuis cette page, et la colonne `has_secretary` garde
  // sa valeur par défaut (false) jusque-là.

  // Validation stricte
  // Le CNOM n'est pas exigé : les psychologues, kinésithérapeutes et autres
  // professions non médicales n'en ont pas.
  if (!name || !email || !password || !specialty || !city) {
    return NextResponse.json({ error: 'Tous les champs obligatoires doivent être remplis (dont la ville)' }, { status: 400 })
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // L'adresse publique, fabriquée à partir du nom : monrdv.co.ma/dr-hassan-alami.
  // Deux Hassan Alami existent : le second reçoit `-2`. On ne demande rien, et on
  // ne refuse jamais une inscription pour une adresse déjà prise — ce refus-là
  // arrivait après que tout le formulaire était rempli.
  const slug = await slugLibre(supabase, name)
  if (!slug) {
    return NextResponse.json({ error: 'Impossible de créer votre adresse. Contactez-nous.' }, { status: 500 })
  }

  // Crée le compte Auth Supabase
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    if (authError?.message.includes('already registered')) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
    }
    return NextResponse.json({ error: authError?.message || 'Erreur création compte' }, { status: 500 })
  }

  // Insère le médecin avec statut 'pending'
  const { data: newDoctor, error: doctorError } = await supabase
    .from('doctors')
    .insert({
      name,
      email,
      specialty,
      specialties: [specialty],
      phone: phone || null,
      city: city || null,
      slug,
      status: 'pending',
      appointment_duration: 30,
    })
    .select('id')
    .single()

  if (doctorError || !newDoctor) {
    // Supprime le compte Auth si l'insertion échoue
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Erreur lors de la création du profil' }, { status: 500 })
  }


  // Emails — AWAIT obligatoire en serverless (sinon tués avant l'envoi)
  await Promise.allSettled([
    // Notifie l'admin par email
    sendAdminNotificationEmail({ doctorName: name, doctorEmail: email, specialty })
      .catch((err) => console.error('[Email admin]', err)),
    // Email de bienvenue au médecin (en attente de validation)
    sendPendingEmail({ to: email, doctorName: name })
      .catch((err) => console.error('[Email pending]', err)),
  ])

  return NextResponse.json({ success: true }, { status: 201 })
}
