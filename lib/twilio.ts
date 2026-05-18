// Service d'envoi de SMS via Twilio
import twilio from 'twilio'
import { formatDateShort, formatTime } from './utils'

// Initialisation du client Twilio (lazy pour éviter les erreurs en mode dev)
function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    console.warn('[Twilio] Variables d\'environnement manquantes — SMS désactivés')
    return null
  }

  return twilio(accountSid, authToken)
}

// Numéro expéditeur Twilio (ou nom alphanumérique)
const FROM = process.env.TWILIO_PHONE_NUMBER || 'MonRDV'

// Envoie un SMS de confirmation au patient
export async function sendConfirmationSMS(params: {
  to: string
  patientName: string
  doctorName: string
  date: string   // YYYY-MM-DD
  time: string   // HH:mm
  cancelToken: string
  baseUrl: string
}): Promise<boolean> {
  const client = getClient()
  if (!client) return false

  const cancelUrl = `${params.baseUrl}/api/cancel/${params.cancelToken}`
  const message =
    `✅ Bonjour ${params.patientName}, votre RDV chez ${params.doctorName} ` +
    `est confirmé le ${formatDateShort(params.date)} à ${formatTime(params.time)}.\n` +
    `Pour annuler : ${cancelUrl}`

  try {
    await client.messages.create({
      body: message,
      from: FROM,
      to: params.to,
    })
    return true
  } catch (error) {
    console.error('[Twilio] Erreur envoi confirmation:', error)
    return false
  }
}

// Envoie un rappel 24h avant le RDV
export async function sendReminderSMS(params: {
  to: string
  patientName: string
  doctorName: string
  date: string
  time: string
  cancelToken: string
  baseUrl: string
}): Promise<boolean> {
  const client = getClient()
  if (!client) return false

  const cancelUrl = `${params.baseUrl}/api/cancel/${params.cancelToken}`
  const message =
    `⏰ Rappel : votre RDV chez ${params.doctorName} est demain ` +
    `le ${formatDateShort(params.date)} à ${formatTime(params.time)}.\n` +
    `Pour annuler : ${cancelUrl}`

  try {
    await client.messages.create({
      body: message,
      from: FROM,
      to: params.to,
    })
    return true
  } catch (error) {
    console.error('[Twilio] Erreur envoi rappel:', error)
    return false
  }
}

// Envoie un SMS d'annulation au patient (par le médecin)
export async function sendCancellationSMS(params: {
  to: string
  patientName: string
  doctorName: string
  date: string
  time: string
}): Promise<boolean> {
  const client = getClient()
  if (!client) return false

  const message =
    `❌ Votre RDV chez ${params.doctorName} du ${formatDateShort(params.date)} ` +
    `à ${formatTime(params.time)} a été annulé. ` +
    `Contactez-nous pour reporter votre rendez-vous.`

  try {
    await client.messages.create({
      body: message,
      from: FROM,
      to: params.to,
    })
    return true
  } catch (error) {
    console.error('[Twilio] Erreur envoi annulation:', error)
    return false
  }
}
