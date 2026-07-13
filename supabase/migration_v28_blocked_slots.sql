-- Blocage de créneaux HORAIRES (pas seulement des journées entières).
-- start_time / end_time NULL = toute la journée bloquée (comportement historique).
-- Sinon : le créneau [start_time, end_time) est indisponible ce jour-là.
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS end_time   TIME;

-- L'ancienne contrainte UNIQUE(doctor_id, date) empêchait plusieurs blocages
-- le même jour (ex : pause déjeuner + visite après-midi). On la remplace.
ALTER TABLE blocked_dates DROP CONSTRAINT IF EXISTS blocked_dates_doctor_id_date_key;

CREATE INDEX IF NOT EXISTS idx_blocked_dates_doctor_date ON blocked_dates(doctor_id, date);
