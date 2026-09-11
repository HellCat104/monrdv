-- ============================================================================
-- Migration v58 — Validité d'un devis (texte libre, devis par devis)
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente.
--
-- ORDRE DE DÉPLOIEMENT : indifférent. Sans cette migration, le devis
-- imprimable (app/devis/[id]) s'affiche sans ligne de validité et un devis se
-- crée normalement ; seule la SAISIE d'une validité est refusée, avec un
-- message qui le dit (« migration v58 à passer ») au lieu d'une erreur
-- anonyme. La migration ne casse pas l'ancien code : elle ajoute une colonne
-- facultative que rien d'autre ne lit.
--
-- ── LA DÉCISION ─────────────────────────────────────────────────────────────
--
-- Décision explicite de la propriétaire :
--   - un TEXTE LIBRE, saisi par le médecin, pour CHAQUE devis ;
--   - aucune liste de durées, aucune date calculée, AUCUNE valeur par défaut :
--     la colonne est NULL tant que le médecin n'a rien écrit ;
--   - le document imprime « Valable » suivi du texte (« 3 mois » → « Valable
--     3 mois ») ; NULL → aucune ligne de validité sur le devis.
-- Le mot « Valable » n'est donc PAS stocké : il appartient au document
-- (lib/devis.ts, ligneValidite), le texte appartient au médecin.
--
-- ── POURQUOI SUR LE DEVIS, ET PAS DANS LES PARAMÈTRES DU MÉDECIN ────────────
--
-- Ce qui est écrit sur le papier remis au patient ne doit jamais changer
-- après coup. Une préférence générale (« mes devis sont valables 3 mois »)
-- réécrirait, le jour où le médecin la modifie, la validité de tous les devis
-- déjà remis : le devis réimprimé ne dirait plus ce que le patient a emporté
-- chez lui. Stockée sur la ligne du devis, la mention ne bouge que si le
-- médecin retouche CE devis.
--
-- ── POURQUOI UNE CONTRAINTE EN BASE ─────────────────────────────────────────
--
-- Les routes /api/quotes nettoient déjà la saisie (lib/devis.ts,
-- normaliserValidite) : espaces normalisés, caractères de contrôle retirés,
-- 120 caractères au plus, chaîne vide → NULL. La contrainte tient les mêmes
-- règles en base, pour qu'une écriture qui ne passerait pas par ces routes
-- (console Supabase, script, route écrite plus tard) ne puisse pas imprimer
-- « Valable » suivi de rien, d'un retour à la ligne ou d'un paragraphe.
--   - char_length entre 1 et 120 : NULL, et jamais '' (une chaîne vide
--     imprimerait « Valable » seul) ; 120 = VALIDITE_MAX dans lib/devis.ts,
--     les deux doivent rester égaux ;
--   - égale à sa version sans espaces aux extrémités ;
--   - sans caractère de contrôle (retour à la ligne, tabulation…) : la
--     mention tient sur une ligne du document.
--
-- ── DROITS ──────────────────────────────────────────────────────────────────
--
-- Aucun changement. La policy « Praticien : ses devis » (v54, FOR ALL) couvre
-- la nouvelle colonne : seul le médecin propriétaire la lit et l'écrit depuis
-- sa session. La secrétaire la LIT à travers /api/cabinet/quotes (client admin,
-- après contrôle du cabinet et de la permission « Afficher les devis ») ; elle
-- ne peut pas l'écrire, cette route n'ayant aucune écriture sur `quotes`.
-- ============================================================================


alter table public.quotes add column if not exists validity_text text;

comment on column public.quotes.validity_text is
  'Validité du devis, texte libre du médecin (ex. « 3 mois »), imprimé après « Valable ». NULL = aucune ligne de validité. Voir migration v58.';

-- Supprimée puis recréée : rend la migration rejouable même si la règle
-- change d'une version à l'autre.
alter table public.quotes drop constraint if exists quotes_validity_text_check;
alter table public.quotes add constraint quotes_validity_text_check check (
  validity_text is null
  or (
    char_length(validity_text) between 1 and 120
    and validity_text = btrim(validity_text)
    and validity_text !~ '[[:cntrl:]]'
  )
);

-- ============================================================================
-- Fin de la migration v58
-- ============================================================================
