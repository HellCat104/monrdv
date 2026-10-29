-- ============================================================================
-- Migration v90 — LE SUIVI DU REMBOURSEMENT : dates et montant remboursé
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QUE « REMBOURSÉE » NE DISAIT PAS ─────────────────────────────────────
--
-- La v65 a donné trois états à une feuille de soins : établie, remise au
-- patient, remboursée. Trois mots, et aucune DATE ni aucun MONTANT.
--
-- Or la seule question qu'on se pose devant une feuille est « depuis quand
-- attend-elle ? ». Un dossier déposé il y a huit semaines sans retour est un
-- dossier à relancer ; le même déposé avant-hier ne regarde personne. Sans
-- date, les deux se ressemblaient.
--
-- Et « remboursée » sans montant n'apprend rien non plus : les organismes
-- marocains remboursent une PART. Le patient qui demande « combien me
-- reste-t-il à ma charge ? » n'obtenait aucune réponse du logiciel.
--
-- ── ON NE REMPLIT PAS LE PASSÉ ──────────────────────────────────────────────
--
-- Aucun rattrapage : les feuilles déjà marquées « remise » gardent une date
-- vide, parce qu'inventer un jour serait écrire une information fausse dans
-- un dossier. L'écran se rabat sur la date des SOINS, qui est une borne
-- certaine — une feuille ne peut pas avoir été remise avant que les soins
-- n'aient lieu — et il dit que c'est une estimation.
--
-- ── À QUI L'ARGENT REVIENT ──────────────────────────────────────────────────
--
-- Le remboursement va de l'organisme AU PATIENT, pas au cabinet : le patient
-- a déjà réglé. Ces colonnes ne sont donc PAS une créance du cabinet et
-- n'entrent dans aucun total comptable. Elles servent à répondre au patient
-- qui rappelle, et à voir quels dossiers s'enlisent.
-- ============================================================================

alter table public.care_sheets
  -- Le jour où la feuille a quitté le cabinet. NULL = on ne sait pas.
  add column if not exists remise_le        date,
  -- Le jour où le patient a été remboursé, tel qu'il l'a dit au cabinet.
  add column if not exists rembourse_le     date,
  -- Ce que l'organisme a effectivement versé. Souvent une part du total.
  add column if not exists montant_rembourse numeric(10,2);

-- Contrainte ajoutée à part : `add column ... check` échoue à la relecture
-- d'une migration déjà passée, alors que ceci se rejoue sans bruit.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_sheets_montant_rembourse_positif') then
    alter table public.care_sheets
      add constraint care_sheets_montant_rembourse_positif
      check (montant_rembourse is null or montant_rembourse >= 0);
  end if;
end $$;

comment on column public.care_sheets.remise_le is
  'Jour où la feuille a été remise au patient. NULL = inconnu ; l''écran se rabat alors sur la date des soins, borne certaine, et l''annonce comme une estimation.';
comment on column public.care_sheets.rembourse_le is
  'Jour du remboursement, rapporté par le patient. Aucune valeur comptable.';
comment on column public.care_sheets.montant_rembourse is
  'Part effectivement versée par l''organisme AU PATIENT. N''entre dans aucun total de recettes : le cabinet a déjà été réglé.';

-- Retrouver les dossiers qui s'enlisent : ceux qui sont partis et ne sont pas
-- revenus. Index partiel — les feuilles remboursées ne se relancent plus.
create index if not exists idx_care_sheets_en_attente
  on public.care_sheets(doctor_id, remise_le)
  where status <> 'remboursee';

-- Le suivi du cabinet, toutes feuilles confondues, du plus récent au plus
-- ancien : la liste qu'aucun écran ne savait produire jusqu'ici.
create index if not exists idx_care_sheets_suivi
  on public.care_sheets(doctor_id, status, care_date desc);

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select column_name from information_schema.columns
--  where table_name = 'care_sheets'
--    and column_name in ('remise_le','rembourse_le','montant_rembourse');

-- ============================================================================
-- Fin de la migration v90
-- ============================================================================
