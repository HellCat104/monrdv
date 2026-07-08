-- Schéma dentaire (odontogramme) par patient — réservé aux dentistes.
-- Un état par dent (notation FDI 11-48) : carie, plombage, couronne, absente…
-- Une seule ligne par patient (clé primaire = patient_id).

create table if not exists public.dental_charts (
  patient_id  uuid primary key references public.patients(id) on delete cascade,
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  -- ex: { "16": { "s": "carie", "n": "à surveiller" }, "36": { "s": "obturation" } }
  teeth       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists dental_charts_doctor_id_idx on public.dental_charts(doctor_id);

alter table public.dental_charts enable row level security;

-- Le dentiste ne voit et ne modifie que les schémas de SES patients.
drop policy if exists "dentist manages own dental charts" on public.dental_charts;
create policy "dentist manages own dental charts"
  on public.dental_charts
  for all
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));
