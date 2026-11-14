-- ============================================================================
-- Migration v100 — LA SÉANCE DERRIÈRE CHAQUE DENT ET CHAQUE CLICHÉ
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QU'ELLE CORRIGE ──────────────────────────────────────────────────────
--
-- 1. UNE PARTIE DE L'HISTORIQUE DES DENTS ÉTAIT PERDUE.
--    La v55 refuse une ligne d'historique si les états de la dent n'ont pas
--    changé (`tooth_history_modification_reelle`). La v66 a ajouté les faces,
--    mais n'a pas assoupli cette règle : préciser qu'une carie touche aussi la
--    face mésiale produit une ligne aux états identiques, que la base rejette.
--    Les lignes partant par lot, TOUT le journal de cet enregistrement était
--    perdu, et le praticien voyait « l'historique n'a pas pu être écrit ».
--
-- 2. LE PASSAGE « À FAIRE » → « RÉALISÉ » N'ÉTAIT PAS TRACÉ.
--    C'est pourtant le moment qui compte : celui où le soin est fait, par
--    qui, et quand. La nature de chaque état est désormais journalisée.
--
-- ── CE QU'ELLE AJOUTE ───────────────────────────────────────────────────────
--
-- 3. LA SÉANCE. Une ligne d'historique de dent et un cliché savent désormais
--    pendant QUEL rendez-vous ils ont été faits. C'est ce qui permet au dossier
--    de dire, pour une visite passée : « ce jour-là, la 36 est passée de carie
--    à obturation, et voici la rétro-alvéolaire prise ce jour-là ».
--
-- ── CE QU'ELLE NE FAIT PAS ──────────────────────────────────────────────────
--
-- Aucune ligne existante n'est réécrite : les anciennes lignes restent sans
-- séance et sans nature, ce qui est vrai — on ne le savait pas.
--
-- `tooth_history.appointment_id` est un simple identifiant, SANS clé
-- étrangère : le journal est append-only (v55, v91), et une clé « on delete
-- set null » le ferait modifier à chaque suppression de rendez-vous. Il garde
-- donc la référence de la séance même si le rendez-vous disparaît un jour,
-- ce qui est le propre d'un journal.
--
-- La fonction append-only de la v91 n'est PAS redéfinie ici : elle dépend de
-- la v91 (patients.efface_le), qui n'est peut-être pas passée sur cette base.
-- Les nouvelles colonnes sont figées par un déclencheur À PART, qui ne dépend
-- de rien d'autre.
-- ============================================================================

-- ── Historique des dents ────────────────────────────────────────────────────

-- Les colonnes de la v66, au cas où elle n'aurait pas été passée : la
-- contrainte ci-dessous en a besoin.
alter table public.tooth_history
  add column if not exists faces_before   jsonb,
  add column if not exists faces_after    jsonb,
  add column if not exists natures_before jsonb,
  add column if not exists natures_after  jsonb,
  add column if not exists appointment_id uuid;

comment on column public.tooth_history.natures_before is
  'Nature de chaque état avant le changement : { "carie": "planifie" }. Absente = constaté. NULL pour les lignes antérieures à la v100.';
comment on column public.tooth_history.natures_after is
  'Nature de chaque état après le changement. NULL pour les lignes antérieures à la v100.';
comment on column public.tooth_history.appointment_id is
  'Le rendez-vous pendant lequel le changement a été fait. NULL = fait hors séance (depuis le dossier), ou ligne antérieure à la v100. Sans clé étrangère, volontairement : le journal ne se modifie pas.';

-- La règle corrigée : une ligne doit décrire un changement RÉEL — d'état, de
-- face ou de nature.
alter table public.tooth_history drop constraint if exists tooth_history_modification_reelle;
alter table public.tooth_history add constraint tooth_history_modification_reelle check (
     states_before  is distinct from states_after
  or faces_before   is distinct from faces_after
  or natures_before is distinct from natures_after
);

create index if not exists idx_tooth_history_seance
  on public.tooth_history (appointment_id)
  where appointment_id is not null;

-- Les colonnes ajoutées depuis la v55 ne sont pas listées par la fonction
-- append-only : sans ce déclencheur, elles resteraient modifiables.
create or replace function public.tooth_history_colonnes_figees()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.faces_before   is distinct from old.faces_before
  or new.faces_after    is distinct from old.faces_after
  or new.natures_before is distinct from old.natures_before
  or new.natures_after  is distinct from old.natures_after
  or new.appointment_id is distinct from old.appointment_id
  then
    raise exception 'Historique dentaire : une ligne déjà écrite ne peut pas être modifiée (journal append-only).'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_tooth_history_colonnes_figees on public.tooth_history;
create trigger trg_tooth_history_colonnes_figees
  before update on public.tooth_history
  for each row execute function public.tooth_history_colonnes_figees();

-- ── Clichés ─────────────────────────────────────────────────────────────────

-- La séance pendant laquelle le cliché a été pris ou déposé. Ici une vraie
-- clé étrangère : un document n'est pas un journal, et un rendez-vous
-- supprimé ne doit pas emporter la radio — seulement son rattachement.
alter table public.patient_documents
  add column if not exists appointment_id uuid
    references public.appointments(id) on delete set null;

comment on column public.patient_documents.appointment_id is
  'Le rendez-vous pendant lequel le document a été déposé. NULL = déposé depuis le dossier, ou antérieur à la v100.';

create index if not exists idx_patient_documents_seance
  on public.patient_documents (appointment_id)
  where appointment_id is not null;

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name in ('tooth_history', 'patient_documents')
--    and column_name in ('natures_before', 'natures_after', 'appointment_id');
