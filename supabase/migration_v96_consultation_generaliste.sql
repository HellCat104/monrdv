-- ════════════════════════════════════════════════════════════════════════════
-- v96 — LA CONSULTATION DU MÉDECIN GÉNÉRALISTE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Des branches développées, le généraliste était la seule sans consultation
-- structurée : il écrivait tout dans une case de texte libre. Ses rubriques
-- réutilisent la table `consultations` (v81), à une près.
--
-- ── CE QUE ÇA AJOUTE, ET POURQUOI UNE SEULE COLONNE ─────────────────────────
--
-- `arret_travail`. Dix des onze rubriques du généraliste existent déjà en
-- base — motif, histoire, antécédents, allergies, mesures, examen clinique,
-- diagnostic, examens demandés, traitement, conduite. L'arrêt de travail,
-- lui, n'a pas d'équivalent : un gastro-entérologue n'en rédige pas tous les
-- jours, un généraliste si. Le ranger dans « conduite à tenir » l'aurait rendu
-- introuvable le jour où la CNSS réclame une durée.
--
-- C'est une colonne TEXTE et non une durée en jours : le praticien y écrit
-- « 3 jours — lombalgie aiguë », et c'est cette phrase qui part sur le
-- certificat. Une colonne `jours integer` aurait obligé à inventer le motif.
--
-- ── SANS CETTE MIGRATION ────────────────────────────────────────────────────
--
-- L'écran marche quand même : la rubrique s'affiche, et l'enregistrement
-- retire la colonne absente puis réessaie (règle de la maison — une
-- fonctionnalité dont la migration n'est pas passée se désactive, elle ne
-- plante pas). Ce qui est écrit dans « Arrêt de travail » n'est alors pas
-- conservé, et l'écran le dit.
--
-- ── À LANCER ────────────────────────────────────────────────────────────────
--
-- Dans l'éditeur SQL de Supabase, en une fois. Idempotent : relançable sans
-- risque.

alter table public.consultations
  add column if not exists arret_travail text;

comment on column public.consultations.arret_travail is
  'Arrêt de travail décidé pendant la consultation : durée et motif, en texte libre (ex. « 3 jours — lombalgie aiguë »). Le certificat lui-même s''établit depuis l''onglet Documents du dossier.';

-- Aucun GRANT à ajouter : `consultations` existe depuis la v81 avec ses droits
-- et ses politiques RLS, et une colonne de plus en hérite. La règle du GRANT
-- obligatoire ne vaut que pour un CREATE TABLE.

-- Obligatoire, et en dernier : sans ça PostgREST continue de servir l'ancien
-- schéma et la nouvelle colonne reste invisible à l'application.
notify pgrst, 'reload schema';
