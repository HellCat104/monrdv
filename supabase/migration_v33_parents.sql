-- Dossier enfant (pédiatrie) : noms des parents / tuteurs — facultatifs
ALTER TABLE patients ADD COLUMN IF NOT EXISTS parent1_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS parent2_name TEXT;
