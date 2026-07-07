-- Migration v19 — Coordonnées de contact publiques du médecin
-- À lancer UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- Ajoute un WhatsApp et un e-mail de contact affichés aux patients sur la page
-- publique du médecin (bloc « Contacter le médecin »). Le téléphone existait déjà.

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS whatsapp     TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS public_email TEXT;

-- Ces colonnes sont publiques : le rôle anon (page publique) doit pouvoir les lire.
-- (La migration v15 avait restreint les colonnes lisibles par anon.)
GRANT SELECT (whatsapp, public_email) ON public.doctors TO anon;
