-- Rattache un certificat au rendez-vous (consultation) où il a été émis,
-- pour regrouper note + ordonnances + certificats dans le résumé de consultation.
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_appointment ON certificates(appointment_id);
