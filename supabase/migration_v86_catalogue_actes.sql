-- ============================================================================
-- Migration v86 — Le CATALOGUE D'ACTES : code, catégorie, laboratoire
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── POURQUOI ON N'A PAS CRÉÉ UNE TABLE « actes » ────────────────────────────
--
-- Il existait déjà DEUX sources d'actes dans MonRDV :
--   • `consultation_types` — nom, durée, tarif par défaut, actif/inactif. Elle
--     sert de motif de rendez-vous et porte déjà le prix.
--   • le catalogue APPRIS des lignes de devis (`/api/quotes/actes`), qui
--     regroupe les libellés déjà facturés avec leur prix.
--
-- En ajouter une troisième aurait donné trois endroits où le même acte existe
-- sous trois formes, et trois prix qui divergent. On étend donc la table qui
-- portait déjà le tarif.
--
-- ── LA DISTINCTION QUI MANQUAIT ─────────────────────────────────────────────
--
-- Tous les actes ne sont pas des motifs de rendez-vous. « Composite deux
-- faces » se facture mais ne se prend pas en rendez-vous ; « Contrôle » se
-- prend en rendez-vous et ne se facture pas toujours. Les mélanger polluait la
-- liste des motifs de la page de réservation, qui est publique.
--
-- D'où deux drapeaux, VRAIS par défaut : les lignes existantes gardent
-- exactement le comportement qu'elles avaient.
--
-- ── LES TARIFS ──────────────────────────────────────────────────────────────
--
-- Aucun tarif n'est livré, aucune nomenclature n'est imposée. Les prix d'un
-- cabinet de Rabat ne sont pas ceux d'un cabinet de Taroudant, et la
-- nomenclature marocaine (NGAP/CNOPS) n'est pas reproduite ici : le `code` est
-- un code INTERNE au cabinet, que le praticien remplit s'il en veut un.
-- ============================================================================

alter table public.consultation_types
  add column if not exists code        text,
  add column if not exists categorie   text,
  add column if not exists description text,
  -- Travail de laboratoire associé : une couronne part chez le prothésiste,
  -- un détartrage non. Sert à proposer la création du travail au bon moment.
  add column if not exists labo        boolean not null default false,
  -- Apparaît comme motif de rendez-vous (page publique et agenda).
  add column if not exists rdv         boolean not null default true,
  -- Utilisable comme ligne de devis et de facture.
  add column if not exists acte        boolean not null default true;

comment on column public.consultation_types.code is
  'Code INTERNE au cabinet, libre. Aucune nomenclature officielle n''est imposée ni reproduite.';
comment on column public.consultation_types.labo is
  'Cet acte implique un travail de laboratoire (couronne, bridge, prothèse amovible).';
comment on column public.consultation_types.rdv is
  'Apparaît comme motif de rendez-vous. Faux pour un acte qui se facture sans se réserver.';
comment on column public.consultation_types.acte is
  'Utilisable comme ligne de devis. Faux pour un motif qui ne se facture pas.';

-- Un code ne vaut que s'il est unique DANS le cabinet. Index partiel : la
-- plupart des praticiens n'en mettront pas, et deux actes sans code ne sont
-- pas des doublons.
create unique index if not exists idx_consultation_types_code
  on public.consultation_types(doctor_id, lower(btrim(code)))
  where code is not null and btrim(code) <> '';

-- Retrouver les actes facturables d'un cabinet, rangés par catégorie.
create index if not exists idx_consultation_types_categorie
  on public.consultation_types(doctor_id, categorie)
  where active and acte;

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'consultation_types'
--    and column_name in ('code','categorie','description','labo','rdv','acte');

-- ============================================================================
-- Fin de la migration v86
-- ============================================================================
