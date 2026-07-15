-- Dossier patient : email + adresse postale (courriers, factures, rappels email)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email   TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT;
