-- v45 — Un blocage est soit une journée entière, soit un intervalle complet.
-- La contrainte protège les nouvelles écritures sans casser les éventuelles
-- données historiques incomplètes (à corriger depuis l'agenda si présentes).
ALTER TABLE public.blocked_dates
  DROP CONSTRAINT IF EXISTS blocked_dates_time_pair;
ALTER TABLE public.blocked_dates
  ADD CONSTRAINT blocked_dates_time_pair CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  ) NOT VALID;
