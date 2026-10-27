-- ============================================================================
-- Migration v85 — La consultation DENTAIRE : les dents et les matériaux
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── POURQUOI SEULEMENT DEUX COLONNES ────────────────────────────────────────
--
-- La table `consultations` (v81) porte déjà tout ce qu'une consultation a de
-- commun : motif, histoire, symptômes, antécédents, allergies, examen,
-- diagnostic, examens demandés, traitement, conduite, recommandations,
-- prochain contrôle, brouillon ou validée. Rien de tout cela n'est à refaire
-- pour un dentiste.
--
-- Il manquait ce qui n'existe qu'au fauteuil :
--
-- `dents` — les dents et secteurs concernés par CETTE séance. Le schéma
-- dentaire dit l'état du patient dans la durée ; la consultation dit ce qu'on
-- a touché ce jour-là. Un tableau et non un texte : on filtrera un jour « les
-- consultations qui ont concerné la 46 », ce qu'une phrase ne permet pas.
--
-- `materiaux` — composite et teinte, type de ciment, alliage d'une couronne,
-- longueur de travail. C'est ce qu'on cherche trois ans plus tard quand une
-- restauration se descelle, et c'est aussi ce que réclame la traçabilité des
-- dispositifs médicaux.
--
-- ── CE QUE CETTE MIGRATION NE FAIT PAS ──────────────────────────────────────
--
-- Elle ne crée aucun lien automatique entre la consultation et les actes
-- facturés. Un acte réalisé se coche sur le devis ou l'odontogramme, par une
-- décision du praticien : déduire « acte réalisé » d'une consultation
-- enregistrée produirait exactement les doubles facturations qu'on cherche à
-- éviter.
-- ============================================================================

alter table public.consultations
  add column if not exists dents text[] not null default '{}';

comment on column public.consultations.dents is
  'Dents et secteurs concernés par cette séance, en notation FDI. Distinct du schéma dentaire, qui porte l''état du patient dans la durée.';

alter table public.consultations
  add column if not exists materiaux text;

comment on column public.consultations.materiaux is
  'Matériaux et informations techniques : composite et teinte, ciment, alliage, longueur de travail. C''est ce qu''on cherche trois ans plus tard quand une restauration se descelle.';

-- Retrouver les séances qui ont concerné une dent précise.
create index if not exists idx_consultations_dents
  on public.consultations using gin (dents);

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'consultations' and column_name in ('dents','materiaux');

-- ============================================================================
-- Fin de la migration v85
-- ============================================================================
