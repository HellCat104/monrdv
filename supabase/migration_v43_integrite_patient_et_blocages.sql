-- v43 — Intégrité doctor_id/patient_id et confidentialité des blocages.
-- À appliquer après v42. Idempotente.
--
-- Une clé étrangère séparée vers doctors et patients n'assure pas que le
-- patient appartient au même cabinet. Ce trigger ferme cette brèche pour toutes
-- les écritures, y compris celles passant par service_role ou une future API.

CREATE OR REPLACE FUNCTION public.assert_patient_belongs_to_doctor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = NEW.patient_id AND p.doctor_id = NEW.doctor_id
  ) THEN
    RAISE EXCEPTION 'patient_id % does not belong to doctor_id %', NEW.patient_id, NEW.doctor_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments', 'consultation_notes', 'prescriptions', 'patient_documents',
    'certificates', 'vital_signs', 'recalls'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_patient_doctor_integrity ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_%I_patient_doctor_integrity BEFORE INSERT OR UPDATE OF doctor_id, patient_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assert_patient_belongs_to_doctor()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- Défense en profondeur RLS : remplace les policies permissives historiques,
-- afin que cette condition ne soit pas contournée par l'OR entre policies.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Médecin : gérer ses notes" ON public.consultation_notes;
  CREATE POLICY "Médecin : gérer ses notes" ON public.consultation_notes FOR ALL TO authenticated
    USING (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email')
      AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id))
    WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email')
      AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id));

  DROP POLICY IF EXISTS "Médecin : gérer ses ordonnances" ON public.prescriptions;
  CREATE POLICY "Médecin : gérer ses ordonnances" ON public.prescriptions FOR ALL TO authenticated
    USING (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id))
    WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id));

  DROP POLICY IF EXISTS "Médecin : gérer ses documents patient" ON public.patient_documents;
  CREATE POLICY "Médecin : gérer ses documents patient" ON public.patient_documents FOR ALL TO authenticated
    USING (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id))
    WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id));

  DROP POLICY IF EXISTS "Médecin : gérer ses certificats" ON public.certificates;
  CREATE POLICY "Médecin : gérer ses certificats" ON public.certificates FOR ALL TO authenticated
    USING (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id))
    WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id));

  DROP POLICY IF EXISTS "Médecin : gérer ses constantes" ON public.vital_signs;
  CREATE POLICY "Médecin : gérer ses constantes" ON public.vital_signs FOR ALL TO authenticated
    USING (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id))
    WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id));

  DROP POLICY IF EXISTS "Médecin : gérer ses rappels" ON public.recalls;
  CREATE POLICY "Médecin : gérer ses rappels" ON public.recalls FOR ALL TO authenticated
    USING (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id))
    WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email') AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.doctor_id = doctor_id));
END $$;

-- Les raisons de blocage sont internes : aucune policy ou API publique ne les
-- expose. Les créneaux partiels restent disponibles via /api/slots.
COMMENT ON COLUMN public.blocked_dates.reason IS 'Motif privé, réservé au cabinet; ne jamais retourner publiquement.';
