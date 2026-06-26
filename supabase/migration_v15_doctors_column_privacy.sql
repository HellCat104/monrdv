-- Migration v15 — Confidentialité des colonnes médecin (loi 09-08)
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- Problème : la policy publique "Public : voir médecins approuvés" autorise la
-- lecture des médecins approuvés, mais la RLS ne filtre PAS les colonnes. Comme
-- la clé anon est publique (incluse dans le bundle JS), n'importe qui pouvait
-- interroger directement PostgREST :
--   GET /rest/v1/doctors?select=email,cnom_number,document_url&status=eq.approved
-- et récupérer l'email pro, le n° au Conseil de l'Ordre et l'URL du justificatif
-- scanné de TOUS les médecins.
--
-- Correctif : retirer au rôle `anon` l'accès aux colonnes sensibles, en ne lui
-- accordant que les colonnes réellement publiques (celles affichées sur la page
-- de réservation et la recherche). Le médecin connecté (rôle `authenticated`)
-- garde l'accès complet à SA propre fiche via la policy `doctors_own`.

REVOKE SELECT ON public.doctors FROM anon;

GRANT SELECT (
  id,
  name,
  slug,
  specialty,
  specialties,
  photo_url,
  address,
  city,
  bio,
  appointment_duration,
  working_hours,
  phone,
  subscription_status,
  status
) ON public.doctors TO anon;

-- Colonnes désormais INACCESSIBLES au public (anon) :
--   email, cnom_number, document_url, rejection_reason, ice, inpe,
--   date_expiration, enabled_vitals, created_at
--
-- Note : la recherche publique passe par la fonction RPC search_doctors
-- (SECURITY DEFINER), non affectée par ce changement. Les routes slots/
-- blocked-dates/search utilisent le client admin (service_role), non affecté.
