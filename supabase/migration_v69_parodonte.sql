-- v69 — Relevés parodontaux.
--
-- UN RELEVÉ PAR DATE, JAMAIS ÉCRASÉ
--
-- Un relevé isolé ne vaut presque rien. Ce qui soigne, c'est la comparaison :
-- « 16 : 6 mm en mars, 3 mm en octobre » — la preuve que le surfaçage a servi,
-- et l'argument qui fait accepter la suite du traitement. Chaque relevé est
-- donc une LIGNE DATÉE, pas une mise à jour de la précédente. C'est le même
-- choix que pour l'historique dent par dent (v55), et pour la même raison :
-- ce qui s'écrase ne se compare plus.
--
-- DEUX NIVEAUX DE SAISIE, UNE SEULE STRUCTURE
--
-- Les cabinets sont multidisciplinaires : l'omnipraticien note la poche la
-- plus profonde par dent, le parodontiste relève six sites. Les deux écrivent
-- dans la MÊME colonne jsonb, et `mode` dit lequel a été utilisé :
--
--   simple   { "16": { "pdMax": 5, "bop": true, "mob": 1 } }
--   complet  { "16": { "pd": [3,2,5,4,3,2], "rec": [0,0,1,1,0,0],
--                      "bop": [false,false,true,true,false,false], "mob": 1 } }
--
-- Les lectures passent par lib/perio.ts, qui expose la même vue dans les deux
-- cas (poche maximale, saignement, mobilité). Un relevé simple et un relevé
-- complet se comparent donc sans conversion — c'est exactement ce qui arrive
-- quand le patient est vu une fois par l'un, une fois par l'autre.

create table if not exists perio_charts (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references doctors(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,

  charted_at  date not null default current_date,
  mode        text not null default 'simple' check (mode in ('simple','complet')),

  -- Mesures, dent par dent (voir l'en-tête).
  teeth       jsonb not null default '{}'::jsonb,

  -- Indice de plaque global, en pourcentage. Saisi une fois pour la bouche en
  -- mode simple ; calculé à partir des sites en mode complet.
  plaque_index numeric(5,2) check (plaque_index is null or (plaque_index >= 0 and plaque_index <= 100)),

  notes       text,
  created_at  timestamptz not null default now()
);

-- La comparaison lit « les deux derniers relevés de ce patient » : c'est cet
-- index qui la rend immédiate.
create index if not exists idx_perio_patient on perio_charts (patient_id, charted_at desc);

alter table perio_charts enable row level security;

drop policy if exists "Praticien : ses relevés parodontaux" on perio_charts;
create policy "Praticien : ses relevés parodontaux" on perio_charts
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));
