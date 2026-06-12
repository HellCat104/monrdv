-- ============================================================================
-- Migration v7 — Sprint 1 : paiements partiels + documents patient
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotent.
-- ============================================================================

-- ── #2 Paiements partiels + mode de règlement ───────────────────────────────
-- amount_paid (existant) = total déjà encaissé.
-- amount_due = montant total attendu (pré-rempli depuis le tarif du motif).
-- Statut dérivé : Payé (payé >= dû), Partiel (0 < payé < dû), Impayé sinon.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS amount_due     NUMERIC(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT; -- especes | carte | cheque | virement

-- ── #3 Documents du patient (table) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,   -- chemin dans le bucket Storage
  file_name  TEXT NOT NULL,   -- nom original affiché
  file_type  TEXT,            -- type MIME
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_documents_patient
  ON patient_documents(patient_id, created_at DESC);

ALTER TABLE patient_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Médecin : gérer ses documents patient" ON patient_documents;
CREATE POLICY "Médecin : gérer ses documents patient" ON patient_documents
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- ── #3 Bucket Storage privé pour les documents ──────────────────────────────
-- Bucket privé (public = false) : accès uniquement via URL signée générée
-- côté serveur. Convention de chemin : {doctor_id}/{patient_id}/{fichier}.
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-documents', 'patient-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS sur les objets : le médecin n'accède qu'aux fichiers dont le 1er dossier
-- du chemin est l'un de ses propres doctor_id.
DROP POLICY IF EXISTS "Médecin gère ses fichiers patient" ON storage.objects;
CREATE POLICY "Médecin gère ses fichiers patient" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'patient-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM doctors WHERE email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    bucket_id = 'patient-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM doctors WHERE email = auth.jwt() ->> 'email'
    )
  );

-- ============================================================================
-- Fin de la migration v7
-- ============================================================================
