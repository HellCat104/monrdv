-- ============================================================================
-- Migration v3 — Tarifs, factures marocaines, ordonnances
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent : peut être relancé sans erreur.
-- ============================================================================

-- ── #2 Prix par défaut par motif de consultation ────────────────────────────
ALTER TABLE consultation_types ADD COLUMN IF NOT EXISTS default_price NUMERIC(10,2);

-- ── #7 Identifiants légaux marocains du médecin (facture) ───────────────────
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS ice  TEXT;  -- Identifiant Commun de l'Entreprise
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS inpe TEXT;  -- Identifiant National des Professions de santé

-- ── #5 Ordonnances ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prescriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient
  ON prescriptions(patient_id, created_at DESC);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Données médicales sensibles : strictement réservées au médecin propriétaire
DROP POLICY IF EXISTS "Médecin : gérer ses ordonnances" ON prescriptions;
CREATE POLICY "Médecin : gérer ses ordonnances" ON prescriptions
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- ============================================================================
-- Fin de la migration v3
-- ============================================================================
