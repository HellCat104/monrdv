-- Pédiatrie v2 : sexe de l'enfant (couloirs OMS garçon/fille sur les courbes)
-- + repères de développement psychomoteur (grilles à cocher par âge)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('M', 'F'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '{}'::jsonb;
