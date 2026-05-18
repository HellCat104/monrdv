-- ============================================================
-- Migration : Ajout champ ville aux médecins
-- Copiez et exécutez ce SQL dans Supabase > SQL Editor
-- ============================================================

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS city text;

CREATE INDEX IF NOT EXISTS idx_doctors_city ON doctors(city);

-- Vérification
SELECT id, name, specialty, city FROM doctors LIMIT 5;
