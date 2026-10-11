-- v66 — Les faces de la dent dans le journal.
--
-- Le schéma lui-même n'a RIEN à migrer : les faces vivent dans la colonne
-- jsonb `dental_charts.teeth`, à côté des états —
--   { "16": { "s": ["carie","obturation"], "f": { "carie": ["O"], "obturation": ["M"] } } }
-- et les lignes écrites avant cette version n'ont simplement pas de `f`.
--
-- Le JOURNAL, lui, a besoin de deux colonnes. Une carie qui passe d'occlusale à
-- occlusale + mésiale ne change aucun état : sans ces colonnes, la trace dirait
-- « rien n'a changé » alors que la dent s'est dégradée. C'est précisément le
-- genre d'évolution qu'un praticien doit pouvoir opposer à un patient.
--
-- Les colonnes sont facultatives côté code : tant que cette migration n'est pas
-- passée, l'insertion est rejouée sans elles (app/api/dental/[id]). Le journal
-- perd la face, jamais la ligne.

alter table tooth_history
  add column if not exists faces_before jsonb,
  add column if not exists faces_after  jsonb;

comment on column tooth_history.faces_before is
  'Faces par état avant le changement : { "carie": ["O","M"] }. NULL pour les lignes antérieures à la v66.';
comment on column tooth_history.faces_after is
  'Faces par état après le changement. NULL pour les lignes antérieures à la v66.';
