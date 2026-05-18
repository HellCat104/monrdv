-- ============================================================
-- Migration : système de vérification des médecins
-- À exécuter dans le SQL Editor de Supabase
-- ============================================================

-- Ajout du statut et du document sur la table doctors
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS document_url TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Index pour filtrer par statut
CREATE INDEX IF NOT EXISTS idx_doctors_status ON doctors(status);

-- Bucket Supabase Storage pour les documents
-- (À créer manuellement dans Storage > New bucket : "doctor-documents", public: false)

-- Les médecins existants sont automatiquement approuvés
UPDATE doctors SET status = 'approved' WHERE status = 'pending';
