-- ============================================================================
-- Migration v8 — Ferme la lecture publique trop large de la table doctors
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
--
-- Problème : la policy "doctors_public_read" (FOR SELECT USING (true)) rendait
-- TOUTES les lignes doctors lisibles avec la clé anon (publique) — y compris
-- les médecins en attente / rejetés, avec leurs emails, téléphones et statuts.
-- Comme les policies RLS se cumulent en OR, cette policy permissive annulait
-- la policy restrictive prévue.
--
-- Vérifié avant changement :
-- • L'admin lit les médecins via le client service_role (bypass RLS) → OK.
-- • Le médecin lit son propre profil via la policy "doctors_own" (email) → OK.
-- • Les pages publiques (recherche, réservation) ne lisent que les médecins
--   approuvés → couvert par la nouvelle policy ci-dessous.
-- ============================================================================

-- 1. Supprime la lecture publique illimitée
DROP POLICY IF EXISTS "doctors_public_read" ON doctors;

-- 2. Remplace la policy publique : seuls les médecins APPROUVÉS sont lisibles
--    publiquement (la page de réservation gère elle-même le cas "abonnement
--    inactif" en affichant un message — il faut donc pouvoir lire la ligne).
DROP POLICY IF EXISTS "Public : voir médecins approuvés actifs" ON doctors;
DROP POLICY IF EXISTS "Public : voir médecins approuvés" ON doctors;
CREATE POLICY "Public : voir médecins approuvés" ON doctors
  FOR SELECT
  USING (status = 'approved');

-- ============================================================================
-- Fin de la migration v8
-- ============================================================================
