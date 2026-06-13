-- ============================================================================
-- Migration v7 — Rappels de suivi + Constantes vitales (par spécialité)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
-- ============================================================================

-- ── #7 Constantes vitales : quelles constantes le médecin suit-il ? ─────────
-- Tableau de clés (ex: {weight,height,systolic,...}). NULL = valeurs par
-- défaut selon la spécialité (gérées côté application). Tableau vide = aucune.
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS enabled_vitals TEXT[];

-- Mesures de constantes (valeurs stockées en JSON pour rester flexibles)
CREATE TABLE IF NOT EXISTS vital_signs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  values      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vital_signs_patient
  ON vital_signs(patient_id, measured_at DESC);

ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Médecin : gérer ses constantes" ON vital_signs;
CREATE POLICY "Médecin : gérer ses constantes" ON vital_signs
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- ── #5 Rappels de suivi ("revenez dans X mois") ─────────────────────────────
CREATE TABLE IF NOT EXISTS recalls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | done | cancelled
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recalls_patient ON recalls(patient_id, due_date);
-- Index pour le cron : retrouver vite les rappels à envoyer
CREATE INDEX IF NOT EXISTS idx_recalls_due ON recalls(due_date) WHERE status = 'pending';

ALTER TABLE recalls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Médecin : gérer ses rappels" ON recalls;
CREATE POLICY "Médecin : gérer ses rappels" ON recalls
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- ============================================================================
-- Fin de la migration v7
-- ============================================================================
