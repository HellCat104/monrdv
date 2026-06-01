-- ============================================================
-- MonRDV — Schéma Supabase / PostgreSQL
-- Fuseau horaire : Africa/Casablanca (GMT+1)
-- ============================================================

-- Extension pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- TABLE : doctors (médecins)
-- ------------------------------------------------------------
CREATE TABLE doctors (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  phone                TEXT,
  specialty            TEXT,
  slug                 TEXT NOT NULL UNIQUE, -- URL unique ex: "hassan-alami"
  working_hours        JSONB NOT NULL DEFAULT '{
    "monday":    {"enabled": true,  "start": "09:00", "end": "18:00"},
    "tuesday":   {"enabled": true,  "start": "09:00", "end": "18:00"},
    "wednesday": {"enabled": true,  "start": "09:00", "end": "18:00"},
    "thursday":  {"enabled": true,  "start": "09:00", "end": "18:00"},
    "friday":    {"enabled": true,  "start": "09:00", "end": "13:00"},
    "saturday":  {"enabled": true,  "start": "09:00", "end": "13:00"},
    "sunday":    {"enabled": false, "start": "09:00", "end": "18:00"}
  }',
  appointment_duration INTEGER NOT NULL DEFAULT 30, -- en minutes
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- TABLE : patients
-- ------------------------------------------------------------
CREATE TABLE patients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id  UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  phone      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(doctor_id, phone) -- un patient unique par médecin
);

-- ------------------------------------------------------------
-- TABLE : appointments (rendez-vous)
-- ------------------------------------------------------------
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled');

CREATE TABLE appointments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id    UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date         DATE NOT NULL,            -- ex: 2026-05-20
  time         TIME NOT NULL,            -- ex: 09:30:00
  status       appointment_status NOT NULL DEFAULT 'confirmed',
  notes        TEXT,
  cancel_token TEXT UNIQUE,              -- token pour annulation par SMS
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Les RDV annules restent dans l'historique et ne bloquent pas le creneau.
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_appointments_doctor_date ON appointments(doctor_id, date);
CREATE INDEX idx_appointments_cancel_token ON appointments(cancel_token);
CREATE INDEX idx_patients_doctor_phone ON patients(doctor_id, phone);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE UNIQUE INDEX unique_active_slot ON appointments(doctor_id, date, time)
  WHERE status <> 'cancelled';

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Isolation multi-tenant
-- ============================================================

ALTER TABLE doctors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Médecin : lit et modifie uniquement ses propres données
CREATE POLICY "doctors_own" ON doctors
  FOR ALL USING (email = auth.jwt() ->> 'email');

-- Patients : accès uniquement par le médecin propriétaire
CREATE POLICY "patients_own" ON patients
  FOR ALL USING (
    doctor_id IN (
      SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'
    )
  );

-- RDV : accès uniquement par le médecin propriétaire
CREATE POLICY "appointments_own" ON appointments
  FOR ALL USING (
    doctor_id IN (
      SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Lecture publique des médecins (page de réservation)
-- Les données sensibles (email) ne sont pas exposées via API publique
CREATE POLICY "doctors_public_read" ON doctors
  FOR SELECT USING (true);

-- ============================================================
-- DONNÉES DE TEST (à supprimer en production)
-- ============================================================

-- INSERT INTO doctors (name, email, phone, specialty, slug)
-- VALUES ('Hassan Alami', 'dr.hassan@exemple.ma', '+212522001122', 'Médecin généraliste', 'hassan-alami');

-- ============================================================
-- NOTES D'INSTALLATION
-- ============================================================
-- 1. Copiez ce SQL dans l'éditeur SQL de votre projet Supabase
-- 2. Exécutez-le intégralement
-- 3. Dans Authentication > Users, créez un utilisateur avec l'email du médecin
-- 4. Dans la table doctors, insérez la ligne correspondante avec le même email
-- 5. Le slug sera utilisé dans l'URL : /dr-[slug] ou /[slug]
