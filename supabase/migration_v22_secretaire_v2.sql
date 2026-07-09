-- ============================================================================
-- Migration v22 — Secrétaire v2 : case « J'ai une secrétaire », CIN/mutuelle,
-- salle d'attente. Additive et idempotente. À lancer une fois.
-- ============================================================================

-- Le médecin déclare avoir du personnel → affiche l'onglet « Mon équipe »
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS has_secretary BOOLEAN NOT NULL DEFAULT false;

-- Les médecins qui ont déjà invité une secrétaire sont marqués automatiquement
UPDATE doctors SET has_secretary = true
WHERE id IN (SELECT DISTINCT doctor_id FROM cabinet_staff);

-- Spécificités Maroc sur la fiche patient
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cin TEXT;       -- carte d'identité nationale
ALTER TABLE patients ADD COLUMN IF NOT EXISTS mutuelle TEXT;  -- CNSS / CNOPS / AMO / privée / aucune

-- Salle d'attente : statut du patient dans la file du jour
-- (arrive | en_consultation | parti) — NULL = pas encore arrivé
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS queue_status TEXT;
