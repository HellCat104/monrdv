-- ============================================================================
-- Migration v6 — Trace du consentement légal (loi 09-08)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
-- ============================================================================

-- Horodatage du consentement donné par le patient lors d'une réservation
-- publique (case "J'accepte le traitement de mes données" cochée).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

-- ============================================================================
-- Fin de la migration v6
-- ============================================================================
