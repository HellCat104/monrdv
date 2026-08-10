-- v41 — Forfaits de séances (psychologues, kinésithérapeutes, suivis réguliers)
--
-- Un praticien vend un pack (ex. « 10 séances — 3000 DH ») payé d'avance.
-- On suit ce qui est consommé et ce qu'il reste. Le décompte est manuel
-- (bouton « Utiliser une séance ») pour rester maîtrisé par le praticien.

create table if not exists session_packages (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null references doctors(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  label          text,                                   -- ex. « Suivi hebdomadaire »
  total_sessions int  not null check (total_sessions > 0),
  used_sessions  int  not null default 0 check (used_sessions >= 0),
  amount         numeric(10,2),                          -- montant payé pour le pack
  status         text not null default 'actif' check (status in ('actif','termine','annule')),
  created_at     timestamptz not null default now(),
  constraint used_not_over_total check (used_sessions <= total_sessions)
);

create index if not exists idx_session_packages_patient on session_packages (patient_id, created_at desc);
create index if not exists idx_session_packages_doctor  on session_packages (doctor_id, status);

alter table session_packages enable row level security;

-- Le praticien n'accède qu'à ses propres forfaits (même logique que le reste de l'app)
drop policy if exists "Praticien : ses forfaits" on session_packages;
create policy "Praticien : ses forfaits" on session_packages
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));

-- Bascule automatique en « terminé » quand toutes les séances sont consommées
create or replace function close_full_session_package()
returns trigger
language plpgsql
as $$
begin
  if new.used_sessions >= new.total_sessions then
    new.status := 'termine';
  elsif new.status = 'termine' then
    new.status := 'actif';   -- une séance retirée rouvre le forfait
  end if;
  return new;
end $$;

drop trigger if exists trg_close_full_session_package on session_packages;
create trigger trg_close_full_session_package
  before insert or update on session_packages
  for each row execute function close_full_session_package();
