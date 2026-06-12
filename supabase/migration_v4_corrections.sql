-- ============================================================================
-- Migration v4 — Corrections de la review (sécurité & robustesse)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent : peut être relancé sans erreur.
-- ============================================================================

-- ── 1. Anti-chevauchement garanti par la base ───────────────────────────────
-- L'index unique existant ne protège que les RDV démarrant à la MÊME heure.
-- Avec les durées variables, deux RDV peuvent se chevaucher sans partager
-- l'heure de départ (ex: 10:00/45min et 10:30/15min). Cette contrainte
-- d'exclusion rejette toute insertion/modification dont l'intervalle
-- [début, début+durée) chevauche un RDV non annulé du même médecin.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Backfill : les anciens RDV n'ont pas de duration_minutes → on leur donne
-- la durée de base actuelle de leur médecin (meilleure approximation).
UPDATE appointments a
SET duration_minutes = d.appointment_duration
FROM doctors d
WHERE a.doctor_id = d.id AND a.duration_minutes IS NULL;

-- Contrainte d'exclusion (30 min par défaut si durée absente).
-- Limitée aux dates futures : le backfill ci-dessus est une approximation et
-- d'anciens RDV pourraient théoriquement se chevaucher (changement de durée
-- de base au fil du temps) — on ne veut pas bloquer la migration pour ça.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_appointments'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT no_overlapping_appointments
      EXCLUDE USING gist (
        doctor_id WITH =,
        tsrange(
          (date + time)::timestamp,
          (date + time)::timestamp + make_interval(mins => COALESCE(duration_minutes, 30))
        ) WITH &&
      ) WHERE (status <> 'cancelled' AND date >= DATE '2026-06-12');
  END IF;
END $$;

-- ── 2. Policy publique des motifs plus stricte ──────────────────────────────
-- Avant : tous les motifs actifs étaient lisibles publiquement.
-- Après : seulement ceux des médecins approuvés et actifs (ceux qui ont
-- réellement une page publique de réservation).
DROP POLICY IF EXISTS "Public : voir les motifs actifs" ON consultation_types;
CREATE POLICY "Public : voir les motifs actifs" ON consultation_types
  FOR SELECT
  USING (
    active = true
    AND doctor_id IN (
      SELECT id FROM doctors
      WHERE status = 'approved' AND subscription_status = 'actif'
    )
  );

-- ============================================================================
-- Fin de la migration v4
-- ============================================================================
