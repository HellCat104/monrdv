-- Migration v60 — Coordonnées GPS du cabinet (données structurées Google)
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- POURQUOI
-- La fiche médecin publie déjà un balisage `Physician` pour Google : nom,
-- spécialité, adresse postale, téléphone, horaires, action de réservation.
-- Il y manque le `geo` — la latitude et la longitude du cabinet. C'est ce qui
-- permet à Google de placer le praticien sur une carte et de le faire remonter
-- sur les recherches « près de moi », qui représentent l'essentiel des
-- recherches médicales faites depuis un téléphone.
--
-- Ces coordonnées n'existaient nulle part en base. Les inventer aurait été la
-- pire des solutions : Google pénalise les données structurées qui ne
-- correspondent pas à la réalité, et un patient se serait présenté à la
-- mauvaise adresse. On crée donc les colonnes, et le balisage `geo` n'est émis
-- QUE pour les cabinets dont les coordonnées ont été réellement renseignées.
--
-- numeric(9,6) : six décimales, soit une précision d'une dizaine de
-- centimètres — très au-delà de ce qu'exige la localisation d'un cabinet.

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS latitude  numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

-- Une latitude sans sa longitude ne localise rien : le couple est indivisible.
-- La contrainte interdit donc la moitié d'une coordonnée, autant qu'une valeur
-- hors des bornes terrestres (une inversion des deux champs, par exemple).
ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_coordonnees_valides;

ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_coordonnees_valides CHECK (
    (latitude IS NULL) = (longitude IS NULL)
    AND (
      latitude IS NULL
      OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    )
  );

COMMENT ON COLUMN public.doctors.latitude  IS 'Latitude du cabinet (WGS84). Publiée dans le balisage schema.org geo.';
COMMENT ON COLUMN public.doctors.longitude IS 'Longitude du cabinet (WGS84). Publiée dans le balisage schema.org geo.';

-- Droits : aucun GRANT à ajouter.
--   • La fiche publique /[slug] lit via le client admin (service_role).
--   • Le médecin connecté (rôle `authenticated`) garde l'accès complet à SA
--     propre fiche — la v37 a délibérément laissé les colonnes ouvertes à ce
--     rôle, la policy `doctors_own` faisant le filtrage par ligne.
--   • Le rôle `anon` n'a que les colonnes listées en v15/v37 : les coordonnées
--     n'y sont pas ajoutées, elles n'ont pas à être interrogeables en masse.

-- ============================================================================
-- Fin de la migration v60
-- ============================================================================
