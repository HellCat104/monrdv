-- Blocage de créneau horaire : plusieurs blocages possibles le même jour
-- (une urgence 13h-14h + un congé, etc.). start_time/end_time existent déjà.
ALTER TABLE blocked_dates DROP CONSTRAINT IF EXISTS blocked_dates_doctor_id_date_key;
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE blocked_dates ADD COLUMN IF NOT EXISTS end_time   TIME;
CREATE INDEX IF NOT EXISTS idx_blocked_dates_doctor_date ON blocked_dates(doctor_id, date);
