-- Migration v61 — Lien de carte du cabinet (bouton « Y aller » du patient)
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- POURQUOI, ALORS QUE LA v60 STOCKE DÉJÀ DES COORDONNÉES
-- Parce qu'un lien Google Maps partagé depuis un téléphone n'en contient pas
-- toujours. Partagé depuis une FICHE DE LIEU, il porte la position exacte
-- (…/place/Nom/@31.62,-8.02/…!3d31.62!4d-8.02) et la v60 suffit. Mais partagé
-- depuis un RÉSULTAT DE RECHERCHE, il n'aboutit qu'à « ?q=Nom du lieu&ftid=… » :
-- aucune coordonnée nulle part, et la page que Google sert à un serveur sans
-- JavaScript ne contient que le centre de la VILLE. Bâtir un `geo` là-dessus
-- placerait tous les cabinets de Marrakech au même point.
--
-- Or pour conduire un patient jusqu'au cabinet, les coordonnées ne sont pas
-- nécessaires : le lien lui-même ouvre l'itinéraire dans son application. On
-- conserve donc les deux, chacun pour ce qu'il sait faire :
--   • `map_url`            → le bouton « Y aller » du patient. Toujours posé.
--   • `latitude/longitude` → le balisage schema.org `geo`, pour Google. Posé
--                            seulement quand la position exacte est lisible.

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS map_url text;

-- Garde-fou minimal en base : une adresse web, et pas un texte quelconque.
-- Le contrôle du DOMAINE (Google Maps, OpenStreetMap) est fait côté
-- application, à l'enregistrement — une liste de domaines a vocation à évoluer,
-- elle n'a pas sa place dans une contrainte de table.
ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_map_url_valide;

ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_map_url_valide CHECK (
    map_url IS NULL
    OR (map_url LIKE 'https://%' AND length(map_url) BETWEEN 12 AND 2000)
  );

COMMENT ON COLUMN public.doctors.map_url IS
  'Lien de carte du cabinet (Google Maps / OSM). Alimente le bouton « Y aller » de la page de réservation.';

-- Droits : aucun GRANT à ajouter, pour les mêmes raisons qu'en v60.
--   • La fiche publique /[slug] lit via le client admin (service_role).
--   • Le médecin connecté garde l'accès complet à SA fiche (policy doctors_own).

-- ============================================================================
-- Fin de la migration v61
-- ============================================================================
