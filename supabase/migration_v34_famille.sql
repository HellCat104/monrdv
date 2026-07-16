-- Module famille (pédiatrie) : téléphone de chaque parent, contact à prévenir
-- en priorité, et lien fratrie (les enfants d'une même famille partagent family_id).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS parent1_phone TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS parent2_phone TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_contact TEXT CHECK (primary_contact IN ('parent1', 'parent2'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS family_id UUID;
CREATE INDEX IF NOT EXISTS idx_patients_family ON patients(family_id);
