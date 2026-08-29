// API : inscription d'un nouveau médecin
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminNotificationEmail, sendPendingEmail } from '@/lib/email'
import { sanitizeString, sanitizeEmail, sanitizeSlug, sanitizePhone, isValidEmail, isValidSlug } from '@/lib/sanitize'

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const name        = sanitizeString(formData.get('name'))
  const email       = sanitizeEmail(formData.get('email'))
  const password    = formData.get('password') as string
  const specialty   = sanitizeString(formData.get('specialty'))
  const phone       = sanitizePhone(formData.get('phone'))
  const city        = sanitizeString(formData.get('city'))
  const slug        = sanitizeSlug(formData.get('slug'))
  const cnom_number = sanitizeString(formData.get('cnom_number'))

  // Le forfait n'est pas demandé à l'inscription : la colonne `plan` démarre à
  // 'agenda' (défaut SQL). Le passage au Cabinet complet se fait ensuite depuis
  // Abonnement (demande du médecin, confirmée par l'admin après paiement).

  // Code délégué (facultatif) : normalisé en MAJUSCULES sans espaces pour que
  // « adham 01 » et « ADHAM01 » soient comptés comme le même délégué.
  const referral_code =
    sanitizeString(formData.get('referral_code')).toUpperCase().replace(/\s+/g, '').slice(0, 20) || null

  // Le médecin déclare seulement qu'il a une secrétaire ; le compte se crée
  // depuis « Mon équipe », après validation du cabinet. Cette route étant
  // publique et non authentifiée, y créer un compte d'authentification sur une
  // adresse tierce, avec un mot de passe fourni dans la requête et marqué comme
  // vérifié, permettait de squatter l'adresse e-mail de n'importe qui.
  const withSecretary = formData.get('has_secretary') === '1'

  // Validation stricte
  // Le CNOM n'est pas exigé : les psychologues, kinésithérapeutes et autres
  // professions non médicales n'en ont pas.
  if (!name || !email || !password || !specialty || !slug || !city) {
    return NextResponse.json({ error: 'Tous les champs obligatoires doivent être remplis (dont la ville)' }, { status: 400 })
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'URL invalide (lettres, chiffres et tirets uniquement)' }, { status: 400 })
  }

  // Slugs réservés : ces adresses correspondent à des pages du site
  const RESERVED_SLUGS = [
    'login', 'admin', 'api', 'inscription', 'recherche', 'patient', 'patients',
    'dashboard', 'appointments', 'settings', 'abonnement', 'factures', 'facture',
    'statistiques', 'equipe', 'cabinet', 'cgu', 'politique-confidentialite',
    'annuler', 'cancel-result', 'choisir', 'medecin', 'dossier', 'ordonnance',
    'avoir', 'reset-password', 'forgot-password', 'sitemap', 'robots', 'favicon',
  ]
  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return NextResponse.json({ error: 'Cette URL est réservée, choisissez-en une autre (ex : votre nom)' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 8 caractères' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Vérifie que le slug n'est pas déjà pris
  const { data: existingSlug } = await supabase
    .from('doctors')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existingSlug) {
    return NextResponse.json({ error: 'Cette URL est déjà utilisée, choisissez-en une autre' }, { status: 409 })
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
      cnom_number: cnom_number || null,
      status: 'pending',
      appointment_duration: 30,
      has_secretary: withSecretary,
      referral_code,
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
