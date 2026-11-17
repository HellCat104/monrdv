-- ============================================================================
-- Migration v101 — LE REGISTRE DES ACTES DU DENTISTE, et SES TARIFS
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente,
-- additive : aucune table existante n'est modifiée, aucune ligne réécrite.
--
-- ── CE QUI MANQUAIT ─────────────────────────────────────────────────────────
--
-- Un acte dentaire existait sous six formes : une ligne de devis cochée
-- « faite », un état « réalisé » sur le schéma, une ligne de feuille de soins,
-- l'encart « actes du jour »… Aucune ne répondait à la question du praticien :
-- « qu'ai-je fait à ce patient, quand, sur quelles dents, et pour combien ? ».
-- Et pour établir une feuille de soins, il fallait retrouver les actes à la
-- main.
--
-- `actes_patient` est cette liste unique. Chaque acte porte sa date, ses dents,
-- son libellé, sa cotation NGAP quand il en a une, son prix (modifiable), son
-- statut (à faire, en cours, fini, annulé) et, une fois porté sur une feuille
-- de soins, la feuille qui l'a emporté.
--
-- ── LE PLAN DE TRAITEMENT ENTRE DANS LA LISTE ───────────────────────────────
--
-- Une ligne de devis ACCEPTÉ devient un acte « à faire » (lien
-- `quote_item_id`, unique : une ligne de plan = un acte). Les deux restent
-- d'accord dans les deux sens, côté serveur : cocher la ligne du devis finit
-- l'acte, finir l'acte coche la ligne. Supprimer la ligne du plan supprime
-- l'acte qui en venait (cascade).
--
-- ── LES TARIFS ──────────────────────────────────────────────────────────────
--
-- Le catalogue des actes (NGAP, lib/actes-dentaires.ts) vit dans le code.
-- `actes_tarifs` ne garde QUE ce que le cabinet y change : son prix pour un
-- acte, un acte qu'il ne pratique pas (masqué), ou un acte à lui hors
-- nomenclature (implant, blanchiment…). Un cabinet qui ne touche à rien n'a
-- aucune ligne ici.
-- ============================================================================

-- ── 1. LE REGISTRE ─────────────────────────────────────────────────────────

create table if not exists public.actes_patient (
  id              uuid primary key default gen_random_uuid(),
  doctor_id       uuid not null references public.doctors(id)  on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  -- La séance pendant laquelle l'acte a été saisi. Supprimer le rendez-vous
  -- n'efface pas l'acte.
  appointment_id  uuid references public.appointments(id) on delete set null,
  -- La ligne du plan de traitement dont vient l'acte. UNIQUE : la
  -- synchronisation ne peut pas créer deux actes pour une même ligne, même si
  -- deux écrans la lancent en même temps.
  quote_item_id   uuid unique references public.quote_items(id) on delete cascade,
  date_acte       date not null default current_date,
  -- Numéros FDI (« 16 », « 85 »). Vide = acte sans dent (consultation,
  -- détartrage complet, prothèse adjointe…).
  dents           text[] not null default '{}',
  -- Faces traitées (M, O, D, V, P), pour les actes qui en ont.
  faces           text[] not null default '{}',
  libelle         text not null check (length(btrim(libelle)) between 1 and 200),
  -- Cotation NGAP quand l'acte est au catalogue. NULL pour un acte libre.
  code            text check (code is null or length(code) <= 20),
  prix            numeric(10,2) not null default 0 check (prix >= 0 and prix <= 1000000),
  remarque        text check (remarque is null or length(remarque) <= 1000),
  statut          text not null default 'fini'
                  check (statut in ('a_faire','en_cours','fini','annule')),
  -- La feuille de soins qui a emporté l'acte. La supprimer rend l'acte de
  -- nouveau disponible pour une autre feuille.
  care_sheet_id   uuid references public.care_sheets(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint actes_patient_dents_max check (coalesce(array_length(dents, 1), 0) <= 32),
  constraint actes_patient_faces_max check (coalesce(array_length(faces, 1), 0) <= 5)
);

comment on table public.actes_patient is
  'Registre des actes dentaires d''un patient : ce qui est fait, en cours, à faire ou annulé. Les lignes de devis accepté y entrent (quote_item_id). Une feuille de soins se compose en cochant ces actes (care_sheet_id).';

create index if not exists idx_actes_patient_patient
  on public.actes_patient (patient_id, date_acte desc, created_at desc);
create index if not exists idx_actes_patient_doctor
  on public.actes_patient (doctor_id, date_acte desc);

-- Depuis le 30 oct. 2026 : une table neuve n'est joignable qu'avec un GRANT.
-- `authenticated` parce que les routes /api/dentaire/* lisent avec la session
-- du médecin (la RLS ci-dessous filtre les lignes). Jamais `anon`.
grant select, insert, update, delete on public.actes_patient to service_role, authenticated;

alter table public.actes_patient enable row level security;

drop policy if exists "Médecin : lire ses actes" on public.actes_patient;
create policy "Médecin : lire ses actes" on public.actes_patient
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
drop policy if exists "Médecin : créer ses actes" on public.actes_patient;
create policy "Médecin : créer ses actes" on public.actes_patient
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
drop policy if exists "Médecin : modifier ses actes" on public.actes_patient;
create policy "Médecin : modifier ses actes" on public.actes_patient
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
drop policy if exists "Médecin : supprimer ses actes" on public.actes_patient;
create policy "Médecin : supprimer ses actes" on public.actes_patient
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

-- Cohérence cabinet : le patient appartient bien au médecin de la ligne. Même
-- garde-fou que les autres tables cliniques (v43), pas un second qui
-- divergerait.
do $$
begin
  if to_regprocedure('public.assert_patient_belongs_to_doctor()') is not null then
    drop trigger if exists trg_actes_patient_patient_doctor_integrity on public.actes_patient;
    create trigger trg_actes_patient_patient_doctor_integrity
      before insert or update of doctor_id, patient_id on public.actes_patient
      for each row execute function public.assert_patient_belongs_to_doctor();
  end if;
end $$;

-- ── 2. LES TARIFS DU CABINET ───────────────────────────────────────────────

create table if not exists public.actes_tarifs (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  -- La clé de l'acte au catalogue NGAP (lib/actes-dentaires.ts, `cleActe`).
  -- NULL pour un acte propre au cabinet.
  cle         text check (cle is null or length(cle) <= 30),
  libelle     text not null check (length(btrim(libelle)) between 1 and 200),
  -- Le prix du cabinet. NULL = pas de prix fixé (le tarif de référence AMO,
  -- ou le dernier prix pratiqué, est alors proposé).
  prix        numeric(10,2) check (prix is null or (prix >= 0 and prix <= 1000000)),
  -- Faux = l'acte n'est plus proposé dans « Ajouter un acte ».
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.actes_tarifs is
  'Ce que le cabinet change au catalogue des actes : son prix, un acte masqué, ou un acte à lui (cle NULL). Sans ligne, l''acte du catalogue garde ses valeurs par défaut.';

-- Une seule ligne par acte du catalogue et par cabinet.
create unique index if not exists idx_actes_tarifs_cle
  on public.actes_tarifs (doctor_id, cle) where cle is not null;
create index if not exists idx_actes_tarifs_doctor
  on public.actes_tarifs (doctor_id);

grant select, insert, update, delete on public.actes_tarifs to service_role, authenticated;

alter table public.actes_tarifs enable row level security;

drop policy if exists "Médecin : lire ses tarifs" on public.actes_tarifs;
create policy "Médecin : lire ses tarifs" on public.actes_tarifs
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
drop policy if exists "Médecin : créer ses tarifs" on public.actes_tarifs;
create policy "Médecin : créer ses tarifs" on public.actes_tarifs
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
drop policy if exists "Médecin : modifier ses tarifs" on public.actes_tarifs;
create policy "Médecin : modifier ses tarifs" on public.actes_tarifs
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
drop policy if exists "Médecin : supprimer ses tarifs" on public.actes_tarifs;
create policy "Médecin : supprimer ses tarifs" on public.actes_tarifs
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select table_name, privilege_type, grantee from information_schema.table_privileges
--  where table_name in ('actes_patient','actes_tarifs') and grantee in ('authenticated','service_role');

-- ============================================================================
-- Fin de la migration v101
-- ============================================================================
