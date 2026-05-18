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

const FROM_EMAIL = process.env.EMAIL_FROM || 'MonRDV <noreply@monrdv.ma>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
            <h2 style="color: #111827;">Bienvenue Dr. ${params.doctorName} !</h2>
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
            <h2 style="color: #111827;">Dr. ${params.doctorName},</h2>
            <p style="color: #6b7280;">Votre demande d'inscription n'a pas pu être approuvée.</p>
            ${params.reason ? `<p style="color: #6b7280;"><strong>Motif :</strong> ${params.reason}</p>` : ''}
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
            <p><strong>Nom :</strong> Dr. ${params.doctorName}</p>
            <p><strong>Email :</strong> ${params.doctorEmail}</p>
            <p><strong>Spécialité :</strong> ${params.specialty}</p>
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
