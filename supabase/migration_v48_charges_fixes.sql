-- v48 — Charges fixes : dépenses récurrentes (loyer, salaires, eau, assurances).
--
-- Une dépense était une ligne unique, ressaisie à la main chaque mois. Quatre
-- charges fixes sur douze mois faisaient 48 saisies pour des montants qui ne
-- bougent pas — de quoi abandonner sa comptabilité au bout de deux mois, et
-- livrer un pack comptable vide au fiduciaire.
--
-- Le modèle décrit la charge ; chaque échéance reste une dépense ordinaire,
-- modifiable et supprimable individuellement (le mois où le loyer augmente ou
-- où l'on verse une prime). Arrêter ou supprimer un modèle ne touche pas aux
-- échéances déjà passées : elles ont été payées, elles restent en comptabilité.

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  label        text NOT NULL,
  amount       numeric(10,2) NOT NULL CHECK (amount >= 0),
  category     text,
  -- Limité à 28 : le 31 n'existe pas tous les mois, et le 29 pas tous les ans.
  day_of_month int NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  start_month  date NOT NULL,          -- 1er du premier mois couvert
  end_month    date,                   -- 1er du dernier mois couvert ; NULL = sans fin
  active       boolean NOT NULL DEFAULT true,
  -- Dernier mois déjà généré. Sans ce repère, une échéance supprimée à la main
  -- (mois non payé, doublon) réapparaîtrait à l'ouverture suivante de la page.
  last_generated_month date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_apres_debut CHECK (end_month IS NULL OR end_month >= start_month)
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_doctor
  ON public.recurring_expenses(doctor_id, active);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Médecin : ses charges fixes" ON public.recurring_expenses;
CREATE POLICY "Médecin : ses charges fixes" ON public.recurring_expenses
  FOR ALL TO authenticated
  USING      (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE email = auth.jwt() ->> 'email'));

-- Rattachement d'une échéance à son modèle. ON DELETE SET NULL : supprimer le
-- modèle laisse la dépense en place, elle devient une dépense ordinaire.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_id uuid REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS period_month date;   -- 1er du mois couvert par l'échéance

-- Garantit qu'une même échéance ne peut pas être créée deux fois, quel que
-- soit le nombre d'ouvertures simultanées de la page. Les dépenses ordinaires
-- ont recurring_id NULL et ne sont pas concernées (NULL distincts en Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_expense_echeance
  ON public.expenses(recurring_id, period_month);
