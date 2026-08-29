// Journal des accès aux dossiers médicaux (table audit_logs, migration v44).
//
// Il ne sert pas à empêcher un accès interdit — le cloisonnement par cabinet et
// les permissions s'en chargent. Il couvre ce que la prévention laisse ouvert
// par construction : l'accès AUTORISÉ. Une secrétaire a le droit d'ouvrir un
// dossier, c'est son métier ; aucun contrôle technique ne distingue « pour
// préparer la consultation » de « parce que c'est ma voisine ».
//
// Il sert donc à deux choses : dissuader, et surtout DISCULPER. Quand une
// information circule, le soupçon retombe sur le cabinet et sur MonRDV. Sans
// journal, personne ne peut démontrer que la fuite venait d'ailleurs.
//
// La table est en RLS sans aucune policy : elle n'est donc accessible qu'au
// service_role, jamais depuis le navigateur. Ni le médecin ni la secrétaire ne
// peuvent effacer une ligne qui les concerne.

import { createAdminClient } from '@/lib/supabase/server'

export type AuditAction =
  | 'dossier_consulte'      // ouverture du dossier médical complet
  | 'dossier_imprime'       // version imprimable
  | 'dossier_exporte'       // PDF ou ZIP téléchargé
  | 'patients_exportes'     // export groupé
  | 'patient_fusionne'

export type AuditActor = 'medecin' | 'secretaire' | 'admin'

interface AuditEntry {
  doctorId: string
  actorUserId?: string | null
  /** Rôle de l'auteur : un même dossier ouvert par le médecin ou par sa
   *  secrétaire ne se lit pas de la même façon dans le journal. */
  actorRole: AuditActor
  actorEmail?: string | null
  action: AuditAction
  patientId?: string | null
  /** Complément non nominatif : jamais de nom de patient ici — le journal ne
   *  doit pas devenir une seconde copie du dossier. */
  extra?: Record<string, unknown>
}

export async function logAccesDossier(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_logs').insert({
      doctor_id: entry.doctorId,
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action,
      target_type: 'patient',
      target_id: entry.patientId ?? null,
      metadata: {
        role: entry.actorRole,
        email: entry.actorEmail ?? null,
        ...(entry.extra ?? {}),
      },
    })
    // Un journal muet ne vaut rien : si l'écriture échoue, on veut le savoir.
    // Mais on ne fait pas échouer la consultation pour autant — refuser l'accès
    // au dossier parce que la journalisation a échoué serait pire que le mal.
    if (error) console.error('[audit] écriture impossible :', error.message, entry.action)
  } catch (e) {
    console.error('[audit] écriture impossible :', e)
  }
}
