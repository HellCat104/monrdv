-- ============================================================================
-- Migration v23 — Certificats médicaux + favoris d'ordonnance
-- Additive et idempotente. À lancer une fois.
-- ============================================================================

-- Certificats émis (le contenu est figé à l'émission : valeur d'archive)
CREATE TABLE IF NOT EXISTS certificates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,             -- repos | sport | scolaire | permis | courrier | analyses | libre
  title      TEXT NOT NULL,             -- ex : « Certificat médical de repos »
  motif      TEXT,                      -- raison saisie par le médecin (ex : grippe)
  content    TEXT NOT NULL,             -- texte final imprimé
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificates_patient
  ON certificates(patient_id, created_at DESC);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Médecin : gérer ses certificats" ON certificates;
CREATE POLICY "Médecin : gérer ses certificats" ON certificates
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- Lignes d'ordonnance favorites du médecin (tableau de textes)
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS prescription_favorites JSONB NOT NULL DEFAULT '[]'::jsonb;
