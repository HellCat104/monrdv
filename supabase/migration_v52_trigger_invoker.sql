-- v52 — La protection du compte médecin ne se déclenchait probablement jamais.
--
-- v39 puis v51 posent la garde `IF current_user IN ('authenticated','anon')`
-- dans une fonction déclarée SECURITY DEFINER. Or, dans une telle fonction,
-- PostgreSQL fait retourner à `current_user` le PROPRIÉTAIRE de la fonction —
-- `postgres` — et non le rôle appelant. La condition est donc fausse à chaque
-- appel, et le corps du trigger n'est jamais exécuté : ni le forfait (v39), ni
-- le statut, ni l'abonnement (v51) n'étaient réellement protégés.
--
-- Ce trigger n'a besoin d'aucun privilège élevé : il se contente de réécrire
-- NEW avant l'écriture. On le repasse donc en SECURITY INVOKER (le défaut),
-- où `current_user` vaut le rôle réellement en place — `authenticated` pour une
-- session navigateur, `service_role` pour une route serveur ou l'admin.
--
-- Le correctif est sûr dans les deux hypothèses : si `current_user` valait déjà
-- 'authenticated', rien ne change ; s'il valait le propriétaire, la protection
-- voulue depuis v39 entre enfin en vigueur.

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
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_doctor_plan ON public.doctors;
CREATE TRIGGER trg_protect_doctor_plan
  BEFORE INSERT OR UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION protect_doctor_plan();
