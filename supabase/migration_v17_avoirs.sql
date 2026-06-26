-- ============================================================================
-- Migration v17 — Registre des factures d'avoir (conformité fiscale MA)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
--
-- Principe : on ne supprime/ré-attribue JAMAIS un numéro de facture (séquence
-- continue obligatoire). Pour annuler ou corriger une facture, on émet une
-- "facture d'avoir" numérotée dans sa propre série AV-AAAA-NNNN, qui référence
-- la facture d'origine.
-- ============================================================================

-- 1) Compteur de la série d'avoirs (par médecin et par an), atomique.
CREATE TABLE IF NOT EXISTS credit_note_counters (
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (doctor_id, year)
);
ALTER TABLE credit_note_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Médecin : ses compteurs d'avoirs" ON credit_note_counters;
CREATE POLICY "Médecin : ses compteurs d'avoirs" ON credit_note_counters
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- 2) Table des avoirs.
CREATE TABLE IF NOT EXISTS credit_notes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id            UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_id       UUID REFERENCES appointments(id) ON DELETE SET NULL,
  credit_no            TEXT,                          -- AV-AAAA-NNNN (attribué par trigger)
  original_invoice_no  TEXT NOT NULL,                 -- facture annulée (snapshot)
  patient_name         TEXT,                          -- snapshot pour l'impression
  amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Médecin : ses avoirs" ON credit_notes;
CREATE POLICY "Médecin : ses avoirs" ON credit_notes
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

CREATE INDEX IF NOT EXISTS idx_credit_notes_doctor ON credit_notes(doctor_id, created_at);

-- 3) Numérotation atomique AV-AAAA-NNNN à l'insertion (sans trou).
CREATE OR REPLACE FUNCTION assign_credit_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y INT; n INT;
BEGIN
  IF NEW.credit_no IS NULL THEN
    y := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Casablanca'))::INT;
    INSERT INTO credit_note_counters(doctor_id, year, last_no) VALUES (NEW.doctor_id, y, 1)
    ON CONFLICT (doctor_id, year) DO UPDATE SET last_no = credit_note_counters.last_no + 1
    RETURNING last_no INTO n;
    NEW.credit_no := 'AV-' || y || '-' || LPAD(n::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_assign_credit_no ON credit_notes;
CREATE TRIGGER trg_assign_credit_no BEFORE INSERT ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION assign_credit_no();

-- 4) Immuabilité de la séquence de factures : on interdit de supprimer un acte
--    déjà facturé ou d'effacer son numéro (ce qui créerait un trou). La bonne
--    façon d'annuler est d'émettre un avoir.
CREATE OR REPLACE FUNCTION protect_invoiced_appointments()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_no IS NOT NULL THEN
      RAISE EXCEPTION 'Cet acte est déjà facturé (%) : émettez un avoir au lieu de le supprimer', OLD.invoice_no;
    END IF;
    RETURN OLD;
  ELSE
    IF OLD.invoice_no IS NOT NULL AND NEW.invoice_no IS DISTINCT FROM OLD.invoice_no THEN
      RAISE EXCEPTION 'Le numéro de facture est immuable (%)', OLD.invoice_no;
    END IF;
    RETURN NEW;
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_protect_invoiced ON appointments;
CREATE TRIGGER trg_protect_invoiced BEFORE UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION protect_invoiced_appointments();

-- ============================================================================
-- Fin de la migration v17
-- ============================================================================
