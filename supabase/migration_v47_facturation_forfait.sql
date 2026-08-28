-- v47 — La numérotation des factures ne concerne que le Cabinet complet.
--
-- Le trigger v13 attribuait un numéro dès qu'un montant était encaissé, sans
-- regarder le forfait. Or l'encaissement est ouvert aux deux forfaits, tandis
-- que les documents comptables (facture, avoir, pack fiduciaire) sont réservés
-- au Cabinet complet. Un médecin en Agenda consommait donc des numéros de
-- facture pour des documents jamais émis : sa séquence se remplissait de
-- numéros fantômes, ce qu'un fiduciaire ou un contrôle fiscal relève, et sa
-- première vraie facture après montée en gamme serait partie d'un rang absurde.
--
-- L'encaissement en Agenda ne change pas : montant, mode de règlement, caisse,
-- impayés et statistiques fonctionnent à l'identique. Seul le numéro légal
-- n'est plus attribué.

CREATE OR REPLACE FUNCTION assign_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE y INT; n INT; p TEXT;
BEGIN
  IF NEW.amount_paid IS NOT NULL AND NEW.invoice_no IS NULL THEN
    SELECT plan INTO p FROM doctors WHERE id = NEW.doctor_id;
    -- Forfait Agenda : on encaisse, mais aucune facture n'est émise.
    IF p IS DISTINCT FROM 'complet' THEN
      RETURN NEW;
    END IF;
    y := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Casablanca'))::INT;
    INSERT INTO invoice_counters(doctor_id, year, last_no) VALUES (NEW.doctor_id, y, 1)
    ON CONFLICT (doctor_id, year) DO UPDATE SET last_no = invoice_counters.last_no + 1
    RETURNING last_no INTO n;
    NEW.invoice_no := 'F-' || y || '-' || LPAD(n::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END $$;

-- Nettoyage des numéros déjà attribués à tort. trg_protect_invoiced rend le
-- numéro immuable (pour interdire les trous) : on le neutralise le temps de
-- l'opération, puis on le rétablit. Les montants encaissés ne sont pas touchés.
ALTER TABLE public.appointments DISABLE TRIGGER trg_protect_invoiced;

UPDATE public.appointments
   SET invoice_no = NULL
 WHERE invoice_no IS NOT NULL
   AND doctor_id IN (SELECT id FROM public.doctors WHERE plan IS DISTINCT FROM 'complet');

-- Le compteur repart à zéro : la première facture émise après une montée en
-- gamme portera bien le n° 0001.
DELETE FROM public.invoice_counters
 WHERE doctor_id IN (SELECT id FROM public.doctors WHERE plan IS DISTINCT FROM 'complet');

ALTER TABLE public.appointments ENABLE TRIGGER trg_protect_invoiced;
