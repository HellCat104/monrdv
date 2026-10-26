-- ============================================================================
-- Migration v81 — Branche GASTRO-ENTÉROLOGIE : consultations, endoscopies,
--                 modèles d'ordonnance, protocoles de préparation, résultats.
--                 (parties B à G du cahier des charges)
--
-- À lancer APRÈS la v80, dans Supabase → SQL Editor → New query → Run.
-- Idempotente. `notify pgrst, 'reload schema';` est à la fin.
--
-- ── PRINCIPES TENUS DANS TOUT CE FICHIER ────────────────────────────────────
--
-- 1. AUCUNE CONSTATATION N'EST INVENTÉE. Toutes les colonnes cliniques sont
--    NULLABLE et vides par défaut. Une section non renseignée ne s'imprime
--    pas : un compte rendu qui annoncerait « œsophage normal » parce que le
--    médecin n'a rien tapé serait un faux, et il serait signé.
--
-- 2. AUCUN DÉLAI CLINIQUE N'EST DÉDUIT. `surveillance_le` est une date saisie
--    par le médecin. Le système ne calcule pas un intervalle à partir d'un
--    diagnostic.
--
-- 3. AUCUNE POSOLOGIE EN DUR. Les modèles d'ordonnance et les protocoles de
--    préparation sont créés par le médecin ; ces tables arrivent VIDES.
--
-- 4. BROUILLON / VALIDÉ. Un document validé est figé : c'est ce qui fait sa
--    valeur d'archive. Le verrou est posé par un déclencheur, pas par l'écran.
--
-- 5. Tables NOUVELLES → GRANTS explicites (règle Supabase du 30/10/2026) et
--    RLS. Rien pour `anon` : aucun acte médical n'a sa place sur le site
--    public.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- B. CONSULTATIONS STRUCTURÉES
-- ════════════════════════════════════════════════════════════════════════════
--
-- `consultation_notes` existe depuis longtemps et reste en place : c'est la
-- note libre, et elle convient à la plupart des spécialités. La consultation
-- de gastro-entérologie a besoin de rubriques séparées — on ne cherche pas
-- « le diagnostic » dans un pavé de texte, et un brouillon doit pouvoir être
-- repris le lendemain.

create table if not exists public.consultations (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null references public.doctors(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  -- Rattachement au rendez-vous : c'est lui qui évite de ressaisir qui, quand,
  -- et pour quel motif. Nullable — une consultation peut naître hors agenda.
  appointment_id uuid references public.appointments(id) on delete set null,
  date_consultation date not null default current_date,

  motif              text,
  histoire           text,
  symptomes          text,   -- symptômes digestifs et leur évolution
  antecedents        text,   -- repris du dossier, puis amendés pour CE jour
  allergies          text,
  mesures            text,   -- poids, IMC, autres mesures utiles
  examen_clinique    text,
  hypotheses         text,
  diagnostic         text,
  examens_demandes   text,
  traitement         text,
  conduite           text,
  recommandations    text,
  -- Date du prochain contrôle, SAISIE par le médecin. Rien ne la déduit.
  prochain_controle  date,

  statut     text not null default 'brouillon' check (statut in ('brouillon', 'validee')),
  validee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.consultations is
  'Consultation structurée (branche gastro-entérologie). Toutes les rubriques cliniques sont facultatives : une rubrique vide ne s''imprime pas, elle n''est jamais remplie par le système.';

create index if not exists idx_consultations_patient
  on public.consultations(patient_id, date_consultation desc);
create index if not exists idx_consultations_medecin
  on public.consultations(doctor_id, date_consultation desc);


-- ════════════════════════════════════════════════════════════════════════════
-- C. COMPTES RENDUS D'ENDOSCOPIE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Une seule table pour la gastroscopie et la coloscopie : ce sont deux
-- formulaires à l'écran, mais le même objet — un acte, une date, des
-- observations par région, une conclusion, un suivi. Deux tables auraient
-- doublé les politiques de sécurité et les requêtes de la chronologie.
--
-- Les observations par région vivent dans un `jsonb` et NON dans des colonnes
-- figées : les régions explorées diffèrent d'un examen à l'autre, et une
-- colonne `oesophage` vide ne se distingue pas d'un œsophage non exploré.
-- Ce qui n'est pas dans le jsonb n'a pas été examiné, et ne s'imprime pas.

create table if not exists public.endoscopies (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null references public.doctors(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,

  type_examen  text not null check (type_examen in ('gastroscopie', 'coloscopie')),
  date_examen  date not null default current_date,

  indication   text,
  conditions   text,   -- anesthésie, matériel, opérateur, incidents
  -- Coloscopie : préparation et sa qualité, étendue atteinte, visualisation.
  -- Laissés NULL pour une gastroscopie ; l'écran ne les propose même pas.
  preparation        text,
  qualite_preparation text,
  etendue            text,
  qualite_visualisation text,

  -- { "oesophage": "…", "estomac": "…", "duodenum": "…" } ou
  -- { "rectum": "…", "sigmoide": "…", … }. Seules les clés présentes ont été
  -- explorées : l'absence n'est pas une normalité.
  observations jsonb not null default '{}'::jsonb,
  lesions      text,
  -- [{ "localisation": "…", "taille_mm": 8, "morphologie": "…", "geste": "…" }]
  polypes      jsonb not null default '[]'::jsonb,
  prelevements text,   -- biopsies et autres prélèvements

  conclusion      text,
  recommandations text,
  -- Date de surveillance PROPOSÉE PAR LE MÉDECIN. Aucun intervalle n'est
  -- déduit d'un diagnostic : c'est une décision clinique, pas un calcul.
  surveillance_le date,

  statut     text not null default 'brouillon' check (statut in ('brouillon', 'valide')),
  valide_le  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.endoscopies is
  'Comptes rendus de gastroscopie et de coloscopie. `observations` ne contient que les régions RÉELLEMENT explorées : une clé absente ne vaut pas constatation normale.';

create index if not exists idx_endoscopies_patient
  on public.endoscopies(patient_id, date_examen desc);
create index if not exists idx_endoscopies_medecin
  on public.endoscopies(doctor_id, date_examen desc);


-- ════════════════════════════════════════════════════════════════════════════
-- D. PROTOCOLES DE PRÉPARATION COLIQUE
-- ════════════════════════════════════════════════════════════════════════════
--
-- La table arrive VIDE. Aucun protocole universel n'est livré : les produits,
-- les volumes et les horaires relèvent du praticien, et imposer un protocole
-- reviendrait à prescrire à sa place.
--
-- Rien ici ne recommande l'arrêt d'un traitement. `consignes_medicaments` est
-- un champ libre que le médecin écrit — le modèle ne contient pas de phrase
-- toute faite sur les anticoagulants.

create table if not exists public.preparation_protocols (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  nom        text not null check (length(btrim(nom)) between 1 and 120),
  produit    text,
  regime     text,
  modalites  text,
  -- [{ "quand": "La veille à 19 h", "quoi": "…" }] — relatif à l'heure de
  -- l'examen, que l'écran décale au moment d'imprimer.
  horaires   jsonb not null default '[]'::jsonb,
  consignes_medicaments text,
  consignes_pratiques   text,
  archive_le timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_preparation_protocols_medecin
  on public.preparation_protocols(doctor_id) where archive_le is null;


-- ════════════════════════════════════════════════════════════════════════════
-- E. MODÈLES D'ORDONNANCE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Également VIDE au départ, et pour la même raison : aucune posologie n'est
-- écrite en dur. Les catégories sont libres (IPP, éradication H. pylori,
-- préparation…), le médecin range comme il veut.

create table if not exists public.prescription_templates (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  nom        text not null check (length(btrim(nom)) between 1 and 120),
  categorie  text,
  -- [{ "medicament": "…", "dosage": "…", "voie": "…", "frequence": "…", "duree": "…" }]
  lignes     jsonb not null default '[]'::jsonb,
  -- Examens biologiques et autres demandes jointes au même modèle.
  examens    text,
  notes      text,
  archive_le timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_prescription_templates_medecin
  on public.prescription_templates(doctor_id, categorie) where archive_le is null;


-- ════════════════════════════════════════════════════════════════════════════
-- G. RÉSULTATS ET ANATOMOPATHOLOGIE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un résultat existe AVANT son document : on prélève, puis on attend. C'est
-- justement l'attente qu'on perd de vue — la biopsie dont l'anapath n'est
-- jamais revenue. D'où une ligne créée au moment du prélèvement, sans fichier,
-- et un fichier rattaché plus tard.
--
-- Aucun diagnostic n'est déduit d'un document importé : `conclusion_medecin`
-- est écrite par le médecin, et `statut` avance par ses clics.

create table if not exists public.resultats (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  -- D'où vient l'attente : l'examen ou la consultation qui l'a motivée.
  endoscopie_id   uuid references public.endoscopies(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,
  -- Le document reçu, quand il arrive.
  document_id uuid references public.patient_documents(id) on delete set null,

  type_resultat text not null default 'autre'
    check (type_resultat in ('biologie', 'anatomopathologie', 'imagerie', 'autre')),
  libelle     text not null check (length(btrim(libelle)) between 1 and 200),
  statut      text not null default 'attendu'
    check (statut in ('attendu', 'recu', 'examine', 'suivi_requis')),
  attendu_le  date,
  recu_le     date,
  examine_le  timestamptz,
  conclusion_medecin text,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table public.resultats is
  'Résultats attendus puis reçus (biologie, anatomopathologie, imagerie). Le statut avance par les clics du médecin ; rien n''est déduit du contenu d''un document importé.';

create index if not exists idx_resultats_a_traiter
  on public.resultats(doctor_id, statut, attendu_le)
  where statut in ('attendu', 'recu', 'suivi_requis');
create index if not exists idx_resultats_patient
  on public.resultats(patient_id, created_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- F. SUIVIS — on ÉTEND `recalls`, on n'en crée pas un second
-- ════════════════════════════════════════════════════════════════════════════
--
-- Le mécanisme de rappel existe (v7, v71) : échéance, motif, statut, envoi par
-- le cron, écran « à rappeler ». Créer une table parallèle aurait donné deux
-- endroits où regarder, et un patient relancé deux fois.
--
-- Il manquait trois choses : d'où vient le suivi, une note, et deux statuts.

alter table public.recalls add column if not exists source_type text;
alter table public.recalls add column if not exists source_id uuid;
alter table public.recalls add column if not exists notes text;

alter table public.recalls drop constraint if exists recalls_source_type_check;
alter table public.recalls add constraint recalls_source_type_check
  check (source_type is null or source_type in ('consultation', 'endoscopie', 'resultat'));

-- « programme » : un rendez-vous a été pris. « reporte » : décalé en connaissance
-- de cause. « en retard » ne se stocke pas — c'est une date dépassée, le calculer
-- évite un statut qui ment dès que personne ne le met à jour.
alter table public.recalls drop constraint if exists recalls_status_check;
alter table public.recalls add constraint recalls_status_check check (
  status in ('pending', 'a_rappeler', 'programme', 'reporte', 'sent', 'done', 'cancelled')
) not valid;

comment on column public.recalls.source_type is
  'consultation | endoscopie | resultat — l''acte qui a motivé ce suivi. NULL pour les rappels créés à la main.';


-- ════════════════════════════════════════════════════════════════════════════
-- VERROU DES DOCUMENTS VALIDÉS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un compte rendu validé est une pièce du dossier : il peut être relu, jamais
-- réécrit. Le verrou est en BASE et pas à l'écran — masquer un bouton
-- n'empêche pas d'appeler l'API.
--
-- Le seul champ qui reste modifiable après validation est le rattachement
-- (`appointment_id`, `consultation_id`) : relier après coup un compte rendu à
-- sa consultation ne change pas ce qui a été constaté.

create or replace function public.fige_document_valide()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.statut in ('validee', 'valide') then
    -- On autorise la seule transition qui a du sens : rien.
    if new.statut is distinct from old.statut then
      raise exception 'Un document validé ne peut pas changer de statut (%).', old.id
        using errcode = 'P0001';
    end if;
    -- Toute modification de fond est refusée. On compare l'ancienne et la
    -- nouvelle ligne en ignorant les seules colonnes de rattachement.
    if to_jsonb(new) - 'appointment_id' - 'consultation_id' - 'updated_at'
       is distinct from
       to_jsonb(old) - 'appointment_id' - 'consultation_id' - 'updated_at' then
      raise exception 'Ce document est validé : son contenu ne peut plus être modifié (%).', old.id
        using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_fige_consultation on public.consultations;
create trigger trg_fige_consultation
  before update on public.consultations
  for each row execute function public.fige_document_valide();

drop trigger if exists trg_fige_endoscopie on public.endoscopies;
create trigger trg_fige_endoscopie
  before update on public.endoscopies
  for each row execute function public.fige_document_valide();


-- ════════════════════════════════════════════════════════════════════════════
-- DROITS — tables nouvelles, donc rien n'est hérité
-- ════════════════════════════════════════════════════════════════════════════

grant select, insert, update, delete on public.consultations          to service_role, authenticated;
grant select, insert, update, delete on public.endoscopies            to service_role, authenticated;
grant select, insert, update, delete on public.preparation_protocols  to service_role, authenticated;
grant select, insert, update, delete on public.prescription_templates to service_role, authenticated;
grant select, insert, update, delete on public.resultats              to service_role, authenticated;
-- Rien pour `anon` : volontaire, et c'est la ligne la plus importante du bloc.


-- ════════════════════════════════════════════════════════════════════════════
-- RLS — le cabinet, et rien d'autre
-- ════════════════════════════════════════════════════════════════════════════
--
-- Le médecin seul. La secrétaire n'a AUCUNE politique sur ces cinq tables :
-- une consultation, un compte rendu d'endoscopie et une anapath sont des
-- données de santé, et aucune permission du cabinet ne les lui ouvre
-- aujourd'hui. Les suivis, eux, passent par `recalls`, dont elle a déjà
-- l'accès selon ses permissions — c'est elle qui rappelle les patients.

do $$
declare t text;
begin
  foreach t in array array['consultations', 'endoscopies', 'preparation_protocols',
                           'prescription_templates', 'resultats']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Médecin : lire" on public.%I', t);
    execute format(
      'create policy "Médecin : lire" on public.%I for select
         using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> ''email''))', t);
    execute format('drop policy if exists "Médecin : créer" on public.%I', t);
    execute format(
      'create policy "Médecin : créer" on public.%I for insert
         with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> ''email''))', t);
    execute format('drop policy if exists "Médecin : modifier" on public.%I', t);
    execute format(
      'create policy "Médecin : modifier" on public.%I for update
         using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> ''email''))
         with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> ''email''))', t);
    execute format('drop policy if exists "Médecin : effacer" on public.%I', t);
    execute format(
      'create policy "Médecin : effacer" on public.%I for delete
         using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> ''email''))', t);
  end loop;
end $$;


notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select tablename from pg_tables
--  where tablename in ('consultations','endoscopies','preparation_protocols',
--                      'prescription_templates','resultats');
-- select tablename, count(*) from pg_policies
--  where tablename in ('consultations','endoscopies','preparation_protocols',
--                      'prescription_templates','resultats') group by 1;

-- ============================================================================
-- Fin de la migration v81
-- ============================================================================
