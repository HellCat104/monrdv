-- Migration : abonnement médecin
-- Ajoute date_expiration et statut actif/inactif

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS date_expiration date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'actif'
    CHECK (subscription_status IN ('actif', 'inactif'));

-- Index pour les recherches filtrées par statut d'abonnement
CREATE INDEX IF NOT EXISTS idx_doctors_subscription_status ON doctors (subscription_status);
