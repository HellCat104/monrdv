-- ============================================================================
-- Migration v12 — Pack comptabilité
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
-- ============================================================================

-- ── #1 Numérotation séquentielle des factures (F-AAAA-NNNN) ─────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS invoice_no TEXT;

CREATE TABLE IF NOT EXISTS invoice_counters (
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  last_no   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (doctor_id, year)
);
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Médecin : ses compteurs" ON invoice_counters;
CREATE POLICY "Médecin : ses compteurs" ON invoice_counters
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- Attribue le prochain numéro de façon atomique (sans trou), par médecin et par an
CREATE OR REPLACE FUNCTION next_invoice_no(p_doctor UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE y INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Casablanca'))::INT; n INT;
BEGIN
  INSERT INTO invoice_counters(doctor_id, year, last_no) VALUES (p_doctor, y, 1)
  ON CONFLICT (doctor_id, year) DO UPDATE SET last_no = invoice_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN 'F-' || y || '-' || LPAD(n::TEXT, 4, '0');
END $$;

-- ── #2 Dépenses / charges du cabinet ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  label      TEXT NOT NULL,
  category   TEXT,
  amount     NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_doctor_date ON expenses(doctor_id, date DESC);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Médecin : ses dépenses" ON expenses;
CREATE POLICY "Médecin : ses dépenses" ON expenses
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- ============================================================================
-- Fin de la migration v12
-- ============================================================================
