-- ============================================================
-- Migration : Authentification patients
-- Copiez et exécutez ce SQL dans Supabase > SQL Editor
-- ============================================================

-- 1. Ajouter colonnes email et user_id à la table patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Index pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_patients_email   ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);

-- 3. RLS des rendez-vous côté patient — VOLONTAIREMENT ABSENTE
--
-- Cette migration contenait une policy « patients can view own appointments »
-- écrite avec `CREATE POLICY IF NOT EXISTS`, syntaxe qui n'existe pas en
-- PostgreSQL : l'instruction échouait, la policy n'a donc jamais été créée.
-- Elle est retirée ici plutôt que « réparée », car l'appliquer serait DANGEREUX :
-- une policy SELECT sur `appointments` ne filtre pas les colonnes et exposerait
-- aux patients, via PostgREST, l'intégralité de la ligne — dont `doctor_notes`
-- (notes privées du médecin), `cancel_token`, `amount_paid` et `invoice_no`.
--
-- L'espace patient n'en a pas besoin : ses lectures passent par le serveur
-- (client service_role) avec une projection explicite des colonnes autorisées,
-- après filtrage sur `user_id` — voir app/patient/(protected)/ et
-- app/api/patient/**. L'annulation utilise le `cancel_token` (secret dans l'URL).
--
-- Ne pas ré-ajouter de policy publique sur `appointments` sans restreindre les
-- colonnes (vue dédiée ou fonction SECURITY DEFINER).

-- Vérification finale
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;
