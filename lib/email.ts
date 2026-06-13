// Service d'envoi d'emails via Resend
import { Resend } from 'resend'

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

// Email envoyé au médecin quand un patient prend un nouveau RDV
export async function sendNewAppointmentToDoctor(params: {
  doctorEmail: string
  doctorName: string
  patientName: string
  patientPhone: string
  date: string
  time: string
  notes?: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: params.doctorEmail,
      subject: `📅 Nouveau RDV — ${params.patientName} le ${params.date} à ${params.time}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #0EA5E9; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Nouveau rendez-vous 📅</h1>
          </div>
          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
            <p style="color: #374151;">Bonjour Dr. ${h(params.doctorName)},</p>
            <p style="color: #374151;">Un nouveau rendez-vous a été pris via MonRDV :</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #f0f9ff;"><td style="padding: 10px 14px; font-weight: bold; color: #0369a1; border-radius: 6px 0 0 6px;">Patient</td><td style="padding: 10px 14px;">${h(params.patientName)}</td></tr>
              <tr><td style="padding: 10px 14px; font-weight: bold; color: #374151;">Téléphone</td><td style="padding: 10px 14px;">${h(params.patientPhone)}</td></tr>
              <tr style="background: #f0f9ff;"><td style="padding: 10px 14px; font-weight: bold; color: #0369a1;">Date</td><td style="padding: 10px 14px;">${h(params.date)}</td></tr>
              <tr><td style="padding: 10px 14px; font-weight: bold; color: #374151;">Heure</td><td style="padding: 10px 14px;">${h(params.time)}</td></tr>
              ${params.notes ? `<tr style="background: #f0f9ff;"><td style="padding: 10px 14px; font-weight: bold; color: #0369a1;">Motif</td><td style="padding: 10px 14px;">${h(params.notes)}</td></tr>` : ''}
            </table>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${APP_URL}/appointments"
                style="background: #0EA5E9; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
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
    console.error('[Email] Erreur notif médecin:', error)
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
  appointments: { time: string; patientName: string; phone: string; notes?: string | null }[]
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false

  const hasAppointments = params.appointments.length > 0

  const appointmentsHtml = hasAppointments
    ? `
      <table style="width:100%; border-collapse:collapse; margin:16px 0;">
        <thead>
          <tr style="background:#f0f9ff;">
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Heure</th>
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Patient</th>
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Téléphone</th>
            <th style="padding:10px 14px; text-align:left; color:#0369a1; font-size:13px;">Motif</th>
          </tr>
        </thead>
        <tbody>
          ${params.appointments.map((apt, i) => `
            <tr style="background:${i % 2 === 0 ? 'white' : '#f9fafb'};">
              <td style="padding:10px 14px; font-weight:bold; color:#374151;">${h(apt.time)}</td>
              <td style="padding:10px 14px; color:#374151;">${h(apt.patientName)}</td>
              <td style="padding:10px 14px; color:#374151;">${h(apt.phone)}</td>
              <td style="padding:10px 14px; color:#6b7280; font-size:13px;">${h(apt.notes) || '—'}</td>
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
