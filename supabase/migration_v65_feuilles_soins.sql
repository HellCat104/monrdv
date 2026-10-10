-- v65 — Feuilles de soins (remboursement : CNSS/AMO, CNOPS, FAR, assurances).
--
-- CE QUE C'EST, ET CE QUE CE N'EST PAS
--
-- Une feuille de soins n'est ni une facture ni un devis : c'est le document
-- que le patient remet à son organisme pour se faire rembourser. Elle décrit
-- des ACTES RÉELLEMENT FAITS, avec leur code de nomenclature et leur montant,
-- et elle ne crée aucune recette — la recette est déjà portée par
-- l'encaissement du rendez-vous ou le versement sur devis. Aucun numéro de la
-- série F-AAAA-NNNN n'est attribué ici : confondre les deux ferait compter la
-- même somme deux fois dans la comptabilité.
--
-- LES CODES NE SONT PAS DANS LE LOGICIEL
--
-- La nomenclature (TNR) évolue et dépend de l'organisme. Y inscrire des codes
-- en dur garantirait des dossiers rejetés le jour d'une mise à jour. Le
-- praticien saisit le code de SES actes une fois ; les feuilles suivantes le
-- proposent automatiquement à partir de ce qu'il a déjà établi.

-- ── L'assuré, qui n'est pas toujours le patient ─────────────────────────────
--
-- Un enfant est soigné sous le numéro de son père ou de sa mère : sans cette
-- colonne, la feuille serait à recopier à la main à chaque visite.
--
-- POURQUOI DU JSON ET PAS DES COLONNES
--
-- Chaque organisme demande autre chose : immatriculation pour la CNSS, numéro
-- d'affiliation et mutuelle de rattachement pour le CNOPS, matricule et unité
-- pour les FAR, numéro de police et compagnie pour un assureur privé. Des
-- colonnes figées obligeraient à une migration à chaque organisme ajouté, et
-- laisseraient le reste à écrire à la main. La liste des champs vit dans
-- lib/organismes.ts ; la base stocke ce que le praticien a saisi.
alter table patients
  add column if not exists insurer_data jsonb not null default '{}'::jsonb;

-- ── La feuille ──────────────────────────────────────────────────────────────
create table if not exists care_sheets (
  id              uuid primary key default gen_random_uuid(),
  doctor_id       uuid not null references doctors(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  -- Le rendez-vous d'origine, quand elle est établie depuis une consultation.
  -- ON DELETE SET NULL : supprimer un rendez-vous ne doit pas effacer le
  -- document remis au patient.
  appointment_id  uuid references appointments(id) on delete set null,
  -- Organisme et identité de l'assuré RECOPIÉS à l'établissement : la fiche
  -- patient peut changer ensuite (mariage, changement d'employeur), le
  -- document remis, lui, ne change plus.
  insurer       text,
  insurer_data  jsonb not null default '{}'::jsonb,
  care_date       date not null default current_date,
  total           numeric(10,2) not null default 0 check (total >= 0),
  status          text not null default 'etablie' check (status in ('etablie','remise','remboursee')),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_care_sheets_patient on care_sheets (patient_id, care_date desc);
create index if not exists idx_care_sheets_doctor  on care_sheets (doctor_id, created_at desc);

alter table care_sheets enable row level security;

drop policy if exists "Praticien : ses feuilles de soins" on care_sheets;
create policy "Praticien : ses feuilles de soins" on care_sheets
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));

-- ── Les actes de la feuille ─────────────────────────────────────────────────
create table if not exists care_sheet_items (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references care_sheets(id) on delete cascade,
  doctor_id   uuid not null references doctors(id) on delete cascade,
  -- Numéro FDI pour les dentistes ; null pour les autres spécialités.
  tooth       text,
  -- Code de nomenclature tel que le praticien l'écrit sur ses feuilles.
  code        text,
  label       text not null,
  amount      numeric(10,2) not null default 0 check (amount >= 0),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_care_sheet_items_sheet on care_sheet_items (sheet_id, position);
-- Sert le catalogue d'actes : « les codes que ce cabinet a déjà utilisés ».
create index if not exists idx_care_sheet_items_doctor on care_sheet_items (doctor_id, created_at desc);

alter table care_sheet_items enable row level security;

drop policy if exists "Praticien : actes de ses feuilles" on care_sheet_items;
create policy "Praticien : actes de ses feuilles" on care_sheet_items
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));
