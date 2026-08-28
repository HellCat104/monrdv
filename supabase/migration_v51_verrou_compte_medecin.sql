-- v51 — Un compte connecté ne peut plus s'attribuer le statut de médecin.
--
-- La policy `doctors_own` est en FOR ALL avec une clause USING mais SANS
-- WITH CHECK. En PostgreSQL, USING sert alors aussi de contrôle à l'INSERT et
-- à l'UPDATE : toute session authentifiée dont le JWT porte l'adresse e-mail
-- de la ligne peut donc écrire cette ligne, colonne par colonne, avec la clé
-- anon — laquelle est publique par nature, présente dans le bundle JavaScript.
--
-- Trois abus en découlaient :
--   1. un médecin inscrit mais NON VALIDÉ passe son `status` à 'approved' et
--      contourne entièrement la vérification du numéro CNOM par l'administrateur ;
--   2. n'importe quel médecin s'offre un abonnement perpétuel en écrivant
--      `subscription_status` et `date_expiration` ;
--   3. un simple compte patient (création libre) INSÈRE une ligne `doctors`
--      à sa propre adresse et bascule sur le tableau de bord médecin, avec une
--      fiche publiée dans l'annuaire.
--
-- Le trigger v39 ne figeait que `plan` et `price_hidden`. On étend le même
-- mécanisme aux colonnes qui gouvernent l'accès à la plateforme, et on retire
-- INSERT et DELETE au rôle `authenticated` : la création d'un médecin passe
-- déjà par /api/doctors/register en service_role.
--
-- Le trigger reste la protection principale, car l'application écrit
-- légitimement dans `doctors` depuis le navigateur (Paramètres, Abonnement) :
-- interdire l'UPDATE casserait ces écrans. On laisse donc modifier la ligne,
-- mais on restaure silencieusement les colonnes sensibles.

CREATE OR REPLACE FUNCTION protect_doctor_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (routes serveur, espace admin) n'est pas concerné.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'La création d''un compte médecin passe par l''inscription.';
    END IF;
    -- Forfait et tarification (v39). `pending_plan` n'est PAS figé : c'est une
    -- demande de montée en gamme, que l'écran Abonnement écrit légitimement
    -- depuis le navigateur. Elle ne donne aucun droit tant que l'administrateur
    -- n'a pas fixé `plan`, qui, lui, reste verrouillé.
    NEW.plan                := OLD.plan;
    NEW.price_hidden        := OLD.price_hidden;
    -- Accès à la plateforme : validation par l'administrateur
    NEW.status              := OLD.status;
    NEW.rejection_reason    := OLD.rejection_reason;
    -- Abonnement
    NEW.subscription_status := OLD.subscription_status;
    NEW.date_expiration     := OLD.date_expiration;
    -- L'identité qui porte la policy elle-même
    NEW.email               := OLD.email;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_doctor_plan ON public.doctors;
CREATE TRIGGER trg_protect_doctor_plan
  BEFORE INSERT OR UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION protect_doctor_plan();

-- Vérifié avant écriture : l'application ne modifie jamais `email` (elle s'en
-- sert comme filtre, et l'adresse publique est une autre colonne), ni `status`,
-- ni `subscription_status`, ni `date_expiration` depuis le navigateur. Figer ces
-- colonnes ne casse donc aucun écran.

-- Défense en profondeur : plus d'INSERT ni de DELETE pour un compte connecté.
REVOKE INSERT, DELETE ON public.doctors FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.doctors FROM anon;
