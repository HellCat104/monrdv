-- ============================================================================
-- Migration v78 — Pas de branche développée, pas de Cabinet complet
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. Ne pas oublier `notify pgrst, 'reload schema';` ensuite.
--
-- ── LA RÈGLE ────────────────────────────────────────────────────────────────
--
-- MonRDV est un TRONC et des BRANCHES. Le tronc — le forfait Agenda — est la
-- relation secrétaire ↔ médecin : agenda, salle d'attente, pointage,
-- encaissement. Il vaut pour toutes les spécialités.
--
-- Le Cabinet complet, lui, n'est rien d'autre que l'INTERFACE DU MÉDECIN,
-- adaptée à sa spécialité. Trois branches sont développées à ce jour :
-- médecine générale, pédiatrie, dentisterie. Une spécialité sans branche n'a
-- donc aucune interface de consultation à proposer — et lui vendre le Cabinet
-- complet reviendrait à lui vendre l'écran d'une autre.
--
-- Concrètement : une psychologue ne doit pas trouver « demande d'examen de
-- laboratoire » dans ses documents, ni un généraliste « consentement
-- extraction dentaire ». Tant que sa branche n'existe pas, son interface
-- s'arrête à la prise de rendez-vous.
--
-- ── POURQUOI EN BASE ────────────────────────────────────────────────────────
--
-- `canAccess(doctor.plan, …)` est appelé depuis QUARANTE-SIX endroits, chacun
-- lisant son propre `doctor`. Poser la règle dans chacun d'eux, c'est la
-- garantie qu'un de ces endroits — ou le prochain écrit — l'oubliera.
--
-- En corrigeant la COLONNE, tous les chemins héritent de la règle sans
-- qu'aucun ne la connaisse : les écrans, les routes serveur, et même un appel
-- direct à l'API. Le forfait affiché est alors toujours le forfait réel.
--
-- Même raison, même endroit que la v63 : c'est déjà la base qui interdit à un
-- médecin de changer son propre forfait.
--
-- ── CE QUE ÇA NE FAIT PAS ───────────────────────────────────────────────────
--
-- Rien n'est supprimé. Un cabinet qui change de spécialité ou dont la branche
-- s'ouvrira plus tard retrouve son forfait en le repassant à « complet » : les
-- dossiers, ordonnances et devis déjà saisis sont toujours là, simplement
-- invisibles tant que le forfait est ramené à Agenda.
--
-- La liste des branches vit à DEUX endroits — ici et dans lib/plan.ts
-- (`brancheDeveloppee`). C'est une duplication assumée : l'une protège la
-- donnée, l'autre explique à l'écran POURQUOI le forfait est bloqué. Les deux
-- doivent être modifiées ensemble le jour où une branche s'ouvre.
-- ============================================================================

create or replace function public.branche_developpee(p_specialty text, p_specialties text[])
returns boolean language sql immutable set search_path = public as $$
  -- « Médecin généraliste » en toutes lettres, et non « général » seul :
  -- « Chirurgien général » contient le mot sans être de cette branche.
  select coalesce(
    array_to_string(coalesce(p_specialties, array[p_specialty]), ' | ')
      ~* '(m[ée]decin g[ée]n[ée]raliste|p[ée]diatr|dent|stomato|orthodont|odonto)',
    false
  );
$$;

comment on function public.branche_developpee(text, text[]) is
  'Cette spécialité a-t-elle une interface médecin développée ? Généraliste, pédiatre, dentiste à ce jour. Doit rester synchronisée avec brancheDeveloppee() dans lib/plan.ts.';

create or replace function public.forfait_selon_branche()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.plan = 'complet' and not public.branche_developpee(new.specialty, new.specialties) then
    new.plan := 'agenda';
  end if;
  return new;
end $$;

-- Le nom commence par « z_ » À DESSEIN. PostgreSQL déclenche les triggers
-- BEFORE dans l'ordre ALPHABÉTIQUE de leur nom, et `trg_protect_doctor_plan`
-- (v63) restaure `OLD.plan` quand c'est un médecin qui écrit. S'il passait
-- après nous, il effacerait notre correction. « z_ » garantit le dernier mot.
drop trigger if exists trg_forfait_selon_branche on public.doctors;
drop trigger if exists z_trg_forfait_selon_branche on public.doctors;
create trigger z_trg_forfait_selon_branche
  before insert or update on public.doctors
  for each row execute function public.forfait_selon_branche();

-- Remise à niveau des comptes existants : un médecin déjà en « complet » sur
-- une spécialité sans branche repasse en Agenda.
update public.doctors
   set plan = 'agenda'
 where plan = 'complet'
   and not public.branche_developpee(specialty, specialties);

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select name, specialty, plan from public.doctors order by plan desc, name;
-- select tgname from pg_trigger where tgname = 'z_trg_forfait_selon_branche';

-- ============================================================================
-- Fin de la migration v78
-- ============================================================================
