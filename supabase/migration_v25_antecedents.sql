-- Antécédents structurés : ajoute « chirurgies » et « vaccins » à la fiche patient.
-- (allergies, maladies chroniques et traitements existent déjà.)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS surgeries TEXT;       -- antécédents chirurgicaux
ALTER TABLE patients ADD COLUMN IF NOT EXISTS vaccinations TEXT;    -- vaccins / statut vaccinal
