-- v49 — Le médecin choisit si ses tarifs sont visibles des patients.
--
-- Afficher les prix rassure le patient et évite les appels « c'est combien ? »,
-- mais tous les praticiens ne le souhaitent pas : honoraires variables selon
-- l'acte, secteur conventionné, ou simple préférence. Le choix leur revient.
--
-- Défaut à true : le tarif est déjà renseigné dans les motifs, l'afficher est
-- le comportement le plus utile au patient. Qui n'en veut pas décoche.

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS show_prices boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.doctors.show_prices IS
  'Affiche les tarifs des motifs de consultation sur la page de réservation publique.';
