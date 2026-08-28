-- v53 — Chaque médecin ne peut écrire que SA photo.
--
-- Le dépôt `doctor-photos` a été créé à la main dans la console, jamais par
-- migration : sa règle d'écriture n'avait donc jamais été relue. Elle
-- autorisait l'écriture à tout compte connecté sur `bucket_id =
-- 'doctor-photos'`, SANS aucune contrainte sur le nom du fichier.
--
-- Or le chemin est simplement `<id-du-médecin>.<extension>`, et cet
-- identifiant est public : /api/search le renvoie. N'importe quel compte —
-- y compris un compte patient, dont la création est libre — pouvait donc
-- écraser la photo de n'importe quel praticien. Défiguration d'une fiche
-- médicale publique, sans aucune trace.
--
-- La lecture reste publique : une photo de médecin est publique par nature.
-- Les deux autres dépôts (patient-documents, expense-receipts) sont privés et
-- correctement cloisonnés depuis leurs migrations respectives.

-- Le nom du fichier doit porter l'identifiant d'un médecin appartenant à
-- l'appelant. Le UUID ne contient pas de point : `split_part` isole donc bien
-- l'identifiant, quelle que soit l'extension.
DROP POLICY IF EXISTS "doctor_photos_auth_insert" ON storage.objects;
CREATE POLICY "doctor_photos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'doctor-photos'
    AND split_part(name, '.', 1) IN (
      SELECT id::text FROM public.doctors WHERE email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS "doctor_photos_auth_update" ON storage.objects;
CREATE POLICY "doctor_photos_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'doctor-photos'
    AND split_part(name, '.', 1) IN (
      SELECT id::text FROM public.doctors WHERE email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    bucket_id = 'doctor-photos'
    AND split_part(name, '.', 1) IN (
      SELECT id::text FROM public.doctors WHERE email = auth.jwt() ->> 'email'
    )
  );

-- Lecture publique inchangée : c'est le comportement voulu.
DROP POLICY IF EXISTS "doctor_photos_public_read" ON storage.objects;
CREATE POLICY "doctor_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'doctor-photos');
