-- ============================================================================
-- Migration v82 — Branche GASTRO : la fiche de pathologie suivie
-- À lancer après la v81. Idempotente. `notify pgrst` à la fin.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- Un Crohn ou une cirrhose se suit dix ans. La chronologie LISTE ce qui s'est
-- passé ; elle ne RÉSUME pas. Le praticien qui rouvre le dossier après six
-- mois doit relire quinze lignes pour reconstituer trois faits : depuis quand,
-- sous quoi, où en est-on.
--
-- `patients.conditions` (v72) porte déjà des étiquettes — « Crohn », « cirrhose ». Elles servent aux cohortes : retrouver tous les Crohn du
-- cabinet. Elles ne portent ni date de diagnostic, ni traitement, ni
-- évolution, et les y mettre les rendrait inutilisables comme étiquettes.
--
-- ── CE QUI EST ÉCRIT PAR LE MÉDECIN, ET CE QUI EST COMPTÉ ───────────────────
--
-- Toutes les colonnes de cette table sont SAISIES. Le logiciel n'en déduit
-- aucune : il ne décide pas qu'une maladie est en rémission.
--
-- Ce que l'écran y ajoute est du COMPTAGE, pas de la clinique : combien de
-- consultations depuis le diagnostic, date de la dernière endoscopie,
-- prochain suivi programmé. Des faits vérifiables, pas une appréciation.
-- ============================================================================

create table if not exists public.patient_pathologies (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,

  libelle    text not null check (length(btrim(libelle)) between 1 and 120),
  -- Date du diagnostic. Souvent antérieure au dossier MonRDV : un patient
  -- suivi depuis 2019 arrive avec son histoire, et la saisir est le seul
  -- moyen de ne pas faire commencer sa maladie le jour de son premier RDV.
  date_diagnostic date,
  -- Évolution telle que LE MÉDECIN la qualifie. Rien ne la calcule.
  statut text not null default 'active'
    check (statut in ('active', 'poussee', 'remission', 'guerie', 'surveillance')),
  traitement_actuel text,
  -- Les poussées, les changements de traitement, les complications : le fil
  -- que le praticien tient lui-même, en quelques lignes datées.
  evolution text,
  notes     text,
  derniere_evaluation date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patient_pathologies is
  'Fiche de synthèse d''une pathologie suivie au long cours (branche gastro). Toutes les colonnes sont saisies par le médecin : le logiciel ne qualifie jamais une évolution.';

create index if not exists idx_patient_pathologies_patient
  on public.patient_pathologies(patient_id, created_at desc);

-- `updated_at` tenu à jour : sur une fiche qu'on relit six mois plus tard, la
-- question « est-ce encore à jour ? » se pose à chaque ouverture.
create or replace function public.touche_pathologie()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touche_pathologie on public.patient_pathologies;
create trigger trg_touche_pathologie
  before update on public.patient_pathologies
  for each row execute function public.touche_pathologie();

-- ── Droits — table nouvelle, rien n'est hérité ──────────────────────────────

grant select, insert, update, delete on public.patient_pathologies to service_role, authenticated;
-- Rien pour `anon`.

-- ── RLS — le médecin seul ───────────────────────────────────────────────────
-- Une pathologie nommée est une donnée de santé au sens le plus strict :
-- « cirrhose » sur un écran d'accueil, c'est le diagnostic lisible par qui
-- passe devant le comptoir. Aucune politique pour la secrétaire.

alter table public.patient_pathologies enable row level security;

drop policy if exists "Médecin : lire ses pathologies" on public.patient_pathologies;
create policy "Médecin : lire ses pathologies" on public.patient_pathologies
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : créer une pathologie" on public.patient_pathologies;
create policy "Médecin : créer une pathologie" on public.patient_pathologies
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : modifier une pathologie" on public.patient_pathologies;
create policy "Médecin : modifier une pathologie" on public.patient_pathologies
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : effacer une pathologie" on public.patient_pathologies;
create policy "Médecin : effacer une pathologie" on public.patient_pathologies
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

notify pgrst, 'reload schema';

-- ============================================================================
-- Fin de la migration v82
-- ============================================================================
