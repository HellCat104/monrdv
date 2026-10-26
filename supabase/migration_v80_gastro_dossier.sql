-- ============================================================================
-- Migration v80 — Branche GASTRO-ENTÉROLOGIE : le dossier médical (partie A)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. `notify pgrst, 'reload schema';` est à la fin.
--
-- ── CE QUE CETTE MIGRATION OUVRE ────────────────────────────────────────────
--
-- 1. La gastro-entérologie rejoint les branches développées (v78) : un
--    gastro-entérologue a désormais accès au forfait Cabinet complet. Tant que
--    sa branche n'existait pas, le déclencheur de la v78 le ramenait à Agenda
--    à chaque enregistrement — c'était voulu : on ne fait pas payer un écran
--    qui n'existe pas.
--
-- 2. Deux colonnes manquaient au dossier décrit pour cette spécialité :
--    les antécédents FAMILIAUX, et la nature d'un document importé.
--
-- ── POURQUOI LES ANTÉCÉDENTS FAMILIAUX ──────────────────────────────────────
--
-- En gastro-entérologie ils décident de la conduite : un cancer colorectal
-- chez un parent du premier degré avance la première coloscopie de dix ans et
-- change le rythme de surveillance. Les écrire dans « maladies chroniques »
-- revenait à prêter au patient la maladie de son père.
--
-- ── POURQUOI UNE CATÉGORIE DE DOCUMENT ──────────────────────────────────────
--
-- Le dossier accumule des analyses, des imageries, des comptes rendus
-- extérieurs et des résultats d'anatomopathologie. Rangés dans une seule
-- liste de noms de fichiers, ils deviennent introuvables au bout d'un an —
-- et c'est le compte rendu d'anapath qu'on cherche, précisément, trois ans
-- après la polypectomie.
--
-- `autre` par défaut : les documents déjà importés ne sont pas reclassés
-- d'office, on ne devine pas à leur place.
-- ============================================================================

-- ── 1. Antécédents familiaux ────────────────────────────────────────────────

alter table public.patients
  add column if not exists family_history text;

comment on column public.patients.family_history is
  'Antécédents familiaux (texte libre). Distinct de chronic_conditions, qui ne porte que les maladies DU patient.';

-- ── 2. Nature du document importé ───────────────────────────────────────────

alter table public.patient_documents
  add column if not exists categorie text;

alter table public.patient_documents drop constraint if exists patient_documents_categorie_check;
alter table public.patient_documents add constraint patient_documents_categorie_check
  check (categorie is null or categorie in ('biologie', 'imagerie', 'anatomopathologie', 'compte_rendu', 'autre'));

comment on column public.patient_documents.categorie is
  'biologie | imagerie | anatomopathologie | compte_rendu | autre. NULL sur les documents importés avant la v80 : on ne les reclasse pas à la place du praticien.';

create index if not exists idx_patient_documents_categorie
  on public.patient_documents(patient_id, categorie);

-- ── 3. La gastro-entérologie devient une branche développée ─────────────────
--
-- La fonction de la v78 est remplacée : `create or replace` suffit, le
-- déclencheur qui l'appelle continue de pointer dessus sans être retouché.

-- On reprend la fonction de la v78 À L'IDENTIQUE, en ajoutant « gastro » à son
-- expression. `set search_path = public` est conservé : sans lui, la fonction
-- irait chercher ses objets dans le chemin de l'appelant, et c'est exactement
-- le piège qui a rendu un déclencheur de sécurité inopérant par le passé.
-- Le déclencheur qui l'appelle n'a pas à être retouché.

create or replace function public.branche_developpee(p_specialty text, p_specialties text[])
returns boolean language sql immutable set search_path = public as $$
  -- « Médecin généraliste » en toutes lettres, et non « général » seul :
  -- « Chirurgien général » contient le mot sans être de cette branche.
  select coalesce(
    array_to_string(coalesce(p_specialties, array[p_specialty]), ' | ')
      ~* '(m[ée]decin g[ée]n[ée]raliste|p[ée]diatr|dent|stomato|orthodont|odonto|gastro)',
    false
  );
$$;

comment on function public.branche_developpee(text, text[]) is
  'Cette spécialité a-t-elle une interface médecin développée ? Généraliste, pédiatre, dentiste, gastro-entérologue à ce jour. Doit rester synchronisée avec brancheDeveloppee() dans lib/plan.ts.';

-- Rattrapage : un gastro-entérologue déjà inscrit a pu être ramené à « agenda »
-- par le déclencheur de la v78. On ne le repasse PAS en « complet » d'office —
-- ce serait lui offrir un forfait qu'il n'a pas demandé ni payé. Il le demande
-- depuis Abonnement, comme tout le monde ; cette migration lui en rend le
-- droit, pas le forfait.

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select public.branche_developpee('Gastro-entérologue', null);  -- doit être true
-- select public.branche_developpee('Cardiologue', null);          -- doit être false

-- ============================================================================
-- Fin de la migration v80
-- ============================================================================
