-- ============================================================================
-- Migration v94 — L'IMAGERIE RATTACHÉE À LA DENT
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QU'ÉTAIT UNE RADIO JUSQU'ICI ─────────────────────────────────────────
--
-- Un fichier dans un tas. `patient_documents` porte un nom, un type MIME, une
-- taille et une date d'ENVOI. Rien d'autre. Une rétro-alvéolaire de la 46
-- déposée en mars se retrouvait entre une attestation de mutuelle et une photo
-- de carte d'identité, et trois ans plus tard personne ne savait plus de quelle
-- dent elle parlait.
--
-- Trois colonnes suffisent à la rendre clinique : LA DENT, LE TYPE, et LA DATE
-- DE L'EXAMEN.
--
-- ── POURQUOI PAS UNE TABLE « IMAGERIE » À PART ──────────────────────────────
--
-- Parce que quatre mécanismes travaillent DÉJÀ sur `patient_documents` :
--   • le quota de stockage du cabinet (trigger de la v63),
--   • la purge du dossier à l'effacement loi 09-08,
--   • l'export des données du patient (droit d'accès),
--   • le dépôt `patient-documents` et ses politiques.
-- Une seconde table obligerait à refaire les quatre — et à en oublier un. La
-- liste de colonnes périmée du droit d'accès, corrigée il y a deux jours,
-- montre exactement comment cet oubli se produit.
--
-- ── LA DATE D'EXAMEN N'EST PAS LA DATE D'ENVOI ──────────────────────────────
--
-- Une radio prise lundi au fauteuil peut être importée jeudi. C'est le jour de
-- l'EXAMEN qui fait la chronologie clinique : « la lésion a-t-elle bougé depuis
-- mars ? » se lit sur les dates de prise de vue, pas sur celles d'import.
-- NULL = inconnue ; l'écran se rabat alors sur la date d'envoi et le dit.
--
-- ── CE QU'ON NE FAIT PAS ────────────────────────────────────────────────────
--
-- Aucune capture. Un navigateur ne parle pas à un capteur intra-oral : le
-- pilote est un composant Windows, et MonRDV est une application web. Ces
-- colonnes servent l'image DÉJÀ produite par le logiciel du capteur, pour
-- qu'elle cesse de vivre dans un dossier que personne ne retrouve.
--
-- Et aucune compression : une image de diagnostic ne se redimensionne pas.
-- ============================================================================

alter table public.patient_documents
  -- Les dents concernées, en notation FDI. Vide = l'image ne vise pas une dent
  -- en particulier : une panoramique les couvre toutes, et en lister
  -- trente-deux ne serait que du bruit.
  add column if not exists dents       text[] not null default '{}',
  -- Nature de l'image. Texte libre contrôlé côté application (lib/imagerie.ts)
  -- plutôt qu'un check en base : la liste des examens s'allonge avec les
  -- habitudes du cabinet, et une contrainte figée obligerait à une migration
  -- pour ajouter « occlusale ».
  add column if not exists type_image  text,
  -- Le jour de la PRISE DE VUE. Voir l'en-tête : ce n'est pas la date d'envoi.
  add column if not exists date_examen date;

comment on column public.patient_documents.dents is
  'Dents concernées, notation FDI. Vide = image non ciblée (panoramique, photo de face).';
comment on column public.patient_documents.type_image is
  'Nature de l''examen : retro, bitewing, panoramique, teleradio, photo… Liste tenue dans lib/imagerie.ts, pas en base.';
comment on column public.patient_documents.date_examen is
  'Jour de la prise de vue, qui n''est pas le jour de l''import. NULL = inconnu, l''écran se rabat sur created_at et l''annonce.';

-- « Toutes les images de la 46 » : c'est la question qu'on pose devant une
-- dent, et elle doit être instantanée.
create index if not exists idx_patient_documents_dents
  on public.patient_documents using gin (dents);

-- La chronologie clinique d'un patient, par date d'examen.
create index if not exists idx_patient_documents_examen
  on public.patient_documents(patient_id, date_examen desc nulls last)
  where type_image is not null;

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'patient_documents'
--    and column_name in ('dents','type_image','date_examen');

-- ============================================================================
-- Fin de la migration v94
-- ============================================================================
