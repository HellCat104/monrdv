// Service d'envoi d'emails via Resend
import { Resend } from 'resend'
import { formatDateFr, formatTime } from '@/lib/utils'

function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY manquant — emails désactivés')
    return null
  }
  return new Resend(apiKey)
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'MonRDV <noreply@monrdv.co.ma>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Échappe les caractères HTML pour éviter les XSS dans les emails
function h(s: string | undefined | null): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Email envoyé au médecin juste après son inscription (en attente de validation)
/**
 * Borne un envoi d'e-mail dans le temps.
 *
 * En serverless une promesse non attendue est tuée avec la fonction : il faut
 * donc attendre l'envoi. Mais sans limite, une API d'e-mail lente bloque la
 * réponse HTTP — l'utilisateur voit l'application « ramer ». On plafonne
 * l'attente : passé ce délai on rend la main, l'envoi se terminera ou non.
 */
export async function sendWithTimeout<T>(task: Promise<T>, label: string, ms = 4000): Promise<void> {
  await Promise.race([
    task,
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]).catch((err) => console.error(`[Email] ${label}:`, err))
}

export async function sendPendingEmail(params: {
  to: string
  doctorName: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: '⏳ Votre compte MonRDV a bien été créé',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MonRDV 🇲🇦</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827;">Bienvenue Dr. ${h(params.doctorName)} !</h2>
            <p style="color: #6b7280;">Votre compte a bien été créé. Notre équipe va vérifier votre dossier et activer votre compte dans les plus brefs délais.</p>
            <div style="background: #fef9c3; border-left: 4px solid #eab308; padding: 16px 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">⏳ Votre compte est en cours de validation. Vous recevrez un email dès qu'il sera activé.</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">En attendant, vous pouvez vous connecter et configurer votre profil (horaires, spécialité, adresse).</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${APP_URL}/login"
                style="background: #0EA5E9; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Accéder à mon espace
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              MonRDV — Prise de rendez-vous médicaux au Maroc
            </p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur email pending:', error)
    return false
  }
}

// Email envoyé au médecin quand son compte est approuvé
export async function sendApprovalEmail(params: {
  to: string
  doctorName: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: '✅ Votre compte MonRDV a été approuvé',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MonRDV 🇲🇦</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827;">Bienvenue Dr. ${h(params.doctorName)} !</h2>
            <p style="color: #6b7280;">Votre compte a été <strong style="color: #16a34a;">approuvé</strong> par notre équipe.</p>
            <p style="color: #6b7280;">Vous pouvez maintenant vous connecter à votre tableau de bord et commencer à recevoir des rendez-vous en ligne.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${APP_URL}/login"
                style="background: #0EA5E9; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Accéder à mon dashboard
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              MonRDV — Prise de rendez-vous médicaux au Maroc
            </p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur approbation:', error)
    return false
  }
}

// Email envoyé au médecin quand son compte est refusé
export async function sendRejectionEmail(params: {
  to: string
  doctorName: string
  reason?: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: 'Votre demande d\'inscription MonRDV',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MonRDV 🇲🇦</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827;">Dr. ${h(params.doctorName)},</h2>
            <p style="color: #6b7280;">Votre demande d'inscription n'a pas pu être approuvée.</p>
            ${params.reason ? `<p style="color: #6b7280;"><strong>Motif :</strong> ${h(params.reason)}</p>` : ''}
            <p style="color: #6b7280;">Vous pouvez soumettre une nouvelle demande avec les documents requis.</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${APP_URL}/inscription"
                style="background: #6b7280; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Soumettre à nouveau
              </a>
            </div>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur refus:', error)
    return false
  }
}

// Email de confirmation envoyé au patient après réservation
export async function sendAppointmentConfirmationToPatient(params: {
  patientEmail: string
  patientName: string
  doctorName: string
  specialty: string
  date: string
  time: string
  cancelToken: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const cancelUrl = `${APP_URL}/annuler/${encodeURIComponent(params.cancelToken)}`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.patientEmail,
      subject: `✅ Votre RDV avec Dr. ${params.doctorName} est confirmé`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Rendez-vous confirmé ✅</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
            <p style="color: #374151;">Votre rendez-vous est bien confirmé :</p>
            <div style="background: #f0f9ff; border-left: 4px solid #0EA5E9; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 4px 0; color: #374151;"><strong>Médecin :</strong> Dr. ${h(params.doctorName)} — ${h(params.specialty)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Date :</strong> ${h(params.date)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Heure :</strong> ${h(params.time)}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Vous recevrez un rappel par email la veille de votre rendez-vous.</p>
            <p style="text-align: center; margin: 28px 0;">
              <a href="${cancelUrl}" style="color: #ef4444; font-size: 13px;">Annuler ce rendez-vous</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur confirmation patient:', error)
    return false
  }
}

// Email de rappel envoyé au patient la veille du RDV
export async function sendReminderEmailToPatient(params: {
  patientEmail: string
  patientName: string
  doctorName: string
  specialty: string
  date: string
  time: string
  cancelToken: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const cancelUrl = `${APP_URL}/annuler/${encodeURIComponent(params.cancelToken)}`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.patientEmail,
      subject: `⏰ Rappel — Votre RDV demain avec Dr. ${params.doctorName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Rappel de rendez-vous ⏰</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
            <p style="color: #374151;">Nous vous rappelons que vous avez un rendez-vous <strong>demain</strong> :</p>
            <div style="background: #f0f9ff; border-left: 4px solid #0EA5E9; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 4px 0; color: #374151;"><strong>Médecin :</strong> Dr. ${h(params.doctorName)} — ${h(params.specialty)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Date :</strong> ${h(params.date)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Heure :</strong> ${h(params.time)}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Si vous ne pouvez pas vous présenter, merci d'annuler votre rendez-vous.</p>
            <p style="text-align: center; margin: 28px 0;">
              <a href="${cancelUrl}" style="color: #ef4444; font-size: 13px;">Annuler ce rendez-vous</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur rappel patient:', error)
    return false
  }
}

// Email de rappel de suivi ("il est temps de reprendre rendez-vous")
export async function sendRecallEmailToPatient(params: {
  patientEmail: string
  patientName: string
  doctorName: string
  specialty: string
  reason?: string | null
  bookingUrl: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.patientEmail,
      subject: `Suivi médical — Reprenez rendez-vous avec Dr. ${params.doctorName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Il est temps de votre suivi</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
            <p style="color: #374151;">Dr. ${h(params.doctorName)} (${h(params.specialty)}) vous invite à reprendre rendez-vous pour votre suivi.</p>
            ${params.reason ? `<div style="background: #f0f9ff; border-left: 4px solid #0EA5E9; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;"><p style="margin: 0; color: #374151;"><strong>Motif :</strong> ${h(params.reason)}</p></div>` : ''}
            <p style="text-align: center; margin: 28px 0;">
              <a href="${params.bookingUrl}" style="background: #0EA5E9; color: white; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-weight: bold; display: inline-block;">Prendre rendez-vous</a>
            </p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur rappel de suivi:', error)
    return false
  }
}

// Email récapitulatif du jour envoyé au médecin chaque matin
export async function sendDailyAgendaToDoctor(params: {
  doctorEmail: string
  doctorName: string
  date: string
  // `notes` (le motif saisi par le patient) est volontairement absent : voir
  // le commentaire du tableau ci-dessous.
  appointments: { time: string; patientName: string; phone: string }[]
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const hasAppointments = params.appointments.length > 0

  // Le motif de consultation est une donnée de santé. L'envoyer par e-mail,
  // pour tous les patients du jour, à travers un prestataire tiers, et le
  // laisser résider durablement dans la boîte du médecin, dépasse ce qu'exige
  // un rappel d'agenda. Il reste consultable dans l'application, qui est le
  // lieu prévu pour ça.
  const appointmentsHtml = hasAppointments
    ? `
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <thead>
          <tr style="background:#f0f9ff;">
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Heure</th>
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Patient</th>
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Téléphone</th>
          </tr>
        </thead>
        <tbody>
          ${params.appointments.map((apt, i) => `
            <tr style="background:${i % 2 === 0 ? 'white' : '#f9fafb'};">
              <td style="padding:10px 14px; font-weight:bold; color:#374151;">${h(apt.time)}</td>
              <td style="padding:10px 14px; color:#374151;">${h(apt.patientName)}</td>
              <td style="padding:10px 14px; color:#374151;">${h(apt.phone)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : `<div style="background:#f9fafb; border-radius:10px; padding:20px; text-align:center; margin:16px 0; color:#6b7280;">
        Aucun rendez-vous prévu aujourd'hui.
       </div>`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.doctorEmail,
      subject: hasAppointments
        ? `📅 Votre agenda du ${params.date} — ${params.appointments.length} RDV`
        : `📅 Votre agenda du ${params.date} — Pas de RDV`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Agenda du jour 📅</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour Dr. ${h(params.doctorName)},</p>
            <p style="color: #374151;">Voici votre agenda pour le <strong>${h(params.date)}</strong> :</p>
            ${appointmentsHtml}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${APP_URL}/appointments"
                style="background: #0EA5E9; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
                Voir mon agenda complet
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur agenda quotidien:', error)
    return false
  }
}

// Email envoyé au patient quand son RDV est annulé
export async function sendCancellationEmailToPatient(params: {
  patientEmail: string
  patientName: string
  doctorName: string
  specialty: string
  date: string
  time: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.patientEmail,
      subject: `❌ Votre RDV avec Dr. ${params.doctorName} a été annulé`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #ef4444; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Rendez-vous annulé ❌</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
            <p style="color: #374151;">Votre rendez-vous a été annulé :</p>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 4px 0; color: #374151;"><strong>Médecin :</strong> Dr. ${h(params.doctorName)} — ${h(params.specialty)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Date :</strong> ${h(params.date)}</p>
              <p style="margin: 4px 0; color: #374151;"><strong>Heure :</strong> ${h(params.time)}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Si vous souhaitez reprendre rendez-vous, vous pouvez réserver directement en ligne.</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${APP_URL}" style="background: #0EA5E9; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
                Prendre un nouveau RDV
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur annulation patient:', error)
    return false
  }
}

// Email envoyé au patient quand son RDV est déplacé (par le médecin ou la
// secrétaire). L'ancien créneau est rappelé pour lever toute ambiguïté, et le
// lien d'annulation reste valable : le jeton ne change pas lors d'un
// déplacement.
export async function sendRescheduleEmailToPatient(params: {
  patientEmail: string
  patientName: string
  doctorName: string          // déjà préfixé « Dr. » si la profession le justifie
  specialty: string
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
  cancelToken?: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const cancelBlock = params.cancelToken
    ? `<p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 18px;">
         Ce créneau ne vous convient pas ?
         <a href="${APP_URL}/annuler/${encodeURIComponent(params.cancelToken)}" style="color: #0EA5E9;">Annuler le rendez-vous</a>
       </p>`
    : ''

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.patientEmail,
      subject: `🗓️ Votre RDV a été déplacé au ${params.newDate} à ${params.newTime}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Rendez-vous déplacé 🗓️</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
            <p style="color: #374151;">Votre rendez-vous avec ${h(params.doctorName)} — ${h(params.specialty)} a été déplacé.</p>

            <div style="background: #f9fafb; border-left: 4px solid #d1d5db; padding: 12px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 2px 0; color: #9ca3af; font-size: 13px;">Ancien créneau</p>
              <p style="margin: 2px 0; color: #6b7280; text-decoration: line-through;">${h(params.oldDate)} à ${h(params.oldTime)}</p>
            </div>

            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 2px 0; color: #047857; font-size: 13px; font-weight: bold;">NOUVEAU CRÉNEAU</p>
              <p style="margin: 4px 0; color: #065f46; font-size: 18px; font-weight: bold;">${h(params.newDate)} à ${h(params.newTime)}</p>
            </div>

            <p style="color: #6b7280; font-size: 14px;">Merci de noter ce changement. Un rappel vous sera envoyé la veille.</p>
            ${cancelBlock}
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 20px;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur déplacement patient:', error)
    return false
  }
}

// Email envoyé au médecin quand un patient annule son RDV
export async function sendCancellationEmailToDoctor(params: {
  doctorEmail: string
  doctorName: string
  patientName: string
  patientPhone: string
  date: string
  time: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.doctorEmail,
      subject: `❌ Annulation RDV — ${params.patientName} le ${params.date} à ${params.time}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #ef4444; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Annulation de rendez-vous ❌</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour Dr. ${h(params.doctorName)},</p>
            <p style="color: #374151;">Un patient a annulé son rendez-vous :</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #fef2f2;"><td style="padding: 10px 14px; font-weight: bold; color: #dc2626;">Patient</td><td style="padding: 10px 14px;">${h(params.patientName)}</td></tr>
              <tr><td style="padding: 10px 14px; font-weight: bold; color: #374151;">Téléphone</td><td style="padding: 10px 14px;">${h(params.patientPhone)}</td></tr>
              <tr style="background: #fef2f2;"><td style="padding: 10px 14px; font-weight: bold; color: #dc2626;">Date</td><td style="padding: 10px 14px;">${h(params.date)}</td></tr>
              <tr><td style="padding: 10px 14px; font-weight: bold; color: #374151;">Heure</td><td style="padding: 10px 14px;">${h(params.time)}</td></tr>
            </table>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${APP_URL}/appointments" style="background: #0EA5E9; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Voir mon agenda
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur annulation médecin:', error)
    return false
  }
}

// Email de notification à l'admin quand un nouveau médecin s'inscrit
export async function sendAdminNotificationEmail(params: {
  doctorName: string
  doctorEmail: string
  specialty: string
}): Promise<boolean> {
  const resend = getResend()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!resend || !adminEmail) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `🔔 Nouvelle inscription médecin : Dr. ${params.doctorName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0;">Nouvelle inscription</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p><strong>Nom :</strong> Dr. ${h(params.doctorName)}</p>
            <p><strong>Email :</strong> ${h(params.doctorEmail)}</p>
            <p><strong>Spécialité :</strong> ${h(params.specialty)}</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${APP_URL}/admin"
                style="background: #0EA5E9; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                Voir le dashboard admin
              </a>
            </div>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur notification admin:', error)
    return false
  }
}

// Email de réinitialisation de mot de passe (envoyé via Resend, pas via Supabase SMTP)
export async function sendPasswordResetEmail(params: {
  to: string
  resetUrl: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: '🔑 Réinitialisation de votre mot de passe MonRDV',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Réinitialisation du mot de passe 🔑</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour,</p>
            <p style="color: #374151;">Vous avez demandé à réinitialiser votre mot de passe MonRDV. Cliquez sur le bouton ci-dessous pour en créer un nouveau :</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${params.resetUrl}"
                style="background: #0EA5E9; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Créer un nouveau mot de passe
              </a>
            </div>
            <p style="color: #6b7280; font-size: 13px;">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.</p>
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur reset mot de passe:', error)
    return false
  }
}

// Email d'invitation d'une secrétaire (personnel du cabinet).
// tempPassword = mot de passe provisoire si le compte vient d'être créé.
export async function sendStaffInviteEmail(params: {
  to: string
  staffName: string
  doctorName: string
  tempPassword?: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `Vous avez été ajouté(e) à l'équipe du Dr. ${params.doctorName} sur MonRDV`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">MonRDV 🇲🇦</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <h2 style="color: #111827;">Bonjour ${h(params.staffName)},</h2>
            <p style="color: #6b7280;">Le <strong>Dr. ${h(params.doctorName)}</strong> vous a ajouté(e) comme secrétaire de son cabinet sur MonRDV.</p>
            ${params.tempPassword ? `
            <p style="color: #6b7280;">Voici vos identifiants de connexion :</p>
            <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:12px 0;font-size:15px;">
              <div style="color:#111827;">E-mail : <strong>${h(params.to)}</strong></div>
              <div style="color:#111827;">Mot de passe provisoire : <strong>${h(params.tempPassword)}</strong></div>
            </div>
            <p style="color:#9ca3af;font-size:13px;">Vous pourrez le modifier après connexion.</p>
            ` : `
            <p style="color: #6b7280;">Connectez-vous avec l'e-mail <strong>${h(params.to)}</strong> et votre mot de passe habituel.</p>
            `}
            <div style="text-align: center; margin: 32px 0;">
              <a href="${APP_URL}/login"
                style="background: #0EA5E9; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Me connecter
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
              MonRDV — Espace cabinet
            </p>
          </div>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('[Email] Erreur invitation secrétaire:', error)
    return false
  }
}

// ── Liste d'attente (v56) ────────────────────────────────────────────────────
//
// Trois différences volontaires avec les e-mails ci-dessus :
//
//  1. Les dates sont formatées ICI (« jeudi 10 septembre 2026 à 10:00 »), avec
//     les formateurs de lib/utils. Les e-mails plus anciens affichent la date
//     brute de la base (« 2026-09-10 ») : un patient qui lit ça sur son
//     téléphone doit la décoder, et c'est précisément le message où une
//     confusion de jour coûte un rendez-vous.
//  2. `doctorName` arrive DÉJÀ préfixé (displayName) : « Dr. » n'est pas écrit
//     en dur, un kinésithérapeute ou un psychologue n'est pas docteur.
//  3. Le retour de Resend est VÉRIFIÉ. Depuis sa v2 le SDK ne lève pas
//     d'exception sur un refus de l'API : il renvoie `{ error }`. Les fonctions
//     plus anciennes répondent donc `true` sur un e-mail jamais parti. Ici, un
//     refus est journalisé et remonte `false` — la liste d'attente compte les
//     offres réellement envoyées, pas celles qu'on a cru envoyer.

/** « jeudi 10 septembre 2026 à 10:00 » — date de calendrier + heure, jamais de fuseau. */
function quandLisible(date: string, time: string): string {
  return `${formatDateFr(date)} à ${formatTime(String(time))}`
}

async function envoyerVerifie(
  label: string,
  message: { to: string; subject: string; html: string },
): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false
  try {
    const { error } = await resend.emails.send({ from: FROM_EMAIL, ...message })
    if (error) {
      console.error(`[Email] ${label} refusé par Resend :`, error.message ?? error)
      return false
    }
    return true
  } catch (error) {
    console.error(`[Email] ${label} :`, error)
    return false
  }
}

// Offre : « une place s'est libérée plus tôt ». Envoyée à tous les candidats
// éligibles en même temps ; le premier qui clique l'obtient.
export async function sendWaitlistOfferEmail(params: {
  patientEmail: string
  patientName: string
  doctorName: string          // déjà préfixé « Dr. » si la profession le justifie
  specialty: string
  offeredDate: string         // YYYY-MM-DD
  offeredTime: string
  currentDate: string         // le rendez-vous qu'il a déjà
  currentTime: string
  offerToken: string
}): Promise<boolean> {
  const url = `${APP_URL}/creneau/${encodeURIComponent(params.offerToken)}`
  const propose = quandLisible(params.offeredDate, params.offeredTime)
  const actuel = quandLisible(params.currentDate, params.currentTime)

  return envoyerVerifie('offre liste d\'attente', {
    to: params.patientEmail,
    subject: `🕐 Une place plus tôt chez ${params.doctorName} : ${propose}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Une place s'est libérée plus tôt 🕐</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
          <p style="color: #374151;">Vous avez demandé à être prévenu(e) si un créneau se libérait plus tôt chez ${h(params.doctorName)}${params.specialty ? ` — ${h(params.specialty)}` : ''}. C'est le cas :</p>

          <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 2px 0; color: #047857; font-size: 13px; font-weight: bold;">CRÉNEAU DISPONIBLE</p>
            <p style="margin: 4px 0; color: #065f46; font-size: 18px; font-weight: bold;">${h(propose)}</p>
          </div>

          <div style="background: #f9fafb; border-left: 4px solid #d1d5db; padding: 12px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 2px 0; color: #9ca3af; font-size: 13px;">Votre rendez-vous actuel</p>
            <p style="margin: 2px 0; color: #6b7280;">${h(actuel)}</p>
          </div>

          <p style="color: #374151; font-size: 14px;">Cette place a été proposée à plusieurs patients : <strong>le premier qui la réserve l'obtient</strong>.</p>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${url}" style="background: #0EA5E9; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
              Avancer mon rendez-vous
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px;">Si vous réservez cette place, votre rendez-vous actuel sera annulé automatiquement, une fois la nouvelle place confirmée. <strong>Si vous ne faites rien, votre rendez-vous du ${h(actuel)} est maintenu</strong> : rien ne change.</p>
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">Vous ne souhaitez plus recevoir ces propositions ? Le lien ci-dessus permet aussi de vous désinscrire.</p>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
        </div>
      </div>
    `,
  })
}

// Confirmation au patient qui a pris la place. Reprend la présentation de
// l'e-mail de déplacement (ancien barré / nouveau en avant), mais avec des
// mots à lui : c'est LUI qui a avancé son rendez-vous, personne ne l'a déplacé.
export async function sendWaitlistBookedEmailToPatient(params: {
  patientEmail: string
  patientName: string
  doctorName: string          // déjà préfixé
  specialty: string
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
  newCancelToken: string
  /** false = l'ancien rendez-vous n'a PAS pu être annulé : le patient en a deux. */
  ancienAnnule: boolean
  oldCancelToken?: string | null
}): Promise<boolean> {
  const nouveau = quandLisible(params.newDate, params.newTime)
  const ancien = quandLisible(params.oldDate, params.oldTime)

  // Le cas dégradé est dit franchement : un patient qui croit son ancien
  // rendez-vous annulé alors qu'il tient toujours bloque une place, et le
  // cabinet l'attendra peut-être vendredi.
  const blocAncien = params.ancienAnnule
    ? `<div style="background: #f9fafb; border-left: 4px solid #d1d5db; padding: 12px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
         <p style="margin: 2px 0; color: #9ca3af; font-size: 13px;">Ancien rendez-vous — annulé</p>
         <p style="margin: 2px 0; color: #6b7280; text-decoration: line-through;">${h(ancien)}</p>
       </div>`
    : `<div style="background: #fef9c3; border-left: 4px solid #eab308; padding: 12px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
         <p style="margin: 2px 0; color: #92400e; font-size: 14px;">Votre ancien rendez-vous du <strong>${h(ancien)}</strong> n'a pas pu être annulé automatiquement. Le cabinet a été prévenu.${params.oldCancelToken
           ? ` Vous pouvez aussi <a href="${APP_URL}/annuler/${encodeURIComponent(params.oldCancelToken)}" style="color: #92400e;">l'annuler vous-même</a>.`
           : ''}</p>
       </div>`

  return envoyerVerifie('confirmation liste d\'attente (patient)', {
    to: params.patientEmail,
    subject: `✅ Rendez-vous avancé : ${nouveau}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Rendez-vous avancé ✅</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <p style="color: #374151;">Bonjour ${h(params.patientName)},</p>
          <p style="color: #374151;">C'est confirmé : votre rendez-vous avec ${h(params.doctorName)}${params.specialty ? ` — ${h(params.specialty)}` : ''} est avancé.</p>

          <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px 20px; margin: 18px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 2px 0; color: #047857; font-size: 13px; font-weight: bold;">NOUVEAU RENDEZ-VOUS</p>
            <p style="margin: 4px 0; color: #065f46; font-size: 18px; font-weight: bold;">${h(nouveau)}</p>
          </div>

          ${blocAncien}

          <p style="color: #6b7280; font-size: 14px;">Un rappel vous sera envoyé la veille.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${APP_URL}/annuler/${encodeURIComponent(params.newCancelToken)}" style="color: #ef4444; font-size: 13px;">Annuler ce rendez-vous</a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
        </div>
      </div>
    `,
  })
}

// Le médecin est prévenu : son agenda vient de changer sans que personne au
// cabinet n'y touche. Il a reçu l'e-mail d'annulation du créneau ; sans
// celui-ci, il ne saurait pas que la place a été reprise, ni qu'une autre
// s'est libérée plus loin dans la semaine.
export async function sendWaitlistBookedEmailToDoctor(params: {
  doctorEmail: string
  doctorName: string          // déjà préfixé
  patientName: string
  patientPhone: string
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
  ancienAnnule: boolean
}): Promise<boolean> {
  const nouveau = quandLisible(params.newDate, params.newTime)
  const ancien = quandLisible(params.oldDate, params.oldTime)

  return envoyerVerifie('confirmation liste d\'attente (médecin)', {
    to: params.doctorEmail,
    subject: `🕐 Liste d'attente — ${params.patientName} a pris la place du ${nouveau}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Un créneau libéré a été repris 🕐</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <p style="color: #374151;">Bonjour ${h(params.doctorName)},</p>
          <p style="color: #374151;">Un patient inscrit en liste d'attente a avancé son rendez-vous sur une place qui venait de se libérer :</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #f0f9ff;"><td style="padding: 10px 14px; font-weight: bold; color: #0369a1;">Patient</td><td style="padding: 10px 14px;">${h(params.patientName)}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: bold; color: #374151;">Téléphone</td><td style="padding: 10px 14px;">${h(params.patientPhone)}</td></tr>
            <tr style="background: #f0f9ff;"><td style="padding: 10px 14px; font-weight: bold; color: #0369a1;">Nouveau rendez-vous</td><td style="padding: 10px 14px;">${h(nouveau)}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: bold; color: #374151;">Ancien rendez-vous</td><td style="padding: 10px 14px;">${h(ancien)} — ${params.ancienAnnule
              ? 'libéré (les patients en attente ont été prévenus)'
              : '<strong style="color: #dc2626;">PAS annulé automatiquement : annulez-le dans votre agenda</strong>'}</td></tr>
          </table>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${APP_URL}/appointments" style="background: #0EA5E9; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Voir mon agenda
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Vous pouvez désactiver la liste d'attente dans vos Paramètres.</p>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">MonRDV — Prise de rendez-vous médicaux au Maroc</p>
        </div>
      </div>
    `,
  })
}
