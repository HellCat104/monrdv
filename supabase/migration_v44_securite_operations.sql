-- v44 — Opérations atomiques, traçabilité et identité du personnel.

ALTER TABLE public.cabinet_staff ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE public.cabinet_staff s SET auth_user_id = u.id
FROM auth.users u WHERE s.auth_user_id IS NULL AND lower(s.email) = lower(u.email);
CREATE INDEX IF NOT EXISTS idx_cabinet_staff_auth_user ON public.cabinet_staff(auth_user_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, action text NOT NULL,
  target_type text NOT NULL, target_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.merge_patients_atomic(p_doctor_id uuid, p_keep_id uuid, p_merge_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k public.patients%ROWTYPE; m public.patients%ROWTYPE; t text;
BEGIN
  SELECT * INTO k FROM public.patients WHERE id=p_keep_id AND doctor_id=p_doctor_id FOR UPDATE;
  SELECT * INTO m FROM public.patients WHERE id=p_merge_id AND doctor_id=p_doctor_id FOR UPDATE;
  IF k.id IS NULL OR m.id IS NULL OR p_keep_id=p_merge_id THEN RAISE EXCEPTION 'Fiches introuvables'; END IF;
  IF k.user_id IS NOT NULL AND m.user_id IS NOT NULL AND k.user_id <> m.user_id THEN RAISE EXCEPTION 'Deux comptes patients différents'; END IF;
  IF k.birth_date IS NOT NULL AND m.birth_date IS NOT NULL AND k.birth_date <> m.birth_date THEN RAISE EXCEPTION 'Dates de naissance différentes'; END IF;
  FOREACH t IN ARRAY ARRAY['appointments','consultation_notes','prescriptions','vital_signs','patient_documents','certificates','recalls','session_packages'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('UPDATE public.%I SET patient_id=$1 WHERE patient_id=$2',t) USING p_keep_id,p_merge_id; END IF;
  END LOOP;
  UPDATE public.patients SET email=coalesce(nullif(k.email,''),m.email), age=coalesce(k.age,m.age), allergies=coalesce(k.allergies,m.allergies), chronic_conditions=coalesce(k.chronic_conditions,m.chronic_conditions), current_treatments=coalesce(k.current_treatments,m.current_treatments), notes=coalesce(k.notes,m.notes), user_id=coalesce(k.user_id,m.user_id), birth_date=coalesce(k.birth_date,m.birth_date), sex=coalesce(k.sex,m.sex), cin=coalesce(k.cin,m.cin), mutuelle=coalesce(k.mutuelle,m.mutuelle), address=coalesce(k.address,m.address), blood_group=coalesce(k.blood_group,m.blood_group), surgeries=coalesce(k.surgeries,m.surgeries), vaccinations=coalesce(k.vaccinations,m.vaccinations) WHERE id=p_keep_id;
  DELETE FROM public.patients WHERE id=p_merge_id;
  INSERT INTO public.audit_logs(doctor_id,actor_user_id,action,target_type,target_id,metadata) VALUES(p_doctor_id,p_actor,'patient_merge','patient',p_keep_id,jsonb_build_object('merged_patient_id',p_merge_id));
END $$;

CREATE OR REPLACE FUNCTION public.delete_patient_safely(p_doctor_id uuid, p_patient_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id=p_patient_id AND doctor_id=p_doctor_id) THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM public.appointments WHERE patient_id=p_patient_id AND doctor_id=p_doctor_id AND invoice_no IS NOT NULL) THEN RAISE EXCEPTION 'Patient avec facture'; END IF;
  IF EXISTS (SELECT 1 FROM public.consultation_notes WHERE patient_id=p_patient_id AND signed_at IS NOT NULL) THEN RAISE EXCEPTION 'Patient avec note signée'; END IF;
  IF EXISTS (SELECT 1 FROM public.certificates WHERE patient_id=p_patient_id) THEN RAISE EXCEPTION 'Patient avec certificat'; END IF;
  DELETE FROM public.patients WHERE id=p_patient_id AND doctor_id=p_doctor_id;
  INSERT INTO public.audit_logs(doctor_id,actor_user_id,action,target_type,target_id) VALUES(p_doctor_id,p_actor,'patient_delete','patient',p_patient_id);
END $$;
