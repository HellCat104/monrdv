-- Groupe sanguin (tous patients) + date de naissance (indispensable aux courbes
-- de croissance et à l'âge en mois pour les pédiatres). Additive.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_group TEXT;   -- A+, A-, B+, … O-, ou NULL
ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date DATE;    -- date de naissance précise
