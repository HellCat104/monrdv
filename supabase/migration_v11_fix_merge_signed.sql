-- ============================================================================
-- Migration v11 — Permettre la fusion de fiches même avec des notes signées
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent (CREATE OR REPLACE).
--
-- Le verrou v10 bloquait TOUTE modification d'une note signée, ce qui empêchait
-- la fusion de fiches (qui déplace les notes vers une autre fiche). On affine :
-- le CONTENU et la SIGNATURE restent immuables (garantie médico-légale), mais
-- la réassignation administrative (changement de patient_id lors d'une fusion)
-- est autorisée.
-- ============================================================================

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
    -- Note signée : on bloque uniquement la modification du contenu ou de la
    -- signature. Le reste (ex. réassignation patient_id à la fusion) est permis.
    IF OLD.signed_at IS NOT NULL
       AND (NEW.note IS DISTINCT FROM OLD.note OR NEW.signed_at IS DISTINCT FROM OLD.signed_at) THEN
      RAISE EXCEPTION 'Une note signée ne peut pas être modifiée';
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

-- ============================================================================
-- Fin de la migration v11
-- ============================================================================
