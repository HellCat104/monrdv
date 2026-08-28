-- v46 — Délai de prévenance : ouvrir la réservation le jour même.
--
-- Le calendrier public interdisait toute réservation le jour même, alors que
-- le serveur, lui, acceptait la journée en cours. Chez un généraliste ou un
-- pédiatre, la demande « pour aujourd'hui » est justement la plus fréquente :
-- elle repartait au téléphone, et les créneaux libres du jour restaient vides.
--
-- Le patient peut désormais réserver aujourd'hui, mais pas dans l'immédiat :
-- il faut au moins `booking_lead_hours` heures d'avance. Le médecin garde une
-- marge pour s'organiser, et celui qui n'en veut pas met 24 pour retrouver
-- l'ancien comportement (réservation à partir du lendemain).

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS booking_lead_hours INTEGER NOT NULL DEFAULT 3
    CHECK (booking_lead_hours >= 0 AND booking_lead_hours <= 168);

COMMENT ON COLUMN public.doctors.booking_lead_hours IS
  'Heures minimum entre la réservation en ligne et le rendez-vous. 0 = immédiat, 24 = à partir de demain.';
