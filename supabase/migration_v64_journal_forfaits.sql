-- v64 — Journal des séances d'un forfait, et un forfait annulé qui le reste.
--
-- POURQUOI UN JOURNAL
-- Jusqu'ici un forfait ne portait qu'un compteur : « 8 / 10 utilisées ». Le
-- jour où le patient dit « j'en ai fait sept, pas huit », personne ne peut
-- répondre : ni la date des séances, ni qui a cliqué. Le compteur reste la
-- vérité d'affichage ; le journal dit comment on y est arrivé.
--
-- Chaque ligne est un mouvement (+1 séance consommée, -1 séance rendue),
-- écrite par la route serveur en même temps que la mise à jour du compteur.

create table if not exists session_package_uses (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references session_packages(id) on delete cascade,
  doctor_id   uuid not null references doctors(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  -- +1 : séance consommée. -1 : séance rendue (erreur de clic, séance annulée).
  delta       smallint not null check (delta in (-1, 1)),
  used_at     timestamptz not null default now(),
  note        text
);

create index if not exists idx_package_uses_package on session_package_uses (package_id, used_at desc);

alter table session_package_uses enable row level security;

drop policy if exists "Praticien : journal de ses forfaits" on session_package_uses;
create policy "Praticien : journal de ses forfaits" on session_package_uses
  for all
  using      (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'))
  with check (doctor_id in (select id from doctors where email = auth.jwt() ->> 'email'));

-- Un forfait annulé le reste.
--
-- Le déclencheur de la v41 recalculait le statut à chaque écriture : annuler
-- un forfait dont toutes les séances étaient consommées le repassait aussitôt
-- en « terminé ». L'annulation est une décision du praticien ; le calcul
-- automatique ne doit pas la défaire.
create or replace function close_full_session_package()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'annule' then
    return new;
  end if;
  if new.used_sessions >= new.total_sessions then
    new.status := 'termine';
  elsif new.status = 'termine' then
    new.status := 'actif';   -- une séance retirée rouvre le forfait
  end if;
  return new;
end $$;
