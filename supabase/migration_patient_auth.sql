-- ============================================================
-- Migration : Authentification patients
-- Copiez et exécutez ce SQL dans Supabase > SQL Editor
-- ============================================================

-- 1. Ajouter colonnes email et user_id à la table patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Index pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_patients_email   ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);

-- 3. RLS : les patients connectés peuvent voir leurs propres rendez-vous
-- (via le user_id ou l'email qui correspond)
CREATE POLICY IF NOT EXISTS "patients can view own appointments"
  ON appointments FOR SELECT
  USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE user_id = auth.uid()
    )
  );

-- 4. RLS : les patients peuvent annuler leurs propres RDV
--    (la route /api/cancel utilise déjà le cancel_token, pas besoin de RLS ici)

-- Vérification finale
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;
