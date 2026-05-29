// API : retourne le rôle de l'utilisateur connecté (server-side, sans exposer ADMIN_EMAIL)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ isAdmin: false, isDoctor: false }, { status: 401 })
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  return NextResponse.json({ isAdmin, userId: user.id })
}
