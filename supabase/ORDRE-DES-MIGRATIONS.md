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

## Obtenir un état réellement à jour

L'instantané `schema.sql` vieillit à chaque migration. Pour une image fidèle
de la production :

```bash
pg_dump --schema-only --no-owner "$DATABASE_URL" > supabase/dump.sql
```

La chaîne `DATABASE_URL` se trouve dans Supabase → Project Settings → Database.
