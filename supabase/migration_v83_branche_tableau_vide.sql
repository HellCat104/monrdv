-- ============================================================================
-- Migration v83 — `branche_developpee` : le cas du tableau VIDE
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
--
-- Depuis la v78, la fonction s'écrit :
--
--     array_to_string(coalesce(p_specialties, array[p_specialty]), ' | ')
--
-- `coalesce` ne remplace que NULL. Un médecin dont `specialties` vaut `{}` —
-- un tableau vide, pas NULL — ne retombe donc PAS sur `specialty` : la chaîne
-- produite est vide, aucune branche ne correspond, et le déclencheur le fait
-- basculer en forfait Agenda à la première modification de sa fiche.
--
-- Le symptôme est déroutant : le médecin a bien sa spécialité à l'écran (elle
-- vient de `specialty`), il perd pourtant Cabinet complet sans rien avoir
-- demandé, et il le perd au moment où il enregistre tout autre chose — un
-- numéro de téléphone, un horaire d'ouverture.
--
-- ── LE CORRECTIF ────────────────────────────────────────────────────────────
--
-- On teste la longueur du tableau avant de s'en servir. `specialty` reste le
-- filet, comme la v78 l'avait prévu — il ne se dépliait simplement jamais.
--
-- Rien d'autre ne change : mêmes branches, même signature, même
-- `set search_path`, même déclencheur. Les médecins déjà corrects le restent.
-- ============================================================================

create or replace function public.branche_developpee(p_specialty text, p_specialties text[])
returns boolean language sql immutable set search_path = public as $$
  -- « Médecin généraliste » en toutes lettres, et non « général » seul :
  -- « Chirurgien général » contient le mot sans être de cette branche.
  select coalesce(
    array_to_string(
      case
        when p_specialties is not null and array_length(p_specialties, 1) > 0 then p_specialties
        when p_specialty is not null then array[p_specialty]
        else array[]::text[]
      end,
      ' | ')
      ~* '(m[ée]decin g[ée]n[ée]raliste|p[ée]diatr|dent|stomato|orthodont|odonto|gastro)',
    false
  );
$$;

comment on function public.branche_developpee(text, text[]) is
  'Cette spécialité a-t-elle une interface médecin développée ? Généraliste, pédiatre, dentiste, gastro-entérologue à ce jour. Un tableau specialties VIDE retombe sur specialty (corrigé v83). Doit rester synchronisée avec brancheDeveloppee() dans lib/plan.ts.';

notify pgrst, 'reload schema';

-- ── Vérification ────────────────────────────────────────────────────────────
-- Les trois doivent répondre true :
-- select public.branche_developpee('Gastro-entérologue', null);
-- select public.branche_developpee('Gastro-entérologue', '{}');
-- select public.branche_developpee(null, array['Gastro-entérologue']);
-- Et celui-ci false :
-- select public.branche_developpee('Cardiologue', '{}');

-- ============================================================================
-- Fin de la migration v83
-- ============================================================================
