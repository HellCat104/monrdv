-- ============================================================================
-- Migration v77 — Un mot entre le médecin et l'accueil, attaché au rendez-vous
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. Ne pas oublier `notify pgrst, 'reload schema';` ensuite.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- Quand la secrétaire a besoin du médecin pendant qu'il consulte, c'est presque
-- toujours À PROPOS DE QUELQU'UN : « elle demande si elle peut décaler à
-- jeudi », « il est parti sans payer », « son fils rappelle pour avancer ».
-- Aujourd'hui ça passe par WhatsApp personnel — donc des noms de patients sur
-- le téléphone privé de la secrétaire, ce que MonRDV passe son temps à éviter.
--
-- ── POURQUOI PAS UNE MESSAGERIE ─────────────────────────────────────────────
--
-- Un fil général perd le lien : le médecin lit « elle demande si c'est
-- possible » trois messages plus tard sans savoir de qui on parle. Le message
-- vit donc SUR le rendez-vous, et s'affiche à côté du nom du patient, là où
-- les deux écrans regardent déjà (v76).
--
-- `appointment_id` est néanmoins NULLABLE : le jour où un fil de cabinet sera
-- utile (« le labo a appelé », « je pars à 17h »), il tiendra dans cette même
-- table sans rendez-vous rattaché. On ne construit pas l'écran aujourd'hui, on
-- se garde juste de fermer la porte.
--
-- ── QUI ÉCRIT ───────────────────────────────────────────────────────────────
--
-- Le médecin, et toute secrétaire qui a le droit de voir l'agenda : si elle
-- voit le rendez-vous, elle peut y laisser un mot. C'est la règle que le
-- cabinet applique déjà pour les présences.
--
-- `auteur` est posé par le SERVEUR, jamais par le navigateur : on ne doit pas
-- pouvoir écrire un mot signé « le médecin » depuis le poste d'accueil.
--
-- ── CE QUE CE N'EST PAS ─────────────────────────────────────────────────────
--
-- Pas de notion de « lu / non lu » : elle demanderait un état par personne, et
-- les deux écrans se rafraîchissent déjà tout seuls. Le mot s'affiche près du
-- nom jusqu'à ce qu'on l'efface.
--
-- Ce n'est pas non plus un dossier médical : c'est de l'organisation de
-- cabinet. Les notes cliniques restent dans `consultation_notes`, que la
-- secrétaire ne voit pas.
--
-- ── DROITS ──────────────────────────────────────────────────────────────────
--
-- Table NOUVELLE : depuis le changement Supabase du 30 octobre 2026, elle
-- n'hérite d'aucun droit. On les écrit donc ici, au plus juste — `service_role`
-- pour le serveur, `authenticated` en lecture seule parce que l'écran du
-- médecin lit directement, et RIEN pour `anon` : aucun visiteur du site public
-- n'a à connaître l'organisation interne d'un cabinet.
-- ============================================================================

create table if not exists public.appointment_messages (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null references public.doctors(id) on delete cascade,
  -- Nullable : voir l'en-tête, un fil de cabinet tiendrait ici.
  appointment_id uuid references public.appointments(id) on delete cascade,
  auteur         text not null check (auteur in ('medecin', 'secretaire')),
  -- Le nom au moment de l'écriture : une secrétaire peut partir, son mot reste
  -- lisible. Recalculer l'auteur plus tard afficherait un nom faux ou vide.
  auteur_nom     text,
  contenu        text not null check (length(btrim(contenu)) between 1 and 1000),
  created_at     timestamptz not null default now()
);

comment on table public.appointment_messages is
  'Mots échangés entre le médecin et l''accueil au sujet d''un rendez-vous. Organisation de cabinet, pas de dossier médical.';

create index if not exists idx_appointment_messages_rdv
  on public.appointment_messages(appointment_id, created_at);

create index if not exists idx_appointment_messages_doctor
  on public.appointment_messages(doctor_id, created_at desc);

-- ── Droits ──────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.appointment_messages to service_role;
grant select, insert, delete          on public.appointment_messages to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.appointment_messages enable row level security;

drop policy if exists "Médecin : lire les mots de son cabinet" on public.appointment_messages;
create policy "Médecin : lire les mots de son cabinet" on public.appointment_messages
  for select
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : écrire un mot" on public.appointment_messages;
create policy "Médecin : écrire un mot" on public.appointment_messages
  for insert
  with check (
    auteur = 'medecin'
    and doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Médecin : effacer un mot" on public.appointment_messages;
create policy "Médecin : effacer un mot" on public.appointment_messages
  for delete
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

-- La secrétaire passe par les routes serveur (service_role), qui vérifient sa
-- permission « agenda » et posent l'auteur. On lui donne tout de même la
-- LECTURE directe, pour que son écran puisse afficher le fil sans aller-retour.
drop policy if exists "Secrétaire : lire les mots du cabinet" on public.appointment_messages;
create policy "Secrétaire : lire les mots du cabinet" on public.appointment_messages
  for select
  using (doctor_id in (
    select doctor_id from public.cabinet_staff
    where lower(email) = lower(auth.jwt() ->> 'email') and status = 'active'
  ));

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select tablename from pg_tables where tablename = 'appointment_messages';
-- select policyname from pg_policies where tablename = 'appointment_messages';

-- ============================================================================
-- Fin de la migration v77
-- ============================================================================
