# Ordre d'application des migrations

Ce dossier n'a **pas** de système de migration automatique : chaque fichier est
exécuté à la main dans l'éditeur SQL de Supabase.

## Pour recréer la base à partir de zéro

1. Exécuter `schema.sql` — c'est la **base de départ figée au 2026-06-06**, pas
   l'état actuel.
2. Exécuter **toutes** les migrations ci-dessous, dans cet ordre. Sauter une
   seule d'entre elles peut laisser en place des règles de sécurité obsolètes.

Les fichiers sont écrits pour être rejouables (`IF NOT EXISTS`,
`DROP POLICY IF EXISTS`) : les relancer ne casse rien.

> Deux numéros portent deux fichiers (**v7** et **v28**), héritage d'un
> développement parallèle. Les deux doivent être exécutés ; l'ordre entre eux
> est indifférent.

## Liste

  2. `migration_v2_cabinet.sql`  
     Migration v2 — Outil de gestion de cabinet
  3. `migration_v3_cabinet.sql`  
     Migration v3 — Tarifs, factures marocaines, ordonnances
  4. `migration_v4_corrections.sql`  
     Migration v4 — Corrections de la review (sécurité & robustesse)
  5. `migration_v5_securite.sql`  
     Migration v5 — Fermeture des accès publics directs à la base (audit)
  6. `migration_v6_consent.sql`  
     Migration v6 — Trace du consentement légal (loi 09-08)
  7. `migration_v7_sprint1.sql`  
     Migration v7 — Sprint 1 : paiements partiels + documents patient
  7. `migration_v7_suivi_constantes.sql`  
     Migration v7 — Rappels de suivi + Constantes vitales (par spécialité)
  8. `migration_v8_securite_doctors.sql`  
     Migration v8 — Ferme la lecture publique trop large de la table doctors
  9. `migration_v9_search_fix.sql`  
     Migration v9 — Corrige la recherche de médecins (search_doctors)
 10. `migration_v10_notes_signees.sql`  
     Migration v10 — Notes de consultation signées (verrouillage médico-légal)
 11. `migration_v11_fix_merge_signed.sql`  
     Migration v11 — Permettre la fusion de fiches même avec des notes signées
 12. `migration_v12_comptabilite.sql`  
     Migration v12 — Pack comptabilité
 13. `migration_v13_invoice_trigger.sql`  
     Migration v13 — Numérotation des factures 100% sans trou (trigger atomique)
 14. `migration_v14_multi_specialites.sql`  
     Migration v14 — Médecin multi-spécialités
 15. `migration_v15_doctors_column_privacy.sql`  
     Migration v15 — Confidentialité des colonnes médecin (loi 09-08)
 16. `migration_v16_securite_audit.sql`  
     Migration v16 — Corrections de l'audit de sécurité
 17. `migration_v17_avoirs.sql`  
     Migration v17 — Registre des factures d'avoir (conformité fiscale MA)
 18. `migration_v18_custom_vitals.sql`  
     Migration v18 — Constantes de suivi personnalisées par médecin
 19. `migration_v19_contact.sql`  
     Migration v19 — Coordonnées de contact publiques du médecin
 20. `migration_v20_dental_chart.sql`  
     Schéma dentaire (odontogramme) par patient — réservé aux dentistes.
 21. `migration_v21_cabinet_staff.sql`  
     Migration v21 — Comptes « secrétaire » (personnel du cabinet)
 22. `migration_v22_secretaire_v2.sql`  
     Migration v22 — Secrétaire v2 : case « J'ai une secrétaire », CIN/mutuelle,
 23. `migration_v23_certificats.sql`  
     Migration v23 — Certificats médicaux + favoris d'ordonnance
 24. `migration_v24_cert_appointment.sql`  
     Rattache un certificat au rendez-vous (consultation) où il a été émis,
 25. `migration_v25_antecedents.sql`  
     Antécédents structurés : ajoute « chirurgies » et « vaccins » à la fiche patient.
 26. `migration_v26_groupe_naissance.sql`  
     Groupe sanguin (tous patients) + date de naissance (indispensable aux courbes
 27. `migration_v27_vaccins.sql`  
     Calendrier vaccinal structuré (pédiatrie) : { "cle_vaccin": "YYYY-MM-DD" (date faite) }
 28. `migration_v28_blocage_creneau.sql`  
     Blocage de créneau horaire : plusieurs blocages possibles le même jour
 28. `migration_v28_blocked_slots.sql`  
     Blocage de créneaux HORAIRES (pas seulement des journées entières).
 29. `migration_v29_confidentiel_et_recurrence.sql`  
     Mode confidentiel : la secrétaire ne voit que le strict minimum (nom, heure, tél),
 30. `migration_v30_patient_email_adresse.sql`  
     Dossier patient : email + adresse postale (courriers, factures, rappels email)
 31. `migration_v31_walk_in.sql`  
     Patients « sans RDV » (walk-in) : ajoutés directement à la file du jour,
 32. `migration_v32_pediatrie.sql`  
     Pédiatrie v2 : sexe de l'enfant (couloirs OMS garçon/fille sur les courbes)
 33. `migration_v33_parents.sql`  
     Dossier enfant (pédiatrie) : noms des parents / tuteurs — facultatifs
 34. `migration_v34_famille.sql`  
     Module famille (pédiatrie) : téléphone de chaque parent, contact à prévenir
 35. `migration_v35_prematurite.sql`  
     Prématurité : terme de naissance en semaines d'aménorrhée (SA).
 36. `migration_v36_rdv_enfant.sql`  
     « Pour mon enfant » : les fiches enfant créées depuis le compte parent sont
 37. `migration_v37_doctors_rls_authenticated.sql`  
     Migration v37 — Fuite des données professionnelles des médecins (audit sécurité)
 38. `migration_v38_vitals_rdv.sql`  
     Rattache une mesure de constantes au rendez-vous où elle a été prise, afin
 39. `migration_v39_forfaits.sql`  
     Forfaits : Agenda (149 DH) / Cabinet complet (299 DH)
 40. `migration_v40_code_delegue.sql`  
     Code délégué (parrainage commercial)
 41. `migration_v41_forfaits_seances.sql`  
     Forfaits de séances (psychologues, kinésithérapeutes, suivis réguliers)
 42. `migration_v42_precompta.sql`  
     Pré-comptabilité : justificatifs de dépense
 43. `migration_v43_integrite_patient_et_blocages.sql`  
     ⚠️ DÉJÀ APPLIQUÉE EN PRODUCTION le 2026-08-27. Ne pas relancer.
 44. `migration_v44_audit_et_staff.sql`  
     ⚠️ DÉJÀ APPLIQUÉE EN PRODUCTION le 2026-08-27. Ne pas relancer.
 45. `migration_v45_blocages_partiels.sql`  
     ⚠️ DÉJÀ APPLIQUÉE EN PRODUCTION le 2026-08-27. Ne pas relancer.
 46. `migration_v46_delai_prevenance.sql`  
     Délai de prévenance : ouvrir la réservation le jour même.
 47. `migration_v47_facturation_forfait.sql`  
     La numérotation des factures ne concerne que le Cabinet complet.
 48. `migration_v48_charges_fixes.sql`  
     Charges fixes : dépenses récurrentes (loyer, salaires, eau, assurances).
 49. `migration_v49_affichage_tarifs.sql`  
     Le médecin choisit si ses tarifs sont visibles des patients.
 50. `migration_v50_protege_certificats.sql`  
     Un patient porteur de certificats ne peut plus être supprimé.
 51. `migration_v51_verrou_compte_medecin.sql`  
     Un compte connecté ne peut plus s'attribuer le statut de médecin.
 52. `migration_v52_trigger_invoker.sql`  
     La protection du compte médecin ne se déclenchait jamais (SECURITY DEFINER).
 53. `migration_v53_photos_medecins.sql`  
     Chaque médecin ne peut écrire que SA photo.
 54. `migration_v54_devis.sql`  
     Devis (plans de traitement chiffrés) et paiement échelonné : `quotes`,
     `quote_items`, `quote_payments`, `quote_installments`. Les versements
     puisent leur numéro dans le compteur `invoice_counters` existant, jamais
     dans une seconde série.
 55. `migration_v55_historique_dents.sql`  
     Historique par dent : `tooth_history`, journal append-only (RLS sans
     policy + trigger) alimenté par `app/api/dental/[id]`. Retire au navigateur
     le droit d'écrire `dental_charts` : **déployer le code AVANT** de lancer
     cette migration.
 56. `migration_v56_liste_attente.sql`  
     Liste d'attente : `doctors.waitlist_enabled` (défaut activé), tables
     `waitlist_entries` (une inscription = un rendez-vous existant) et
     `waitlist_offers` (un e-mail = un jeton = un créneau), trigger qui ferme
     l'inscription d'un rendez-vous annulé. Ordre de déploiement indifférent :
     le code tolère l'absence de la migration.
 57. `migration_v57_logo_cabinet.sql`  
     Logo du cabinet sur les ordonnances : colonne `doctors.logo_path` (un
     chemin, pas une URL, forcé à commencer par l'identifiant du médecin),
     bucket dédié `cabinet-logos` en lecture publique, écriture interdite
     depuis tout navigateur par des politiques restrictives — seule la route
     `app/api/doctors/logo` écrit, après examen des octets du fichier. Ordre de
     déploiement indifférent : sans migration, l'ordonnance s'affiche sans logo.
 58. `migration_v58_validite_devis.sql`  
     Validité d'un devis : colonne `quotes.validity_text` (texte libre du
     médecin, NULL par défaut, imprimé « Valable » + texte sur le devis),
     contrainte `quotes_validity_text_check` (1 à 120 caractères, sans espaces
     aux extrémités ni retour à la ligne). Aucune policy modifiée. Ordre de
     déploiement indifférent : sans migration, le devis s'imprime sans ligne de
     validité et la saisie d'une validité est refusée avec un message explicite.
 59. `migration_v59_rebonds_email.sql`  
     Rebonds d'e-mail rapportés par le webhook Resend (`app/api/webhooks/resend`) :
     journal `email_events` (RLS sans policy, `svix_id` unique = idempotence),
     colonnes `email_bounced_at` / `email_bounce_reason` sur `patients` et
     `cabinet_staff`, fonction `enregistrer_evenement_email` (journal + fiches
     en une seule transaction, exécutable par le seul service_role), trigger
     `email_rebond_suit_adresse` (SECURITY INVOKER) qui efface le drapeau dès
     que l'adresse change et interdit au navigateur de le poser ou de l'effacer
     à la main. Ordre de déploiement indifférent ; la lancer AVANT d'activer le
     webhook dans Resend évite une journée de nouvelles tentatives en erreur.

 60. `migration_v60_coordonnees_cabinet.sql`  
     Migration v60 — Coordonnées GPS du cabinet : `latitude`/`longitude` sur
     `doctors`, avec une contrainte « couple complet ou rien » et des bornes
     terrestres. Alimente le balisage schema.org `geo` de la fiche publique,
     émis UNIQUEMENT si les coordonnées existent — c'est lui qui fait remonter
     le cabinet sur les recherches « près de moi ». Le médecin les saisit en
     collant un lien Google Maps, résolu par `/api/geo/resoudre`.

 61. `migration_v61_lien_carte.sql`  
     Migration v61 — Lien de carte du cabinet, pour le bouton « Y aller » du
     patient. Complète la v60 : quand les coordonnées exactes manquent, le lien
     collé par le médecin sert de repli plutôt que d'ouvrir une recherche vide.

 62. `migration_v62_taille_documents.sql`  
     Migration v62 — `patient_documents.file_size`, reprise des tailles depuis
     `storage.objects`, et limite de 10 Mo posée sur le dépôt lui-même. Corrige
     un défaut ancien : l'export des données du patient demandait `file_size`,
     colonne inexistante — la requête échouait et l'inventaire des documents
     ressortait VIDE, en silence.

 63. `migration_v63_quota_stockage.sql`  
     Migration v63 — Quota de stockage par cabinet : `doctors.storage_limit_mb`
     (5 Go par défaut), ajouté au verrou `protect_doctor_plan` pour qu'un
     médecin ne relève pas sa propre limite, et trigger `verifier_quota_stockage`
     qui lève `QUOTA_STOCKAGE` avant l'insertion. Jauge visible dans les
     Paramètres.

 64. `migration_v64_journal_forfaits.sql`  
     Migration v64 — Journal des séances d'un forfait (`session_package_uses`) :
     un mouvement = une séance consommée ou rendue, datée. Corrige aussi le
     déclencheur de la v41, qui recalculait le statut à chaque écriture et
     faisait repasser en « terminé » un forfait ANNULÉ dont les séances étaient
     consommées.

 65. `migration_v65_feuilles_soins.sql`  
     Migration v65 — Feuilles de soins (CNSS/AMO, CNOPS, FAR, assurances) :
     `care_sheets` + `care_sheet_items`, et `patients.insurer_data` en jsonb —
     les champs demandés diffèrent selon l'organisme. L'organisme et l'assuré
     sont RECOPIÉS sur la feuille au moment de l'établir : une feuille est une
     pièce justificative, elle ne doit pas changer quand la fiche change.
     **Épisode à retenir** : passée début octobre sans `notify pgrst`, les
     tables existaient et PostgREST les ignorait — l'API répondait 500 et
     `insurer_data` était écarté en silence. Trois semaines de confusion pour
     une ligne manquante.

 66. `migration_v66_faces_dentaires.sql`  
     Migration v66 — `faces_before`/`faces_after` sur `tooth_history`.
     Facultative : sans elle, l'insertion est rejouée sans ces colonnes. Les
     faces elles-mêmes vivent dans `dental_charts.teeth`, rien à migrer.

 67. `migration_v67_seances_devis.sql`  
     Migration v67 — Le plan de traitement en séances : `quote_items.session_no`
     (1 à 20). Un devis disait QUOI et COMBIEN, jamais QUAND — or un plan à
     12 000 DH ne se décide pas sans savoir en combien de fois. À ne pas
     confondre avec `appointment_id` (v54), qui désigne le rendez-vous RÉEL.

 68. `migration_v68_laboratoire.sql`  
     Migration v68 — Travaux de prothèse : `lab_works` (type, dents, laboratoire,
     teinte, envoi, retour attendu, réception, statut, coût) et
     `doctors.lab_slip_naming`. L'enjeu n'est pas d'enregistrer, c'est de ne pas
     découvrir le retard le jour du rendez-vous.

 69. `migration_v69_parodonte.sql`  
     Migration v69 — Relevés parodontaux : `perio_charts`, un relevé DATÉ par
     visite, jamais écrasé — c'est l'écart entre deux relevés qui soigne, pas
     la dernière valeur. Même colonne jsonb pour la saisie simple (une poche par
     dent) et le charting à 6 sites.

 70. `migration_v70_orthodontie.sql`  
     Migration v70 — `ortho_treatments` + `ortho_visits`. L'argent reste au
     devis (`quote_id`) et n'est jamais redéclaré ici : un traitement qui porte
     ses propres montants finit par contredire la comptabilité.

 71. `migration_v71_rappels_a_appeler.sql`  
     Migration v71 — Statut `a_rappeler` sur `recalls`, et la contrainte CHECK
     qui n'existait PAS (les quatre statuts n'étaient qu'un commentaire depuis
     la v7). Corrige un défaut réel : un rappel dont le patient n'a pas d'e-mail
     était marqué « envoyé » pour ne pas boucler — donc personne n'était
     prévenu, et le rappel disparaissait en silence. C'est le rendez-vous que le
     médecin perd sans savoir qu'il l'a perdu.

 72. `migration_v72_etiquettes_pathologies.sql`  
     Migration v72 — `patients.conditions text[]` + index GIN, pour retrouver
     une cohorte (« tous mes diabétiques »). `chronic_conditions` est CONSERVÉ :
     le texte libre porte la nuance clinique, l'étiquette sert à RETROUVER.
     Aucune étiquette n'est devinée depuis l'ancien texte — une étiquette fausse
     sur une fiche médicale est pire qu'une étiquette absente.

 73. `migration_v73_whatsapp.sql`  
     Migration v73 — Chatbot WhatsApp : `patients.phone_norm` (colonne générée au
     format `wa_id` de Meta + index, sans quoi la recherche par numéro échoue en
     SILENCE et tout patient connu passe pour un inconnu), `appointments.channel`
     (mesurer l'absentéisme par canal), et les tables `whatsapp_conversations` /
     `whatsapp_messages` avec RLS médecin + secrétaire. `wa_message_id` est
     UNIQUE : c'est la garantie d'idempotence contre les rejeux de webhook de
     Meta, qui créeraient autrement deux rendez-vous au même patient.
     Additive et rejouable. Ne pas oublier `notify pgrst, 'reload schema';`.

 74. `migration_v74_photos_cabinet.sql`  
     Migration v74 — Photos du cabinet sur la fiche publique : dépôt
     `cabinet-photos` (public en lecture, 2 Mo, JPEG seulement, écriture fermée
     aux navigateurs par policies RESTRICTIVES comme en v57), colonne
     `doctors.photos text[]` dont l'ORDRE est l'ordre d'affichage, et trigger
     `protect_doctor_photos` en SECURITY INVOKER qui refuse l'écriture depuis un
     navigateur ET vérifie le format des chemins même en service_role (5 au
     maximum, chacun préfixé par l'identifiant de CE médecin). Le navigateur
     redimensionne et réencode en JPEG avant l'envoi, donc le serveur ne reçoit
     qu'un seul format. Hors du quota de 5 Go de la v63 : le maximum est connu
     d'avance (~1,5 Mo par cabinet). Additive et rejouable ; sans elle l'encart
     des Paramètres annonce que la fonction n'est pas activée et la fiche
     publique s'affiche comme avant. `notify pgrst, 'reload schema';` ensuite.

 75. `migration_v75_escalade_traitee.sql`  
     Migration v75 — `whatsapp_conversations.escalade_traitee_le` : une escalade
     traitée se referme SANS s'effacer. « Ouverte » devient « escalade_le
     renseignée ET escalade_traitee_le vide », même logique que `recalls.status`
     (v71). Effacer aurait fait perdre le compte des passages de main et leurs
     causes — justement la mesure qui dira si le chatbot s'améliore. Index
     partiel dédié aux escalades ouvertes. Additive et rejouable ; sans elle
     l'encart du tableau de bord n'apparaît simplement pas.
     `notify pgrst, 'reload schema';` ensuite.

 76. `migration_v76_salle_attente_partagee.sql`  
     Migration v76 — la salle d'attente parle dans les deux sens. Quatre
     colonnes sur `appointments` : `queue_arrived_at` et `queue_started_at`,
     posées par le DÉCLENCHEUR `trg_horodate_file` et jamais par l'application
     (quatre chemins écrivent `queue_status` ; un seul oubli rendrait la durée
     d'attente affichée fausse, ce qui est pire que de ne rien afficher) ;
     `reprogrammer_jours`, borné à 730 jours, par lequel le médecin demande à
     l'accueil de redonner un rendez-vous ; `appel_suivant_le`, signal fugace
     « faites entrer le suivant », effacé d'un clic et ignoré passé un quart
     d'heure. Le déclencheur gère l'INSERT à part : le patient sans rendez-vous
     naît directement « arrivé ». Deux index partiels. Aucun GRANT à écrire —
     colonnes sur une table existante. Additive et rejouable ; sans elle les
     encarts ne s'affichent simplement pas.
     `notify pgrst, 'reload schema';` ensuite.

 78. `migration_v78_branches_developpees.sql`  
     Migration v78 — pas de branche développée, pas de Cabinet complet.
     MonRDV est un tronc (le forfait Agenda, la relation secrétaire-médecin,
     commune à toutes les spécialités) et des branches (le Cabinet complet
     n'est que l'interface du MÉDECIN, adaptée à sa spécialité). Trois
     branches à ce jour : médecine générale, pédiatrie, dentisterie. Une
     spécialité sans branche n'a aucune interface de consultation à proposer,
     et son forfait s'arrête à la prise de rendez-vous. La règle est tenue par
     un DÉCLENCHEUR, pas par le code : `canAccess` est appelé depuis
     quarante-six endroits, et l'un d'eux finirait par l'oublier. Nommé
     `z_trg_forfait_selon_branche` à dessein, pour passer APRÈS
     `trg_protect_doctor_plan` (v63), qui restaure sinon l'ancien forfait par
     -dessus. Met aussi à niveau les comptes existants. Rien n'est supprimé :
     un cabinet dont la branche s'ouvrira retrouve ses données en repassant au
     forfait complet. Attention — la liste des branches vit AUSSI dans
     lib/plan.ts (`brancheDeveloppee`), pour expliquer le blocage à l'écran :
     les deux doivent changer ensemble.
     `notify pgrst, 'reload schema';` ensuite.

 79. `migration_v79_vaccinations.sql`  
     Migration v79 — `vaccinations` : les vaccins administrés au cabinet,
     BRANCHE GÉNÉRALISTE. Libellé libre (la liste de l'écran est une aide, pas
     une contrainte : un vaccin du voyageur ne figure dans aucune nomenclature
     courte), date d'administration, lot, dose, date de rappel indicative.
     Distincte de `patients.vaccines` (v27), qui porte le calendrier
     PÉDIATRIQUE sous la forme `{clé: date}` : un vaccin d'adulte a un lot et
     peut être répété, ce qu'une clé unique ne sait pas représenter, et y
     mélanger une seconde forme casserait le calendrier qui parcourt ces clés.
     Table nouvelle, donc GRANTS explicites et RLS côté médecin seulement —
     la secrétaire n'a aucune politique : un acte médical ne relève pas d'elle.
     Additive ; sans elle l'écran s'affiche et le dit, mais n'enregistre pas.
     `notify pgrst, 'reload schema';` ensuite.

 80. `migration_v80_gastro_dossier.sql`
     Migration v80 — BRANCHE GASTRO-ENTÉROLOGIE, partie A (le dossier).
     Ouvre le Cabinet complet à la gastro-entérologie en remplaçant la fonction
     `branche_developpee()` de la v78 (même signature, `set search_path`
     conservé, le déclencheur n'est pas retouché). Ajoute
     `patients.family_history` — les antécédents FAMILIAUX décident de la
     conduite ici : un cancer colorectal chez un parent du premier degré avance
     la première coloscopie de dix ans, et les écrire dans
     `chronic_conditions` revenait à prêter au patient la maladie de son père.
     Ajoute `patient_documents.categorie` (biologie | imagerie |
     anatomopathologie | compte_rendu | autre), NULL sur l'existant : on ne
     reclasse pas à la place du praticien. Additive ; sans elle la fiche
     s'enregistre et le dit, mais sans les antécédents familiaux.
     `notify pgrst, 'reload schema';` est dans le fichier.

 81. `migration_v81_gastro_actes.sql`
     Migration v81 — BRANCHE GASTRO, parties B à G. Tables `consultations`,
     `endoscopies`, `preparation_protocols`, `prescription_templates`,
     `resultats` ; `recalls` étendu (source, notes, statuts). Toutes les
     colonnes cliniques sont NULLABLE : une rubrique vide ne s'imprime pas, et
     `observations` ne contient que les régions réellement explorées — une clé
     absente ne vaut pas constatation normale. Déclencheur `fige_document_valide`
     : un document validé ne se modifie plus, verrou en base et non à l'écran.
     GRANTS explicites, RLS médecin seul (aucune politique secrétaire sur ces
     cinq tables : données de santé).

 82. `migration_v82_gastro_pathologies.sql`
     Migration v82 — BRANCHE GASTRO : `patient_pathologies`, la fiche de
     synthèse d'une maladie suivie au long cours (libellé, date de diagnostic,
     statut, traitement, évolution). Distincte de `patients.conditions` (v72),
     qui porte des ÉTIQUETTES servant aux cohortes et ne peut pas porter une
     histoire. Toutes les colonnes sont saisies : le logiciel ne qualifie
     jamais une évolution, il compte seulement les actes depuis le diagnostic.
     RLS médecin seul. Additive ; sans elle le bloc ne s'affiche pas.

 83. `migration_v83_branche_tableau_vide.sql`
     Migration v83 — CORRECTIF. `branche_developpee` utilisait
     `coalesce(p_specialties, array[p_specialty])` : `coalesce` ne remplace que
     NULL, donc un `specialties` à `{}` produisait une chaîne vide, aucune
     branche, et le déclencheur basculait le médecin en forfait Agenda à la
     PREMIÈRE modification de sa fiche. Sa spécialité s'affichait pourtant à
     l'écran, elle venait de `specialty`. La fonction teste désormais la
     longueur du tableau. Même piège corrigé onze fois côté TypeScript
     (`specialitesDu()` dans types/index.ts).

 84. `migration_v84_urgence.sql`
     Migration v84 — L'URGENCE, TRONC COMMUN (toutes spécialités).
     `appointments.urgent` (booléen, false par défaut) : coché à la main par
     qui répond au téléphone. Aucun score, aucun tri automatique, aucune
     conduite à tenir — un logiciel qui calculerait « gravité modérée » sur une
     hémorragie digestive serait dangereux. Index partiel : on ne cherche que
     les urgences. Documente aussi la valeur `queue_status = 'hopital'`,
     adressage aux urgences : le patient quitte le circuit du jour sans être
     compté comme une consultation terminée. Pas de contrainte ajoutée sur
     `queue_status` (jamais contrainte depuis la v22) : c'est l'API qui
     contrôle les valeurs. Additive.

 77. `migration_v77_mot_sur_le_rdv.sql`  
     Migration v77 — `appointment_messages` : un mot entre le médecin et
     l'accueil, ATTACHÉ au rendez-vous et non dans un fil général, parce qu'un
     fil perd le lien (« elle demande si c'est possible » — de qui parle-t-on ?).
     `appointment_id` reste nullable : un fil de cabinet tiendrait dans la même
     table sans rien reconstruire. `auteur` est posé par le SERVEUR, jamais par
     le navigateur — le poste d'accueil ne doit pas pouvoir signer « le
     médecin ». Pas de « lu / non lu » : les deux écrans se rafraîchissent déjà
     seuls. Table NOUVELLE, donc GRANTS explicites (service_role complet,
     authenticated en lecture + insertion, RIEN pour anon) et RLS des deux
     côtés. Additive ; sans elle les cartes ne s'affichent pas.
     `notify pgrst, 'reload schema';` ensuite.


## Toute nouvelle table arrive avec ses droits

Depuis le **30 octobre 2026**, Supabase n'accorde plus automatiquement l'accès
à l'API aux tables créées dans `public`. Une table sans `GRANT` répond
« permission denied », quelles que soient ses politiques RLS : le droit ouvre
la porte, la politique filtre les lignes — il faut les deux.

Les tables existantes ne sont pas concernées, elles gardent leurs droits.

Pour les suivantes, les `GRANT` s'écrivent **dans la migration qui crée la
table**. Et on ne recopie pas un modèle tout fait : les v15, v37 et v51 ont
justement RETIRÉ des droits sur `doctors` pour fermer une fuite (e-mail, CNOM,
INPE, ICE lisibles par tout compte connecté). Chaque table reçoit ce dont elle
a besoin, et rien de plus.

## Obtenir un état réellement à jour

L'instantané `schema.sql` vieillit à chaque migration. Pour une image fidèle
de la production :

```bash
pg_dump --schema-only --no-owner "$DATABASE_URL" > supabase/dump.sql
```

La chaîne `DATABASE_URL` se trouve dans Supabase → Project Settings → Database.

 85. `migration_v85_consultation_dentaire.sql`
     Migration v85 — BRANCHE DENTAIRE. Deux colonnes seulement sur
     `consultations` (v81), qui portait déjà tout ce qu'une consultation a de
     commun : `dents text[]` — les dents et secteurs touchés par CETTE séance,
     distinct du schéma dentaire qui porte l'état du patient dans la durée, en
     tableau pour pouvoir filtrer « les séances qui ont concerné la 46 » ; et
     `materiaux` — composite et teinte, ciment, alliage, longueur de travail,
     ce qu'on cherche trois ans plus tard quand une restauration se descelle.
     Index GIN sur `dents`. Aucun lien automatique entre consultation et actes
     facturés : déduire « acte réalisé » d'une consultation enregistrée
     produirait des doubles facturations. Additive.

 86. `migration_v86_catalogue_actes.sql`
     Migration v86 — LE CATALOGUE D'ACTES. On ÉTEND `consultation_types`
     plutôt que de créer une table `actes` : il existait déjà deux sources
     (cette table, qui porte nom, durée, tarif et actif/inactif, et le
     catalogue APPRIS des lignes de devis via /api/quotes/actes). Une
     troisième aurait donné trois endroits où le même acte existe sous trois
     formes, et trois prix qui divergent.
     Ajoute `code` (interne au cabinet, aucune nomenclature officielle n'est
     reproduite), `categorie`, `description`, `labo` (travail de prothèse
     associé), et deux drapeaux VRAIS par défaut : `rdv` (apparaît comme motif
     de rendez-vous) et `acte` (utilisable en ligne de devis) — tous les actes
     ne sont pas des motifs, « composite deux faces » se facture sans se
     réserver, et les mélanger polluait la page de réservation publique.
     Index unique partiel sur (doctor_id, code) : deux actes sans code ne sont
     pas des doublons. Additive, aucune ligne réécrite.

 87. `migration_v87_anamnese.sql`
     Migration v87 — L'ANAMNÈSE MÉDICALE STRUCTURÉE. Ajoute `patients.anamnese`
     (jsonb) et `patients.anamnese_maj` (date). Le dossier portait déjà quatre
     champs de TEXTE LIBRE (allergies, maladies chroniques, chirurgies,
     traitements) : un texte libre ne prévient personne. « Sintrom depuis
     2019 » écrit en 2022 dans un champ qu'on n'ouvre pas ne s'affiche nulle
     part le jour où on extrait une dent. Vingt-deux questions rangées, elles,
     sont RELUES PAR LE LOGICIEL et affichées d'elles-mêmes en haut du dossier
     et au-dessus de l'odontogramme.
     Un seul jsonb plutôt que vingt-deux colonnes : `patients` est une table du
     tronc commun, et chaque pédiatre aurait porté les colonnes du dentiste.
     Format { "<cle>": { "r": "oui|non|inconnu", "p": "précision" } } ; une clé
     ABSENTE veut dire « pas encore posée », ce qui n'est pas « non ».
     Les champs de texte libre restent en place et continuent d'alimenter la
     même bannière : un cabinet qui ne remplit jamais le questionnaire garde
     exactement ce qu'il avait. Additive, aucune RLS à ajouter.

 88. `migration_v88_stock.sql`
     Migration v88 — LE STOCK DU CABINET. Deux tables nouvelles :
     `stock_articles` (nom, catégorie, unité de comptage, quantité, seuil
     d'alerte, péremption la plus proche, fournisseur, référence, prix
     d'achat, `actif`) et `stock_mouvements` (sens entree/sortie/inventaire,
     quantité, `quantite_apres`, motif).
     C'était le seul poste du cabinet dentaire dont MonRDV ne savait rien :
     combien reste-t-il de composite, de cartouches, de gants ? On s'en
     apercevait au fauteuil, patient installé.
     La quantité vit sur l'article — on la lit cent fois par jour et une liste
     de quatre-vingts références qui additionnerait ses mouvements serait lente
     pour rien — mais elle n'est modifiable QUE par la fonction
     `stock_mouvement()`, qui écrit la ligne de journal et la nouvelle quantité
     dans la même transaction, sous `for update`. Sans ce verrou, le médecin au
     fauteuil et la secrétaire au comptoir lisent le même « 12 » et écrivent
     tous les deux « 11 ». SECURITY INVOKER, pour que la RLS s'applique comme
     à n'importe quelle requête.
     La quantité PEUT devenir négative, et c'est voulu : refuser une sortie au
     fauteuil ferait abandonner le module en une semaine, et ramener
     silencieusement à zéro mentirait dans le journal. Un nombre négatif ne
     peut venir que d'un comptage inexact : il est l'alerte lui-même.
     Pas d'`update` ni de `delete` sur les mouvements — un journal qu'on
     réécrit ne sert plus à rien ; une erreur se contre-passe. Index unique
     partiel sur (doctor_id, nom) des articles ACTIFS seulement : archiver
     « Gants M » doit laisser la place à un nouvel article du même nom.
     Aucune déduction automatique depuis les actes réalisés : « composite deux
     faces » ne consomme pas une quantité connue, et un stock décrémenté par
     une consultation donnerait des comptes faux avec l'autorité du chiffre.
     RLS médecin uniquement ; la secrétaire, qui tient souvent l'étagère,
     reste à ouvrir par une permission — une décision à prendre, pas un oubli.
     Additive, deux tables nouvelles, aucune ligne existante touchée.

 89. `migration_v89_postes.sql`
     Migration v89 — LES POSTES DE TRAVAIL : fauteuils et salles. Table
     `cabinet_postes` (nom, ordre, couleur, actif) + `appointments.poste_id`
     (nullable, `on delete set null` — démonter un fauteuil ne doit pas
     emporter les rendez-vous qui s'y sont tenus).
     Un cabinet à deux fauteuils ne POUVAIT PAS planifier deux patients à la
     même heure : la base le refusait, par `no_overlapping_appointments` (v4,
     v31). C'était juste quand un cabinet valait un fauteuil, et faux dès
     qu'il y en a deux — l'anesthésie qui fait effet d'un côté pendant qu'on
     détartre de l'autre est la journée normale d'un cabinet dentaire.
     La règle change de GRAIN, elle ne disparaît pas : plus de chevauchement
     SUR UN MÊME POSTE. `coalesce(poste_id, uuid nul)` fait du « non précisé »
     un poste à part entière — NULL = NULL est inconnu, et un index unique
     aurait laissé passer autant de doublons qu'on veut. Un cabinet qui ne
     déclare aucun poste garde donc exactement le comportement d'avant, sans
     rien migrer ni choisir.
     ORDRE DES OPÉRATIONS : on AJOUTE `unique_active_slot_poste` et
     `no_overlap_poste` AVANT de retirer `unique_active_slot` et
     `no_overlapping_appointments`. Les nouvelles étant strictement plus
     permissives, elles s'installent sans conflit tant que les anciennes
     tiennent ; si elles échouaient, l'agenda n'aurait pas passé une seconde
     sans protection contre les doubles réservations.
     Un poste N'EST PAS un second praticien : la réservation en ligne les
     ignore complètement et continue de ne proposer qu'un patient à la fois.
     `/api/slots` n'honore `?poste=` que pour un appelant CONNECTÉ, et répond
     alors en `private, no-store` — sinon un visiteur verrait libre un
     créneau que la création publique refuserait ensuite.
     RLS médecin ; rien pour `anon`. Additive.

 90. `migration_v90_suivi_remboursement.sql`
     Migration v90 — LE SUIVI DU REMBOURSEMENT. Ajoute à `care_sheets` :
     `remise_le` (date), `rembourse_le` (date) et `montant_rembourse`
     (numeric, contrainte de positivité posée à part pour rester rejouable).
     La v65 avait donné trois ÉTATS à une feuille de soins — établie, remise,
     remboursée — et aucune date ni aucun montant. Or la seule question qu'on
     se pose devant une feuille partie est « depuis quand attend-elle ? » :
     déposée il y a huit semaines, c'est un dossier à relancer ; déposée
     avant-hier, cela ne regarde personne. Sans date, les deux se
     ressemblaient. Et « remboursée » sans montant n'apprend rien non plus,
     les organismes marocains remboursant une PART : le patient qui demande
     ce qui lui reste à charge n'obtenait aucune réponse.
     AUCUN RATTRAPAGE : les feuilles déjà marquées « remise » gardent une date
     vide, parce qu'inventer un jour écrirait une information fausse dans un
     dossier. L'écran se rabat sur la date des SOINS — borne certaine, une
     feuille ne peut pas être partie avant les soins — et annonce « au plus
     tôt ».
     Ces colonnes NE SONT PAS une créance du cabinet et n'entrent dans aucun
     total comptable : le patient a déjà réglé, et c'est LUI que l'organisme
     rembourse. Index partiel sur les feuilles non remboursées (celles qu'on
     relance) et index de suivi (doctor_id, status, care_date desc).
     Additive. Sans elle, l'écran de suivi fonctionne en se passant des dates.
