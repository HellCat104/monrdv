// API : inscription d'un nouveau médecin
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminNotificationEmail } from '@/lib/email'
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

  // Validation stricte
  if (!name || !email || !password || !specialty || !slug || !cnom_number) {
    return NextResponse.json({ error: 'Tous les champs obligatoires doivent être remplis' }, { status: 400 })
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'URL invalide (lettres, chiffres et tirets uniquement)' }, { status: 400 })
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
  const { error: doctorError } = await supabase
    .from('doctors')
    .insert({
      name,
      email,
      specialty,
      phone: phone || null,
      city: city || null,
      slug,
      cnom_number,
      status: 'pending',
      appointment_duration: 30,
    })

  if (doctorError) {
    // Supprime le compte Auth si l'insertion échoue
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Erreur lors de la création du profil' }, { status: 500 })
  }

  // Notifie l'admin par email
  sendAdminNotificationEmail({ doctorName: name, doctorEmail: email, specialty })
    .catch((err) => console.error('[Email admin]', err))

  return NextResponse.json({ success: true }, { status: 201 })
}
