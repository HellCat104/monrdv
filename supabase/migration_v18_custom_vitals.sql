-- Migration v18 — Constantes de suivi personnalisées par médecin
-- À lancer UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- Permet à chaque médecin de créer ses propres constantes (au-delà de la liste
-- standard) : ex. cardiologue → HbA1c, bilan lipidique, créatinine, INR, TP…
-- Chaque constante = { key, label, unit, step? }. Les valeurs saisies restent
-- stockées dans vital_signs.values (déjà un JSONB clé→nombre), donc rien à
-- changer côté mesures.

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS custom_vitals JSONB NOT NULL DEFAULT '[]'::jsonb;
