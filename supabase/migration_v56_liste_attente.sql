-- ============================================================================
-- Migration v56 — Liste d'attente : prévenir quand un créneau se libère plus tôt
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente.
--
-- ORDRE DE DÉPLOIEMENT : indifférent. Le code tolère l'absence de la migration
-- (la case et l'interrupteur restent simplement cachés, les annulations
-- continuent de fonctionner) et cette migration ne casse pas l'ancien code.
-- Le plus simple reste de la lancer AVANT de pousser le code.
--
-- ── LE PROBLÈME ─────────────────────────────────────────────────────────────
--
-- Un patient annule à 18 h son rendez-vous du lendemain 10 h. Le créneau se
-- vide, personne ne le sait : le cabinet perd une heure de fauteuil, et le
-- patient déjà inscrit pour vendredi — qui serait volontiers venu demain — ne
-- l'apprend jamais. C'est la perte la plus banale et la plus invisible d'un
-- cabinet.
--
-- ── POURQUOI UNE INSCRIPTION S'APPUIE SUR UN RENDEZ-VOUS EXISTANT ───────────
--
-- On n'inscrit QUE des patients qui ont DÉJÀ un rendez-vous chez ce praticien
-- et viendraient plus tôt. Trois raisons, qui décident de toute la forme de
-- ces tables :
--
--  1. Le candidat est identifié, joignable (il a une adresse e-mail) et il
--     s'est engagé. Une liste ouverte à tout venant, c'est une file de
--     curieux : on notifierait des gens qui ne viendront pas.
--  2. Le cabinet ne risque rien. Si personne ne répond, le créneau reste vide
--     — exactement la situation d'avant. Et le patient qui ne répond pas garde
--     son rendez-vous tardif : il ne perd rien non plus. ON PRÉVIENT, ON NE
--     DÉPLACE JAMAIS D'OFFICE.
--  3. Le rendez-vous existant sert de BORNE : on ne propose qu'un créneau
--     strictement PLUS TÔT que le sien, chez le MÊME praticien.
--
-- D'où `appointment_id NOT NULL` : une inscription sans rendez-vous n'existe
-- pas dans ce produit. La règle est en base, pas seulement dans le code.
--
-- ── POURQUOI DEUX TABLES : L'INSCRIPTION ET L'OFFRE ─────────────────────────
--
-- La version précédente de ce fichier (jamais exécutée) rangeait l'offre en
-- cours DANS l'inscription, avec un jeton unique qui « tournait » à chaque
-- nouvel e-mail. Conséquence : deux places qui se libèrent coup sur coup (10 h
-- puis 15 h), le lien du premier e-mail meurt, et le patient qui préférait
-- 10 h tombe sur « lien invalide » alors que la place est peut-être encore
-- libre. On lui aurait reproché de ne pas avoir lu le bon message.
--
-- Ici, chaque e-mail parti = une ligne `waitlist_offers`, avec SON jeton et
-- SON créneau. Chaque lien reste valable pour le créneau qu'il annonce, tant
-- que ce créneau est libre et que l'inscription est active. Et la règle « ne
-- jamais envoyer deux fois la même offre » devient une contrainte d'unicité
-- (inscription, date, heure) : c'est la base qui la tient, y compris quand
-- deux annulations concurrentes libèrent le même créneau.
--
-- Le créneau proposé est stocké EN BASE, jamais dans l'URL : sinon n'importe
-- qui pourrait réécrire l'heure dans le lien et se réserver le créneau de son
-- choix. Le jeton désigne « CETTE offre-là », rien d'autre.
--
-- ── PREMIER ARRIVÉ, PREMIER SERVI — ARBITRÉ PAR POSTGRESQL ──────────────────
--
-- Tous les candidats éligibles sont prévenus EN MÊME TEMPS. La course n'est
-- pas arbitrée par le code applicatif (qui perdrait sur deux requêtes
-- concurrentes) mais par la contrainte d'exclusion GiST
-- `no_overlapping_appointments` (v31) : la base REFUSE physiquement une
-- seconde réservation du même intervalle. Le perdant reçoit une phrase claire
-- (« ce créneau vient d'être pris »), jamais une erreur PostgreSQL.
--
-- Ces tables ne contiennent donc AUCUN verrou « réservé pour X pendant
-- 10 minutes » : le seul verrou qui compte est celui des rendez-vous.
--
-- ── POURQUOI C'EST OUVERT AUX DEUX FORFAITS ─────────────────────────────────
--
-- Une inscription en liste d'attente n'est pas une donnée de santé : une date
-- et une intention (« je viendrais plus tôt »), comme le rappel de suivi. La
-- fonction est disponible en forfait Agenda comme en Cabinet complet —
-- contrairement au dossier, aux ordonnances ou aux factures (lib/plan.ts).
-- ============================================================================


-- Aucune extension requise : le jeton ci-dessous n'utilise que
-- gen_random_uuid(), intégrée au cœur de PostgreSQL depuis la version 13 et
-- déjà employée par toutes les tables de ce schéma. Une première version
-- s'appuyait sur gen_random_bytes() (pgcrypto), qui n'avait jamais servi dans
-- cette base et que Supabase range dans le schéma `extensions` : la résolution
-- du nom dépendait alors du search_path de l'éditeur SQL.


-- ── 1) Le réglage du praticien ──────────────────────────────────────────────
-- Automatique par défaut : un médecin qui vient de s'inscrire profite de la
-- fonction sans rien configurer — c'est tout l'intérêt d'un remplissage
-- automatique. Celui que ça dérange (agenda tenu au téléphone, patientèle qui
-- ne lit pas ses e-mails) la coupe en un clic dans ses Paramètres.
--
-- Aucun GRANT à ajouter : depuis la v37, le rôle `authenticated` lit toute SA
-- fiche via `doctors_own`, et les pages publiques passent par service_role.
-- Le trigger v51/v52 ne fige pas cette colonne : le médecin doit pouvoir
-- l'écrire depuis l'écran Paramètres.
alter table public.doctors
  add column if not exists waitlist_enabled boolean not null default true;

comment on column public.doctors.waitlist_enabled is
  'Prévenir automatiquement par e-mail les patients inscrits en liste d''attente quand un créneau se libère plus tôt. Défaut : activé.';


-- ── 2) Les inscriptions ─────────────────────────────────────────────────────
create table if not exists public.waitlist_entries (
  id             uuid primary key default gen_random_uuid(),

  -- doctor_id est DUPLIQUÉ depuis le rendez-vous, pour que la policy RLS reste
  -- une comparaison directe comme partout ailleurs. Le trigger du §5 garantit
  -- qu'il ne peut pas mentir.
  --
  -- Le patient, lui, n'est PAS dupliqué (il l'était dans la version
  -- précédente) : la fusion de deux fiches (app/api/patients/merge) déplace
  -- les rendez-vous vers la fiche conservée PUIS supprime l'autre. Une colonne
  -- patient_id en cascade aurait effacé l'inscription au passage, sans un
  -- mot. On le lit toujours à travers le rendez-vous, seule source de vérité.
  doctor_id      uuid not null references public.doctors(id)      on delete cascade,

  -- LA BORNE. ON DELETE CASCADE : une inscription sans rendez-vous n'a plus
  -- aucun sens, elle ne doit pas survivre en orpheline.
  appointment_id uuid not null references public.appointments(id) on delete cascade,

  -- active : en attente d'une place
  -- used   : le patient a pris une place plus tôt grâce à cette inscription
  -- closed : son rendez-vous a été annulé, est passé, ou il s'est désinscrit
  status         text not null default 'active'
                 check (status in ('active','used','closed')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Une seule inscription VIVANTE par rendez-vous. Sans cet index, un patient
-- qui coche deux fois (formulaire renvoyé, double clic, case du formulaire
-- public PUIS interrupteur de son espace) recevrait chaque offre en double.
-- Partiel : les inscriptions terminées s'accumulent librement, elles ne
-- notifient plus personne.
create unique index if not exists uniq_waitlist_active_appointment
  on public.waitlist_entries (appointment_id) where status = 'active';

-- La requête du chemin chaud : « qui attend chez ce praticien ? », exécutée à
-- chaque créneau libéré. Partiel : on ne balaye jamais les inscriptions éteintes.
create index if not exists idx_waitlist_doctor_active
  on public.waitlist_entries (doctor_id, created_at) where status = 'active';

-- Index complet sur la clé étrangère : la cascade à la suppression d'un
-- rendez-vous et l'effacement d'un compte patient cherchent par appointment_id
-- toutes inscriptions confondues, pas seulement les actives.
create index if not exists idx_waitlist_appointment
  on public.waitlist_entries (appointment_id);


-- ── 3) Les offres ───────────────────────────────────────────────────────────
-- Une ligne = un e-mail parti = un lien réservable.
create table if not exists public.waitlist_offers (
  id                    uuid primary key default gen_random_uuid(),
  entry_id              uuid not null references public.waitlist_entries(id) on delete cascade,

  -- 64 caractères hexadécimaux : deux UUID v4 concaténés, soit 244 bits
  -- d'aléa — hors de portée d'une énumération. Clé d'entrée de la page
  -- publique /creneau/[token].
  token                 text not null unique
                        default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),

  -- Le créneau libéré. `duration_minutes` est la durée du rendez-vous annulé :
  -- un plafond, on ne propose la place qu'à qui tient dedans.
  offered_date          date    not null,
  offered_time          time    not null,
  duration_minutes      integer not null check (duration_minutes > 0),

  -- Le rendez-vous créé grâce à cette offre. Trace de ce que la liste d'attente
  -- a réellement produit ; SET NULL pour que la trace survive à la suppression
  -- du rendez-vous plutôt que d'emporter l'offre avec lui.
  booked_appointment_id uuid references public.appointments(id) on delete set null,

  created_at            timestamptz not null default now(),

  -- « Ne jamais envoyer deux fois la même offre » : un créneau qui se libère,
  -- se reprend puis se libère à nouveau ne produit pas un second e-mail
  -- identique. Tenu en base : l'application INSÈRE l'offre avant d'envoyer, et
  -- n'envoie que si l'insertion a réussi.
  constraint uniq_waitlist_offer_slot unique (entry_id, offered_date, offered_time)
);


-- ── 4) RLS ──────────────────────────────────────────────────────────────────
alter table public.waitlist_entries enable row level security;
alter table public.waitlist_offers  enable row level security;

-- Le praticien peut LIRE les inscriptions de son cabinet, rien de plus. Aucune
-- écriture depuis le navigateur : l'inscription, la désinscription, les offres
-- et la réservation passent toutes par des routes serveur (lib/waitlist.ts)
-- qui écrivent en service_role après avoir vérifié la propriété. Donner
-- l'écriture « au cas où » ouvrirait une porte qu'aucun écran n'utilise.
drop policy if exists "Praticien : sa liste d'attente" on public.waitlist_entries;
create policy "Praticien : sa liste d'attente" on public.waitlist_entries
  for select
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

-- `waitlist_offers` : RLS SANS AUCUNE policy, comme `audit_logs` (v44).
-- Chaque ligne porte un jeton qui réserve un créneau au nom d'un patient :
-- personne n'a à le lire depuis un navigateur, pas même le médecin.
--
-- Aucune policy patient non plus, nulle part : le patient n'accède jamais à
-- ces tables directement (app/api/patient/waitlist et app/api/waitlist/[token]
-- vérifient d'abord, écrivent ensuite en service_role).


-- ── 5) Une inscription ne peut pas mentir sur son cabinet ───────────────────
-- Même précaution qu'en v54 (quote_child_same_doctor) : la policy compare
-- `doctor_id`, pas le rendez-vous. Un doctor_id faux rendrait le
-- cloisonnement inopérant. On ne fait donc pas confiance à la valeur envoyée :
-- on la REMPLACE par celle du rendez-vous.
--
-- SECURITY INVOKER (le défaut), volontairement. Le seul rôle qui écrit ici est
-- service_role, qui lit `appointments` sans restriction ; un trigger qui se
-- contente de réécrire NEW n'a besoin d'aucun privilège supplémentaire (voir
-- v52 : SECURITY DEFINER a déjà rendu une protection inopérante trois
-- semaines). Si un jour un rôle moins privilégié écrivait ici pour le
-- rendez-vous d'un autre cabinet, il ne le verrait pas et l'exception
-- ci-dessous refuserait l'insertion — l'échec est du bon côté.
create or replace function public.waitlist_entry_follows_appointment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  d uuid;
begin
  select doctor_id into d from public.appointments where id = new.appointment_id;
  if d is null then
    raise exception 'Rendez-vous introuvable pour cette inscription en liste d''attente';
  end if;
  new.doctor_id  := d;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_waitlist_entry_follows_appointment on public.waitlist_entries;
create trigger trg_waitlist_entry_follows_appointment
  before insert or update of appointment_id, doctor_id on public.waitlist_entries
  for each row execute function public.waitlist_entry_follows_appointment();


-- ── 6) Hygiène : un rendez-vous annulé éteint son inscription ───────────────
-- L'application ferme déjà l'inscription depuis les chemins d'annulation
-- (lib/waitlist.ts). Ce trigger est la ceinture par-dessus les bretelles : le
-- jour où quelqu'un ajoutera un chemin de plus — un script de maintenance, une
-- correction à la main dans l'éditeur SQL — l'inscription s'éteindra quand
-- même. Sans lui, le patient qui annule vendredi continuerait de recevoir des
-- créneaux « plus tôt que vendredi » pour un rendez-vous qui n'existe plus.
--
-- Le filtre `status = 'active'` est essentiel : la réservation depuis la liste
-- d'attente marque l'inscription `used` PUIS annule l'ancien rendez-vous. Sans
-- ce filtre, le trigger écraserait `used` par `closed` et on perdrait la seule
-- trace qui dit que la liste d'attente a fonctionné.
--
-- SECURITY DEFINER, cette fois indispensable : la route médecin
-- (app/api/appointments/[id]) annule avec le JWT du médecin, qui n'a que la
-- LECTURE sur waitlist_entries (§4). En invoker, la RLS filtrerait l'UPDATE à
-- zéro ligne, sans la moindre erreur. La fonction n'utilise pas current_user
-- (le piège de la v52) et ne touche que les inscriptions du rendez-vous que
-- l'appelant vient lui-même, légitimement, de modifier.
create or replace function public.close_waitlist_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.waitlist_entries
       set status = 'closed', updated_at = now()
     where appointment_id = new.id
       and status = 'active';
  end if;
  return new;
end $$;

drop trigger if exists trg_close_waitlist_on_cancel on public.appointments;
create trigger trg_close_waitlist_on_cancel
  after update of status on public.appointments
  for each row execute function public.close_waitlist_on_cancel();


-- ── 7) Vérification (facultatif, à lancer après la migration) ───────────────
-- select column_name, data_type, column_default from information_schema.columns
--  where table_name in ('waitlist_entries','waitlist_offers') order by table_name, ordinal_position;
-- select count(*) filter (where waitlist_enabled) as actives, count(*) as total from public.doctors;
-- select tgname from pg_trigger where tgname in
--   ('trg_waitlist_entry_follows_appointment','trg_close_waitlist_on_cancel');

-- ============================================================================
-- Fin de la migration v56
-- ============================================================================
