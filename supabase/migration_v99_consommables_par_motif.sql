-- ============================================================================
-- Migration v99 — CE QU'UN MOTIF CONSOMME, D'HABITUDE
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────
--
-- Le stock (v88) ne descendait que si quelqu'un pensait à le faire descendre :
-- ouvrir l'écran Stock, retrouver l'article, saisir une sortie. Au fauteuil,
-- personne ne le fait — et un stock qui n'est pas tenu annonce « 12 carpules »
-- le jour où il n'y en a plus.
--
-- La clôture d'une consultation demande désormais « Qu'avez-vous utilisé ? ».
-- Pour que la question tienne en un clic, il faut que la réponse soit déjà
-- écrite : un détartrage consomme la même chose d'une fois sur l'autre.
--
-- Cette table est la MÉMOIRE de cette réponse. Pour chaque motif de
-- rendez-vous, elle garde ce que le cabinet a réellement déduit la DERNIÈRE
-- fois — article et quantité. La fois suivante, la liste revient pré-remplie ;
-- le praticien corrige ce qui a changé, et sa correction devient la nouvelle
-- habitude.
--
-- ── CE QU'ELLE N'EST PAS ────────────────────────────────────────────────────
--
-- Ce n'est PAS le journal du stock : les sorties elles-mêmes s'écrivent dans
-- stock_mouvements, par stock_mouvement(), comme toutes les autres. Effacer
-- cette table ne ferait perdre aucun mouvement — seulement le pré-remplissage.
--
-- Ce n'est PAS un protocole livré : aucune ligne n'est créée ici. MonRDV ne
-- sait pas ce que le cabinet range sur ses étagères ; il l'apprend.
--
-- ── LA CLÉ DU MOTIF ─────────────────────────────────────────────────────────
--
-- `motif_cle` est l'identifiant du motif (consultation_types.id) écrit en
-- texte, ou 'sans-motif' pour un rendez-vous pris en « durée standard ». Du
-- texte et non une clé étrangère : un rendez-vous sans motif a lui aussi ses
-- habitudes, et NULL dans une contrainte d'unicité laisse passer les doublons
-- (NULL = NULL est inconnu — la leçon de la v89). Un motif supprimé laisse
-- derrière lui quelques lignes que plus rien ne lit ; elles ne gênent personne.
-- ============================================================================

create table if not exists public.motif_consommables (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  motif_cle  text not null check (length(btrim(motif_cle)) between 1 and 80),
  -- Un article archivé ou supprimé emporte son habitude avec lui.
  article_id uuid not null references public.stock_articles(id) on delete cascade,
  -- numeric comme le stock : une unité peut se compter en demi-boîtes.
  quantite   numeric(12,2) not null check (quantite > 0),
  updated_at timestamptz not null default now(),
  constraint motif_consommables_unique unique (doctor_id, motif_cle, article_id)
);

comment on table public.motif_consommables is
  'Mémoire du pré-remplissage « Qu''avez-vous utilisé ? » à la clôture d''une consultation : pour chaque motif, ce que le cabinet a déduit du stock la dernière fois. Les sorties elles-mêmes vivent dans stock_mouvements.';
comment on column public.motif_consommables.motif_cle is
  'consultation_types.id en texte, ou ''sans-motif'' pour un rendez-vous sans motif.';

create index if not exists idx_motif_consommables_motif
  on public.motif_consommables(doctor_id, motif_cle);

-- Depuis le 30 octobre 2026, une table créée sans GRANT est invisible de
-- l'API : sans ces lignes, le pré-remplissage resterait vide sans rien dire.
grant select, insert, update, delete on public.motif_consommables to service_role, authenticated;

alter table public.motif_consommables enable row level security;

drop policy if exists "Médecin : lire ses habitudes de stock" on public.motif_consommables;
create policy "Médecin : lire ses habitudes de stock" on public.motif_consommables
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : écrire ses habitudes de stock" on public.motif_consommables;
create policy "Médecin : écrire ses habitudes de stock" on public.motif_consommables
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : corriger ses habitudes de stock" on public.motif_consommables;
create policy "Médecin : corriger ses habitudes de stock" on public.motif_consommables
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : oublier ses habitudes de stock" on public.motif_consommables;
create policy "Médecin : oublier ses habitudes de stock" on public.motif_consommables
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select m.motif_cle, a.nom, m.quantite, m.updated_at
--   from public.motif_consommables m
--   join public.stock_articles a on a.id = m.article_id
--  order by m.updated_at desc;
