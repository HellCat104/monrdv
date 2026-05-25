// API : inscription d'un nouveau médecin avec upload de document
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminNotificationEmail } from '@/lib/email'
import { sanitizeString, sanitizeEmail, sanitizeSlug, sanitizePhone, isValidEmail, isValidSlug } from '@/lib/sanitize'

export async function POST(req: NextRequest) {
  const formData = await req.formData()

  const name      = sanitizeString(formData.get('name'))
  const email     = sanitizeEmail(formData.get('email'))
  const password  = formData.get('password') as string
  const specialty = sanitizeString(formData.get('specialty'))
  const phone     = sanitizePhone(formData.get('phone'))
  const city      = sanitizeString(formData.get('city'))
  const slug      = sanitizeSlug(formData.get('slug'))
  const document  = formData.get('document') as File | null

  // Validation stricte
  if (!name || !email || !password || !specialty || !slug || !document) {
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

  if (document.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Le fichier dépasse 5 MB' }, { status: 400 })
  }

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
  if (!allowedTypes.includes(document.type)) {
    return NextResponse.json({ error: 'Format de fichier non autorisé (PDF, JPG, PNG uniquement)' }, { status: 400 })
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
    email_confirm: true, // confirme automatiquement l'email
  })

  if (authError || !authData.user) {
    if (authError?.message.includes('already registered')) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
    }
    return NextResponse.json({ error: authError?.message || 'Erreur création compte' }, { status: 500 })
  }

  // Upload le document dans Supabase Storage
  let documentUrl = null
  try {
    const fileExt = document.name.split('.').pop()
    const fileName = `${authData.user.id}-${Date.now()}.${fileExt}`
    const arrayBuffer = await document.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('doctor-documents')
      .upload(fileName, buffer, {
        contentType: document.type,
        upsert: false,
      })

    if (!uploadError && uploadData) {
      const { data: urlData } = supabase.storage
        .from('doctor-documents')
        .getPublicUrl(fileName)
      documentUrl = urlData.publicUrl
    }
  } catch (uploadErr) {
    console.error('[Upload] Erreur:', uploadErr)
    // Continue même si l'upload échoue — l'admin pourra demander le document manuellement
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
      status: 'pending',
      document_url: documentUrl,
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
