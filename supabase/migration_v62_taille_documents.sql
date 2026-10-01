-- Migration v62 — Taille des documents patients, et limite côté serveur
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--
-- POURQUOI
-- 1) `patient_documents` n'a jamais porté de colonne `file_size` (table créée
--    en v7). L'export des données du patient la demandait pourtant : la requête
--    échouait à chaque appel et, le résultat étant lu en `data ?? []`,
--    l'inventaire des documents arrivait VIDE chez le patient. Corrigé côté
--    code le 2026-10-01 (commit 414e532) en retirant la colonne de la
--    projection ; cette migration la crée pour de bon.
-- 2) La limite de 10 Mo par document n'existe que dans le navigateur. Le dépôt
--    `patient-documents` n'a, lui, aucune limite : un envoi direct à l'API la
--    contourne. Le dépôt des logos (v57) montre la bonne pratique.

ALTER TABLE public.patient_documents
  ADD COLUMN IF NOT EXISTS file_size bigint
  CHECK (file_size IS NULL OR (file_size >= 0 AND file_size <= 10485760));

COMMENT ON COLUMN public.patient_documents.file_size IS
  'Poids du fichier en octets. Renseigné à l''envoi ; NULL pour les documents antérieurs à la v62.';

-- Reprise de l'existant : la taille est déjà connue du stockage, dans
-- storage.objects.metadata. On la recopie pour les documents déjà déposés.
UPDATE public.patient_documents d
   SET file_size = (o.metadata->>'size')::bigint
  FROM storage.objects o
 WHERE o.bucket_id = 'patient-documents'
   AND o.name = d.file_path
   AND d.file_size IS NULL
   AND (o.metadata->>'size') ~ '^[0-9]+$';

-- Seconde barrière, tenue par le serveur de stockage lui-même : 10 Mo, et
-- uniquement des images ou des PDF — ce que le navigateur accepte déjà
-- (accept="image/*,application/pdf").
UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/gif','application/pdf']
 WHERE id = 'patient-documents';

-- Vérifications (à lire dans les résultats) :
--   select count(*) filter (where file_size is null) as sans_taille,
--          count(*) as total,
--          pg_size_pretty(sum(file_size)) as volume
--     from public.patient_documents;
--   select id, file_size_limit, allowed_mime_types from storage.buckets
--    where id = 'patient-documents';

-- ============================================================================
-- Fin de la migration v62
-- ============================================================================
