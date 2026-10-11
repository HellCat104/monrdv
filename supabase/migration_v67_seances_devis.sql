-- v67 — Le plan de traitement en séances.
--
-- Un devis disait QUOI et COMBIEN, jamais QUAND. Or un plan à 12 000 DH ne se
-- paie pas d'un coup : il se découpe en séances, et la première question du
-- patient est « je paie combien jeudi ? ». Sans découpage, le praticien
-- répondait de tête, et le devis imprimé ne portait pas la réponse.
--
-- DEUX NOTIONS, DEUX COLONNES
--
--   `session_no`     — la séance PRÉVUE : 1, 2, 3… C'est de la planification,
--                      elle existe avant qu'aucun rendez-vous ne soit pris.
--   `appointment_id` — le rendez-vous RÉEL auquel la séance a été rattachée
--                      (colonne déjà créée par la v54, jamais utilisée jusqu'ici).
--
-- Les confondre serait une erreur : on planifie quatre séances le jour du
-- devis, et on ne prend le rendez-vous de la troisième que six semaines plus
-- tard. Une ligne sans `session_no` est un acte non encore planifié — l'état
-- de toutes les lignes existantes, qui n'ont donc rien à reprendre.

alter table quote_items
  add column if not exists session_no smallint;

-- Garde-fou de forme : une séance numérotée 0 ou 300 est une faute de frappe,
-- et vingt séances couvrent large, y compris un traitement orthodontique.
alter table quote_items
  drop constraint if exists quote_items_session_no_valide;
alter table quote_items
  add constraint quote_items_session_no_valide
  check (session_no is null or (session_no >= 1 and session_no <= 20));

create index if not exists idx_quote_items_session on quote_items (quote_id, session_no);

comment on column quote_items.session_no is
  'Séance prévue du plan de traitement (1 à 20). NULL = acte pas encore planifié.';
