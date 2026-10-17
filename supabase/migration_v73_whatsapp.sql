-- v73 — Chatbot WhatsApp : prise de RDV par le patient, dans la conversation.
-- Additive et rejouable. À lancer une fois, puis `notify pgrst, 'reload schema';`
-- ============================================================================
--
-- CE QUE CETTE MIGRATION N'AJOUTE PAS
--
-- Ni agenda WhatsApp, ni créneaux WhatsApp, ni base WhatsApp. Un RDV pris dans
-- la conversation est créé par le MÊME `POST /api/appointments` que la page
-- publique, atterrit dans la MÊME table `appointments`, et hérite donc sans un
-- mot de code de l'agenda, de la vue cabinet, de la salle d'attente, de la
-- feuille de route et du dossier patient. Les disponibilités viennent du MÊME
-- `/api/slots` : `working_hours`, pauses, `blocked_dates`, `booking_lead_hours`
-- et la durée du motif s'appliquent déjà, sans que le médecin ait à régler quoi
-- que ce soit deux fois. Le chatbot est un canal d'entrée, pas un système.
--
-- Cette migration n'ajoute donc que les trois choses qui manquaient vraiment.
--
--
-- 1. patients.phone_norm — LE PIÈGE QUI AURAIT TOUT CASSÉ EN SILENCE
--
-- Meta identifie le patient par son `wa_id` : « 212612345678 », chiffres seuls,
-- sans « + ». La colonne `patients.phone` est un TEXT libre, jamais normalisé :
-- la même personne y figure en « 0612345678 », « 06 12 34 56 78 »,
-- « +212 6 12 34 56 78 »… Une comparaison directe n'aurait trouvé personne, SANS
-- lever d'erreur : le chatbot aurait traité chaque patient déjà connu comme un
-- inconnu. Pas un plantage — un échec muet, le pire genre.
--
-- Colonne GÉNÉRÉE, et non remplie par un trigger ou par le code : elle ne peut
-- alors pas se désynchroniser, aucun reprise de données n'est nécessaire, et
-- aucun chemin d'écriture (médecin, secrétaire, patient, import) ne peut
-- l'oublier. Le format cible est celui de Meta — on compare sans transformer.
--
-- L'index compte autant que la colonne. Le seul index existant est
-- `idx_patients_doctor_phone (doctor_id, phone)` : inutilisable pour la requête
-- principale du chatbot, qui cherche un numéro SANS connaître le médecin
-- (« chez quels praticiens ce numéro est-il patient ? »). Sans index dédié,
-- chaque message entrant balayait toute la table.
--
--
-- 2. appointments.channel — POUR DÉCIDER DES RAPPELS AVEC DES CHIFFRES
--
-- Les rappels WhatsApp sont hors périmètre : ils sont payants, le chatbot ne
-- l'est pas. Mais une réservation WhatsApp sans email n'a AUCUN rappel (le cron
-- ignore les patients sans email), et l'absentéisme est le premier problème du
-- cabinet. Cette colonne permettra de comparer le taux d'absence par canal, et
-- donc de savoir ce qu'un rappel payant rapporte AVANT de le payer.
--
-- Volontairement NULLABLE et SANS défaut : les RDV antérieurs à la v73 sont
-- d'origine inconnue, et leur affecter « web » par défaut aurait étiqueté comme
-- réservations patient des RDV saisis au cabinet. NULL = avant la v73, et c'est
-- une information honnête. Pas de contrainte NOT NULL non plus : un canal futur
-- ne doit pas exiger une migration.
--
--
-- 3. Les deux tables de conversation
--
-- `whatsapp_conversations` porte l'ÉTAT (une ligne par numéro, pas un
-- historique) : où en est la personne dans le parcours, pour quel cabinet et
-- pour qui. Le parcours est une machine à états déterministe — c'est ce qui
-- rend le chatbot gratuit (aucun modèle sur le chemin principal) et sûr (aucun
-- créneau inventé : seuls ceux rendus par /api/slots sont proposés).
--
-- `whatsapp_messages` porte le TRANSCRIPT, et surtout `wa_message_id UNIQUE`.
-- Meta rejoue un webhook tant qu'il n'a pas reçu de 200 assez vite. Sans cette
-- contrainte d'unicité, un rejeu pouvait créer DEUX rendez-vous au même
-- patient. La garantie est posée dans la base, pas dans le code applicatif.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Numéro normalisé au format Meta
-- ----------------------------------------------------------------------------

-- Chiffres seuls → « 00 » international retiré → « 0 » national remplacé par
-- l'indicatif marocain. Un numéro étranger déjà préfixé de son indicatif est
-- laissé tel quel : on ne force PAS 212 (un patient français en +33 existe).
-- Toutes les fonctions utilisées sont IMMUTABLE, condition d'une colonne générée.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS phone_norm TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = '' THEN NULL
      -- 00212… / 0033… : préfixe de sortie international
      WHEN left(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 2) = '00'
        THEN substr(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 3)
      -- 212… : déjà au format Meta
      WHEN left(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 3) = '212'
        THEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
      -- 0612345678 : numéro national marocain (10 chiffres commençant par 0)
      WHEN left(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 1) = '0'
       AND length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) = 10
        THEN '212' || substr(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 2)
      -- 612345678 : national sans le 0
      WHEN length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) = 9
        THEN '212' || regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
      ELSE regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
    END
  ) STORED;

COMMENT ON COLUMN patients.phone_norm IS
  'Numéro au format wa_id de Meta (212612345678). Généré depuis phone : ne jamais écrire dedans.';

-- La requête principale du chatbot : un numéro, sans connaître le médecin.
CREATE INDEX IF NOT EXISTS idx_patients_phone_norm ON patients(phone_norm);

-- ----------------------------------------------------------------------------
-- 2. Canal d'origine du rendez-vous
-- ----------------------------------------------------------------------------

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS channel TEXT;

COMMENT ON COLUMN appointments.channel IS
  'Canal de création : web | whatsapp | cabinet. NULL = RDV antérieur à la v73.';

-- ----------------------------------------------------------------------------
-- 3. État de conversation (une ligne par numéro) et transcript
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id       TEXT NOT NULL,                 -- 212612345678, tel que Meta l'envoie
  doctor_id   UUID REFERENCES doctors(id)  ON DELETE SET NULL,
  patient_id  UUID REFERENCES patients(id) ON DELETE SET NULL,
  etape       TEXT NOT NULL DEFAULT 'accueil',
  -- Sélections en cours (motif, date, heure) + les créneaux RÉELLEMENT proposés
  -- au dernier tour : avant d'écrire un RDV on vérifie que l'heure choisie en
  -- faisait partie. C'est ce qui interdit structurellement un créneau inventé.
  contexte    JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Fin de la fenêtre de service Meta (24 h après le dernier message entrant).
  -- Au-delà, on ne peut plus répondre librement : la conversation doit repartir
  -- de zéro plutôt que de reprendre un parcours périmé.
  fenetre_fin TIMESTAMPTZ,
  -- Renseigné dès qu'un humain doit reprendre la main (urgence, hors-script,
  -- deux incompréhensions). Tant que c'est non NULL, le bot se tait.
  escalade_le TIMESTAMPTZ,
  escalade_motif TEXT,
  maj_le      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un seul état courant par numéro : la ligne se met à jour, elle ne s'empile pas.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_conversations_wa_id
  ON whatsapp_conversations(wa_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_doctor
  ON whatsapp_conversations(doctor_id, maj_le DESC);

-- Les conversations à traiter par un humain, triées par ancienneté.
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_escalade
  ON whatsapp_conversations(doctor_id, escalade_le)
  WHERE escalade_le IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  -- Identifiant Meta du message entrant. UNIQUE = idempotence : un webhook
  -- rejoué ne peut pas reprendre le parcours une seconde fois. NULL pour les
  -- messages sortants et pour le simulateur, d'où l'index partiel.
  wa_message_id  TEXT,
  sens           TEXT NOT NULL CHECK (sens IN ('entrant', 'sortant')),
  contenu        TEXT,
  -- Charge utile du message interactif envoyé (boutons, liste) : permet de
  -- rejouer l'affichage exact dans l'écran de la secrétaire.
  interactif     JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_messages_wa_id
  ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation
  ON whatsapp_messages(conversation_id, created_at);

-- ----------------------------------------------------------------------------
-- 4. Sécurité : une conversation ne doit jamais fuir
-- ----------------------------------------------------------------------------
--
-- Un numéro de téléphone peut être celui du mari, du frère, du cybercafé. Ces
-- tables disent qui consulte quel praticien : rien ici n'est lisible
-- publiquement. Le webhook écrit avec la clé de service (hors RLS) ; le médecin
-- et sa secrétaire lisent, et seulement les lignes de leur cabinet.

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Médecin : lire ses conversations" ON whatsapp_conversations;
CREATE POLICY "Médecin : lire ses conversations" ON whatsapp_conversations
  FOR SELECT
  USING (doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "Secrétaire : lire les conversations du cabinet" ON whatsapp_conversations;
CREATE POLICY "Secrétaire : lire les conversations du cabinet" ON whatsapp_conversations
  FOR SELECT
  USING (doctor_id IN (
    SELECT doctor_id FROM cabinet_staff
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  ));

DROP POLICY IF EXISTS "Médecin : lire les messages" ON whatsapp_messages;
CREATE POLICY "Médecin : lire les messages" ON whatsapp_messages
  FOR SELECT
  USING (conversation_id IN (
    SELECT c.id FROM whatsapp_conversations c
    WHERE c.doctor_id IN (SELECT id FROM doctors WHERE email = auth.jwt() ->> 'email')
  ));

DROP POLICY IF EXISTS "Secrétaire : lire les messages du cabinet" ON whatsapp_messages;
CREATE POLICY "Secrétaire : lire les messages du cabinet" ON whatsapp_messages
  FOR SELECT
  USING (conversation_id IN (
    SELECT c.id FROM whatsapp_conversations c
    WHERE c.doctor_id IN (
      SELECT doctor_id FROM cabinet_staff
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  ));

-- ============================================================================
-- Fin de la migration v73
-- ============================================================================
