-- Prématurité : terme de naissance en semaines d'aménorrhée (SA).
-- Si < 37 SA, les courbes de croissance utilisent l'âge corrigé jusqu'à 24 mois.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gestational_age_weeks INT CHECK (gestational_age_weeks BETWEEN 22 AND 43);
