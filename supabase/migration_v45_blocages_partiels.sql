-- ⚠️ DÉJÀ APPLIQUÉE EN PRODUCTION le 2026-08-27. Ne pas relancer.
-- Ce fichier documente le schéma réel : il avait disparu du dépôt lors de
-- l'annulation du commit 7d50f3d, alors que son SQL avait déjà été exécuté.

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
