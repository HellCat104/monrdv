-- ============================================================================
-- Migration v10 — Notes de consultation signées (verrouillage médico-légal)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
--
-- Une note "signée" (signed_at renseigné) ne peut plus être ni modifiée ni
-- supprimée — garanti par un trigger en base (pas seulement l'interface).
-- Tant qu'elle n'est pas signée, elle reste éditable/supprimable.
-- ============================================================================

ALTER TABLE consultation_notes ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- Bloque toute modification/suppression d'une note déjà signée.
-- (La signature elle-même = un UPDATE qui passe signed_at de NULL à une date,
--  autorisé car l'ancienne valeur était NULL.)
CREATE OR REPLACE FUNCTION protect_signed_notes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Une note signée ne peut pas être supprimée';
    END IF;
    RETURN OLD;
  ELSE
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Une note signée ne peut pas être modifiée';
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_signed_notes ON consultation_notes;
CREATE TRIGGER trg_protect_signed_notes
  BEFORE UPDATE OR DELETE ON consultation_notes
  FOR EACH ROW EXECUTE FUNCTION protect_signed_notes();

-- ============================================================================
-- Fin de la migration v10
-- ============================================================================
