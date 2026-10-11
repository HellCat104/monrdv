-- v70 — Traitements orthodontiques.
--
-- CE QUE L'ORTHO A DE DIFFÉRENT
--
-- Un soin se termine dans la séance ; un traitement orthodontique dure deux
-- ans et se mesure en MOIS. Les questions ne sont donc pas les mêmes :
-- « où en est-on sur les 18 mois prévus ? », « quand est la prochaine
-- activation ? », « qu'a-t-on fait le mois dernier ? ». Rien, dans le devis ou
-- le forfait de séances, ne répond à ça : le devis dit le prix, le forfait
-- compte des jetons.
--
-- DEUX TABLES, PARCE QUE CE SONT DEUX DURÉES
--   ortho_treatments — le traitement : ce qui est posé, depuis quand, pour
--                      combien de temps. Une ligne par patient traité.
--   ortho_visits     — la séance : activation, changement d'arc, urgence.
--                      Une ligne par visite, c'est l'historique clinique.
--
-- L'ARGENT RESTE AU DEVIS
-- `quote_id` rattache le traitement au devis qui porte le plan et son
-- échéancier (v54/v67). On ne redéclare pas de montants ici : deux endroits
-- pour la même somme finissent toujours par diverger.

create table if not exists ortho_treatments (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references doctors(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  quote_id    uuid references quotes(id) on delete set null,

  -- Appareil posé : multibagues métal, céramique, aligneurs, amovible…
  -- Texte libre : la liste des techniques bouge plus vite qu'une migration.
  appliance   text,
  -- 'haut', 'bas' ou 'deux' — l'arcade traitée.
  arches      text check (arches is null or arches in ('haut','bas','deux')),

  started_on     date,
  -- Durée ANNONCÉE au patient, en mois. C'est l'engagement, pas une estimation
  -- interne : c'est sur elle que le patient jugera.
  planned_months smallint check (planned_months is null or (planned_months between 1 and 72)),
  ended_on       date,

  status text not null default 'en_cours'
    check (status in ('en_cours','contention','termine','interrompu')),

  diagnosis  text,
  goals      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ortho_patient on ortho_treatments (patient_id, created_at desc);
create index if not exists idx_ortho_doctor  on ortho_treatments (doctor_id, status);

create table if not exists ortho_visits (
  id            uuid primary key default gen_random_uuid(),
  treatment_id  uuid not null references ortho_treatments(id) on delete cascade,
  doctor_id     uuid not null references doctors(id) on delete cascade,
  -- Le rendez-vous d'où vient la séance, quand elle a été saisie depuis
  -- l'agenda. Facultatif : une urgence se note sans rendez-vous.
  appointment_id uuid references appointments(id) on delete set null,

  visit_date  date not null default current_date,
  -- Ce qui a été fait : activation, changement d'arc, collage, décollage,
  -- urgence, contrôle de contention.
  act         text,
  -- Arc ou gouttière posé ce jour-là : c'est la ligne qu'on relit avant la
  -- séance suivante pour savoir par quoi continuer.
  wire        text,
  next_visit  date,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ortho_visits on ortho_visits (treatment_id, visit_date desc);

alter table ortho_treatments enable row level security;
alter table ortho_visits     enable row level security;

drop policy if exists "Praticien : ses traitements ortho" on ortho_treatments;
create policy "Praticien : ses traitements ortho" on ortho_treatments
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Praticien : ses séances ortho" on ortho_visits;
create policy "Praticien : ses séances ortho" on ortho_visits
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));
