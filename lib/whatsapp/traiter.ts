// Point d'entrée unique du chatbot : un message entre, des réponses sortent.
//
// Le webhook Meta (phase 2) et le simulateur interne (phase 1) appellent tous
// deux `traiter()` — c'est ce qui garantit que ce qui est testé dans le
// navigateur est EXACTEMENT ce que le patient vivra sur WhatsApp.
//
// Ordre des contrôles, et il n'est pas négociable :
//   1. fenêtre de service expirée  → on repart de zéro (créneaux périmés)
//   2. conversation déjà escaladée → le bot se tait, un humain a la main
//   3. urgence                     → orientation + alerte, aucune question clinique
//   4. demande d'humain            → escalade
//   5. parcours normal
// L'urgence passe avant le parcours : un patient qui écrit « je saigne » au
// milieu du choix d'un créneau ne doit pas recevoir une liste d'horaires.

import { createAdminClient } from '@/lib/supabase/server'
import { normaliserTelephone, versNationalMaroc } from '@/lib/telephone'
import { formatDateFr } from '@/lib/utils'
import { T } from '@/lib/whatsapp/messages'
import {
  charger, enregistrer, estUrgence, demandeUnHumain, quand,
  etapeAccueil, etapeMotif, etapeJour, etapeHeure, etapeConfirmation,
  APP_URL, INCOMPREHENSIONS_MAX,
  type Entree, type Resultat, type Conversation, type Contexte, type Etape, type Sortie,
} from '@/lib/whatsapp/machine'

export type { Entree, Resultat, Sortie }

export async function traiter(entree: Entree): Promise<Resultat> {
  const waId = normaliserTelephone(entree.waId)
  if (!waId) return { sorties: [{ type: 'texte', texte: T.incompris }], etape: 'accueil' }

  const texte = (entree.texte ?? '').trim()
  const choix = entree.choix ?? ''
  let conv = await charger(waId)

  // 1. Fenêtre de service Meta expirée : le parcours en cours ne vaut plus rien
  //    (les créneaux mémorisés ont pu être pris entre-temps).
  if (conv?.fenetre_fin && new Date(conv.fenetre_fin) < new Date()) {
    await enregistrer(waId, {
      etape: 'accueil', contexte: {}, escalade_le: null, escalade_motif: null,
    })
    const suite = await etapeAccueil(waId, texte, { ...conv, doctor_id: conv.doctor_id, etape: 'accueil', contexte: {} })
    return { ...suite, sorties: [{ type: 'texte', texte: T.fenetreExpiree }, ...suite.sorties] }
  }

  // 2. Un humain a la main : le bot n'intervient plus dans cette conversation.
  if (conv?.escalade_le) return { sorties: [], etape: 'escalade' }

  // 3. Urgence — à n'importe quelle étape, et avant tout le reste.
  if (texte && estUrgence(texte)) return escalader(waId, conv, 'urgence', texte)

  // 4. Demande explicite d'un humain.
  if (choix === 'secretaire' || (texte && demandeUnHumain(texte))) {
    return escalader(waId, conv, 'demande du patient', texte)
  }

  // 5. Parcours
  if (!conv) return etapeAccueil(waId, texte, null)

  switch (conv.etape) {
    case 'accueil':
      if (choix === 'rdv') return demarrerReservation(conv)
      if (choix === 'prochain') return prochainRdv(conv)
      // Pas de choix exploitable : (re)faire l'accueil, qui relance la résolution.
      if (!choix) return etapeAccueil(waId, texte, conv)
      return incompris(conv)

    case 'choix_cabinet': {
      const id = apres(choix, 'cab:')
      if (!id) return incompris(conv)
      await enregistrer(waId, { doctor_id: id, patient_id: null, etape: 'accueil', contexte: {} })
      return etapeAccueil(waId, '', { ...conv, doctor_id: id, patient_id: null, contexte: {} })
    }

    case 'choix_personne': {
      if (choix === 'pers:autre') return demanderIdentite(conv)
      const id = apres(choix, 'pers:')
      if (!id) return incompris(conv)
      await enregistrer(waId, { patient_id: id, etape: 'motif', contexte: {} })
      return etapeMotif({ ...conv, patient_id: id, etape: 'motif', contexte: {} })
    }

    case 'identite': {
      const nom = decouperNom(texte)
      if (!nom) {
        await enregistrer(waId, { etape: 'identite', contexte: conv.contexte })
        return { sorties: [{ type: 'texte', texte: T.identiteIncomprise }], etape: 'identite' }
      }
      const contexte: Contexte = { ...conv.contexte, ...nom }
      await enregistrer(waId, { etape: 'motif', contexte })
      return etapeMotif({ ...conv, etape: 'motif', contexte })
    }

    case 'motif': {
      const id = apres(choix, 'motif:')
      if (!id) return incompris(conv)
      const supabase = createAdminClient()
      const { data: motif } = await supabase
        .from('consultation_types')
        .select('name')
        .eq('id', id)
        .eq('doctor_id', conv.doctor_id)
        .eq('active', true)
        .maybeSingle()
      if (!motif) return incompris(conv)
      const contexte: Contexte = { ...conv.contexte, motifId: id, motifLibelle: motif.name }
      await enregistrer(waId, { etape: 'jour', contexte })
      return etapeJour({ ...conv, etape: 'jour', contexte })
    }

    case 'jour': {
      if (choix === 'plus_tard') {
        const lien = await lienMedecin(conv.doctor_id!)
        const nom = await nomDu(conv.doctor_id!)
        return { sorties: [{ type: 'texte', texte: T.plusTard(nom, lien) }], etape: 'jour' }
      }
      const date = apres(choix, 'jour:')
      if (!date) return incompris(conv)
      return etapeHeure(conv, date)
    }

    case 'heure': {
      const heure = apres(choix, 'heure:')
      if (!heure) return incompris(conv)
      return etapeConfirmation(conv, heure)
    }

    case 'confirmation':
      if (choix === 'confirmer') return creer(conv)
      if (choix === 'changer') return etapeJour(conv)
      return incompris(conv)

    case 'email': {
      if (choix === 'pas_email') {
        await enregistrer(waId, { etape: 'accueil', contexte: {} })
        return { sorties: [], etape: 'accueil' }
      }
      const email = texte.toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { sorties: [{ type: 'texte', texte: T.emailInvalide }], etape: 'email' }
      }
      await enregistrerEmail(conv, email)
      await enregistrer(waId, { etape: 'accueil', contexte: {} })
      return { sorties: [{ type: 'texte', texte: T.emailEnregistre }], etape: 'accueil' }
    }

    default:
      return etapeAccueil(waId, texte, conv)
  }
}

// ---------------------------------------------------------------------------

function apres(choix: string, prefixe: string): string | null {
  return choix.startsWith(prefixe) ? choix.slice(prefixe.length) || null : null
}

/** « Yasmine Alaoui » → prénom + nom. Un seul mot ne suffit pas : la fiche
 *  patient exige les deux, et le dédoublonnage de /api/appointments se fait
 *  sur nom + téléphone. */
function decouperNom(texte: string): { prenom: string; nom: string } | null {
  const mots = texte.replace(/\s+/g, ' ').trim().split(' ').filter((m) => m.length > 1)
  if (mots.length < 2) return null
  return { prenom: mots[0].slice(0, 100), nom: mots.slice(1).join(' ').slice(0, 100) }
}

async function nomDu(doctorId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('doctors').select('name').eq('id', doctorId).maybeSingle()
  return data?.name ?? ''
}

async function lienMedecin(doctorId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('doctors').select('slug').eq('id', doctorId).maybeSingle()
  return data?.slug ? `${APP_URL}/dr-${data.slug}` : APP_URL
}

async function escalader(
  waId: string,
  conv: Conversation | null,
  motif: string,
  texte: string
): Promise<Resultat> {
  const urgence = motif === 'urgence'
  let tel: string | null = null
  if (conv?.doctor_id) {
    const supabase = createAdminClient()
    const { data } = await supabase.from('doctors').select('phone').eq('id', conv.doctor_id).maybeSingle()
    tel = data?.phone ?? null
  }

  await enregistrer(waId, {
    etape: 'escalade',
    escalade_le: new Date().toISOString(),
    escalade_motif: `${motif}${texte ? ` — « ${texte.slice(0, 200)} »` : ''}`,
  })

  return {
    etape: 'escalade',
    escalade: motif,
    sorties: [{ type: 'texte', texte: urgence ? T.urgence(tel) : T.escalade }],
  }
}

/** Deux incompréhensions d'affilée et un humain reprend : faire tourner un
 *  patient en rond est pire que de passer la main. */
async function incompris(conv: Conversation): Promise<Resultat> {
  const n = (conv.contexte.incomprehensions ?? 0) + 1
  if (n >= INCOMPREHENSIONS_MAX) {
    return escalader(conv.wa_id, conv, 'incompréhension répétée', '')
  }
  await enregistrer(conv.wa_id, {
    etape: conv.etape,
    contexte: { ...conv.contexte, incomprehensions: n },
  })
  return { sorties: [{ type: 'texte', texte: T.incompris }], etape: conv.etape }
}

async function demarrerReservation(conv: Conversation): Promise<Resultat> {
  if (!conv.doctor_id) return etapeAccueil(conv.wa_id, '', conv)
  if (!conv.patient_id && !conv.contexte.prenom) return demanderIdentite(conv)
  return etapeMotif(conv)
}

async function demanderIdentite(conv: Conversation): Promise<Resultat> {
  await enregistrer(conv.wa_id, { etape: 'identite', patient_id: null, contexte: {} })
  return { sorties: [{ type: 'texte', texte: T.demanderIdentite }], etape: 'identite' }
}

/**
 * Prochain rendez-vous de la personne — praticien, date, heure, adresse.
 * Rien de clinique : ni motif, ni acte, ni montant. Le téléphone peut être
 * celui du mari, du frère, du cybercafé, et la personne n'a été identifiée
 * que par son numéro.
 * L'annulation renvoie vers /annuler/[token], qui porte déjà sa propre
 * confirmation : on ne réimplémente pas un geste irréversible dans le chat.
 */
async function prochainRdv(conv: Conversation): Promise<Resultat> {
  if (!conv.patient_id) return demarrerReservation(conv)

  const supabase = createAdminClient()
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const { data: rdv } = await supabase
    .from('appointments')
    .select('date, time, cancel_token, doctor:doctors(name, address)')
    .eq('patient_id', conv.patient_id)
    .gte('date', aujourdhui)
    .neq('status', 'cancelled')
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!rdv) {
    return { sorties: [{ type: 'texte', texte: 'Vous n’avez aucun rendez-vous à venir.' }], etape: 'accueil' }
  }

  const medecin = (rdv.doctor as { name?: string; address?: string } | null) ?? {}
  const lignes = [
    'Votre prochain rendez-vous :',
    '',
    `👨‍⚕️ ${medecin.name ?? ''}`,
    `📅 ${quand(String(rdv.date).slice(0, 10), String(rdv.time).slice(0, 5))}`,
    ...(medecin.address ? [`📍 ${medecin.address}`] : []),
    ...(rdv.cancel_token ? ['', `Annuler : ${APP_URL}/annuler/${rdv.cancel_token}`] : []),
  ]
  return { sorties: [{ type: 'texte', texte: lignes.join('\n') }], etape: 'accueil' }
}

/**
 * Création du rendez-vous par le MÊME `POST /api/appointments` que la page
 * publique : mêmes validations, même dédoublonnage de fiche, même trace de
 * consentement, même contrainte d'unicité de créneau. Dupliquer l'insertion
 * ici aurait été la seule façon de laisser les deux canaux diverger.
 */
async function creer(conv: Conversation): Promise<Resultat> {
  const { date, heure, motifId } = conv.contexte
  if (!date || !heure || !conv.doctor_id) return etapeJour(conv)

  const supabase = createAdminClient()

  // Les nom et prénom doivent correspondre EXACTEMENT à la fiche choisie : le
  // dédoublonnage de la route se fait sur (téléphone, prénom, nom), c'est ce
  // qui rattache le RDV au bon membre de la famille.
  let prenom = conv.contexte.prenom ?? ''
  let nom = conv.contexte.nom ?? ''
  let emailFiche: string | null = null
  if (conv.patient_id) {
    const { data: fiche } = await supabase
      .from('patients')
      .select('first_name, last_name, email')
      .eq('id', conv.patient_id)
      .maybeSingle()
    if (fiche) {
      prenom = fiche.first_name
      nom = fiche.last_name
      emailFiche = fiche.email
    }
  }

  const telephone = versNationalMaroc(conv.wa_id)
  // Numéro non marocain : la route refuserait (isValidPhoneMaroc). On passe la
  // main plutôt que d'échouer sans explication.
  if (!telephone || !prenom || !nom) {
    return escalader(conv.wa_id, conv, 'création impossible (numéro ou identité)', '')
  }

  const reponse = await fetch(`${APP_URL}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doctor_id: conv.doctor_id,
      first_name: prenom,
      last_name: nom,
      phone: telephone,
      date,
      time: heure,
      consultation_type_id: motifId ?? undefined,
      public: true,
      // Le bouton « Je confirme » valait consentement : la mention était
      // affichée dans le récapitulatif, avant le clic (loi 09-08).
      consent: true,
      channel: 'whatsapp',
    }),
  })

  if (reponse.status === 409) {
    // Créneau pris entre l'affichage et le clic : on repropose le même jour.
    const suite = await etapeHeure(conv, date)
    return {
      ...suite,
      sorties: [{ type: 'texte', texte: T.creneauPris(formatDateFr(date)) }, ...suite.sorties],
    }
  }

  if (!reponse.ok) {
    return escalader(conv.wa_id, conv, `échec de création (${reponse.status})`, '')
  }

  const cree = (await reponse.json()) as { id: string }

  // Le jeton d'annulation n'est volontairement PAS renvoyé par la route (il ne
  // doit pas circuler vers un navigateur). Ici on est côté serveur, et sur
  // WhatsApp la conversation EST le canal de confirmation : on le relit.
  const { data: apt } = await supabase
    .from('appointments')
    .select('cancel_token')
    .eq('id', cree.id)
    .maybeSingle()

  const { data: medecin } = await supabase
    .from('doctors')
    .select('name, address')
    .eq('id', conv.doctor_id)
    .maybeSingle()

  const token = apt?.cancel_token ?? ''
  const sorties: Sortie[] = [{
    type: 'texte',
    texte: T.confirme(
      medecin?.name ?? '',
      quand(date, heure),
      medecin?.address ?? null,
      token ? `${APP_URL}/annuler/${token}` : APP_URL,
      token ? `${APP_URL}/api/rdv/${token}/calendrier.ics` : APP_URL
    ),
  }]

  // Rappel la veille : le cron email existant ignore les patients sans email.
  // On le propose, sans l'imposer — et seulement à qui n'en a pas déjà un.
  const etapeSuivante: Etape = emailFiche ? 'accueil' : 'email'
  if (!emailFiche) {
    sorties.push({
      type: 'boutons',
      texte: T.proposerEmail,
      boutons: [{ id: 'pas_email', titre: T.btnPasDEmail }],
    })
  }

  await enregistrer(conv.wa_id, {
    etape: etapeSuivante,
    contexte: { cancelToken: token },
  })

  return { sorties, etape: etapeSuivante }
}

/** L'email n'est écrit que s'il manque : on ne touche pas à une fiche qui en a
 *  déjà un (même prudence que /api/appointments sur l'appropriation de dossier). */
async function enregistrerEmail(conv: Conversation, email: string): Promise<void> {
  if (!conv.patient_id) return
  const supabase = createAdminClient()
  const { data: fiche } = await supabase
    .from('patients')
    .select('email')
    .eq('id', conv.patient_id)
    .maybeSingle()
  if (fiche && !fiche.email) {
    await supabase.from('patients').update({ email }).eq('id', conv.patient_id)
  }
}
