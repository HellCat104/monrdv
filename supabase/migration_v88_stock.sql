-- ============================================================================
-- Migration v88 — LE STOCK DU CABINET : articles et mouvements
-- À lancer dans Supabase → SQL Editor → New query → Run. Idempotente.
--
-- ── CE QUI MANQUAIT ─────────────────────────────────────────────────────────
--
-- Rien dans MonRDV ne disait combien il reste de composite A2, de cartouches
-- d'anesthésique ou de gants en M. On s'en aperçoit au fauteuil, patient
-- installé, et le soin se reporte. C'était le seul poste du cabinet dentaire
-- dont le logiciel ne savait absolument rien.
--
-- ── DEUX TABLES, ET UNE SEULE VÉRITÉ ────────────────────────────────────────
--
-- `stock_articles` porte ce que le cabinet détient ; `stock_mouvements` porte
-- l'histoire de chaque variation. La quantité vit sur l'article — on la lit
-- cent fois par jour, et une liste de quatre-vingts références qui
-- additionnerait ses mouvements à chaque affichage serait lente pour rien.
--
-- Mais elle n'est JAMAIS modifiable directement : la fonction
-- `stock_mouvement()` ci-dessous est le seul chemin, et elle écrit les deux
-- lignes ensemble. Sans cela on aurait eu deux sources de vérité qui
-- divergent — exactement la faute que la v86 a évitée du côté des actes.
--
-- ── LA QUANTITÉ PEUT DEVENIR NÉGATIVE, ET C'EST VOULU ───────────────────────
--
-- Le praticien prend la dernière boîte, le logiciel en comptait deux : faut-il
-- refuser la sortie ? Non. Refuser au fauteuil, c'est faire abandonner le
-- module en une semaine. Ramener silencieusement à zéro, c'est mentir dans le
-- journal et casser l'arithmétique des lignes.
--
-- Le stock descend donc sous zéro, s'affiche en rouge, et dit « le compte est
-- à corriger ». Un nombre négatif est l'alerte elle-même : il ne peut venir
-- que d'un comptage inexact, et il nomme le problème au lieu de le cacher.
--
-- ── CE QU'ON NE FAIT PAS ────────────────────────────────────────────────────
--
-- Aucune déduction automatique depuis les actes réalisés. « Composite deux
-- faces » ne consomme pas une quantité connue de matériau, et un stock
-- décrémenté par une consultation enregistrée donnerait des comptes faux avec
-- l'autorité du chiffre — le même raisonnement qui interdit, depuis la v85,
-- de facturer un acte parce qu'une consultation le mentionne.
--
-- Aucun catalogue livré, aucun fournisseur, aucun prix : ni les références ni
-- les tarifs d'un cabinet de Rabat ne sont ceux d'un cabinet de Taroudant.
-- ============================================================================

-- ── Les articles ────────────────────────────────────────────────────────────

create table if not exists public.stock_articles (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,

  nom        text not null check (length(btrim(nom)) between 1 and 120),
  categorie  text,
  -- Référence du fournisseur, pour recommander sans rechercher. Libre : le
  -- praticien y met le code du catalogue de SON dépositaire.
  reference  text,
  fournisseur text,
  -- L'unité DANS LAQUELLE ON COMPTE, et elle n'est pas la même d'un article à
  -- l'autre : on compte les cartouches à l'unité, les gants à la boîte, le
  -- composite à la seringue. Un stock exprimé dans une unité unique ne veut
  -- rien dire.
  unite      text not null default 'unité',

  -- numeric et non integer : une unité peut se compter en demi-boîtes.
  quantite   numeric(12,2) not null default 0,
  -- Le seuil au-dessous duquel l'article passe « à commander ». NULL = pas
  -- d'alerte : tout n'a pas besoin d'être surveillé, et une alerte qu'on ne
  -- veut pas est le début de l'indifférence à toutes les autres.
  seuil_alerte numeric(12,2),
  -- Péremption la plus PROCHE parmi les lots détenus. Une gestion par lots
  -- (plusieurs dates pour un même article) serait plus juste et personne ne
  -- la tiendrait : ce qu'on veut savoir, c'est quelle est la prochaine date
  -- qui tombe.
  peremption date,
  -- Prix d'achat unitaire, pour chiffrer ce qui dort sur l'étagère. Facultatif.
  prix_achat numeric(10,2),
  notes      text,
  -- Un article qu'on ne tient plus : il sort des listes et garde son journal.
  -- On ne SUPPRIME pas un article qui a une histoire, on l'archive.
  actif      boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stock_articles is
  'Consommables et petit matériel du cabinet. La quantité ne se modifie que par public.stock_mouvement() : aucun écran n''écrit cette colonne directement.';
comment on column public.stock_articles.quantite is
  'Peut être négative : une sortie au fauteuil n''est jamais refusée, et un nombre négatif signale un comptage à corriger plutôt que de le masquer.';
comment on column public.stock_articles.seuil_alerte is
  'NULL = aucune alerte pour cet article.';

-- Deux fois le même nom dans un cabinet, ce sont deux comptes qui divergent.
-- Index partiel sur les articles ACTIFS : archiver « Gants M » doit laisser
-- la place à un nouvel article du même nom.
create unique index if not exists idx_stock_articles_nom
  on public.stock_articles(doctor_id, lower(btrim(nom)))
  where actif;

create index if not exists idx_stock_articles_cabinet
  on public.stock_articles(doctor_id, categorie, nom)
  where actif;

-- ── Les mouvements ──────────────────────────────────────────────────────────

create table if not exists public.stock_mouvements (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  article_id uuid not null references public.stock_articles(id) on delete cascade,

  -- 'entree'     : une livraison, un réassort.
  -- 'sortie'     : consommé, cassé, périmé, jeté.
  -- 'inventaire' : on a compté l'étagère, et c'est ce chiffre qui fait foi.
  sens       text not null check (sens in ('entree', 'sortie', 'inventaire')),
  -- Toujours > 0 : la magnitude saisie. Pour un inventaire, la quantité
  -- COMPTÉE.
  quantite   numeric(12,2) not null check (quantite > 0),
  -- Le stock APRÈS application. Écrit par la fonction, jamais par un écran :
  -- sans lui, un journal relu six mois plus tard ne permet pas de retrouver
  -- où le compte a décroché.
  quantite_apres numeric(12,2) not null,
  -- « livraison Dentomaroc », « cassé », « périmé jeté » : trois mots qui
  -- font la différence entre un journal et une colonne de chiffres.
  motif      text,

  created_at timestamptz not null default now()
);

comment on table public.stock_mouvements is
  'Journal des variations de stock. Écrit uniquement par public.stock_mouvement(), qui met à jour l''article dans le même appel.';

create index if not exists idx_stock_mouvements_article
  on public.stock_mouvements(article_id, created_at desc);

-- `updated_at` tenu à jour : sur un stock, « depuis quand ce chiffre
-- n'a-t-il pas bougé » est une information en soi.
create or replace function public.touche_stock_article()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touche_stock_article on public.stock_articles;
create trigger trg_touche_stock_article
  before update on public.stock_articles
  for each row execute function public.touche_stock_article();

-- ── Le seul chemin vers la quantité ─────────────────────────────────────────
--
-- SECURITY INVOKER (le défaut, écrit ici pour qu'on le lise) : la fonction
-- s'exécute avec les droits de l'appelant, donc la RLS ci-dessous s'applique
-- comme pour n'importe quelle requête. Une fonction SECURITY DEFINER aurait
-- contourné les politiques — et `current_user` y désigne le propriétaire, ce
-- qui a déjà rendu un contrôle de sécurité inopérant dans ce projet.
--
-- Le verrou de ligne (`for update`) sérialise deux sorties simultanées : sans
-- lui, le médecin au fauteuil et la secrétaire au comptoir peuvent lire le
-- même « 12 » et écrire tous les deux « 11 ».
create or replace function public.stock_mouvement(
  p_article uuid,
  p_sens    text,
  p_qte     numeric,
  p_motif   text default null
)
returns public.stock_articles
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_article public.stock_articles;
  v_apres   numeric(12,2);
begin
  if p_sens not in ('entree', 'sortie', 'inventaire') then
    raise exception 'Sens de mouvement inconnu : %', p_sens;
  end if;
  if p_qte is null or p_qte <= 0 then
    raise exception 'La quantité doit être supérieure à zéro.';
  end if;

  -- La RLS décide ce que ce select voit : un article d'un autre cabinet ne
  -- remonte pas, et la fonction répond « introuvable ».
  select * into v_article from public.stock_articles
   where id = p_article for update;
  if not found then
    raise exception 'Article introuvable.';
  end if;

  v_apres := case p_sens
    when 'entree'     then v_article.quantite + p_qte
    when 'sortie'     then v_article.quantite - p_qte
    when 'inventaire' then p_qte
  end;

  insert into public.stock_mouvements
    (doctor_id, article_id, sens, quantite, quantite_apres, motif)
  values
    (v_article.doctor_id, p_article, p_sens, p_qte, v_apres,
     nullif(btrim(coalesce(p_motif, '')), ''));

  update public.stock_articles set quantite = v_apres
   where id = p_article
   returning * into v_article;

  return v_article;
end $$;

comment on function public.stock_mouvement(uuid, text, numeric, text) is
  'Seul chemin vers stock_articles.quantite : écrit le mouvement et met à jour l''article dans la même transaction, sous verrou de ligne.';

-- ── Droits — tables nouvelles, rien n'est hérité ────────────────────────────

grant select, insert, update, delete on public.stock_articles   to service_role, authenticated;
grant select, insert                 on public.stock_mouvements to service_role, authenticated;
-- Un mouvement ne se corrige pas, il se contre-passe : pas d'update, pas de
-- delete. Un journal qu'on réécrit ne sert plus à rien.
grant execute on function public.stock_mouvement(uuid, text, numeric, text)
  to service_role, authenticated;
-- Rien pour `anon`.

-- ── RLS — le cabinet, et lui seul ───────────────────────────────────────────
--
-- Pas de donnée de santé ici : un stock n'appartient à aucun patient. Mais il
-- dit ce que le cabinet achète, à qui et à quel prix, ce qui n'a pas à sortir
-- du cabinet. La secrétaire n'y a pas de politique pour l'instant : c'est
-- pourtant elle qui tient souvent l'étagère, et l'ouvrir à sa permission sera
-- une décision à prendre, pas un oubli à rattraper.

alter table public.stock_articles   enable row level security;
alter table public.stock_mouvements enable row level security;

drop policy if exists "Médecin : lire son stock" on public.stock_articles;
create policy "Médecin : lire son stock" on public.stock_articles
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : créer un article" on public.stock_articles;
create policy "Médecin : créer un article" on public.stock_articles
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : modifier un article" on public.stock_articles;
create policy "Médecin : modifier un article" on public.stock_articles
  for update using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'))
          with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : effacer un article" on public.stock_articles;
create policy "Médecin : effacer un article" on public.stock_articles
  for delete using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : lire son journal de stock" on public.stock_mouvements;
create policy "Médecin : lire son journal de stock" on public.stock_mouvements
  for select using (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

drop policy if exists "Médecin : écrire un mouvement" on public.stock_mouvements;
create policy "Médecin : écrire un mouvement" on public.stock_mouvements
  for insert with check (doctor_id in (select id from public.doctors where email = auth.jwt() ->> 'email'));

notify pgrst, 'reload schema';

-- ── Vérification (facultatif) ───────────────────────────────────────────────
-- select table_name from information_schema.tables
--  where table_name in ('stock_articles', 'stock_mouvements');

-- ============================================================================
-- Fin de la migration v88
-- ============================================================================
