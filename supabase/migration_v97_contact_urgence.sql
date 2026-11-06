-- ════════════════════════════════════════════════════════════════════════════
-- v97 — LE CONTACT D'URGENCE
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── CE QUE ÇA AJOUTE, ET POURQUOI ───────────────────────────────────────────
--
-- Le dossier administratif d'un patient comprend qui prévenir s'il ne peut pas
-- répondre lui-même. MonRDV ne le demandait nulle part : les seuls contacts
-- secondaires de la base sont `parent1_*` et `parent2_*`, qui sont les parents
-- d'un enfant en pédiatrie — les faire servir de contact d'urgence pour un
-- adulte de soixante ans aurait été un détournement, et le libellé « Parent 1 »
-- aurait fini imprimé sur un document.
--
-- Deux colonnes, pas trois :
--
--   `emergency_contact` — le nom ET le lien, en texte libre : « Fatima
--     Berrada, sa fille ». Une colonne `lien` séparée aurait imposé une liste
--     fermée (conjoint, enfant, voisin…) qui ne couvre jamais les cas réels.
--   `emergency_phone`   — le numéro, à part, pour qu'il reste composable.
--
-- ── SANS CETTE MIGRATION ────────────────────────────────────────────────────
--
-- Tout marche. Les deux champs n'apparaissent simplement pas dans la fiche, et
-- la rubrique « Contact et couverture » de la consultation dit que le contact
-- d'urgence n'est pas renseigné (règle de la maison : une fonctionnalité dont
-- la migration n'est pas passée se désactive, elle ne plante pas).
--
-- ── À LANCER ────────────────────────────────────────────────────────────────
--
-- Dans l'éditeur SQL de Supabase, en une fois. Idempotent : relançable sans
-- risque.

alter table public.patients
  add column if not exists emergency_contact text,
  add column if not exists emergency_phone text;

comment on column public.patients.emergency_contact is
  'Contact d''urgence : nom et lien avec le patient, en texte libre (ex. « Fatima Berrada, sa fille »). Information administrative — rien de clinique.';
comment on column public.patients.emergency_phone is
  'Téléphone du contact d''urgence.';

-- Aucun GRANT à ajouter : `patients` existe de longue date avec ses droits et
-- ses politiques RLS, et une colonne de plus en hérite. La règle du GRANT
-- obligatoire ne vaut que pour un CREATE TABLE.

-- Obligatoire, et en dernier : sans ça PostgREST continue de servir l'ancien
-- schéma et les nouvelles colonnes restent invisibles à l'application.
notify pgrst, 'reload schema';
