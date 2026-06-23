-- ============================================================================
-- Migration v13 — Numérotation des factures 100% sans trou (trigger atomique)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
--
-- Le numéro est attribué DANS la même transaction que l'encaissement : si
-- l'UPDATE échoue (rollback), l'incrément du compteur est annulé aussi → la
-- séquence reste continue, sans trou. Remplace l'attribution côté application.
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE y INT; n INT;
BEGIN
  -- Attribue un numéro au moment où un montant est encaissé pour la 1re fois
  IF NEW.amount_paid IS NOT NULL AND NEW.invoice_no IS NULL THEN
    y := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Casablanca'))::INT;
    INSERT INTO invoice_counters(doctor_id, year, last_no) VALUES (NEW.doctor_id, y, 1)
    ON CONFLICT (doctor_id, year) DO UPDATE SET last_no = invoice_counters.last_no + 1
    RETURNING last_no INTO n;
    NEW.invoice_no := 'F-' || y || '-' || LPAD(n::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_invoice_no ON appointments;
CREATE TRIGGER trg_assign_invoice_no
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_no();

-- ============================================================================
-- Fin de la migration v13
-- ============================================================================
