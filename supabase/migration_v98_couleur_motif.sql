-- ============================================================================
-- Migration v98 — LA COULEUR D'UN MOTIF DE CONSULTATION
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────
--
-- Un agenda de dentiste n'est pas une suite de rendez-vous interchangeables.
-- Un détartrage de vingt minutes et une pose de couronne d'une heure ne se
-- préparent pas pareil : il faut sortir un bon de laboratoire pour l'une, pas
-- pour l'autre. L'assistante qui ouvre l'écran à 8 h veut savoir de quoi sa
-- journée est faite AVANT d'en lire les libellés un par un.
--
-- Une couleur par motif répond à cette question d'un coup d'œil. Elle se pose
-- là où le motif vit déjà — on n'ajoute pas une table pour un mot.
--
-- ── CE QU'ON NE FAIT PAS ────────────────────────────────────────────────────
--
-- Aucune couleur n'est attribuée aux motifs existants. Un cabinet qui n'a
-- rien choisi garde l'agenda qu'il connaît : la couleur se décide, elle ne
-- s'impose pas. Et aucune palette n'est stockée en base — la colonne ne porte
-- qu'une CLÉ ('ciel', 'menthe'…), dont les teintes vivent dans
-- lib/motifs-couleurs.ts. Mettre des codes hexadécimaux en base aurait figé
-- l'apparence de l'agenda dans les données du cabinet.
-- ============================================================================

alter table public.consultation_types
  add column if not exists couleur text;

comment on column public.consultation_types.couleur is
  'Clé de couleur du motif dans l''agenda (ciel, menthe, violet, rose, turquoise, indigo, citron, ardoise). NULL = pas de couleur, le rendez-vous garde l''apparence par défaut. Les teintes vivent dans lib/motifs-couleurs.ts, pas ici.';

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select name, couleur from public.consultation_types order by created_at;
