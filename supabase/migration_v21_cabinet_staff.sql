-- ============================================================================
-- Migration v21 — Comptes « secrétaire » (personnel du cabinet)
-- Additive : n'affecte AUCUN médecin existant. À lancer une fois.
-- ============================================================================

-- Une secrétaire = un compte auth (email) rattaché à UN médecin, avec des
-- permissions granulaires (JSONB). Le médecin gère son équipe.
CREATE TABLE IF NOT EXISTS cabinet_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- Permissions par défaut : poste d'accueil (agenda + patients, sans le médical)
  permissions JSONB NOT NULL DEFAULT '{
    "agenda": true,
    "manage_appointments": true,
    "mark_attendance": true,
    "payments": false,
    "patients_contact": true,
    "patients_medical": false,
    "factures": false
  }'::jsonb,
  status      TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un même email ne peut être secrétaire qu'une fois par médecin.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cabinet_staff_doctor_email
  ON cabinet_staff(doctor_id, lower(email));
-- Pour retrouver vite « de quel(s) cabinet(s) fait partie cet email ».
CREATE INDEX IF NOT EXISTS idx_cabinet_staff_email ON cabinet_staff(lower(email));

ALTER TABLE cabinet_staff ENABLE ROW LEVEL SECURITY;

-- Le médecin gère (voit/ajoute/modifie/supprime) SON équipe.
DROP POLICY IF EXISTS "Médecin : gérer son équipe" ON cabinet_staff;
CREATE POLICY "Médecin : gérer son équipe" ON cabinet_staff
  FOR ALL
  USING      (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

-- La secrétaire peut lire SA propre ligne (pour connaître ses permissions).
DROP POLICY IF EXISTS "Secrétaire : lire sa fiche" ON cabinet_staff;
CREATE POLICY "Secrétaire : lire sa fiche" ON cabinet_staff
  FOR SELECT
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- ============================================================================
-- Fin de la migration v21
-- ============================================================================
