-- v55 — Historique par dent (odontogramme)
--
-- `dental_charts` (v20) ne garde qu'UNE ligne par patient, écrasée à chaque
-- enregistrement : l'état antérieur d'une dent n'existe nulle part. Le jour où
-- un patient affirme « cette dent était saine avant que vous n'y touchiez », le
-- praticien n'a rigoureusement rien à opposer — pas même la date à laquelle il
-- a constaté la carie. C'est une faiblesse médico-légale, pas un manque de
-- confort : le dossier dentaire est une pièce opposable.
--
-- Cette table est donc un JOURNAL, au même titre que `audit_logs` (v44) : une
-- ligne par dent réellement modifiée, jamais réécrite, jamais effacée.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : déployer le code AVANT de lancer cette migration.
-- Elle retire au navigateur le droit d'écrire dans `dental_charts` (voir plus
-- bas) : avec l'ancien code encore en ligne, l'odontogramme ne s'enregistrerait
-- plus. Dans l'autre sens (code neuf + ancienne policy) tout fonctionne, la
-- route serveur écrivant en service_role.
--
-- Idempotente : relançable sans dommage.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La table d'événements
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tooth_history (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.doctors(id)  on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete cascade,

  -- Numéro FDI. Même règle que lib/dental.ts (FDI_RE) : on valide la FORME
  -- (deux chiffres de 1 à 8) et non la liste exacte, sans quoi on finirait par
  -- refuser une notation légitime chez l'enfant (dents de lait, 51-85).
  tooth         text not null check (tooth ~ '^[1-8][1-8]$'),

  -- Les états AVANT et APRÈS, dans l'ordre canonique de lib/dental.ts.
  -- Tableaux et non texte : une dent porte plusieurs états simultanés depuis
  -- le passage à ToothInfo.s[]. Un tableau vide est un état légitime — il
  -- signifie « aucun état » : à gauche c'est une création, à droite un
  -- effacement. La colonne reste donc NOT NULL avec un défaut vide.
  states_before text[] not null default '{}'::text[],
  states_after  text[] not null default '{}'::text[],

  -- La note libre de la dent telle qu'elle était au moment du changement
  -- d'état. Contexte, pas objet du journal : les modifications de la seule
  -- note ne créent pas de ligne (voir la contrainte ci-dessous).
  note          text,

  -- Qui a fait la modification. Même logique que lib/audit.ts : le rôle
  -- compte autant que l'identité — un schéma dentaire touché par le médecin
  -- ou par le secrétariat ne se lit pas de la même façon des années plus tard.
  -- L'e-mail est recopié ici volontairement : `auth_user_id` devient NULL si
  -- le compte est supprimé, et un journal qui perd le nom de son auteur ne
  -- prouve plus grand-chose.
  actor_role    text not null default 'medecin' check (actor_role in ('medecin','secretaire','admin')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email   text,

  created_at    timestamptz not null default now(),

  -- Le cœur du dispositif : une ligne n'existe que si l'état a RÉELLEMENT
  -- changé. Sans cette contrainte, l'enregistrement débouncé de l'odontogramme
  -- (une écriture par frappe dans la note) noierait l'histoire de la dent sous
  -- des lignes identiques, et l'historique deviendrait illisible donc inutile.
  constraint tooth_history_modification_reelle
    check (states_before is distinct from states_after)
);

-- Lecture type : « l'histoire de la dent 16 de ce patient, du plus récent au
-- plus ancien » — exactement l'ordre des colonnes de l'index.
create index if not exists idx_tooth_history_patient_tooth
  on public.tooth_history (patient_id, tooth, created_at desc);

-- Second usage : tout l'historique d'un cabinet (support, export, contrôle).
create index if not exists idx_tooth_history_doctor
  on public.tooth_history (doctor_id, created_at desc);

-- Cohérence cabinet : deux clés étrangères séparées n'interdisent pas d'écrire
-- l'historique d'un patient d'un AUTRE médecin. On réutilise le garde-fou de
-- v43 plutôt que d'en écrire un second, qui divergerait. Le `if` couvre le cas
-- d'une base où v43 n'aurait pas encore été passée.
do $$
begin
  if to_regprocedure('public.assert_patient_belongs_to_doctor()') is not null then
    drop trigger if exists trg_tooth_history_patient_doctor_integrity on public.tooth_history;
    create trigger trg_tooth_history_patient_doctor_integrity
      before insert or update of doctor_id, patient_id on public.tooth_history
      for each row execute function public.assert_patient_belongs_to_doctor();
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. APPEND-ONLY — le verrou est en base, pas dans l'application
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Un journal que son auteur peut retoucher ne vaut rien : il ne prouve que ce
-- que la dernière main a bien voulu y laisser. La protection tient donc en
-- deux étages, l'un pour le navigateur, l'autre pour tout le reste.
--
-- Étage 1 — RLS SANS AUCUNE POLICY, comme `audit_logs` (v44).
-- Sans policy, une table sous RLS est totalement inaccessible aux rôles `anon`
-- et `authenticated` : le navigateur du médecin comme celui de la secrétaire ne
-- peuvent ni lire, ni insérer, ni modifier, ni supprimer une ligne. Seul le
-- `service_role` (routes serveur) y accède. C'est aussi pour cela que la
-- lecture de l'historique passe par app/api/dental/[id] : le contrôle du
-- forfait s'y fait côté serveur, où il ne se contourne pas.
alter table public.tooth_history enable row level security;

-- Étage 2 — un trigger, qui lui s'applique AUSSI au service_role et à l'éditeur
-- SQL. Les policies protègent du navigateur ; elles ne protègent pas d'une
-- route serveur mal écrite demain, ni d'un `update` lancé à la main. Deux
-- exceptions, et deux seulement, sont tolérées ; elles sont détaillées dans le
-- corps de la fonction.
create or replace function public.tooth_history_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Seule mutation admise : rattacher la ligne à une AUTRE fiche du même
    -- cabinet, lors d'une fusion de doublons (app/api/patients/merge). Sans
    -- cette porte, fusionner deux fiches détruirait l'historique dentaire de
    -- la fiche absorbée — le pire des deux mondes. Le contenu de l'événement
    -- (dent, avant, après, auteur, date) reste, lui, strictement intact.
    if new.id            is distinct from old.id
    or new.doctor_id     is distinct from old.doctor_id
    or new.tooth         is distinct from old.tooth
    or new.states_before is distinct from old.states_before
    or new.states_after  is distinct from old.states_after
    or new.note          is distinct from old.note
    or new.actor_role    is distinct from old.actor_role
    or new.actor_user_id is distinct from old.actor_user_id
    or new.actor_email   is distinct from old.actor_email
    or new.created_at    is distinct from old.created_at
    then
      raise exception 'Historique dentaire : une ligne déjà écrite ne peut pas être modifiée (journal append-only).'
        using errcode = '42501';
    end if;
    -- La fiche d'arrivée doit appartenir au même cabinet (le trigger v43 le
    -- vérifie déjà ; on ne s'en remet pas à sa présence pour cette porte-là).
    if not exists (
      select 1 from public.patients p
       where p.id = new.patient_id and p.doctor_id = new.doctor_id
    ) then
      raise exception 'Historique dentaire : rattachement impossible, la fiche cible n''appartient pas à ce cabinet.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE — DROIT À L'EFFACEMENT.
  -- Le journal est inaltérable TANT QUE le dossier existe. Il ne survit pas au
  -- dossier : effacer un patient (ou fermer un cabinet) doit rester possible,
  -- et un historique dentaire orphelin serait une donnée de santé conservée
  -- sans dossier ni titulaire — exactement ce que l'effacement doit supprimer.
  -- On n'autorise donc la suppression que dans ce cas précis : le patient ou le
  -- médecin n'existe DÉJÀ PLUS. C'est vrai pendant la cascade `on delete
  -- cascade` (la ligne parente est supprimée avant que la cascade ne s'exécute)
  -- et faux dans toute suppression directe, qui est donc refusée.
  -- Conséquence assumée : effacer l'historique d'une dent oblige à effacer
  -- toute la fiche patient — un acte visible, tracé, et déjà bloqué par v50
  -- lorsque le patient porte des certificats.
  if exists (select 1 from public.patients p where p.id = old.patient_id)
 and exists (select 1 from public.doctors  d where d.id = old.doctor_id)
  then
    raise exception 'Historique dentaire : une ligne ne peut pas être supprimée (journal append-only). Seule la suppression de la fiche patient l''efface.'
      using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists trg_tooth_history_append_only on public.tooth_history;
create trigger trg_tooth_history_append_only
  before update or delete on public.tooth_history
  for each row execute function public.tooth_history_append_only();

-- TRUNCATE ne déclenche aucun trigger de ligne : il viderait la table sans
-- rencontrer le garde-fou ci-dessus. On le ferme explicitement.
create or replace function public.tooth_history_no_truncate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Historique dentaire : table append-only, TRUNCATE interdit.'
    using errcode = '42501';
end $$;

drop trigger if exists trg_tooth_history_no_truncate on public.tooth_history;
create trigger trg_tooth_history_no_truncate
  before truncate on public.tooth_history
  for each statement execute function public.tooth_history_no_truncate();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. L'odontogramme ne s'écrit plus depuis le navigateur
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Un journal alimenté par une route que l'on peut contourner ne prouve rien :
-- tant que le navigateur garde le droit d'écrire directement dans
-- `dental_charts` (policy `for all` de v20), il suffit d'un appel Supabase
-- direct pour changer l'état d'une dent SANS laisser de trace. On retire donc
-- l'écriture au rôle `authenticated` et on ne lui laisse que la lecture ;
-- l'enregistrement passe désormais par app/api/dental/[id], qui calcule la
-- différence et écrit les deux tables en service_role.
drop policy if exists "dentist manages own dental charts" on public.dental_charts;
drop policy if exists "dentist reads own dental charts"   on public.dental_charts;
create policy "dentist reads own dental charts"
  on public.dental_charts
  for select
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
