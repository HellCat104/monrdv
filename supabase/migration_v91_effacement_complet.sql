-- ============================================================================
-- Migration v91 — L'EFFACEMENT COMPLET : marquer la fiche, libérer le journal
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── LE CONFLIT QU'ELLE TRANCHE ──────────────────────────────────────────────
--
-- Deux bonnes intentions se contredisaient.
--
-- D'un côté, `tooth_history` est un journal APPEND-ONLY (v55) : une ligne
-- écrite ne se modifie ni ne s'efface, parce qu'un historique dentaire qu'on
-- peut réécrire ne vaut rien devant une contestation. Son déclencheur
-- n'autorise la suppression que si la fiche patient n'existe DÉJÀ PLUS —
-- pendant une cascade, donc.
--
-- De l'autre, le droit à l'effacement (loi 09-08) ANONYMISE la fiche sans la
-- détruire : les rendez-vous passés et leur comptabilité appartiennent au
-- cabinet et doivent survivre.
--
-- Résultat : la fiche restait, donc le journal aussi. L'historique dentaire
-- d'une personne effacée était INEFFAÇABLE — exactement ce que le droit
-- interdit, obtenu par un contrôle écrit pour bien faire.
--
-- ── CE QU'ON CHANGE, ET CE QU'ON NE CHANGE PAS ──────────────────────────────
--
-- Le journal reste inaltérable pour toute fiche VIVANTE : aucune route, aucun
-- éditeur SQL, aucun service_role ne peut en retirer une ligne. On ouvre une
-- seule porte, nommée : une fiche explicitement marquée comme effacée.
--
-- Le marqueur est une COLONNE, pas une devinette sur le nom « Supprimé » :
-- comparer des chaînes pour décider d'un droit d'accès est le genre de
-- contrôle qui cède au premier patient qui s'appelle autrement.
-- ============================================================================

-- ── Le marqueur d'effacement ────────────────────────────────────────────────

alter table public.patients
  add column if not exists efface_le timestamptz;

comment on column public.patients.efface_le is
  'Horodatage de l''effacement au titre de la loi 09-08. NULL = fiche vivante. Seule valeur qui autorise la suppression des journaux append-only rattachés.';

-- Retrouver les fiches effacées : utile au contrôle, et peu nombreuses.
create index if not exists idx_patients_efface
  on public.patients(doctor_id, efface_le)
  where efface_le is not null;

-- ── Le journal cède, et à cela seulement ────────────────────────────────────
--
-- Fonction RÉÉCRITE À L'IDENTIQUE, sauf la branche DELETE. Le reste — refus de
-- toute modification de contenu, porte étroite de la fusion de doublons,
-- contrôle d'appartenance au cabinet — est repris mot pour mot : une
-- migration qui réécrit un contrôle de sécurité ne doit rien emporter au
-- passage.
create or replace function public.tooth_history_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Seule mutation admise : rattacher la ligne à une AUTRE fiche du même
    -- cabinet, lors d'une fusion de doublons (app/api/patients/merge).
    if new.id            is distinct from old.id
    or new.doctor_id     is distinct from old.doctor_id
    or new.tooth         is distinct from old.tooth
    or new.states_before is distinct from old.states_before
    or new.states_after  is distinct from old.states_after
    or new.note          is distinct from old.note
    or new.actor_role    is distinct from old.actor_role
    or new.actor_user_id is distinct from old.actor_user_id
    or new.actor_email   is distinct from old.actor_email
    or new.created_at    is distinct from old.created_at
    then
      raise exception 'Historique dentaire : une ligne déjà écrite ne peut pas être modifiée (journal append-only).'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.patients p
       where p.id = new.patient_id and p.doctor_id = new.doctor_id
    ) then
      raise exception 'Historique dentaire : rattachement impossible, la fiche cible n''appartient pas à ce cabinet.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE — DROIT À L'EFFACEMENT.
  --
  -- Le journal ne survit pas au dossier. On refuse donc la suppression tant
  -- que la fiche existe ET N'EST PAS MARQUÉE EFFACÉE. Deux chemins l'ouvrent,
  -- et deux seulement :
  --   • la cascade, quand la fiche est réellement supprimée (la ligne parente
  --     disparaît avant la cascade, le `exists` est donc déjà faux) ;
  --   • l'effacement au titre de la loi 09-08, qui pose `efface_le` sur la
  --     fiche AVANT de purger les journaux rattachés.
  -- Toute autre suppression — une route mal écrite, un `delete` lancé à la
  -- main, un service_role curieux — reste refusée.
  if exists (
        select 1 from public.patients p
         where p.id = old.patient_id and p.efface_le is null
      )
 and exists (select 1 from public.doctors d where d.id = old.doctor_id)
  then
    raise exception 'Historique dentaire : une ligne ne peut pas être supprimée (journal append-only). Seuls la suppression de la fiche ou son effacement au titre de la loi 09-08 l''effacent.'
      using errcode = '42501';
  end if;
  return old;
end $$;

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'patients' and column_name = 'efface_le';

-- ============================================================================
-- Fin de la migration v91
-- ============================================================================
