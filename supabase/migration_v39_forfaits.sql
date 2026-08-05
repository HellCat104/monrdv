-- v39 — Forfaits : Agenda (149 DH) / Cabinet complet (299 DH)
-- - plan          : forfait actif du médecin ('agenda' | 'complet')
-- - pending_plan  : demande de changement en attente de confirmation admin
-- - price_hidden  : masque les tarifs dans l'espace Abonnement (médecins pilotes)
--
-- Les médecins DÉJÀ inscrits passent sur 'agenda' (défaut) avec prix masqué.
-- Leurs données Cabinet (dossiers, factures…) sont conservées, juste masquées.

alter table doctors add column if not exists plan text not null default 'agenda'
  check (plan in ('agenda','complet'));

alter table doctors add column if not exists pending_plan text
  check (pending_plan in ('agenda','complet'));

alter table doctors add column if not exists price_hidden boolean not null default false;

-- Médecins existants : prix masqué (la question du tarif se règle hors app)
update doctors set price_hidden = true;

-- Les nouveaux inscrits garderont price_hidden = false (défaut de la colonne).

-- ---------------------------------------------------------------------------
-- Verrou : un médecin ne peut PAS s'attribuer un forfait lui-même.
-- La policy `doctors_own` l'autorise à modifier sa fiche : sans ce garde-fou,
-- un simple update depuis le navigateur suffirait à passer en 'complet' sans
-- payer. Seuls le service_role (API admin) et le SQL editor peuvent changer
-- `plan` / `price_hidden`. `pending_plan` reste libre : c'est une demande.
-- ---------------------------------------------------------------------------
create or replace function protect_doctor_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.plan is distinct from old.plan then
      new.plan := old.plan;
    end if;
    if new.price_hidden is distinct from old.price_hidden then
      new.price_hidden := old.price_hidden;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_doctor_plan on doctors;
create trigger trg_protect_doctor_plan
  before update on doctors
  for each row execute function protect_doctor_plan();
