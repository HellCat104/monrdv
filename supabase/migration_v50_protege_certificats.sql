-- v50 — Un patient porteur de certificats ne peut plus être supprimé.
--
-- `certificates` est lié au patient en ON DELETE CASCADE, sans aucune garde :
-- supprimer une fiche effaçait donc ses certificats médicaux, qui sont des
-- pièces opposables. Les actes facturés (trg_protect_invoiced) et les notes
-- signées (trg_protect_signed_notes) étaient déjà protégés ; ce maillon
-- manquait.
--
-- La protection vit en base et non dans l'application : elle vaut alors pour
-- toutes les voies d'écriture — client, route serveur, service_role, éditeur
-- SQL — et pas seulement pour celle qu'on a pensé à garder.

CREATE OR REPLACE FUNCTION protect_patient_certificates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'Ce patient a % certificat(s) médical(aux) : ils ne peuvent pas être supprimés. Supprimez-les d''abord si vous y êtes autorisé.',
    (SELECT count(*) FROM public.certificates WHERE patient_id = OLD.patient_id);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_patient_certificates ON public.certificates;
CREATE TRIGGER trg_protect_patient_certificates
  BEFORE DELETE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION protect_patient_certificates();
