-- ============================================================================
-- Migration v89 — LES POSTES DE TRAVAIL : fauteuils et salles
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QUI ÉTAIT PHYSIQUEMENT IMPOSSIBLE ────────────────────────────────────
--
-- Un cabinet à deux fauteuils ne pouvait pas planifier deux patients à la même
-- heure : la base le REFUSAIT, par la contrainte `no_overlapping_appointments`
-- (v4, v31). C'était la bonne règle quand un cabinet = un fauteuil, et elle
-- devient fausse dès qu'il y en a deux. L'anesthésie qui fait effet au
-- fauteuil 1 pendant qu'on détartre au fauteuil 2 est la journée normale d'un
-- cabinet dentaire, et l'agenda la déclarait impossible.
--
-- ── LA RÈGLE CHANGE DE GRAIN, ELLE NE DISPARAÎT PAS ─────────────────────────
--
-- Avant : pas deux rendez-vous à la même heure CHEZ UN MÉDECIN.
-- Après : pas deux rendez-vous à la même heure SUR UN MÊME POSTE.
--
-- Un cabinet qui ne déclare aucun poste garde donc EXACTEMENT le comportement
-- qu'il avait : tous ses rendez-vous portent le même poste (aucun), et la
-- contrainte les compare entre eux comme auparavant. Rien à migrer, rien à
-- choisir, aucune régression pour les quatre cinquièmes des cabinets.
--
-- ── CE QUE LE POSTE N'EST PAS ───────────────────────────────────────────────
--
-- Ce n'est pas un deuxième praticien. Deux fauteuils ne dédoublent pas le
-- dentiste : la RÉSERVATION EN LIGNE continue de ne proposer qu'un patient à
-- la fois, et ne connaît pas les postes. Placer un second patient à la même
-- heure est un geste du cabinet, qui sait qui fait quoi — pas une porte
-- ouverte dans la page publique.
--
-- ── L'ORDRE DES OPÉRATIONS ──────────────────────────────────────────────────
--
-- On AJOUTE la nouvelle contrainte avant de retirer l'ancienne. La nouvelle
-- est strictement plus permissive, donc elle s'installe sans conflit tant que
-- l'ancienne tient ; et si elle échoue, l'agenda n'a pas passé une seconde
-- sans protection contre les doubles réservations.
-- ============================================================================

-- ── Les postes ──────────────────────────────────────────────────────────────

create table if not exists public.cabinet_postes (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,

  -- « Fauteuil 1 », « Salle de soins », « Box 2 » : le cabinet nomme ses
  -- postes comme il les appelle à l'oral. Aucun vocabulaire imposé.
  nom        text not null check (length(btrim(nom)) between 1 and 60),
  -- L'ordre des colonnes dans l'agenda — celui du couloir, pas l'alphabet.
  ordre      smallint not null default 0,
  -- Une couleur pour distinguer les colonnes d'un coup d'œil. Facultative.
  couleur    text,
  -- Un poste démonté : il sort des listes et les rendez-vous passés gardent
  -- leur trace. On n'efface pas un poste qui a une histoire.
  actif      boolean not null default true,

  created_at timestamptz not null default now()
);

comment on table public.cabinet_postes is
  'Fauteuils, salles ou box d''un cabinet. Un poste n''est PAS un second praticien : la réservation en ligne les ignore.';

-- Deux « Fauteuil 1 » dans un cabinet, c'est une colonne qu'on ne sait plus
-- lire. Index partiel sur les postes ACTIFS : démonter puis remonter un poste
-- du même nom reste possible.
create unique index if not exists idx_cabinet_postes_nom
  on public.cabinet_postes(doctor_id, lower(btrim(nom)))
  where actif;

create index if not exists idx_cabinet_postes_cabinet
  on public.cabinet_postes(doctor_id, ordre, nom)
  where actif;

-- ── Le poste d'un rendez-vous ───────────────────────────────────────────────
--
-- NULL = « poste non précisé », et c'est le cas de TOUS les rendez-vous
-- existants. Ce n'est pas un trou à combler : un cabinet à un fauteuil n'a
-- jamais besoin de le nommer.
--
-- `on delete set null` et non `cascade` : démonter un fauteuil ne doit pas
-- emporter les rendez-vous qui s'y sont tenus.
alter table public.appointments
  add column if not exists poste_id uuid references public.cabinet_postes(id) on delete set null;

comment on column public.appointments.poste_id is
  'Fauteuil ou salle occupé. NULL = non précisé, ce qui est un poste à part entière pour les contraintes de chevauchement.';

create index if not exists idx_appointments_poste
  on public.appointments(doctor_id, date, poste_id)
  where status <> 'cancelled';

-- ── Les contraintes, au grain du poste ──────────────────────────────────────
--
-- `coalesce(poste_id, uuid nul)` : NULL se compare mal (NULL = NULL est
-- inconnu, et un index unique laisserait donc passer autant de doublons qu'on
-- veut). On lui substitue un identifiant constant, qui fait du « non précisé »
-- un poste comme les autres — celui du cabinet à un seul fauteuil.

-- 1. Un seul rendez-vous par heure de départ ET PAR POSTE.
create unique index if not exists unique_active_slot_poste
  on public.appointments(
    doctor_id,
    (coalesce(poste_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    date, time)
  where status <> 'cancelled' and walk_in = false;

-- 2. Pas de chevauchement d'intervalles SUR UN MÊME POSTE.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'no_overlap_poste') then
    alter table public.appointments add constraint no_overlap_poste
      exclude using gist (
        doctor_id with =,
        (coalesce(poste_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
        tsrange(
          (date + time)::timestamp,
          (date + time)::timestamp + make_interval(mins => coalesce(duration_minutes, 30))
        ) with &&
      ) where (status <> 'cancelled' and date >= date '2026-06-12' and walk_in = false);
  end if;
end $$;

-- 3. Les anciennes, devenues trop strictes, partent EN DERNIER — une fois les
--    nouvelles en place et validées.
drop index if exists unique_active_slot;
alter table public.appointments drop constraint if exists no_overlapping_appointments;

-- ── Droits — table nouvelle, rien n'est hérité ──────────────────────────────

grant select, insert, update, delete on public.cabinet_postes to service_role, authenticated;
-- `anon` lit les postes ? Non : la page publique de réservation ne les
-- connaît pas, et le nombre de fauteuils d'un cabinet ne regarde personne.

-- ── RLS — le cabinet, et lui seul ───────────────────────────────────────────

alter table public.cabinet_postes enable row level security;

drop policy if exists "Médecin : lire ses postes" on public.cabinet_postes;
create policy "Médecin : lire ses postes" on public.cabinet_postes
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : créer un poste" on public.cabinet_postes;
create policy "Médecin : créer un poste" on public.cabinet_postes
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : modifier un poste" on public.cabinet_postes;
create policy "Médecin : modifier un poste" on public.cabinet_postes
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : effacer un poste" on public.cabinet_postes;
create policy "Médecin : effacer un poste" on public.cabinet_postes
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select conname from pg_constraint where conrelid = 'public.appointments'::regclass;
-- select indexname from pg_indexes where tablename = 'appointments';

-- ============================================================================
-- Fin de la migration v89
-- ============================================================================
