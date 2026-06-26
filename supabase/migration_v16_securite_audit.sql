-- ============================================================================
-- Migration v16 — Corrections de l'audit de sécurité
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
-- ============================================================================

-- 1) Idempotence des rappels J-1 (HAUTE)
-- Sans marque "rappel envoyé", un rejeu du cron Vercel renvoyait l'email au
-- patient. On ajoute une colonne ; le cron filtre désormais dessus.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- 2) Immuabilité du médecin signataire d'une note signée (HAUTE, médico-légal)
-- Le trigger v11 gelait le contenu et la signature, mais PAS doctor_id : une
-- note signée pouvait être réattribuée à un autre praticien. On l'interdit,
-- tout en gardant la réassignation patient_id (nécessaire à la fusion de fiches).
-- On ajoute aussi SET search_path = public (durcissement).
CREATE OR REPLACE FUNCTION protect_signed_notes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Une note signée ne peut pas être supprimée';
    END IF;
    RETURN OLD;
  ELSE
    IF OLD.signed_at IS NOT NULL
       AND (NEW.note IS DISTINCT FROM OLD.note
            OR NEW.signed_at IS DISTINCT FROM OLD.signed_at) THEN
      RAISE EXCEPTION 'Une note signée ne peut pas être modifiée';
    END IF;
    -- Le médecin signataire est immuable (le patient_id reste modifiable pour la fusion).
    IF OLD.signed_at IS NOT NULL
       AND NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
      RAISE EXCEPTION 'Le médecin signataire d''une note signée est immuable';
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

-- 3) Cohérence comptable : un montant payé ne peut pas dépasser le montant dû.
-- (Double sécurité : déjà validé côté API, on le garantit aussi en base.)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS chk_paid_not_over_due;
ALTER TABLE appointments ADD CONSTRAINT chk_paid_not_over_due
  CHECK (amount_paid IS NULL OR amount_due IS NULL OR amount_paid <= amount_due);

-- ============================================================================
-- Fin de la migration v16
-- ============================================================================
