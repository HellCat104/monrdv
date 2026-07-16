-- Patients « sans RDV » (walk-in) : ajoutés directement à la file du jour,
-- sans réserver de créneau. Ils ne doivent donc jamais entrer en collision
-- avec les RDV planifiés → on les exclut des contraintes d'unicité et de
-- non-chevauchement.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS walk_in BOOLEAN DEFAULT false;

-- Un seul RDV planifié par créneau (les walk-ins sont hors de cette règle).
-- (unique_active_appointment était un doublon de unique_active_slot → supprimé.)
DROP INDEX IF EXISTS unique_active_slot;
DROP INDEX IF EXISTS unique_active_appointment;
CREATE UNIQUE INDEX unique_active_slot ON appointments(doctor_id, date, time)
  WHERE status <> 'cancelled' AND walk_in = false;

-- Non-chevauchement : idem, on ignore les walk-ins.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_overlapping_appointments;
ALTER TABLE appointments ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    doctor_id WITH =,
    tsrange(
      (date + time)::timestamp,
      (date + time)::timestamp + make_interval(mins => COALESCE(duration_minutes, 30))
    ) WITH &&
  ) WHERE (status <> 'cancelled' AND date >= DATE '2026-06-12' AND walk_in = false);
