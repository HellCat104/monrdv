-- ============================================================================
-- Migration v57 — Logo du cabinet sur les ordonnances
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente.
--
-- ORDRE DE DÉPLOIEMENT : indifférent. Le code tolère l'absence de la migration
-- (le composant de Paramètres annonce que la fonction n'est pas encore
-- activée, les ordonnances s'impriment sans logo, exactement comme avant) et
-- cette migration ne casse pas l'ancien code : elle ajoute une colonne
-- facultative et un dépôt de fichiers que rien d'autre n'utilise.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- L'ordonnance est le document qui sort du cabinet. Beaucoup de praticiens —
-- les dentistes d'abord — ont une identité visuelle et veulent la retrouver
-- dessus. Le logo est FACULTATIF : sans logo, l'ordonnance reste strictement
-- identique à celle d'aujourd'hui.
--
-- ── POURQUOI UN DÉPÔT DÉDIÉ, ET PAS UN SOUS-DOSSIER DE `doctor-photos` ───────
--
--  1. Les politiques RLS d'un dépôt s'ADDITIONNENT (policies permissives, en
--     OU). `doctor-photos` a été créé à la main dans la console et sa règle
--     d'écriture n'a été relue qu'en v53 — qui a remplacé les policies dont
--     elle connaissait le NOM. Si la console en avait créé une autre, sous un
--     autre nom, elle s'appliquerait aussi à un sous-dossier `logos/`. Un
--     dépôt neuf, créé ici, n'hérite d'aucune règle qu'on n'a pas lue.
--  2. Les garde-fous du dépôt lui-même — poids maximal et types de fichiers
--     acceptés — valent pour TOUT le dépôt. Les poser sur `doctor-photos`
--     aurait changé les règles de la photo de profil (2 Mo, WebP accepté).
--  3. La photo de profil se téléverse directement depuis le navigateur ; le
--     logo, jamais (voir §2). Les deux régimes ne cohabitent pas dans un même
--     dépôt sans que l'un affaiblisse l'autre.
--
-- ── POURQUOI LE NAVIGATEUR N'A AUCUN DROIT D'ÉCRITURE ───────────────────────
--
-- Même choix qu'en v55 (dental_charts) et v56 (liste d'attente) : l'écriture
-- passe par une route serveur (app/api/doctors/logo) qui vérifie d'abord,
-- écrit ensuite en service_role. Deux raisons propres au logo :
--
--  - L'examen du fichier (vrai format lu dans les octets, SVG refusé, image
--    décompressée une fois pour s'assurer qu'elle est entière) ne vaut que si
--    on ne peut pas le contourner. Une policy « chaque médecin écrit dans son
--    dossier » laisserait n'importe quel médecin déposer, avec la clé anon
--    publique, un fichier que la route aurait refusé.
--  - Le dossier de stockage est déduit de la SESSION par la route. Aucun
--    paramètre ne permet de désigner le logo d'un autre médecin : un médecin
--    ne peut écrire, remplacer ou supprimer QUE le sien, par construction.
--
-- La lecture, elle, est publique : un logo n'est pas une donnée sensible, et
-- l'ordonnance doit pouvoir s'imprimer sans jeton ni adresse signée qui expire.
-- ============================================================================


-- ── 1) Le dépôt ─────────────────────────────────────────────────────────────
-- public = true : les fichiers sont servis à l'adresse
-- /storage/v1/object/public/cabinet-logos/<chemin>, sans aucune policy SELECT.
-- On n'en crée donc pas : une policy SELECT servirait seulement à LISTER le
-- contenu du dépôt, ce dont personne n'a besoin.
--
-- file_size_limit et allowed_mime_types : seconde barrière, tenue par le
-- serveur de stockage lui-même. 1 Mo, comme LOGO_MAX_BYTES (lib/cabinet-logo.ts)
-- — les deux valeurs doivent rester égales. Seuls PNG et JPEG : pas de SVG
-- (il peut contenir du script), pas de WebP (pdfkit, qui produit le dossier
-- PDF, ne sait pas le lire). La route vérifie le VRAI format dans les octets ;
-- cette liste ne contrôle que le type déclaré, d'où son rôle de filet.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cabinet-logos', 'cabinet-logos', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ── 2) Aucune écriture depuis un navigateur ─────────────────────────────────
-- Des policies RESTRICTIVES, et pas simplement l'absence de policy. Une policy
-- restrictive doit être satisfaite EN PLUS des permissives : même si une règle
-- large existait déjà sur storage.objects (créée dans la console, du genre
-- « tout compte connecté peut téléverser »), elle ne pourrait pas ouvrir ce
-- dépôt-ci. C'est exactement le piège que la v53 a dû refermer sur
-- `doctor-photos`.
--
-- Pour les autres dépôts, la condition `bucket_id <> 'cabinet-logos'` est
-- toujours vraie : ces policies ne changent rien à leurs règles.
--
-- service_role (la route serveur) contourne la RLS et n'est pas concerné.
drop policy if exists "cabinet_logos_aucun_depot_navigateur" on storage.objects;
create policy "cabinet_logos_aucun_depot_navigateur" on storage.objects
  as restrictive
  for insert to anon, authenticated
  with check (bucket_id <> 'cabinet-logos');

-- UPDATE : couvre le remplacement (upsert) ET le déplacement d'un fichier
-- d'un autre dépôt vers celui-ci — d'où la clause WITH CHECK en plus de USING.
drop policy if exists "cabinet_logos_aucune_modif_navigateur" on storage.objects;
create policy "cabinet_logos_aucune_modif_navigateur" on storage.objects
  as restrictive
  for update to anon, authenticated
  using      (bucket_id <> 'cabinet-logos')
  with check (bucket_id <> 'cabinet-logos');

drop policy if exists "cabinet_logos_aucune_suppression_navigateur" on storage.objects;
create policy "cabinet_logos_aucune_suppression_navigateur" on storage.objects
  as restrictive
  for delete to anon, authenticated
  using (bucket_id <> 'cabinet-logos');


-- ── 3) La colonne ───────────────────────────────────────────────────────────
-- On stocke le CHEMIN dans le dépôt (`<id-médecin>/logo-<horodatage>.png`), pas
-- une adresse complète. L'adresse se reconstruit côté serveur à partir du
-- dépôt. Stocker une URL aurait permis d'y écrire n'importe quel domaine —
-- une image hébergée ailleurs, qui verrait passer l'adresse IP de chaque
-- personne ouvrant l'ordonnance.
--
-- La contrainte tient la forme du chemin EN BASE : il commence forcément par
-- l'identifiant de CE médecin, et se termine par .png ou .jpg. Même une
-- écriture en service_role par erreur (script, correction à la main) ne peut
-- pas faire pointer le logo d'un médecin vers le fichier d'un autre.
alter table public.doctors
  add column if not exists logo_path text;

alter table public.doctors
  drop constraint if exists doctors_logo_path_format;
alter table public.doctors
  add constraint doctors_logo_path_format check (
    logo_path is null
    or logo_path ~ ('^' || id::text || '/logo-[0-9]{13}\.(png|jpg)$')
  );

comment on column public.doctors.logo_path is
  'Logo du cabinet (facultatif) : chemin dans le dépôt cabinet-logos. Écrit uniquement par app/api/doctors/logo (service_role). Affiché sur les ordonnances et les dossiers imprimés.';

-- Aucun GRANT au rôle `anon`. Depuis la v15, anon ne lit que les colonnes qui
-- lui sont accordées une à une ; une colonne nouvelle lui reste donc fermée
-- sans rien faire. Aucune page publique n'affiche le logo : la fiche de
-- réservation (app/[slug]) et la recherche passent par des projections
-- explicites, en service_role ou par la fonction search_doctors, que cette
-- colonne ne modifie pas. Le médecin connecté la lit sur SA fiche via
-- `doctors_own` (v37), comme toutes ses autres colonnes.


-- ── 4) La colonne n'est pas modifiable depuis un navigateur ─────────────────
-- `doctors_own` permet au médecin connecté de mettre à jour sa propre ligne
-- depuis le navigateur (Paramètres, Abonnement). Sans ce trigger, il pourrait
-- écrire dans `logo_path` le chemin d'un fichier qu'il n'a jamais fait
-- examiner par la route — la contrainte du §3 limite ce chemin à son propre
-- dossier, mais c'est la route qui doit rester le seul chemin d'écriture.
--
-- On LÈVE une erreur au lieu de restaurer silencieusement l'ancienne valeur
-- comme le fait protect_doctor_plan (v51) : aucun écran n'écrit cette colonne
-- depuis le navigateur (l'enregistrement des Paramètres envoie une liste de
-- champs explicite), donc une tentative est soit une erreur de code à
-- découvrir tout de suite, soit un abus. `UPDATE OF logo_path` : le trigger
-- ne se déclenche que si la colonne figure dans la requête, et la comparaison
-- IS DISTINCT FROM laisse passer une réécriture à l'identique.
--
-- SECURITY INVOKER (le défaut), impérativement : c'est la leçon de la v52. En
-- SECURITY DEFINER, `current_user` vaudrait le propriétaire de la fonction et
-- la garde ne se déclencherait jamais.
create or replace function public.protect_doctor_logo()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.logo_path is distinct from old.logo_path then
    raise exception 'Le logo du cabinet se modifie depuis Paramètres, pas directement.';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_doctor_logo on public.doctors;
create trigger trg_protect_doctor_logo
  before update of logo_path on public.doctors
  for each row execute function public.protect_doctor_logo();


-- ── 5) Vérification (facultatif, à lancer après la migration) ───────────────
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cabinet-logos';
-- select policyname, permissive, cmd, roles from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' and policyname like 'cabinet_logos%';
--   → trois lignes, permissive = 'RESTRICTIVE'.
-- select column_name, data_type from information_schema.columns
--  where table_name = 'doctors' and column_name = 'logo_path';
-- select tgname from pg_trigger where tgname = 'trg_protect_doctor_logo';

-- ============================================================================
-- Fin de la migration v57
-- ============================================================================
