-- ============================================================================
-- Migration v87 — L'ANAMNÈSE MÉDICALE STRUCTURÉE
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── POURQUOI PAS VINGT COLONNES ─────────────────────────────────────────────
--
-- Le questionnaire compte vingt-deux questions et il évoluera. Vingt-deux
-- colonnes booléennes sur `patients` — table du TRONC COMMUN, partagée par
-- toutes les spécialités — auraient fait porter à chaque pédiatre et à chaque
-- psychiatre les colonnes du dentiste. Un seul jsonb, lu par un seul module.
--
-- Format écrit :
--   { "anticoagulant": { "r": "oui", "p": "Sintrom, depuis 2019" },
--     "allergie_latex": { "r": "non" } }
--   r = oui | non | inconnu     p = précision libre
-- Une clé ABSENTE veut dire « pas encore posée », ce qui n'est pas « non ».
--
-- ── POURQUOI UNE DATE À PART ────────────────────────────────────────────────
--
-- Une anamnèse de 2023 n'est pas une anamnèse : le patient a pu commencer un
-- anticoagulant depuis. La date de dernière mise à jour permet d'inviter à la
-- reconfirmer sans jamais rien effacer ni bloquer.
--
-- ── CE QUI N'EST PAS TOUCHÉ ─────────────────────────────────────────────────
--
-- `allergies`, `chronic_conditions`, `surgeries`, `current_treatments` et
-- `family_history` restent en place, inchangés, et continuent d'alimenter la
-- bannière d'alerte. Un cabinet qui ne remplit jamais le questionnaire garde
-- exactement ce qu'il avait.
-- ============================================================================

alter table public.patients
  add column if not exists anamnese     jsonb,
  add column if not exists anamnese_maj date;

comment on column public.patients.anamnese is
  'Anamnèse médicale structurée : { "<question>": { "r": "oui|non|inconnu", "p": "précision" } }. Clé absente = question non posée, ce qui n''est pas « non ».';
comment on column public.patients.anamnese_maj is
  'Date de dernière confirmation de l''anamnèse par le praticien. Au-delà d''un an, l''écran invite à la reconfirmer.';

-- Aucune politique RLS à ajouter : ces colonnes vivent dans `patients`, déjà
-- protégée par les politiques existantes (un praticien ne lit que ses
-- patients, la secrétaire n'accède pas aux colonnes médicales — c'est la route
-- serveur qui les filtre pour elle).

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_name = 'patients' and column_name in ('anamnese','anamnese_maj');

-- ============================================================================
-- Fin de la migration v87
-- ============================================================================
