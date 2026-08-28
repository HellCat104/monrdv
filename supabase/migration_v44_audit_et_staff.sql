-- ⚠️ DÉJÀ APPLIQUÉE EN PRODUCTION le 2026-08-27. Ne pas relancer.
-- Ce fichier documente le schéma réel : il avait disparu du dépôt lors de
-- l'annulation du commit 7d50f3d, alors que son SQL avait déjà été exécuté.
--
-- ⚠️ RÉÉCRIT LE 2026-08-28 — ne recopie PAS la migration d'origine.
-- Celle-ci créait aussi deux fonctions SECURITY DEFINER, merge_patients_atomic()
-- et delete_patient_safely(). Elles prenaient le doctor_id en simple paramètre,
-- sans jamais vérifier que l'appelant était bien ce médecin : n'importe quel
-- compte connecté pouvait donc, par un appel RPC direct, fusionner ou supprimer
-- les fiches patients d'un autre cabinet. Elles ont été SUPPRIMÉES le
-- 2026-08-28 (DROP FUNCTION) et ne figurent volontairement pas ici.
-- NE PAS LES RECRÉER sans contrôle de l'appelant (auth.uid() / auth.jwt()).

-- Rattache un membre du personnel à son compte d'authentification, pour ne plus
-- dépendre uniquement de la correspondance des adresses e-mail.
ALTER TABLE public.cabinet_staff
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.cabinet_staff s
   SET auth_user_id = u.id
  FROM auth.users u
 WHERE s.auth_user_id IS NULL
   AND lower(s.email) = lower(u.email);

CREATE INDEX IF NOT EXISTS idx_cabinet_staff_auth_user
  ON public.cabinet_staff(auth_user_id);

-- Journal des opérations sensibles (fusion, suppression de fiche…).
-- RLS activée sans policy : la table n'est accessible qu'au service_role.
-- Aucune écriture n'y est faite aujourd'hui — les fonctions qui l'alimentaient
-- ont été supprimées (voir l'avertissement ci-dessus).
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     uuid,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
