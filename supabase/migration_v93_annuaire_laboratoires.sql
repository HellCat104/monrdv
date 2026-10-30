-- ============================================================================
-- Migration v93 — L'ANNUAIRE DES LABORATOIRES
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QUI MANQUAIT, ET CE QUI MENTAIT ──────────────────────────────────────
--
-- Le nom du laboratoire se tapait à la main sur chaque travail. Un carnet de
-- suggestions existait pourtant côté écran, et son commentaire annonçait
-- « ceux que ce cabinet a déjà utilisés » — mais il était construit à partir
-- des travaux DU SEUL PATIENT affiché. Sur une fiche neuve il était donc
-- toujours vide : on retapait le nom de zéro, et « Prothèse Atlas »,
-- « Prothese Atlas » et « Atlas » devenaient trois prothésistes différents,
-- qu'aucun écran ne savait rapprocher.
--
-- ── CE QUE L'ANNUAIRE APPORTE VRAIMENT ──────────────────────────────────────
--
-- Pas seulement une liste déroulante. Le travail de prothèse se suit par
-- TÉLÉPHONE : on appelle pour savoir où en est une couronne. Le numéro du
-- prothésiste doit donc être à un clic du travail en retard, pas dans un
-- carnet posé à côté du fauteuil.
--
-- ── LE NOM RESTE RECOPIÉ SUR LE TRAVAIL ─────────────────────────────────────
--
-- `lab_works.lab_name` est CONSERVÉ tel quel, à côté du nouveau lien. Un
-- laboratoire qui change de nom, ou qu'on retire de l'annuaire, ne doit pas
-- réécrire les bons déjà partis : le travail garde le nom sous lequel il a
-- réellement été envoyé. Même règle que l'organisme recopié sur une feuille
-- de soins (v65).
-- ============================================================================

-- ── L'annuaire ──────────────────────────────────────────────────────────────

create table if not exists public.cabinet_laboratoires (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,

  nom        text not null check (length(btrim(nom)) between 1 and 120),
  -- Ce pour quoi l'annuaire existe : pouvoir appeler.
  telephone  text,
  contact    text,          -- la personne qu'on demande
  email      text,
  adresse    text,
  -- Délai habituel annoncé, en jours. Sert à proposer une date de retour
  -- plutôt que de la faire calculer de tête à chaque envoi. NULL = on ne sait
  -- pas, et on ne propose rien : une date inventée serait pire que rien.
  delai_jours smallint check (delai_jours is null or (delai_jours >= 0 and delai_jours <= 365)),
  notes      text,
  -- Un laboratoire avec qui on ne travaille plus : il sort des listes et les
  -- travaux passés gardent leur trace.
  actif      boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cabinet_laboratoires is
  'Prothésistes du cabinet. lab_works.lab_name reste recopié sur chaque travail : un laboratoire renommé ne réécrit pas les bons déjà partis.';

-- Deux fois le même laboratoire, c'est l'annuaire qui ne sert plus à rien.
create unique index if not exists idx_cabinet_laboratoires_nom
  on public.cabinet_laboratoires(doctor_id, lower(btrim(nom)))
  where actif;

create index if not exists idx_cabinet_laboratoires_cabinet
  on public.cabinet_laboratoires(doctor_id, nom)
  where actif;

-- ── Le lien depuis le travail ───────────────────────────────────────────────
--
-- `on delete set null` : retirer un laboratoire de l'annuaire ne doit pas
-- emporter les travaux qu'il a réalisés. Le nom recopié, lui, reste.
alter table public.lab_works
  add column if not exists laboratoire_id uuid references public.cabinet_laboratoires(id) on delete set null;

create index if not exists idx_lab_works_laboratoire
  on public.lab_works(doctor_id, laboratoire_id)
  where laboratoire_id is not null;

-- ── Reprise de l'existant ───────────────────────────────────────────────────
--
-- L'annuaire ne part pas de rien : on y verse les laboratoires déjà écrits à
-- la main. `distinct on` sur le nom NORMALISÉ — sans quoi « Atlas » et
-- « atlas » entreraient deux fois et l'index unique refuserait l'insertion.
--
-- Les variantes orthographiques déjà présentes en base, elles, restent
-- distinctes : le logiciel ne peut pas deviner que « Prothese Atlas » et
-- « Prothèse Atlas » sont le même prothésiste, et les fusionner d'autorité
-- réécrirait des bons de laboratoire. Elles arrivent donc toutes dans
-- l'annuaire, où le praticien peut en désactiver les doublons lui-même.
insert into public.cabinet_laboratoires (doctor_id, nom)
select distinct on (w.doctor_id, lower(btrim(w.lab_name)))
       w.doctor_id, btrim(w.lab_name)
  from public.lab_works w
 where w.lab_name is not null
   and btrim(w.lab_name) <> ''
 order by w.doctor_id, lower(btrim(w.lab_name)), w.created_at
on conflict do nothing;

-- Et on relie les travaux existants à leur entrée d'annuaire.
update public.lab_works w
   set laboratoire_id = l.id
  from public.cabinet_laboratoires l
 where l.doctor_id = w.doctor_id
   and lower(btrim(l.nom)) = lower(btrim(coalesce(w.lab_name, '')))
   and w.laboratoire_id is null;

-- `updated_at` tenu à jour.
create or replace function public.touche_laboratoire()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touche_laboratoire on public.cabinet_laboratoires;
create trigger trg_touche_laboratoire
  before update on public.cabinet_laboratoires
  for each row execute function public.touche_laboratoire();

-- ── Droits — table nouvelle, rien n'est hérité ──────────────────────────────

grant select, insert, update, delete on public.cabinet_laboratoires to service_role, authenticated;
-- Rien pour `anon` : à qui le cabinet confie ses prothèses ne regarde personne.

-- ── RLS — le cabinet, et lui seul ───────────────────────────────────────────

alter table public.cabinet_laboratoires enable row level security;

drop policy if exists "Médecin : lire ses laboratoires" on public.cabinet_laboratoires;
create policy "Médecin : lire ses laboratoires" on public.cabinet_laboratoires
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : créer un laboratoire" on public.cabinet_laboratoires;
create policy "Médecin : créer un laboratoire" on public.cabinet_laboratoires
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : modifier un laboratoire" on public.cabinet_laboratoires;
create policy "Médecin : modifier un laboratoire" on public.cabinet_laboratoires
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : effacer un laboratoire" on public.cabinet_laboratoires;
create policy "Médecin : effacer un laboratoire" on public.cabinet_laboratoires
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select nom, telephone from public.cabinet_laboratoires order by nom;

-- ============================================================================
-- Fin de la migration v93
-- ============================================================================
