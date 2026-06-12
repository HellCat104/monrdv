-- ============================================================================
-- Migration v2 — Outil de gestion de cabinet
-- À lancer dans Supabase → SQL Editor → New query → Run
-- Ajoute : motifs de consultation, dossier patient enrichi, durées variables,
--          paiements, et prépare les notes de consultation.
-- Idempotent : peut être relancé sans erreur (IF NOT EXISTS partout).
-- ============================================================================

-- ── 1. Motifs de consultation (durées variables) ───────────────────────────
CREATE TABLE IF NOT EXISTS consultation_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id        UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  duration_minutes INT  NOT NULL DEFAULT 30,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_types_doctor
  ON consultation_types(doctor_id) WHERE active = true;

ALTER TABLE consultation_types ENABLE ROW LEVEL SECURITY;

-- Le médecin gère ses propres motifs
DROP POLICY IF EXISTS "Médecin : gérer ses motifs" ON consultation_types;
CREATE POLICY "Médecin : gérer ses motifs" ON consultation_types
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- Lecture publique des motifs actifs (page de réservation patient)
DROP POLICY IF EXISTS "Public : voir les motifs actifs" ON consultation_types;
CREATE POLICY "Public : voir les motifs actifs" ON consultation_types
  FOR SELECT
  USING (active = true);


-- ── 2. Notes de consultation (historique du dossier patient) ────────────────
CREATE TABLE IF NOT EXISTS consultation_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  note           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_notes_patient
  ON consultation_notes(patient_id, created_at DESC);

ALTER TABLE consultation_notes ENABLE ROW LEVEL SECURITY;

-- Données médicales sensibles : strictement réservées au médecin propriétaire
DROP POLICY IF EXISTS "Médecin : gérer ses notes" ON consultation_notes;
CREATE POLICY "Médecin : gérer ses notes" ON consultation_notes
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));


-- ── 3. Dossier patient enrichi ──────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS allergies           TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS chronic_conditions  TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS current_treatments  TEXT;


-- ── 4. Rendez-vous : motif, durée variable, paiement ────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_type_id UUID
  REFERENCES consultation_types(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS amount_paid      NUMERIC(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ;

-- ============================================================================
-- Fin de la migration v2
-- ============================================================================
