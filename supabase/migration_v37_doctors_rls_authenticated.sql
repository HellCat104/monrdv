-- Migration v37 — Fuite des données professionnelles des médecins (audit sécurité)
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- PROBLÈME
-- La migration v15 avait retiré au rôle `anon` l'accès aux colonnes sensibles de
-- `doctors` (email pro, cnom_number, document_url, ice, inpe…). Mais la policy
-- « Public : voir médecins approuvés » (v8) n'a pas de clause TO : elle s'applique
-- donc AUSSI au rôle `authenticated`, à qui Supabase accorde SELECT par défaut.
-- Conséquence : n'importe quel compte patient (création libre) pouvait interroger
-- PostgREST avec la clé anon publique + son JWT et récupérer, pour TOUS les
-- médecins, l'email professionnel, le numéro au Conseil de l'Ordre, l'ICE/INPE et
-- l'URL du justificatif scanné — exactement ce que la v15 voulait fermer.
--
-- CORRECTIF
-- Restreindre la lecture publique au seul rôle `anon`. Les comptes connectés ne
-- voient alors plus que LEUR propre fiche, via la policy `doctors_own` (schema.sql).
--
-- Pourquoi ne pas révoquer les colonnes à `authenticated` ?
-- Les GRANT de colonnes s'appliquent à TOUTES les lignes : cela empêcherait le
-- médecin de lire sa propre fiche complète depuis son tableau de bord.
--
-- Les pages publiques ne sont pas affectées : la fiche médecin (/[slug]) et les
-- pages ville/spécialité utilisent le client admin (service_role), et la recherche
-- passe par la fonction RPC search_doctors (SECURITY DEFINER).

DROP POLICY IF EXISTS "Public : voir médecins approuvés" ON doctors;

CREATE POLICY "Public : voir médecins approuvés" ON doctors
  FOR SELECT
  TO anon
  USING (status = 'approved');

-- Complète les colonnes publiques ajoutées après la v15 (contact affiché sur la
-- page de réservation), pour que le rôle anon reste cohérent.
GRANT SELECT (whatsapp, public_email) ON public.doctors TO anon;
