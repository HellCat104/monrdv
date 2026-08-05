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

  // Forfait choisi à l'inscription (défaut : Agenda, le moins engageant)
  const plan = formData.get('plan') === 'complet' ? 'complet' : 'agenda'

  // Secrétaire (facultatif — « Avez-vous une secrétaire médicale ? »)
  const secName     = sanitizeString(formData.get('secretary_name'))
  const secEmail    = sanitizeEmail(formData.get('secretary_email'))
  const secPassword = (formData.get('secretary_password') as string) || ''
  const withSecretary = !!(secName && secEmail)

  // Validation stricte
  if (!name || !email || !password || !specialty || !slug || !cnom_number || !city) {
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

  if (withSecretary) {
    if (!isValidEmail(secEmail)) {
      return NextResponse.json({ error: 'E-mail de la secrétaire invalide' }, { status: 400 })
    }
    if (secEmail.toLowerCase() === email.toLowerCase()) {
      return NextResponse.json({ error: 'La secrétaire doit avoir un e-mail différent du vôtre' }, { status: 400 })
    }
    if (secPassword.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe de la secrétaire doit contenir au moins 8 caractères' }, { status: 400 })
    }
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
      cnom_number,
      status: 'pending',
      appointment_duration: 30,
      has_secretary: withSecretary,
      plan,
    })
    .select('id')
    .single()

  if (doctorError || !newDoctor) {
    // Supprime le compte Auth si l'insertion échoue
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Erreur lors de la création du profil' }, { status: 500 })
  }

  // Crée le compte de la secrétaire (identifiants distincts, lié au cabinet).
  // Non bloquant : si son e-mail est déjà pris, l'inscription du médecin reste
  // valide — il pourra la réinviter depuis « Mon équipe ».
  let secretaryWarning: string | null = null
  if (withSecretary) {
    const { error: secAuthErr } = await supabase.auth.admin.createUser({
      email: secEmail,
      password: secPassword,
      email_confirm: true,
      user_metadata: { role: 'staff', name: secName },
    })
    if (secAuthErr && !/already|registered|exists/i.test(secAuthErr.message || '')) {
      secretaryWarning = 'Le compte de la secrétaire n\'a pas pu être créé — vous pourrez l\'inviter depuis « Mon équipe ».'
    } else {
      const { error: staffErr } = await supabase.from('cabinet_staff').insert({
        doctor_id: newDoctor.id,
        email: secEmail.toLowerCase(),
        name: secName,
        // permissions par défaut : agenda + accueil (défini côté DB)
      })
      if (staffErr) {
        secretaryWarning = 'Le compte de la secrétaire n\'a pas pu être lié — vous pourrez l\'inviter depuis « Mon équipe ».'
      }
    }
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

  return NextResponse.json({ success: true, secretaryWarning }, { status: 201 })
}
