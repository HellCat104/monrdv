-- Migration : autoriser la re-reservation des creneaux annules
-- A executer dans Supabase > SQL Editor.

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS unique_slot;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot
  ON appointments (doctor_id, date, time)
  WHERE status <> 'cancelled';
