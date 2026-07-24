-- Rattache une mesure de constantes au rendez-vous où elle a été prise, afin
-- qu'elle apparaisse dans le résumé de la consultation et sur le dossier du RDV.
-- (Les mesures existantes restent valides : appointment_id NULL = saisie hors RDV.)
ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_vital_signs_appointment ON vital_signs(appointment_id);
