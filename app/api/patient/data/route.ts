// API droits patients (loi 09-08) : accès, rectification, effacement
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getNowInMaroc } from '@/lib/utils'
import { format } from 'date-fns'
import {
  proposerCreneauLibere, creneauDuRdv, effacerInscriptionsDesPatients, type CreneauLibere,
} from '@/lib/waitlist'

// GET — Droit d'accès : retourne toutes les données du patient
//
// L'export ne contenait que l'identité de base et les rendez-vous. L'écran
// promet pourtant « toutes les données que MonRDV détient sur vous », et la
// politique de confidentialité « l'ensemble des données vous concernant » —
// alors que « Mon dossier » affiche au même patient ses ordonnances, ses
// constantes et ses vaccins. Un export qui montre moins que l'application
// elle-même ne tient pas la promesse d'un droit d'accès.
//
// Ce qui reste volontairement dehors : `appointments.doctor_notes`, les notes
// personnelles du praticien. Elles ne sont pas destinées au dossier et
// n'entrent pas dans le droit d'accès ; la projection ci-dessous ne les
// demande pas. Les fichiers eux-mêmes ne sont pas embarqués non plus — trop
// lourds pour un JSON — mais leur inventaire l'est, pour que le patient sache
// ce qui existe et puisse le réclamer.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Fiche complète : l'identité étendue et le contenu médical saisi par le
  // cabinet font partie des données personnelles du patient.
  //
  // CETTE LISTE EST À TENIR À JOUR. Énumérer les colonnes protège des fuites
  // involontaires, mais elle se périme en silence : cinq colonnes ajoutées
  // depuis — l'anamnèse structurée et sa date, les étiquettes de pathologie,
  // les antécédents familiaux, les données d'organisme — n'étaient pas
  // remises au patient qui demandait son dossier. Toute colonne ajoutée à
  // `patients` doit arriver ici le même jour.
  const { data: patients } = await adminDb
    .from('patients')
    .select(`id, first_name, last_name, phone, email, is_child, created_at,
             birth_date, age, sex, blood_group, cin, mutuelle, address, notes,
             allergies, chronic_conditions, current_treatments, surgeries,
             vaccines, vaccinations, milestones, gestational_age_weeks,
             parent1_name, parent2_name, parent1_phone, parent2_phone,
             anamnese, anamnese_maj, conditions, family_history, insurer_data`)
    .eq('user_id', user.id)

  const patientIds = (patients ?? []).map((p: any) => p.id)

  const vide = { data: [] as any[] }
  const [
    aptRes, presRes, certRes, notesRes, vitalsRes, docsRes, recallsRes,
    dentRes, histRes, devisRes, versRes, packsRes,
  ] = patientIds.length === 0
    ? [vide, vide, vide, vide, vide, vide, vide, vide, vide, vide, vide, vide]
    : await Promise.all([
      adminDb.from('appointments')
        .select('id, date, time, status, notes, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('date', { ascending: false }),
      adminDb.from('prescriptions')
        .select('id, content, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('certificates')
        .select('id, type, title, motif, content, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('consultation_notes')
        .select('id, note, signed_at, created_at, doctor:doctors(name, specialty)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('vital_signs')
        .select('id, measured_at, values, created_at')
        .in('patient_id', patientIds).order('measured_at', { ascending: false }),
      // Inventaire des fichiers, pas les fichiers : nom, type, date.
      //
      // `file_size` a longtemps été demandé ici alors que la colonne n'existait
      // pas : la requête échouait à chaque appel et, le résultat étant lu en
      // `docsRes.data ?? []`, l'inventaire des documents arrivait VIDE chez le
      // patient, en silence. La colonne existe depuis la v62 (2026-10-01) ;
      // la taille est donc de nouveau rendue. Une colonne retirée de la base
      // reproduirait la panne : toute modification de cette projection doit
      // s'accompagner d'une migration.
      adminDb.from('patient_documents')
        .select('id, file_name, file_type, file_size, created_at')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('recalls')
        .select('id, due_date, reason, status, sent_at, created_at')
        .in('patient_id', patientIds).order('due_date', { ascending: false }),
      adminDb.from('dental_charts').select('patient_id, teeth, updated_at').in('patient_id', patientIds),
      adminDb.from('tooth_history')
        .select('id, tooth, states_before, states_after, note, created_at')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('quotes')
        .select('id, label, status, notes, created_at, items:quote_items(tooth, label, unit_price, quantity, done, done_at)')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
      adminDb.from('quote_payments')
        .select('id, amount, payment_method, paid_at, invoice_no, note')
        .in('patient_id', patientIds).order('paid_at', { ascending: false }),
      adminDb.from('session_packages')
        .select('id, label, total_sessions, used_sessions, amount, status, created_at')
        .in('patient_id', patientIds).order('created_at', { ascending: false }),
    ])

  return NextResponse.json({
    account: { email: user.email, created_at: user.created_at },
    patients: patients ?? [],
    appointments: aptRes.data ?? [],
    ordonnances: presRes.data ?? [],
    certificats: certRes.data ?? [],
    notes_de_consultation: notesRes.data ?? [],
    constantes: vitalsRes.data ?? [],
    documents: docsRes.data ?? [],
    rappels_de_suivi: recallsRes.data ?? [],
    schema_dentaire: dentRes.data ?? [],
    historique_dentaire: histRes.data ?? [],
    devis: devisRes.data ?? [],
    versements: versRes.data ?? [],
    forfaits_de_seances: packsRes.data ?? [],
  })
}

// PATCH — Droit de rectification : modifier téléphone ou email
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { phone, email } = body

  // Validation format
  const phoneRegex = /^\+?[\d\s\-().]{7,20}$/
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (phone && !phoneRegex.test(String(phone).trim())) {
    return NextResponse.json({ error: 'Format de téléphone invalide' }, { status: 400 })
  }
  if (email && !emailRegex.test(String(email).trim())) {
    return NextResponse.json({ error: 'Format d\'email invalide' }, { status: 400 })
  }

  const adminDb = createAdminClient()

  const updates: Record<string, string> = {}
  if (phone) updates.phone = String(phone).trim().substring(0, 20)
  if (email) updates.email = String(email).trim().substring(0, 254)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 })
  }

  await adminDb
    .from('patients')
    .update(updates)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}

// DELETE — Droit à l'effacement : supprime le compte et les données
export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adminDb = createAdminClient()

  // Récupère les IDs patients
  const { data: patients } = await adminDb
    .from('patients')
    .select('id')
    .eq('user_id', user.id)

  const patientIds = (patients ?? []).map((p: any) => p.id)

  // Créneaux libérés par l'effacement, proposés à la liste d'attente en fin de
  // requête (voir plus bas).
  const liberes: CreneauLibere[] = []

  // Annule les RDV futurs
  if (patientIds.length > 0) {
    // Jour calendaire MAROCAIN : `new Date().toISOString()` donnait le jour UTC,
    // décalé d'un jour entre minuit et 1 h du matin à Casablanca.
    const today = format(getNowInMaroc(), 'yyyy-MM-dd')
    // `.select()` : les lignes réellement annulées — preuve que l'écriture a
    // porté, et liste exacte des créneaux libérés. Cette annulation est la
    // PREMIÈRE écriture de l'effacement : si elle échoue, on s'arrête ici, rien
    // n'est encore détruit et le patient peut réessayer. Continuer aurait laissé
    // des rendez-vous futurs réservés au nom d'un « Supprimé », places bloquées.
    const { data: annules, error: errAnnulation } = await adminDb
      .from('appointments')
      .update({ status: 'cancelled' })
      .in('patient_id', patientIds)
      .gte('date', today)
      .neq('status', 'cancelled')
      .select('id, doctor_id, date, time, duration_minutes, walk_in')
    if (errAnnulation) {
      console.error('[effacement] annulation des rendez-vous futurs :', errAnnulation.message)
      return NextResponse.json({ error: 'La suppression n\'a pas pu aboutir. Réessayez.' }, { status: 500 })
    }
    for (const r of annules ?? []) liberes.push(creneauDuRdv('annulation', r))

    // Liste d'attente : les inscriptions (et leurs offres, par cascade) sont
    // SUPPRIMÉES, pas seulement fermées — une ligne fermée dirait encore
    // « cette personne attendait une place chez ce médecin ». Un échec est
    // journalisé par la fonction ; il ne bloque pas l'effacement : l'adresse
    // e-mail est retirée de la fiche juste en dessous, aucune offre ne pourrait
    // donc plus partir vers cette personne.
    await effacerInscriptionsDesPatients(patientIds)

    // Anonymise les données patient (ne supprime pas les RDV passés pour le médecin).
    // Efface aussi tout le dossier médical enrichi (loi 09-08 : suppression réelle
    // des données personnelles à la demande de la personne concernée).
    //
    // ── CE QUI SURVIVAIT À UNE DEMANDE D'EFFACEMENT ────────────────────────
    //
    // La liste s'arrêtait à trois champs médicaux. Tout le reste restait en
    // base sous le nom « Supprimé » : le NUMÉRO DE CIN, la date de naissance,
    // l'adresse, le sexe, le groupe sanguin, les chirurgies, les antécédents
    // familiaux, l'anamnèse structurée, les coordonnées des parents. Avec un
    // numéro de carte d'identité nationale et une date de naissance, la
    // personne était ré-identifiable immédiatement : l'anonymisation n'en
    // était pas une.
    //
    // Les colonnes NOT NULL reprennent leur valeur par défaut plutôt que NULL,
    // qui serait refusé par la base — et un refus silencieux ici laisserait
    // tout en place.
    const { error: errAnonymisation } = await adminDb
      .from('patients')
      .update({
        first_name: 'Supprimé', last_name: '', phone: '', email: null, user_id: null,
        // Identité
        age: null, birth_date: null, sex: null, cin: null, address: null,
        blood_group: null, mutuelle: null, gestational_age_weeks: null,
        family_id: null,
        parent1_name: null, parent2_name: null, parent1_phone: null, parent2_phone: null,
        email_bounced_at: null, email_bounce_reason: null,
        // Dossier médical porté par la fiche elle-même
        notes: null,
        allergies: null, chronic_conditions: null, current_treatments: null,
        surgeries: null, family_history: null, vaccinations: null,
        anamnese: null, anamnese_maj: null,
        milestones: {}, vaccines: {}, conditions: [], insurer_data: {},
        // Marqueur d'effacement (v91). Il est posé AVANT la purge : c'est lui
        // qui autorise la suppression de l'historique dentaire, journal
        // append-only qui refuse toute autre main. Sans la migration, la
        // colonne n'existe pas et l'écriture échouerait pour tout le reste :
        // elle part donc dans une seconde écriture, juste après.
      })
      .in('id', patientIds)
    // L'erreur n'était pas regardée : l'anonymisation pouvait échouer pendant
    // que la suite détruisait le dossier, et la réponse annonçait un succès.
    // On ne s'arrête pas pour autant — les rendez-vous futurs sont déjà
    // annulés — mais la trace existe, et le patient n'est pas trompé.
    if (errAnonymisation) {
      console.error('[effacement] anonymisation de la fiche :', errAnonymisation.message)
      return NextResponse.json({
        error: 'La suppression n\'a pas pu aboutir entièrement. Contactez le cabinet.',
      }, { status: 500 })
    }

    // Le marqueur, à part : sans la v91 la colonne n'existe pas, et la
    // joindre à l'écriture ci-dessus aurait fait échouer TOUTE
    // l'anonymisation pour un champ qui n'en est pas une.
    const { error: errMarqueur } = await adminDb
      .from('patients').update({ efface_le: new Date().toISOString() }).in('id', patientIds)
    const marqueurPose = !errMarqueur
    if (errMarqueur) {
      console.warn('[effacement] marqueur efface_le absent (migration v91 non passée) :', errMarqueur.message)
    }

    // ── LA PURGE DU DOSSIER MÉDICAL ───────────────────────────────────────
    //
    // Le principe est celui que ce fichier applique déjà : LE MÉDICAL PART,
    // LE COMPTABLE RESTE. Les devis, leurs versements, les factures et les
    // rendez-vous passés appartiennent à la comptabilité du cabinet et
    // survivent, rattachés à une fiche devenue anonyme. Tout ce qui décrit un
    // corps s'en va.
    //
    // Une table ABSENTE n'est pas une erreur : toutes les migrations ne sont
    // pas passées sur toutes les bases, et une branche non installée ne doit
    // pas faire échouer l'effacement d'un patient. Un échec RÉEL, lui, est
    // retenu et annoncé : mieux vaut dire « contactez le cabinet » que
    // promettre une suppression qui n'a pas eu lieu.
    const tablesMedicales = [
      'consultations',         // la consultation structurée (toutes branches)
      'dental_charts',         // l'odontogramme
      'tooth_history',         // son journal — n'ouvre que sur `efface_le` (v91)
      'perio_charts',          // les relevés parodontaux
      'ortho_treatments',      // l'orthodontie (ses visites partent en cascade)
      'patient_pathologies',   // les pathologies suivies
      'vaccinations',          // le calendrier vaccinal
      'endoscopies',           // les examens endoscopiques
      'resultats',             // les résultats d'examens
      'certificates',          // les certificats — le patient en a sa copie
      'care_sheets',           // les feuilles de soins (leurs actes en cascade)
      'lab_works',             // les travaux de prothèse ; la DÉPENSE reste
      'whatsapp_conversations',// les échanges (leurs messages en cascade)
    ]
    const echecs: string[] = []
    for (const table of tablesMedicales) {
      const { error } = await adminDb.from(table).delete().in('patient_id', patientIds)
      if (!error) continue
      // 42P01 / PGRST205 : la table n'existe pas sur cette base.
      if (error.code === '42P01' || error.code === 'PGRST205') continue
      console.error(`[effacement] purge de ${table} impossible :`, error.message)
      echecs.push(table)
    }
    if (echecs.length > 0) {
      return NextResponse.json({
        error: marqueurPose
          ? 'Une partie du dossier médical n\'a pas pu être supprimée. Contactez le cabinet.'
          : 'Une partie du dossier médical n\'a pas pu être supprimée (migration v91 en attente). Contactez le cabinet.',
      }, { status: 500 })
    }

    // Efface tout le dossier médical rattaché (loi 09-08 : suppression réelle)
    await adminDb.from('consultation_notes').delete().in('patient_id', patientIds)
    await adminDb.from('prescriptions').delete().in('patient_id', patientIds)
    await adminDb.from('vital_signs').delete().in('patient_id', patientIds)
    await adminDb.from('recalls').delete().in('patient_id', patientIds)

    // Documents : supprime les fichiers du stockage PUIS les lignes en base
    const { data: docs } = await adminDb
      .from('patient_documents')
      .select('file_path')
      .in('patient_id', patientIds)
    const paths = (docs ?? []).map((d: { file_path: string }) => d.file_path).filter(Boolean)
    if (paths.length > 0) {
      await adminDb.storage.from('patient-documents').remove(paths)
    }
    await adminDb.from('patient_documents').delete().in('patient_id', patientIds)
  }

  // Supprime le compte auth
  await adminDb.auth.admin.deleteUser(user.id)

  // LISTE D'ATTENTE — chaque rendez-vous futur annulé ci-dessus libère une
  // place. Proposées en dernier : le compte est déjà effacé, et un incident ici
  // ne peut plus rien empêcher. proposerCreneauLibere écarte d'elle-même les
  // créneaux déjà passés (rendez-vous de ce matin) et ne lève jamais.
  await Promise.allSettled(liberes.map((c) => proposerCreneauLibere(c)))

  return NextResponse.json({ success: true })
}
