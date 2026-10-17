// Qui écrit, et pour quel cabinet ? Deux ambiguïtés, pas une.
//
// 1. PLUSIEURS CABINETS — `patients` est rattaché à `doctor_id` : un même
//    numéro existe en autant de fiches que de praticiens consultés. C'est la
//    bonne conception (le dossier appartient au cabinet), mais le chatbot
//    reçoit un numéro, pas un médecin.
//
// 2. PLUSIEURS PERSONNES — et c'est le cas le plus fréquent. Le schéma le dit
//    explicitement : « Pas de contrainte UNIQUE(doctor_id, phone) […] Permet
//    aux familles de partager un numéro. » Chez UN seul dentiste, un numéro
//    porte la mère, le père et trois enfants. Ne résoudre que le cabinet, c'est
//    prendre le RDV pour la mère alors qu'il est pour la fille — ou pire,
//    annuler celui du frère.
//
// RÈGLE DURE : aucune lecture de rendez-vous, aucune annulation tant que la
// PERSONNE n'est pas résolue. Un numéro n'est pas une identité : il peut être
// celui du mari, du frère, du cybercafé.
//
// CONFIDENTIALITÉ : la liste des cabinets révèle qui cette personne consulte.
// On n'y met donc JAMAIS la spécialité — « Dr Benjelloun — Casablanca » ne dit
// rien, « Dr Benjelloun — psychiatre » en dit beaucoup trop. Même raison pour
// les personnes : prénoms seuls, jamais les noms complets.

import { createAdminClient } from '@/lib/supabase/server'
import { colonneAbsente } from '@/lib/migrations'

export interface CabinetCandidat {
  doctorId: string
  name: string
  city: string | null
}

export interface PersonneCandidate {
  patientId: string
  prenom: string
}

export type Resolution =
  /** Numéro inconnu : aucune fiche patient nulle part. */
  | { type: 'inconnu' }
  /** Cabinet et personne identifiés : le parcours peut démarrer. */
  | { type: 'resolu'; doctorId: string; patientId: string | null }
  /** Cabinet connu, reste à savoir pour qui (famille sur un même numéro). */
  | { type: 'choisir_personne'; doctorId: string; personnes: PersonneCandidate[] }
  /** Plusieurs cabinets : on demande, le plus récemment fréquenté en tête. */
  | { type: 'choisir_cabinet'; cabinets: CabinetCandidat[] }

/**
 * Médecin désigné par un message pré-rempli (« RDV dr-hassan »), tel que le
 * produit un lien wa.me affiché sur la page du praticien, un QR code en salle
 * d'attente ou la bio Instagram du cabinet.
 *
 * C'est le chemin le plus court et le plus fiable : il supprime d'un coup les
 * deux ambiguïtés ci-dessus. Chaque lien diffusé est une étape de moins pour
 * le patient.
 *
 * Le slug stocké en base est SANS le préfixe « dr- » : app/[slug]/page.tsx le
 * retire avant de requêter (`params.slug.replace(/^dr-/, '')`). On fait pareil.
 */
export async function cabinetDepuisTexte(texte: string): Promise<string | null> {
  const trouve = texte.toLowerCase().match(/\b(?:rdv|rendez-?vous)\s+([a-z0-9-]{2,60})/i)
  if (!trouve) return null

  const slug = trouve[1].replace(/^dr-/, '')
  if (!slug) return null

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('doctors')
    .select('id, status, subscription_status')
    .eq('slug', slug)
    .maybeSingle()

  // Un médecin non réservable ne doit pas être proposé : /api/slots ne rendrait
  // aucun créneau et la création du RDV serait refusée ensuite.
  if (!data || data.status !== 'approved' || data.subscription_status !== 'actif') return null
  return data.id
}

/**
 * Résolution complète à partir du numéro Meta et du premier message.
 *
 * @param waId numéro normalisé au format Meta (voir lib/telephone.ts)
 * @param texte premier message reçu, qui peut porter le slug du praticien
 * @param cabinetConnu médecin déjà identifié dans cette conversation
 *        (lien wa.me, ou choix mémorisé d'une conversation précédente)
 */
export async function resoudre(
  waId: string,
  texte = '',
  cabinetConnu?: string | null
): Promise<Resolution> {
  const supabase = createAdminClient()

  const doctorId = cabinetConnu ?? (await cabinetDepuisTexte(texte))

  // Toutes les fiches portant ce numéro, tous cabinets confondus.
  const { data: fiches, error } = await supabase
    .from('patients')
    .select('id, first_name, doctor_id')
    .eq('phone_norm', waId)

  // Migration v73 non passée : la colonne n'existe pas encore. Règle de la
  // maison — la fonctionnalité se désactive, elle ne tombe pas en erreur.
  // Le chatbot traite alors tout le monde comme un nouveau patient, ce qui
  // reste un parcours valide.
  if (error && colonneAbsente(error.code)) {
    return doctorId ? { type: 'resolu', doctorId, patientId: null } : { type: 'inconnu' }
  }

  const trouvees = fiches ?? []

  /** Départage les fiches d'un cabinet déjà identifié. */
  const dansLeCabinet = (id: string): Resolution => {
    const duCabinet = trouvees.filter((f) => f.doctor_id === id)
    if (duCabinet.length === 0) return { type: 'resolu', doctorId: id, patientId: null }
    if (duCabinet.length === 1) return { type: 'resolu', doctorId: id, patientId: duCabinet[0].id }
    return {
      type: 'choisir_personne',
      doctorId: id,
      personnes: duCabinet.map((f) => ({ patientId: f.id, prenom: f.first_name })),
    }
  }

  if (doctorId) return dansLeCabinet(doctorId)
  if (trouvees.length === 0) return { type: 'inconnu' }

  const cabinets = Array.from(new Set(trouvees.map((f) => f.doctor_id)))
  if (cabinets.length === 1) return dansLeCabinet(cabinets[0])

  // Plusieurs cabinets : on demande. Le plus récemment fréquenté en tête, parce
  // que c'est de loin le plus probable — et parce qu'une liste WhatsApp ne
  // tient que 10 lignes.
  const [medecinsRes, dernierRes] = await Promise.all([
    supabase
      .from('doctors')
      .select('id, name, city')
      .in('id', cabinets)
      .eq('status', 'approved')
      .eq('subscription_status', 'actif'),
    supabase
      .from('appointments')
      .select('doctor_id, date')
      .in('patient_id', trouvees.map((f) => f.id))
      .order('date', { ascending: false }),
  ])

  const dernierParCabinet = new Map<string, string>()
  for (const r of dernierRes.data ?? []) {
    if (!dernierParCabinet.has(r.doctor_id)) dernierParCabinet.set(r.doctor_id, String(r.date))
  }

  const liste: CabinetCandidat[] = (medecinsRes.data ?? [])
    .map((m) => ({ doctorId: m.id, name: m.name, city: m.city }))
    .sort((a, b) =>
      (dernierParCabinet.get(b.doctorId) ?? '').localeCompare(dernierParCabinet.get(a.doctorId) ?? '')
    )

  // Tous les cabinets de ce numéro sont devenus non réservables : on repart
  // comme pour un inconnu plutôt que d'afficher une liste vide.
  if (liste.length === 0) return { type: 'inconnu' }
  if (liste.length === 1) return dansLeCabinet(liste[0].doctorId)

  return { type: 'choisir_cabinet', cabinets: liste }
}
