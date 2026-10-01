-- Migration v63 — Quota de stockage par cabinet (5 Go)
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- POURQUOI
-- Rien ne limitait l'espace occupé par un cabinet. Un cabinet qui scanne de
-- l'imagerie pouvait, à lui seul, remplir le plan de stockage de la
-- plateforme. La v62 a posé la limite par FICHIER (10 Mo) ; celle-ci pose la
-- limite par CABINET.
--
-- 5 120 Mo = 5 Go : avec une moyenne mesurée à ~900 ko par patient ayant au
-- moins un document, cela représente plusieurs milliers de patients, soit des
-- années d'usage courant. Le quota est donc une protection contre l'abus, pas
-- une contrainte commerciale.

-- 1. La limite, modifiable cabinet par cabinet depuis l'administration.
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS storage_limit_mb integer NOT NULL DEFAULT 5120
  CHECK (storage_limit_mb > 0 AND storage_limit_mb <= 1048576);

COMMENT ON COLUMN public.doctors.storage_limit_mb IS
  'Espace de documents autorisé pour ce cabinet, en Mo. 5120 = 5 Go par défaut.';

-- 2. Le médecin ne doit pas pouvoir relever sa propre limite : elle rejoint
--    les champs figés par le verrou de la fiche praticien (v51/v52).
--    SECURITY INVOKER est indispensable : dans une fonction SECURITY DEFINER,
--    `current_user` vaut le PROPRIÉTAIRE, et la garde ne protégerait rien
--    (leçon de la v52).
CREATE OR REPLACE FUNCTION protect_doctor_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'La création d''un compte médecin passe par l''inscription.';
    END IF;
    NEW.plan                := OLD.plan;
    NEW.price_hidden        := OLD.price_hidden;
    NEW.status              := OLD.status;
    NEW.rejection_reason    := OLD.rejection_reason;
    NEW.subscription_status := OLD.subscription_status;
    NEW.date_expiration     := OLD.date_expiration;
    NEW.email               := OLD.email;
    NEW.storage_limit_mb    := OLD.storage_limit_mb;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_doctor_plan ON public.doctors;
CREATE TRIGGER trg_protect_doctor_plan
  BEFORE INSERT OR UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION protect_doctor_plan();

-- 3. Le contrôle du quota, tenu par la base — donc valable quel que soit
--    l'écran, et même pour un appel direct à l'API.
--    SECURITY DEFINER ici : la fonction doit lire la limite du cabinet et la
--    somme de ses documents sans dépendre des politiques RLS de l'appelant.
--    Aucune décision n'est prise sur `current_user` : le piège de la v52 ne
--    s'applique pas.
CREATE OR REPLACE FUNCTION verifier_quota_stockage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limite_octets bigint;
  occupe        bigint;
BEGIN
  SELECT storage_limit_mb::bigint * 1024 * 1024 INTO limite_octets
    FROM public.doctors WHERE id = NEW.doctor_id;
  IF limite_octets IS NULL THEN
    RETURN NEW;                   -- cabinet introuvable : rien à arbitrer ici
  END IF;

  SELECT COALESCE(SUM(file_size), 0) INTO occupe
    FROM public.patient_documents WHERE doctor_id = NEW.doctor_id;

  IF occupe + COALESCE(NEW.file_size, 0) > limite_octets THEN
    RAISE EXCEPTION 'QUOTA_STOCKAGE: espace de stockage du cabinet atteint (% Mo).',
      round(limite_octets / 1024.0 / 1024.0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_quota_stockage ON public.patient_documents;
CREATE TRIGGER trg_quota_stockage
  BEFORE INSERT ON public.patient_documents
  FOR EACH ROW EXECUTE FUNCTION verifier_quota_stockage();

-- Vérifications :
--   select name, storage_limit_mb from public.doctors order by name;
--   select d.name,
--          pg_size_pretty(coalesce(sum(p.file_size), 0)) as occupe,
--          d.storage_limit_mb || ' Mo' as limite
--     from public.doctors d
--     left join public.patient_documents p on p.doctor_id = d.id
--    group by d.id, d.name, d.storage_limit_mb
--    order by coalesce(sum(p.file_size), 0) desc;

-- ============================================================================
-- Fin de la migration v63
-- ============================================================================
