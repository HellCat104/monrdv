// API : demande de réinitialisation de mot de passe
// Génère un lien de récupération via l'API admin Supabase, puis l'envoie
// par Resend (chemin fiable) au lieu du SMTP Supabase (capricieux).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPasswordResetEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  let email = ''
  try {
    const body = await req.json()
    email = String(body.email ?? '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.monrdv.co.ma'
  const supabase = createAdminClient()

  // Génère un lien de récupération officiel Supabase (sans envoyer d'email côté Supabase)
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/reset-password` },
  })

  // Si le compte n'existe pas (ou autre erreur), on renvoie quand même un succès
  // générique — on ne révèle jamais si un email est enregistré (sécurité).
  if (!error && data?.properties?.action_link) {
    await sendPasswordResetEmail({ to: email, resetUrl: data.properties.action_link })
      .catch((err) => console.error('[Reset] envoi email:', err))
  } else if (error) {
    console.error('[Reset] generateLink:', error.message)
  }

  return NextResponse.json({ success: true })
}
