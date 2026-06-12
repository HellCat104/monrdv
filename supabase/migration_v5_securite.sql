-- ============================================================================
-- Migration v5 — Fermeture des accès publics directs à la base (audit)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent : peut être relancé sans erreur.
--
-- Contexte : les réservations publiques passent par /api/appointments qui
-- utilise le client admin (service_role, bypass RLS) et fait toutes les
-- validations (médecin approuvé, créneau libre, sanitisation, etc.).
-- Ces policies permettaient de contourner l'API et d'écrire/lire
-- directement dans la base avec la simple clé anon (publique). On les ferme.
--
-- Vérifié avant suppression :
-- • Médecin : "patients_own" et "appointments_own" (FOR ALL) couvrent
--   toujours ses INSERT depuis le dashboard → rien ne casse.
-- • Annulation par email : page + API utilisent le client admin → rien ne casse.
-- ============================================================================

-- 1. Un anonyme ne peut plus créer de patient directement dans la base
DROP POLICY IF EXISTS "Public : créer un patient" ON patients;

-- 2. Un anonyme ne peut plus créer de RDV directement dans la base
--    (bypass total des validations : médecin non approuvé, créneau pris,
--    jour même, spam en masse, contenu non sanitisé…)
DROP POLICY IF EXISTS "Public : créer un RDV" ON appointments;

-- 3. Un anonyme ne peut plus LIRE les RDV. L'ancienne policy
--    USING (cancel_token IS NOT NULL) rendait lisibles publiquement
--    quasiment tous les RDV — dates, heures, notes ET leurs tokens
--    d'annulation (permettant d'annuler les RDV d'autrui).
DROP POLICY IF EXISTS "Public : voir RDV par token" ON appointments;

-- ============================================================================
-- Fin de la migration v5
-- ============================================================================
