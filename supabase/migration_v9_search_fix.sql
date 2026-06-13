-- ============================================================================
-- Migration v9 — Corrige la recherche de médecins (search_doctors)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent (CREATE OR REPLACE).
--
-- Bug corrigé : un médecin avec un champ NULL (ex: ville non renseignée)
-- disparaissait des résultats car "NULL ILIKE '...'" vaut NULL (faux).
-- → On ignore proprement les filtres vides (COALESCE(...,'') = '').
--
-- Bonus sécurité : la fonction ne renvoie QUE les colonnes publiques
-- (plus d'email/identifiants exposés via la recherche).
-- ============================================================================

CREATE OR REPLACE FUNCTION search_doctors(p_q text, p_specialite text, p_ville text)
RETURNS TABLE (
  id                   uuid,
  name                 text,
  specialty            text,
  slug                 text,
  phone                text,
  city                 text,
  appointment_duration integer,
  photo_url            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT d.id, d.name, d.specialty, d.slug, d.phone, d.city,
         d.appointment_duration, d.photo_url
  FROM doctors d
  WHERE d.status = 'approved'
    AND d.subscription_status = 'actif'
    AND (COALESCE(p_q, '')          = '' OR unaccent(d.name) ILIKE '%' || unaccent(p_q) || '%')
    AND (COALESCE(p_specialite, '') = '' OR d.specialty = p_specialite)
    AND (COALESCE(p_ville, '')      = '' OR d.city = p_ville)
  ORDER BY d.name
  LIMIT 100;
$$;

-- ============================================================================
-- Fin de la migration v9
-- ============================================================================
