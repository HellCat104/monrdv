-- Mode confidentiel : la secrétaire ne voit que le strict minimum (nom, heure, tél),
-- jamais le motif, le type de consultation, les antécédents ni les ordonnances.
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS confidential_mode BOOLEAN DEFAULT false;

-- RDV récurrents : chaque occurrence est un vrai RDV (déplaçable/annulable
-- individuellement) ; recurrence_group_id relie les occurrences d'une même série.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_appointments_recurrence ON appointments(recurrence_group_id);
