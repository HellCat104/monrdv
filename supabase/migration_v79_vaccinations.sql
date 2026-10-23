-- ============================================================================
-- Migration v79 — Les vaccins administrés au cabinet (branche GÉNÉRALISTE)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. Ne pas oublier `notify pgrst, 'reload schema';` ensuite.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- Un généraliste vaccine : tétanos après une plaie, grippe à l'automne,
-- hépatite B, rage, fièvre jaune avant un voyage. Le patient repart avec un
-- papier, et le cabinet doit garder la trace — c'est elle qu'on cherche trois
-- ans plus tard pour savoir si le rappel est dû.
--
-- ── POURQUOI PAS `patients.vaccines` ────────────────────────────────────────
--
-- Cette colonne existe (v27) mais elle porte le calendrier national PÉDIATRIQUE
-- sous la forme `{clé du calendrier: date}` : une case cochée, rien d'autre.
-- Un vaccin d'adulte a un libellé libre, un numéro de lot, parfois une dose —
-- et le même patient peut recevoir le même vaccin plusieurs fois, ce qu'une
-- clé unique ne sait pas représenter.
--
-- Y mélanger une seconde forme casserait le calendrier pédiatrique, qui
-- parcourt ces clés. Une table à part n'enlève rien à l'existant et servira
-- aussi la pédiatrie le jour où elle voudra des lots.
--
-- ── CE QUE ÇA N'EST PAS ─────────────────────────────────────────────────────
--
-- Pas un carnet de vaccination officiel, pas une connexion au programme
-- national. C'est la trace de ce que CE cabinet a administré.
--
-- ── DROITS ──────────────────────────────────────────────────────────────────
--
-- Table NOUVELLE : depuis le changement Supabase du 30 octobre 2026, elle
-- n'hérite d'aucun droit. `service_role` pour le serveur, `authenticated` en
-- lecture et écriture parce que l'écran du médecin écrit directement, et RIEN
-- pour `anon` : un acte médical n'a rien à faire sur le site public.
-- ============================================================================

create table if not exists public.vaccinations (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  -- Libellé libre : la liste proposée à l'écran est une aide, pas une
  -- contrainte. Un vaccin du voyageur ne figure dans aucune nomenclature
  -- courte, et refuser de l'enregistrer serait absurde.
  libelle     text not null check (length(btrim(libelle)) between 1 and 120),
  -- Date d'ADMINISTRATION, pas de saisie : on rattrape souvent le lendemain.
  administre_le date not null,
  lot         text check (lot is null or length(lot) <= 60),
  dose        text check (dose is null or length(dose) <= 60),
  -- Date du rappel attendu, à titre indicatif. Le rappel qui REMONTE à
  -- l'écran du médecin reste une ligne de `recalls` : deux mécanismes de
  -- rappel seraient deux endroits à regarder.
  rappel_le   date,
  created_at  timestamptz not null default now()
);

comment on table public.vaccinations is
  'Vaccins administrés au cabinet. Trace du cabinet, pas un carnet officiel. Distinct de patients.vaccines (v27), qui porte le calendrier pédiatrique national.';

create index if not exists idx_vaccinations_patient
  on public.vaccinations(patient_id, administre_le desc);

-- ── Droits ──────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.vaccinations to service_role;
grant select, insert, update, delete on public.vaccinations to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.vaccinations enable row level security;

drop policy if exists "Médecin : lire ses vaccinations" on public.vaccinations;
create policy "Médecin : lire ses vaccinations" on public.vaccinations
  for select
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : enregistrer un vaccin" on public.vaccinations;
create policy "Médecin : enregistrer un vaccin" on public.vaccinations
  for insert
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : corriger un vaccin" on public.vaccinations;
create policy "Médecin : corriger un vaccin" on public.vaccinations
  for update
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
  -- `with check` en plus de `using` : sans lui, un médecin pouvait corriger sa
  -- propre ligne en y inscrivant l'identifiant d'un confrère, et le vaccin
  -- changeait de cabinet. `using` dit ce qu'on peut toucher, `with check` dit
  -- ce que la ligne a le droit de devenir.
  with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : effacer un vaccin" on public.vaccinations;
create policy "Médecin : effacer un vaccin" on public.vaccinations
  for delete
  using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

-- La secrétaire n'y touche pas : un acte médical relève du dossier, qu'elle ne
-- voit que si le médecin lui en donne la permission — et cette permission-là
-- n'existe pas pour les vaccins. Aucune politique pour `cabinet_staff`.

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select tablename from pg_tables where tablename = 'vaccinations';
-- select policyname from pg_policies where tablename = 'vaccinations';

-- ============================================================================
-- Fin de la migration v79
-- ============================================================================
