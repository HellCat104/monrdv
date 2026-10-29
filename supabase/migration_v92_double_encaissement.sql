-- ============================================================================
-- Migration v92 — LA DOUBLE SOUMISSION D'UN VERSEMENT
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QUI SE PASSAIT ───────────────────────────────────────────────────────
--
-- Deux requêtes d'encaissement identiques lancées ensemble étaient toutes les
-- deux acceptées. Mesuré sur la base : deux versements de 300 DH au lieu d'un,
-- et surtout DEUX NUMÉROS DE FACTURE LÉGAUX consommés pour le même argent.
--
-- Un double clic sur « Encaisser », un réseau lent où la secrétaire reclique,
-- un onglet resté ouvert : le chiffre d'affaires du cabinet gonfle d'un
-- paiement qui n'a jamais eu lieu, et la série F-AAAA-NNNN porte deux pièces
-- pour une seule somme. Un bouton grisé côté écran ne protège de rien de tout
-- cela — il ne vaut que pour le clic, et pas pour le second onglet.
--
-- ── LA PARADE ───────────────────────────────────────────────────────────────
--
-- Une CLÉ DE SAISIE, tirée par l'écran au moment où le formulaire s'arme, et
-- envoyée avec le versement. Deux envois du même geste portent la même clé ;
-- deux encaissements réellement distincts en portent deux différentes. La base
-- refuse le second par un index unique, et l'application renvoie alors le
-- versement DÉJÀ enregistré — l'utilisateur voit un succès, parce que c'en est
-- un : son argent est bien saisi, une seule fois.
--
-- Ce n'est pas une fenêtre de temps : deux versements du même montant à dix
-- secondes d'intervalle sont parfaitement légitimes, et une heuristique sur la
-- durée aurait fini par refuser un vrai paiement. La clé, elle, ne se trompe
-- jamais : elle dit si c'est LE MÊME GESTE, pas si c'est le même montant.
--
-- NULL reste permis : les versements déjà enregistrés n'en ont pas, et l'index
-- partiel les ignore.
-- ============================================================================

alter table public.quote_payments
  add column if not exists cle_saisie text;

comment on column public.quote_payments.cle_saisie is
  'Clé du GESTE de saisie, tirée par l''écran. Deux envois du même clic la partagent ; l''index unique rejette alors le doublon. NULL = versement antérieur à la v92.';

-- Un même geste ne s'encaisse qu'une fois, sur un même devis.
create unique index if not exists idx_quote_payments_cle_saisie
  on public.quote_payments(quote_id, cle_saisie)
  where cle_saisie is not null;

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select indexname from pg_indexes where tablename = 'quote_payments';

-- ============================================================================
-- Fin de la migration v92
-- ============================================================================
