-- ============================================================================
-- Migration v74 — Photos du cabinet sur la fiche publique
-- À lancer dans Supabase → SQL Editor → New query → Run (une seule fois).
-- Idempotente. Ne pas oublier `notify pgrst, 'reload schema';` ensuite.
--
-- ORDRE DE DÉPLOIEMENT : indifférent. Sans la migration, l'encart des
-- Paramètres annonce que la fonction n'est pas encore activée et la fiche
-- publique s'affiche exactement comme avant.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
--
-- Un patient qui hésite entre deux cabinets regarde à quoi ils ressemblent.
-- La salle d'attente, le fauteuil, la façade : c'est ce qui rassure avant un
-- premier rendez-vous, et c'est précisément ce qu'une fiche d'annuaire ne
-- montre pas. Cinq photos au plus, facultatives.
--
-- ── POURQUOI UN DÉPÔT DÉDIÉ ─────────────────────────────────────────────────
--
-- Mêmes raisons qu'en v57, et elles valent toujours :
--   • les policies d'un dépôt s'additionnent — un dépôt neuf créé ICI n'hérite
--     d'aucune règle écrite un jour dans la console et jamais relue ;
--   • le poids maximal et les types acceptés valent pour TOUT le dépôt : les
--     poser sur `doctor-photos` changerait les règles de la photo de profil ;
--   • la photo de profil se téléverse depuis le navigateur, celles-ci jamais.
--     Les deux régimes ne cohabitent pas sans que l'un affaiblisse l'autre.
--
-- ── POURQUOI JPEG SEULEMENT, ET 2 Mo ────────────────────────────────────────
--
-- Le navigateur REDIMENSIONNE et réencode chaque photo avant l'envoi
-- (lib/image-navigateur.ts) : le serveur ne reçoit donc jamais autre chose que
-- du JPEG, quelle que soit l'image choisie — HEIC d'iPhone compris. Deux
-- bénéfices : une photo de téléphone passe de ~4 Mo à ~300 ko, ce qui rend
-- l'envoi instantané en 4G, et le format accepté se réduit à un seul.
--
-- Le plafond de 2 Mo n'est donc pas la taille attendue, c'est un filet : il
-- vaut pour un appel direct à la route qui contournerait le redimensionnement.
--
-- Pas de WebP ni de PNG : inutiles ici. Pas de SVG, jamais — c'est du XML qui
-- peut embarquer du script.
--
-- ── CE QUE ÇA COÛTE EN STOCKAGE ─────────────────────────────────────────────
--
-- 5 photos × ~300 ko = 1,5 Mo par cabinet, soit ~150 Mo pour cent cabinets.
-- Volontairement HORS du quota de 5 Go de la v63 : ce quota existe pour les
-- documents patients, dont le volume est imprévisible. Ici le maximum est
-- connu d'avance et plafonné par le nombre de photos ; l'ajouter à la jauge
-- compliquerait `espaceOccupe()` sans rien protéger.
--
-- Le patient, lui, ne télécharge pas ces fichiers : la fiche publique les sert
-- par l'optimiseur de Next (AVIF/WebP, redimensionné), déjà configuré pour
-- *.supabase.co dans next.config.js.
-- ============================================================================


-- ── 1) Le dépôt ─────────────────────────────────────────────────────────────
-- public = true : servi à /storage/v1/object/public/cabinet-photos/<chemin>,
-- sans policy SELECT. Une policy SELECT ne servirait qu'à LISTER le dépôt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cabinet-photos', 'cabinet-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ── 2) Aucune écriture depuis un navigateur ─────────────────────────────────
-- RESTRICTIVES, comme en v57 : une policy restrictive doit être satisfaite EN
-- PLUS des permissives. Même si une règle large existait déjà sur
-- storage.objects, elle ne pourrait pas ouvrir ce dépôt-ci.
-- Pour les autres dépôts, `bucket_id <> 'cabinet-photos'` est toujours vrai.
drop policy if exists "cabinet_photos_aucun_depot_navigateur" on storage.objects;
create policy "cabinet_photos_aucun_depot_navigateur" on storage.objects
  as restrictive
  for insert to anon, authenticated
  with check (bucket_id <> 'cabinet-photos');

drop policy if exists "cabinet_photos_aucune_modif_navigateur" on storage.objects;
create policy "cabinet_photos_aucune_modif_navigateur" on storage.objects
  as restrictive
  for update to anon, authenticated
  using      (bucket_id <> 'cabinet-photos')
  with check (bucket_id <> 'cabinet-photos');

drop policy if exists "cabinet_photos_aucune_suppression_navigateur" on storage.objects;
create policy "cabinet_photos_aucune_suppression_navigateur" on storage.objects
  as restrictive
  for delete to anon, authenticated
  using (bucket_id <> 'cabinet-photos');


-- ── 3) La colonne ───────────────────────────────────────────────────────────
-- Un TABLEAU de CHEMINS, pas d'adresses : stocker une URL permettrait d'y
-- écrire n'importe quel domaine, et chaque visiteur de la fiche publique
-- enverrait alors son adresse IP à un serveur tiers.
--
-- L'ORDRE DU TABLEAU est l'ordre d'affichage : le médecin réorganise ses
-- photos, la route réécrit le tableau. Pas de colonne `position`, pas de table
-- de liaison — une photo n'a aucun attribut propre.
alter table public.doctors
  add column if not exists photos text[];

comment on column public.doctors.photos is
  'Photos du cabinet (facultatif, 5 au plus) : chemins dans le dépôt cabinet-photos, dans l''ordre d''affichage. Écrit uniquement par app/api/doctors/photos (service_role). Affichées sur la fiche publique de réservation.';


-- ── 4) Garde unique : navigateur interdit, et format tenu même en service_role
-- Un trigger plutôt qu'une contrainte CHECK : valider CHAQUE élément d'un
-- tableau demande un `unnest`, donc une sous-requête, que CHECK n'accepte pas.
-- Le trigger a d'ailleurs un avantage — il s'applique AUSSI au service_role et
-- à l'éditeur SQL (leçon de la v55), là où la RLS, elle, est contournée.
--
-- Deux rôles distincts dans la même fonction :
--   a) l'écriture depuis un navigateur est refusée. `doctors_own` laisse le
--      médecin mettre à jour sa propre ligne depuis les Paramètres ; sans ce
--      garde, il pourrait inscrire le chemin d'un fichier jamais examiné.
--   b) le format est vérifié pour TOUT LE MONDE : chaque chemin commence par
--      l'identifiant de CE médecin. Même une correction à la main ne peut pas
--      faire pointer la galerie d'un cabinet vers les fichiers d'un autre.
--
-- SECURITY INVOKER impérativement : c'est la leçon de la v52. En DEFINER,
-- `current_user` vaudrait le propriétaire et la garde (a) ne se déclencherait
-- jamais.
create or replace function public.protect_doctor_photos()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  chemin text;
begin
  if new.photos is distinct from old.photos then
    if current_user in ('authenticated', 'anon') then
      raise exception 'Les photos du cabinet se modifient depuis Paramètres, pas directement.';
    end if;

    if coalesce(array_length(new.photos, 1), 0) > 5 then
      raise exception 'Cinq photos de cabinet au maximum.';
    end if;

    foreach chemin in array coalesce(new.photos, array[]::text[]) loop
      if chemin !~ ('^' || new.id::text || '/photo-[0-9]{13}-[0-9]+\.jpg$') then
        raise exception 'Chemin de photo invalide : %', chemin;
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_doctor_photos on public.doctors;
create trigger trg_protect_doctor_photos
  before update of photos on public.doctors
  for each row execute function public.protect_doctor_photos();

-- Aucun GRANT à `anon`. Depuis la v15, anon ne lit que les colonnes accordées
-- une à une : cette colonne lui reste fermée sans rien faire. La fiche publique
-- (app/[slug]) lit le médecin avec le client admin, par une projection
-- explicite — elle n'a donc pas besoin de ce droit.


-- ── 5) Vérification (facultatif, à lancer après la migration) ───────────────
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cabinet-photos';
-- select policyname, permissive, cmd from pg_policies
--  where schemaname = 'storage' and tablename = 'objects' and policyname like 'cabinet_photos%';
--   → trois lignes, permissive = 'RESTRICTIVE'.
-- select column_name, data_type from information_schema.columns
--  where table_name = 'doctors' and column_name = 'photos';
-- select tgname from pg_trigger where tgname = 'trg_protect_doctor_photos';

-- ============================================================================
-- Fin de la migration v74
-- ============================================================================
