-- Calendrier vaccinal structuré (pédiatrie) : { "cle_vaccin": "YYYY-MM-DD" (date faite) }
ALTER TABLE patients ADD COLUMN IF NOT EXISTS vaccines JSONB NOT NULL DEFAULT '{}'::jsonb;
