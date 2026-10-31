-- ════════════════════════════════════════════════════════════════════════════
-- v95 — LA FEUILLE DE SOINS PREND LA FORME DE L'ORGANISME
-- ════════════════════════════════════════════════════════════════════════════
--
-- Jusqu'ici MonRDV imprimait UN document neutre, à agrafer au formulaire de
-- l'organisme. Le dentiste recopiait donc tout à la main sur le papier de la
-- CNSS, du CNOPS, de la mutuelle des FAR ou de son assureur. C'est la recopie
-- que ce chantier supprime : le logiciel imprime désormais le formulaire de
-- l'organisme lui-même, sur une feuille A4 blanche.
--
-- CE QUE LES VRAIS FORMULAIRES EXIGENT, ET QUE LA BASE NE SAVAIT PAS DIRE
--
-- 1. UNE DATE PAR ACTE. Les formulaires CNSS et CNOPS ont une colonne
--    « Dates des actes » sur CHAQUE ligne, et RMA une colonne « Date » par
--    ligne de soin. Une feuille porte couramment des actes de plusieurs
--    séances. `care_sheets.care_date` ne décrivait qu'un jour pour toute la
--    feuille : il devient la date d'établissement, et chaque acte porte la
--    sienne.
--
--    Ce n'est pas cosmétique. Le délai de dépôt court à partir du PREMIER
--    acte porté sur la feuille (CNSS et CNOPS : deux mois ; mutuelle des FAR :
--    trois mois après la consultation ; RMA : trois mois après la cessation
--    des soins). Sans date par acte, ce délai n'est pas calculable, et une
--    feuille déposée trop tard n'est pas remboursée du tout.
--
-- 2. LA COTATION, QUI N'EST PAS LE CODE. Les formulaires demandent DEUX
--    choses différentes dans deux colonnes différentes :
--      · « Code des actes »        → le code ANAM de l'acte (D726, D761…)
--      · « Lettre clé + Cotation » → la lettre clé et son coefficient (D 50)
--    plus une troisième, « Valeur Clé », et enfin « Montant facturé ».
--    La base ne connaissait que `code` et `amount`. Une feuille sans
--    coefficient est incomplète et revient au cabinet.
--
--    La VALEUR de la clé est la tarification nationale de référence. Le
--    logiciel ne l'invente pas : elle est saisie par le praticien, retenue
--    avec l'acte, et reproposée ensuite — comme le code l'est déjà.
--
-- 3. DEVIS OU EXÉCUTION. Les quatre formulaires portent la même case en tête,
--    sous des noms voisins : « Entente préalable / Exécution » (CNSS, CNOPS),
--    « Type de déclaration : Devis / Exécution » (RMA). Une prothèse, un
--    traitement d'orthodontie, et chez RMA une extraction de plus de cinq
--    dents, passent par un accord AVANT d'être posés. La feuille de MonRDV ne
--    savait décrire que des actes déjà faits : le praticien n'avait donc aucun
--    moyen de produire la demande d'accord, qui est pourtant le premier
--    document de tout traitement lourd.
--
-- 4. LE TYPE DE SOINS. CNSS et CNOPS demandent de cocher Soins / Prothèse /
--    Orthodontie / Autres, et le numéro de l'entente préalable quand il y en a
--    une. Ces cases commandent le circuit du dossier chez l'organisme.
--
-- RIEN N'EST OBLIGATOIRE ICI. Toutes les colonnes sont nullables et sans
-- valeur par défaut imposée : une feuille établie avant cette migration reste
-- lisible et imprimable telle qu'elle a été établie. On n'invente pas une
-- date d'acte ni un coefficient qui n'ont jamais été saisis.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Les actes ───────────────────────────────────────────────────────────────
alter table public.care_sheet_items
  -- Le jour de CET acte. NULL = non précisé : les écrans se rabattent alors
  -- sur la date de la feuille, qui est une borne sûre, et le disent.
  add column if not exists acte_date   date,
  -- Lettre clé de la nomenclature. « D » pour un acte dentaire ; la colonne
  -- reste du texte libre pour que les autres branches (C, K, ORL…) s'en
  -- servent sans nouvelle migration.
  add column if not exists lettre_cle  text,
  -- Le coefficient de l'acte. Décimal : certains actes sont cotés en demis.
  add column if not exists coefficient numeric(7,2),
  -- La valeur de la clé, en dirhams, telle que le praticien la connaît.
  add column if not exists valeur_cle  numeric(8,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_sheet_items_coefficient_positif') then
    alter table public.care_sheet_items
      add constraint care_sheet_items_coefficient_positif
      check (coefficient is null or coefficient > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'care_sheet_items_valeur_cle_positive') then
    alter table public.care_sheet_items
      add constraint care_sheet_items_valeur_cle_positive
      check (valeur_cle is null or valeur_cle > 0);
  end if;
  -- Une lettre clé est une ou deux lettres, pas une phrase.
  if not exists (select 1 from pg_constraint where conname = 'care_sheet_items_lettre_cle_courte') then
    alter table public.care_sheet_items
      add constraint care_sheet_items_lettre_cle_courte
      check (lettre_cle is null or lettre_cle ~ '^[A-Z]{1,3}$');
  end if;
end $$;

comment on column public.care_sheet_items.acte_date is
  'Jour de cet acte, colonne « Dates des actes » des formulaires CNSS et CNOPS. NULL = non précisé, l''écran se rabat sur la date de la feuille.';
comment on column public.care_sheet_items.lettre_cle is
  'Lettre clé de la nomenclature (« D » en dentaire). À distinguer de `code`, qui est le code ANAM de l''acte.';
comment on column public.care_sheet_items.coefficient is
  'Coefficient de la cotation. Imprimé avec la lettre clé : « D 50 ».';
comment on column public.care_sheet_items.valeur_cle is
  'Valeur de la clé en dirhams (tarification nationale de référence). Saisie par le praticien — le logiciel n''invente aucun tarif.';

-- ── La feuille ──────────────────────────────────────────────────────────────
alter table public.care_sheets
  -- « Exécution » (des actes faits) ou « Entente préalable » (un accord
  -- demandé avant de poser). Les deux cases en tête de tous les formulaires.
  -- NULL = feuille établie avant la v95 : elle décrit des actes faits, mais on
  -- ne RÉÉCRIT pas son passé, on laisse l'écran le déduire.
  add column if not exists nature       text,
  -- Les cases « Type de soins » du formulaire : soins, prothese, orthodontie,
  -- autres. Un tableau : une feuille peut en porter plusieurs.
  add column if not exists types_soins  text[],
  -- Le numéro de l'entente préalable obtenue, quand les actes en relèvent.
  add column if not exists entente_no   text,
  -- L'organisme retenu à l'établissement, sous sa CLÉ (cnss, cnops, far,
  -- rma…), qui commande le gabarit imprimé. `insurer` garde, lui, le libellé
  -- tel qu'il était sur la fiche patient ce jour-là.
  add column if not exists organisme    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'care_sheets_nature_connue') then
    alter table public.care_sheets
      add constraint care_sheets_nature_connue
      check (nature is null or nature in ('execution','entente_prealable'));
  end if;
end $$;

comment on column public.care_sheets.nature is
  'execution = actes faits ; entente_prealable = accord demandé avant de poser. NULL = feuille antérieure à la v95.';
comment on column public.care_sheets.types_soins is
  'Cases « Type de soins » cochées sur le formulaire : soins, prothese, orthodontie, autres.';
comment on column public.care_sheets.organisme is
  'Clé de l''organisme (cnss, cnops, far, rma…), qui commande le gabarit imprimé. `insurer` reste le libellé lu sur la fiche patient.';

-- ── Le cabinet ──────────────────────────────────────────────────────────────
-- L'INPE et l'ICE existent déjà sur la fiche praticien. Le référentiel de
-- l'ANAM exige en plus l'identifiant fiscal sur la feuille de soins : « Les
-- identifiants fiscaux (ICE, I.F) doivent être portés sur la feuille de soins
-- actuelle. »
alter table public.doctors
  add column if not exists identifiant_fiscal text;

comment on column public.doctors.identifiant_fiscal is
  'Identifiant fiscal (I.F). Exigé avec l''ICE sur la feuille de soins par le référentiel ANAM des actes dentaires.';

-- Sans ceci, PostgREST ignore les colonnes et la feuille se croit non migrée.
notify pgrst, 'reload schema';
