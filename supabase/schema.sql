-- ============================================================
-- MonRDV — Schéma Supabase / PostgreSQL (schéma "public")
-- Fuseau horaire applicatif : Africa/Casablanca (GMT+1)
-- ============================================================
-- Ce fichier reflète FIDÈLEMENT la base de production (régénéré
-- depuis information_schema/pg_catalog le 2026-06-06).
-- Il sert d'archive : exécuté sur une base vide, il recrée la
-- structure complète de l'application.
--
-- Note : les règles ON DELETE (CASCADE / SET NULL) reflètent le
-- design d'origine ; elles ne sont pas extractibles du dump JSON
-- mais correspondent au comportement attendu de l'application.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- pour gen_random_uuid()

-- Type énuméré du statut des rendez-vous
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- ------------------------------------------------------------
-- TABLE : doctors (médecins)
-- ------------------------------------------------------------
CREATE TABLE doctors (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL UNIQUE,
  phone                TEXT,
  specialty            TEXT,
  slug                 TEXT NOT NULL UNIQUE,            -- URL unique ex: "hassan-alami"
  working_hours        JSONB NOT NULL DEFAULT '{
    "monday":    {"enabled": true,  "start": "09:00", "end": "18:00"},
    "tuesday":   {"enabled": true,  "start": "09:00", "end": "18:00"},
    "wednesday": {"enabled": true,  "start": "09:00", "end": "18:00"},
    "thursday":  {"enabled": true,  "start": "09:00", "end": "18:00"},
    "friday":    {"enabled": true,  "start": "09:00", "end": "13:00"},
    "saturday":  {"enabled": true,  "start": "09:00", "end": "13:00"},
    "sunday":    {"enabled": false, "start": "09:00", "end": "18:00"}
  }'::jsonb,
  appointment_duration INTEGER NOT NULL DEFAULT 30,     -- en minutes
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status               TEXT NOT NULL DEFAULT 'pending'  -- pending | approved | rejected
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  document_url         TEXT,                            -- justificatif (carte CNOM, etc.)
  rejection_reason     TEXT,                            -- motif de refus éventuel
  city                 TEXT,
  date_expiration      DATE,                            -- fin de la période d'abonnement
  subscription_status  TEXT NOT NULL DEFAULT 'actif'    -- actif | inactif
                         CHECK (subscription_status IN ('actif', 'inactif')),
  cnom_number          TEXT,                            -- numéro Conseil de l'Ordre
  photo_url            TEXT,
  address              TEXT,
  bio                  TEXT
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
  email      TEXT,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- compte patient lié (optionnel)
  age        INTEGER,
  notes      TEXT                                        -- notes privées du médecin
  -- Pas de contrainte UNIQUE(doctor_id, phone) : le dédoublonnage est géré
  -- dans le code (nom + téléphone). Permet aux familles de partager un numéro.
);

-- ------------------------------------------------------------
-- TABLE : appointments (rendez-vous)
-- ------------------------------------------------------------
CREATE TABLE appointments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id    UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  date         DATE NOT NULL,                            -- ex: 2026-05-20
  time         TIME NOT NULL,                            -- ex: 09:30:00
  status       appointment_status NOT NULL DEFAULT 'confirmed',
  notes        TEXT,                                     -- motif saisi par le patient
  cancel_token TEXT UNIQUE,                              -- token pour le lien d'annulation
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  doctor_notes TEXT,                                     -- notes privées du médecin sur le RDV
  attendance   TEXT                                      -- present | absent | late | NULL
);

-- ------------------------------------------------------------
-- TABLE : blocked_dates (congés / absences du médecin)
-- ------------------------------------------------------------
CREATE TABLE blocked_dates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID REFERENCES doctors(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  reason     TEXT,                                       -- message affiché aux patients
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, date)
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX idx_appointments_doctor_date  ON appointments(doctor_id, date);
CREATE INDEX idx_appointments_cancel_token ON appointments(cancel_token);
CREATE INDEX idx_appointments_status       ON appointments(status);

CREATE INDEX idx_patients_doctor_phone     ON patients(doctor_id, phone);
CREATE INDEX idx_patients_email            ON patients(email);
CREATE INDEX idx_patients_user_id          ON patients(user_id);

CREATE INDEX idx_doctors_status              ON doctors(status);
CREATE INDEX idx_doctors_city                ON doctors(city);
CREATE INDEX idx_doctors_subscription_status ON doctors(subscription_status);

-- Un seul RDV actif (non annulé) par créneau et par médecin.
-- NB : la base contient deux index identiques (unique_active_slot et
-- unique_active_appointment) — l'un est redondant et peut être supprimé.
CREATE UNIQUE INDEX unique_active_slot ON appointments(doctor_id, date, time)
  WHERE status <> 'cancelled';
CREATE UNIQUE INDEX unique_active_appointment ON appointments(doctor_id, date, time)
  WHERE status <> 'cancelled';

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — Isolation multi-tenant
-- ============================================================
ALTER TABLE doctors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

-- ---------- DOCTORS ----------
CREATE POLICY "doctors_own" ON doctors
  FOR ALL USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Médecin : voir son propre profil" ON doctors
  FOR SELECT USING ((auth.jwt() ->> 'email') = email);

CREATE POLICY "Médecin : modifier son propre profil" ON doctors
  FOR UPDATE USING ((auth.jwt() ->> 'email') = email);

CREATE POLICY "doctors_public_read" ON doctors
  FOR SELECT USING (true);

CREATE POLICY "Public : voir médecins approuvés actifs" ON doctors
  FOR SELECT USING (status = 'approved' AND subscription_status = 'actif');

-- ---------- PATIENTS ----------
CREATE POLICY "patients_own" ON patients
  FOR ALL USING (
    doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  );

CREATE POLICY "Médecin : voir ses patients" ON patients
  FOR SELECT USING (
    doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  );

CREATE POLICY "Médecin : modifier ses patients" ON patients
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  );

CREATE POLICY "Public : créer un patient" ON patients
  FOR INSERT WITH CHECK (true);

-- ---------- APPOINTMENTS ----------
CREATE POLICY "appointments_own" ON appointments
  FOR ALL USING (
    doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  );

CREATE POLICY "Médecin : voir ses RDV" ON appointments
  FOR SELECT USING (
    doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  );

CREATE POLICY "Médecin : modifier ses RDV" ON appointments
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  );

CREATE POLICY "Public : créer un RDV" ON appointments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public : voir RDV par token" ON appointments
  FOR SELECT USING (cancel_token IS NOT NULL);

-- ---------- BLOCKED_DATES ----------
CREATE POLICY "doctors_own_blocked_dates" ON blocked_dates
  FOR ALL
  USING (doctor_id IN (SELECT id FROM doctors WHERE email = auth.email()))
  WITH CHECK (doctor_id IN (SELECT id FROM doctors WHERE email = auth.email()));

-- ============================================================
-- NOTES
-- ============================================================
-- • Les opérations serveur de l'app utilisent la SERVICE ROLE KEY
--   (createAdminClient) qui contourne le RLS : le filtrage par
--   doctor_id / user_id est alors assuré dans le code applicatif.
-- • Les écritures publiques (réservation patient) passent par les
--   policies "Public : créer ...".
-- • Pour créer un médecin : créer l'utilisateur dans Auth > Users
--   avec le MÊME email que la ligne doctors (l'email = identifiant).
