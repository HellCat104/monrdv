// Fichier calendrier d'un rendez-vous : le patient tape, le RDV entre dans
// l'agenda de son téléphone, et SON téléphone le rappelle.
//
// POURQUOI CETTE ROUTE EXISTE
// Les rappels WhatsApp sont payants (message initié par nous, hors fenêtre de
// 24 h) et hors périmètre pour l'instant. Le rappel email, lui, ignore les
// patients sans email — et une réservation WhatsApp n'en a pas. Sans parade,
// un RDV pris par chatbot n'aurait AUCUN rappel, alors que l'absentéisme est
// le premier problème du cabinet. Celle-ci ne coûte rien, ne dépend d'aucun
// email, et vaut mieux qu'un rappel que le patient peut rater.
//
// Le jeton d'annulation sert de clé d'accès : il est déjà secret, déjà unique,
// déjà transmis au patient, et il n'ouvre rien de plus que ce que la page
// /annuler montre. Pas de nouvelle surface à sécuriser.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/** Échappe les caractères réservés d'iCalendar (RFC 5545). Sans ça, une
 *  adresse contenant une virgule casse le reste de la ligne. */
function echapper(valeur: string): string {
  return valeur.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function horodatage(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.slice(0, 5).replace(':', '')}00`
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const { data: rdv } = await supabase
    .from('appointments')
    .select('date, time, duration_minutes, status, doctor:doctors(name, address, phone, appointment_duration)')
    .eq('cancel_token', params.token)
    .maybeSingle()

  if (!rdv || rdv.status === 'cancelled') {
    return NextResponse.json({ error: 'Rendez-vous introuvable' }, { status: 404 })
  }

  const medecin = (rdv.doctor as { name?: string; address?: string; phone?: string; appointment_duration?: number } | null) ?? {}
  const date = String(rdv.date).slice(0, 10)
  const debut = String(rdv.time).slice(0, 5)
  const duree = rdv.duration_minutes || medecin.appointment_duration || 30

  const [h, m] = debut.split(':').map(Number)
  const finMinutes = h * 60 + m + duree
  const fin = `${String(Math.floor(finMinutes / 60) % 24).padStart(2, '0')}:${String(finMinutes % 60).padStart(2, '0')}`

  // HEURE FLOTTANTE, volontairement : pas de « Z », pas de TZID. Le Maroc est
  // à UTC+1 en permanence MAIS repasse à UTC+0 pendant le Ramadan — convertir
  // en UTC obligerait à embarquer ces bascules, et un décalage d'une heure sur
  // un rendez-vous médical est pire que pas de rappel du tout. Une heure
  // flottante s'affiche « 15:00 » sur le téléphone du patient, qui est au
  // Maroc. C'est exactement ce qu'on veut dire.
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MonRDV//Rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.token}@monrdv.co.ma`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${horodatage(date, debut)}`,
    `DTEND:${horodatage(date, fin)}`,
    `SUMMARY:${echapper(`Rendez-vous — ${medecin.name ?? 'cabinet médical'}`)}`,
    ...(medecin.address ? [`LOCATION:${echapper(medecin.address)}`] : []),
    // Aucun élément clinique : le motif ne figure pas dans un fichier qui peut
    // se retrouver dans un agenda partagé.
    `DESCRIPTION:${echapper(medecin.phone ? `Cabinet : ${medecin.phone}` : 'Pris via MonRDV')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${echapper('Rappel : rendez-vous demain')}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${echapper('Rendez-vous dans 2 heures')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rendez-vous.ics"',
      'Cache-Control': 'private, no-store',
    },
  })
}
