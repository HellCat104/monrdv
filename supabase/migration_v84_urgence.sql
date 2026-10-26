-- ============================================================================
-- Migration v84 — L'URGENCE. Tronc commun : toutes les spécialités.
-- À lancer dans Supabase → SQL Editor → New query → Run.
-- Idempotente. `notify pgrst, 'reload schema';` à la fin.
--
-- ── POURQUOI C'EST DU TRONC COMMUN, ET PAS DE LA GASTRO ─────────────────────
--
-- Le besoin est venu d'un cas de gastro-entérologie — l'hémorragie digestive —
-- mais il ne lui appartient pas. Une douleur thoracique chez un généraliste,
-- un nourrisson qui ne boit plus chez un pédiatre : c'est la même chose. La
-- secrétaire prend l'appel, elle doit pouvoir le dire, et la ligne doit cesser
-- de ressembler à celle d'un contrôle de routine.
--
-- Deux colonnes seulement, parce que c'est tout ce qu'il faut.
--
-- ── CE QUE CETTE MIGRATION N'AJOUTE PAS ─────────────────────────────────────
--
-- Aucun score de gravité, aucun tri automatique, aucune conduite à tenir.
-- `urgent` est un OUI/NON coché par un humain qui a entendu la voix au
-- téléphone. Un logiciel qui calculerait « gravité modérée » sur une
-- hémorragie digestive serait dangereux.
-- ============================================================================

-- ── 1. Le rendez-vous urgent ────────────────────────────────────────────────
--
-- `false` par défaut : rien ne change pour les rendez-vous existants, et
-- l'urgence reste l'exception qu'elle doit être. Une liste où tout est urgent
-- est une liste où plus rien ne l'est.

alter table public.appointments
  add column if not exists urgent boolean not null default false;

comment on column public.appointments.urgent is
  'Coché à la main par la secrétaire ou le médecin. Aucun calcul : le logiciel ne décide pas qu''un cas est grave.';

-- Index partiel : on ne cherche QUE les urgences, jamais les non-urgences.
-- Un index sur toute la colonne aurait pesé pour rien.
create index if not exists idx_appointments_urgent
  on public.appointments(doctor_id, date)
  where urgent;


-- ── 2. L'issue « adressé à l'hôpital » ──────────────────────────────────────
--
-- Le circuit de la salle d'attente n'avait que trois états : arrivé, en
-- consultation, parti. « Parti » veut dire « reparti chez lui ». Le patient
-- transféré aux urgences était donc compté comme une consultation ordinaire,
-- et plus personne ne savait qu'il fallait prendre de ses nouvelles.
--
-- `queue_status` n'a jamais porté de contrainte (v22) : la liste des valeurs
-- admises vit dans l'API, qui la contrôle à chaque écriture. On documente ici
-- la valeur nouvelle plutôt que d'ajouter une contrainte qui ferait échouer
-- les lignes anciennes mal formées, s'il y en a.

comment on column public.appointments.queue_status is
  'arrive | en_consultation | parti | hopital. « hopital » = adressé aux urgences : le patient quitte le circuit du jour sans être compté comme une consultation terminée. Valeurs contrôlées par l''API (app/api/cabinet/appointments).';

-- Retrouver vite ceux dont il faut prendre des nouvelles.
create index if not exists idx_appointments_hopital
  on public.appointments(doctor_id, date)
  where queue_status = 'hopital';


notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name, data_type, column_default
--   from information_schema.columns
--  where table_name = 'appointments' and column_name = 'urgent';

-- ============================================================================
-- Fin de la migration v84
-- ============================================================================
