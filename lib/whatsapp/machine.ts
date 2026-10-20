// Le parcours de prise de RDV, comme une machine à états déterministe.
//
// POURQUOI PAS UN MODÈLE DE LANGAGE ICI
// Le patient SÉLECTIONNE, il n'écrit pas. Trois conséquences, et ce sont les
// trois raisons d'être de ce fichier :
//   — la darija écrite en lettres latines n'a plus à être comprise sur le
//     chemin principal, qui est justement là où une erreur coûte un RDV ;
//   — aucun créneau ne peut être inventé : `creneauxProposes` garde la liste
//     réellement rendue par /api/slots au tour précédent, et une heure qui n'y
//     figure pas est refusée AVANT d'écrire quoi que ce soit ;
//   — le coût d'exploitation est nul.
// Le modèle n'intervient qu'en rattrapage (phase ultérieure), sur le
// hors-script, et son échec est sans danger : il renvoie aux boutons.
//
// VOLONTAIREMENT IGNORANTE DE WHATSAPP
// Ce module prend un message, rend des réponses. Il ne connaît ni Meta, ni
// webhook, ni jeton : c'est ce qui le rend testable intégralement depuis le
// simulateur, avant même que le compte Meta soit vérifié — et ce qui permettra
// de brancher un autre canal sans y toucher.

import { createAdminClient } from '@/lib/supabase/server'
import { tableAbsente } from '@/lib/migrations'
import { detailMotif } from '@/lib/tarifs'
import { formatDateFr, ageFromBirthDate } from '@/lib/utils'
import { disponibilitesSurPeriode } from '@/lib/disponibilites'
import { resoudre, cabinetDepuisTexte } from '@/lib/whatsapp/resolution'
import { T, MOTS_URGENCE } from '@/lib/whatsapp/messages'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/** Horizon proposé dans la conversation. Au-delà, on renvoie vers le site :
 *  une liste WhatsApp ne tient que 10 lignes, et l'agenda complet du site fait
 *  ce travail bien mieux. */
const JOURS_PROPOSES = 7

/** Créneaux affichés par jour (le plafond WhatsApp est de 10 lignes). */
const CRENEAUX_PAR_JOUR = 8

/** Deux incompréhensions d'affilée et un humain reprend la main. Mieux vaut
 *  passer la main que faire tourner un patient en rond. */
const INCOMPREHENSIONS_MAX = 2

export type Etape =
  | 'accueil'
  | 'choix_cabinet'
  | 'choix_personne'
  | 'identite'
  | 'age'
  | 'motif'
  | 'jour'
  | 'heure'
  | 'confirmation'
  | 'email'
  | 'escalade'

export interface Entree {
  waId: string
  /** Message libre tapé par le patient. */
  texte?: string
  /** Identifiant de la ligne de liste ou du bouton cliqué. */
  choix?: string
  /** Identifiant Meta du message entrant. Absent depuis le simulateur : il n'y
   *  a pas de rejeu à craindre quand c'est un humain qui clique. */
  waMessageId?: string
}

export interface Bouton { id: string; titre: string }
export interface Ligne { id: string; titre: string; description?: string }

export type Sortie =
  | { type: 'texte'; texte: string }
  | { type: 'boutons'; texte: string; boutons: Bouton[] }
  | { type: 'liste'; texte: string; bouton: string; lignes: Ligne[] }

export interface Resultat {
  sorties: Sortie[]
  etape: Etape
  /** Renseigné quand un humain doit reprendre : l'appelant notifie le cabinet. */
  escalade?: string
}

interface Contexte {
  motifId?: string | null
  motifLibelle?: string
  date?: string
  libelleJour?: string
  heure?: string
  /** Garde-fou : les heures réellement proposées au dernier tour. */
  creneauxProposes?: string[]
  prenom?: string
  nom?: string
  /** Âge saisi dans la conversation, quand la fiche ne le porte pas. */
  age?: number
  incomprehensions?: number
  /** Étape où la dernière incompréhension a eu lieu : le compteur ne vaut que
   *  pour des échecs CONSÉCUTIFS au même endroit. */
  echecEtape?: Etape
  cancelToken?: string
}

interface Conversation {
  id: string
  wa_id: string
  doctor_id: string | null
  patient_id: string | null
  etape: Etape
  contexte: Contexte
  fenetre_fin: string | null
  escalade_le: string | null
  /** Pourquoi un humain a repris. Lu pour distinguer une URGENCE d'une
   *  escalade ordinaire : seule la seconde se rouvre sur un « bonjour ». */
  escalade_motif: string | null
  /** Date à laquelle le cabinet a repris la conversation (v75). L'escalade
   *  n'est OUVERTE que si `escalade_le` est renseignée et celle-ci vide — on
   *  conserve ainsi l'historique au lieu d'effacer. */
  escalade_traitee_le: string | null
}

// ---------------------------------------------------------------------------
// État de conversation
// ---------------------------------------------------------------------------

/** La fenêtre de service Meta dure 24 h après le dernier message du patient.
 *  Au-delà, on ne peut plus répondre librement : une conversation périmée
 *  repart de zéro plutôt que de reprendre un parcours obsolète (et des
 *  créneaux qui n'existent plus). */
function fenetreFin(): string {
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString()
}

async function charger(waId: string): Promise<Conversation | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('id, wa_id, doctor_id, patient_id, etape, contexte, fenetre_fin, escalade_le, escalade_motif, escalade_traitee_le')
    .eq('wa_id', waId)
    .maybeSingle()

  // Migration v73 non passée : on ne tombe pas en erreur, on le signale à
  // l'appelant par une exception explicite (le simulateur l'affiche).
  if (error && tableAbsente(error.code)) {
    throw new Error('MIGRATION_V73_ABSENTE')
  }
  return (data as Conversation | null) ?? null
}

async function enregistrer(
  waId: string,
  maj: Partial<Pick<Conversation, 'doctor_id' | 'patient_id' | 'etape' | 'escalade_le'>> & {
    contexte?: Contexte
    escalade_motif?: string | null
    escalade_traitee_le?: string | null
  }
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('whatsapp_conversations')
    .upsert(
      { wa_id: waId, ...maj, fenetre_fin: fenetreFin(), maj_le: new Date().toISOString() },
      { onConflict: 'wa_id' }
    )

  // Cette fonction écrit TOUT l'état du chatbot. Elle ne vérifiait pas son
  // erreur : une écriture refusée passait inaperçue, le bot répondait comme si
  // de rien n'était, et l'état restait à l'étape précédente. C'est ainsi qu'une
  // escalade a été annoncée au patient sans jamais être enregistrée — donc sans
  // que personne au cabinet ne soit prévenu.
  //
  // On LÈVE plutôt que de continuer : mieux vaut un message d'erreur, et un
  // rejeu par Meta, qu'une conversation qui affirme ce qui n'a pas eu lieu.
  if (error) {
    console.error('[whatsapp] état non enregistré :', error.code, error.message, maj)
    throw new Error(`État non enregistré (${error.code ?? 'sans code'}) : ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// Petits utilitaires de parcours
// ---------------------------------------------------------------------------

/**
 * Le patient (re)commence la conversation.
 *
 * « bonjour » au milieu d'un parcours n'est PAS une incompréhension : c'est
 * quelqu'un qui revient. L'état vivant en base, un patient distrait retrouve sa
 * conversation à l'étape « quelle heure ? » deux heures plus tard — et répondre
 * « je n'ai pas compris » à sa salutation, puis le passer à la secrétaire au
 * deuxième essai, est exactement le contraire de ce qu'il faut faire.
 *
 * Volontairement ANCRÉ : seule une salutation SEULE compte. « Salam Alaoui »
 * est un nom, pas un redémarrage — et l'étape « identité » attend précisément
 * un nom.
 */
function recommence(texte: string): boolean {
  const t = texte.trim().toLowerCase()
  if (/^(bonjour|bonsoir|salam|salam alaykoum|salut|hello|hi|coucou|re|yo)\s*[!.…?]*$/.test(t)) return true
  return /^(recommenc|annuler|annule|menu|retour|revenir|depuis le d[eé]but|recommencer)/.test(t)
}

function estUrgence(texte: string): boolean {
  const t = texte.toLowerCase()
  return MOTS_URGENCE.some((m) => t.includes(m))
}

/** Le patient réclame une personne.
 *
 *  « cabinet » et « téléphone » ont été RETIRÉS de cette liste : ce sont les
 *  deux mots les plus banals d'une prise de rendez-vous — « j'ai rdv au
 *  cabinet », « c'est quoi votre téléphone ? » — et ils faisaient passer la
 *  main pour rien, au beau milieu d'une réservation qui se passait bien.
 *  Ne restent que des mots d'INTENTION. Ce qui échappe à cette liste n'est pas
 *  perdu : deux incompréhensions d'affilée escaladent de toute façon. */
function demandeUnHumain(texte: string): boolean {
  const t = texte.toLowerCase()
  return /\b(secr[eé]taire|humain|une personne|quelqu.un)\b/.test(t)
      || /\b(parler|appeler|joindre|contacter|rappelez|rappeler)\b/.test(t)
}

/** « Jeudi 16 octobre 2026 à 15h00 » — la forme lue dans le récapitulatif
 *  et dans la confirmation. */
function quand(date: string, heure: string): string {
  return `${formatDateFr(date)} à ${heure.replace(':', 'h')}`
}

function tronquer(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

// ---------------------------------------------------------------------------
// Étapes
// ---------------------------------------------------------------------------

async function etapeAccueil(waId: string, texte: string, conv: Conversation | null): Promise<Resultat> {
  // Personne DÉJÀ choisie dans cette conversation : on ne la redemande pas, on
  // montre le menu.
  //
  // Sans ce court-circuit, un numéro partagé par une famille ne voyait jamais
  // le menu : « bonjour » → « c'est pour qui ? » → et le choix enchaînait
  // directement sur la réservation. « Mon prochain RDV » et « Parler au
  // cabinet » étaient donc inatteignables pour ces patients — alors qu'un
  // numéro partagé est le cas le plus courant en cabinet dentaire.
  //
  // Un texte porteur d'un slug (lien wa.me) reprend la main : il peut désigner
  // un AUTRE cabinet, et doit donc relancer la résolution.
  if (conv?.doctor_id && conv.patient_id && !(await cabinetDepuisTexte(texte))) {
    return menuAccueil(conv.doctor_id, conv.patient_id, waId, conv)
  }

  const resolution = await resoudre(waId, texte, conv?.doctor_id ?? null)

  if (resolution.type === 'inconnu') {
    // Numéro inconnu et aucun praticien désigné : on ne peut pas deviner le
    // cabinet, et on ne peut pas non plus « passer la main » — on ne saurait
    // pas à qui. Le site fait la découverte bien mieux qu'une liste WhatsApp.
    await enregistrer(waId, { etape: 'accueil', contexte: {} })
    return { sorties: [{ type: 'texte', texte: T.trouverPraticien(APP_URL) }], etape: 'accueil' }
  }

  if (resolution.type === 'choisir_cabinet') {
    await enregistrer(waId, { etape: 'choix_cabinet', contexte: {} })
    return {
      etape: 'choix_cabinet',
      sorties: [{
        type: 'liste',
        texte: T.quelCabinet,
        bouton: T.btnListeCabinets,
        // Jamais la spécialité : elle révélerait ce que ce patient consulte.
        lignes: resolution.cabinets.slice(0, 10).map((c) => ({
          id: `cab:${c.doctorId}`,
          titre: tronquer(c.name, 24),
          description: c.city ?? undefined,
        })),
      }],
    }
  }

  if (resolution.type === 'choisir_personne') {
    const medecin = await nomMedecin(resolution.doctorId)
    await enregistrer(waId, { doctor_id: resolution.doctorId, etape: 'choix_personne', contexte: {} })
    return {
      etape: 'choix_personne',
      sorties: [{
        type: 'liste',
        texte: T.quellePersonne(medecin),
        bouton: T.btnListePersonnes,
        // Prénoms seuls : un nom complet en dit trop si le téléphone est partagé.
        lignes: [
          ...resolution.personnes.slice(0, 9).map((p) => ({
            id: `pers:${p.patientId}`,
            titre: tronquer(p.prenom, 24),
          })),
          { id: 'pers:autre', titre: T.ligneAutrePersonne },
        ],
      }],
    }
  }

  // Cabinet et personne connus (ou cabinet connu, patient à créer).
  const { doctorId, patientId } = resolution
  return menuAccueil(doctorId, patientId, waId, conv)
}

/** Le menu : salutation nominative et les actions possibles. */
async function menuAccueil(
  doctorId: string,
  patientId: string | null,
  waId: string,
  conv: Conversation | null
): Promise<Resultat> {
  const supabase = createAdminClient()
  const [{ data: medecin }, { data: fiche }] = await Promise.all([
    supabase.from('doctors').select('name, city').eq('id', doctorId).maybeSingle(),
    patientId
      ? supabase.from('patients').select('first_name').eq('id', patientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  await enregistrer(waId, { doctor_id: doctorId, patient_id: patientId, etape: 'accueil', contexte: {} })

  const nom = medecin?.name ?? ''
  const ville = medecin?.city ?? null

  // « Mon prochain RDV » n'a pas de sens pour une fiche qui n'existe pas encore.
  const boutons: Bouton[] = patientId
    ? [
        { id: 'rdv', titre: T.btnPrendreRdv },
        { id: 'prochain', titre: T.btnProchainRdv },
        { id: 'secretaire', titre: T.btnSecretaire },
      ]
    : [
        { id: 'rdv', titre: T.btnPrendreRdv },
        { id: 'secretaire', titre: T.btnSecretaire },
      ]

  return {
    etape: 'accueil',
    sorties: [{
      type: 'boutons',
      texte: fiche?.first_name ? T.accueilConnu(fiche.first_name, nom, ville) : T.accueilCabinet(nom, ville),
      boutons,
    }],
  }
}

/**
 * L'âge est-il nécessaire pour créer ce rendez-vous ?
 *
 * `POST /api/appointments` l'exige pour toute réservation publique chez un
 * médecin au forfait Cabinet (`plan !== 'agenda'`) : sans lui, la création est
 * refusée en 400 et le chatbot passait la main sans que personne comprenne
 * pourquoi. Mais au forfait Agenda, ce même endpoint EFFACE l'âge — ce forfait
 * ne collecte aucune donnée démographique (règle CNDP). Poser la question
 * reviendrait donc à collecter ce qu'on s'est engagé à ne pas collecter.
 *
 * Et on ne la pose jamais pour rien : si la fiche porte déjà un âge ou une date
 * de naissance, on l'a. Redemander son âge à un patient connu du cabinet est
 * la meilleure façon d'avoir l'air d'un formulaire.
 *
 * @returns l'âge connu, ou null s'il faut le demander, ou undefined si ce
 *          médecin n'en a pas besoin.
 */
async function ageNecessaire(
  doctorId: string,
  patientId: string | null
): Promise<number | null | undefined> {
  const supabase = createAdminClient()
  const { data: medecin } = await supabase
    .from('doctors').select('plan').eq('id', doctorId).maybeSingle()
  if (!medecin || medecin.plan === 'agenda') return undefined

  if (patientId) {
    const { data: fiche } = await supabase
      .from('patients').select('age, birth_date').eq('id', patientId).maybeSingle()
    if (fiche?.age != null) return fiche.age
    const calcule = ageFromBirthDate(fiche?.birth_date)
    if (calcule != null) return calcule
  }
  return null
}

async function nomMedecin(doctorId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('doctors').select('name').eq('id', doctorId).maybeSingle()
  return data?.name ?? ''
}

async function etapeMotif(conv: Conversation): Promise<Resultat> {
  const supabase = createAdminClient()

  // GARDE STRUCTURELLE : l'âge se résout ICI, à l'entrée des motifs, et non
  // chez chacun des appelants.
  //
  // Elle y était avant, côté traiter.ts, appelée par deux chemins sur trois :
  // celui de la famille (« le rendez-vous est pour qui ? ») filait droit vers
  // les motifs, l'âge n'était jamais demandé, et la création échouait en 400
  // sans que rien ne l'explique au patient. C'était la troisième fois qu'un
  // chemin contournait une étape obligatoire — alors on supprime la
  // possibilité de contourner plutôt que de corriger le chemin fautif.
  const ageConnu = await ageNecessaire(conv.doctor_id!, conv.patient_id)
  if (ageConnu === null && conv.contexte.age == null) {
    const { data: fichePour } = conv.patient_id
      ? await supabase.from('patients').select('first_name').eq('id', conv.patient_id).maybeSingle()
      : { data: null }
    const prenom = fichePour?.first_name ?? conv.contexte.prenom ?? null

    await enregistrer(conv.wa_id, { etape: 'age', contexte: conv.contexte })
    return {
      etape: 'age',
      sorties: [{ type: 'texte', texte: prenom ? T.demanderAgePour(prenom) : T.demanderAge }],
    }
  }
  // Âge déjà connu : on le met en contexte pour que la création l'envoie sans
  // relire la fiche.
  if (typeof ageConnu === 'number' && conv.contexte.age == null) {
    conv = { ...conv, contexte: { ...conv.contexte, age: ageConnu } }
  }
  const [{ data: motifs }, { data: medecin }] = await Promise.all([
    supabase
      .from('consultation_types')
      .select('id, name, duration_minutes, default_price')
      .eq('doctor_id', conv.doctor_id)
      .eq('active', true)
      .order('name'),
    supabase.from('doctors').select('show_prices').eq('id', conv.doctor_id).maybeSingle(),
  ])

  const liste = motifs ?? []

  // Aucun motif déclaré : on ne pose pas une question sans réponse possible,
  // la durée de base du médecin s'applique.
  if (liste.length === 0) {
    await enregistrer(conv.wa_id, { etape: 'jour', contexte: { ...conv.contexte, motifId: null } })
    return etapeJour({ ...conv, etape: 'jour', contexte: { ...conv.contexte, motifId: null } })
  }

  await enregistrer(conv.wa_id, { etape: 'motif', contexte: conv.contexte })
  return {
    etape: 'motif',
    sorties: [{
      type: 'liste',
      texte: T.quelMotif,
      bouton: T.btnListeMotifs,
      // Le prix suit EXACTEMENT le réglage du médecin dans MonRDV (lib/tarifs.ts),
      // il n'y a pas de second interrupteur pour WhatsApp.
      // Le NOM au titre, la durée et le tarif à la description. Le titre est
      // aussi ce que le patient revoit dans sa propre bulle après avoir
      // choisi : un nom coupé net y resterait affiché.
      lignes: liste.slice(0, 10).map((m) => ({
        id: `motif:${m.id}`,
        titre: tronquer(m.name, 24),
        description: tronquer(detailMotif(m, medecin?.show_prices), 72),
      })),
    }],
  }
}

async function etapeJour(conv: Conversation): Promise<Resultat> {
  const dispo = await disponibilitesSurPeriode(conv.doctor_id!, JOURS_PROPOSES, conv.contexte.motifId)
  // Le lien se construit depuis la fiche DÉJÀ chargée : `lienPublic` relisait
  // la table `doctors` pour la seule colonne `slug`, juste après que
  // `disponibilitesSurPeriode` venait de la lire.
  const lienMedecin = dispo?.medecin.slug ? `${APP_URL}/dr-${dispo.medecin.slug}` : APP_URL

  if (!dispo || dispo.jours.length === 0) {
    await enregistrer(conv.wa_id, { etape: 'accueil', contexte: {} })
    return {
      etape: 'accueil',
      sorties: [{ type: 'texte', texte: T.aucuneDispo(dispo?.medecin.name ?? '', lienMedecin) }],
    }
  }

  await enregistrer(conv.wa_id, { etape: 'jour', contexte: conv.contexte })
  return {
    etape: 'jour',
    sorties: [{
      type: 'liste',
      texte: T.quelJour(dispo.medecin.name),
      bouton: T.btnListeJours,
      lignes: [
        ...dispo.jours.map((j) => ({
          id: `jour:${j.date}`,
          titre: tronquer(j.libelle, 24),
          description: T.ligneJour(j.creneaux.length),
        })),
        { id: 'plus_tard', titre: T.lignePlusTard, description: T.descriptionPlusTard },
      ],
    }],
  }
}

async function etapeHeure(conv: Conversation, date: string): Promise<Resultat> {
  // On re-interroge les disponibilités plutôt que de réutiliser la liste du
  // tour précédent : entre deux messages, un autre patient a pu réserver.
  const dispo = await disponibilitesSurPeriode(conv.doctor_id!, JOURS_PROPOSES, conv.contexte.motifId)
  const jour = dispo?.jours.find((j) => j.date === date)

  if (!jour) {
    return etapeJour({ ...conv, contexte: { ...conv.contexte, date: undefined } })
  }

  const creneaux = jour.creneaux.slice(0, CRENEAUX_PAR_JOUR)
  const contexte: Contexte = {
    ...conv.contexte,
    date,
    libelleJour: formatDateFr(date),
    creneauxProposes: creneaux,
  }
  await enregistrer(conv.wa_id, { etape: 'heure', contexte })

  return {
    etape: 'heure',
    sorties: [{
      type: 'liste',
      texte: T.quelleHeure(formatDateFr(date)),
      bouton: T.btnListeHeures,
      lignes: creneaux.map((h) => ({ id: `heure:${h}`, titre: h.replace(':', 'h') })),
    }],
  }
}

async function etapeConfirmation(conv: Conversation, heure: string): Promise<Resultat> {
  // GARDE-FOU : l'heure doit figurer parmi celles réellement proposées au tour
  // précédent. Sans ce contrôle, un identifiant forgé — ou un futur modèle de
  // langage — pourrait faire écrire un RDV hors agenda.
  if (!conv.contexte.creneauxProposes?.includes(heure)) {
    return etapeJour(conv)
  }

  const supabase = createAdminClient()
  const [{ data: medecin }, { data: fiche }] = await Promise.all([
    supabase.from('doctors').select('name').eq('id', conv.doctor_id).maybeSingle(),
    conv.patient_id
      ? supabase.from('patients').select('first_name').eq('id', conv.patient_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const contexte: Contexte = { ...conv.contexte, heure }
  await enregistrer(conv.wa_id, { etape: 'confirmation', contexte })

  const pour = fiche?.first_name ?? conv.contexte.prenom ?? null

  return {
    etape: 'confirmation',
    sorties: [{
      type: 'boutons',
      texte: T.recapitulatif(
        medecin?.name ?? '',
        quand(conv.contexte.date!, heure),
        conv.contexte.motifLibelle ?? 'Consultation',
        pour
      ),
      boutons: [
        { id: 'confirmer', titre: T.btnConfirmer },
        { id: 'changer', titre: T.btnChanger },
      ],
    }],
  }
}


export { ageNecessaire, etapeAccueil, etapeMotif, etapeJour, etapeHeure, etapeConfirmation, charger, enregistrer, estUrgence, demandeUnHumain, recommence, quand, APP_URL, JOURS_PROPOSES, CRENEAUX_PAR_JOUR, INCOMPREHENSIONS_MAX }
export type { Contexte, Conversation }
