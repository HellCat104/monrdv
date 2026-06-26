-- ============================================================================
-- Migration v14 — Médecin multi-spécialités
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent. Rétrocompatible (les médecins mono-spécialité ne changent pas).
-- ============================================================================

-- Spécialités d'un médecin (inclut la principale). specialty = principale (titre).
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS specialties TEXT[];
UPDATE doctors SET specialties = ARRAY[specialty] WHERE specialties IS NULL AND specialty IS NOT NULL;

-- Spécialité choisie par le patient à la réservation (si le médecin en a plusieurs)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS specialty TEXT;

-- Recherche : le médecin remonte sous CHACUNE de ses spécialités
DROP FUNCTION IF EXISTS search_doctors(text, text, text);
CREATE FUNCTION search_doctors(p_q text, p_specialite text, p_ville text)
RETURNS TABLE (
  id uuid, name text, specialty text, slug text, phone text,
  city text, appointment_duration integer, photo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT d.id, d.name, d.specialty, d.slug, d.phone, d.city,
         d.appointment_duration, d.photo_url
  FROM doctors d
  WHERE d.status = 'approved'
    AND d.subscription_status = 'actif'
    AND (COALESCE(p_q, '')          = '' OR unaccent(d.name) ILIKE '%' || unaccent(p_q) || '%')
    AND (COALESCE(p_specialite, '') = '' OR p_specialite = ANY(COALESCE(d.specialties, ARRAY[d.specialty])))
    AND (COALESCE(p_ville, '')      = '' OR d.city = p_ville)
  ORDER BY d.name
  LIMIT 100;
$$;

-- ============================================================================
-- Fin de la migration v14
-- ============================================================================
