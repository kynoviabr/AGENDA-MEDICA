-- Financeiro — Contratos (previsão contratual)
-- Camada analítica de previsão (não representa recebimento real)

CREATE TABLE IF NOT EXISTS public.contract_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  payer_id uuid REFERENCES public.payers(id) ON DELETE SET NULL,
  total_contract_value numeric(12,2) NOT NULL DEFAULT 0,
  total_predicted_value numeric(12,2) NOT NULL DEFAULT 0,
  prediction_status text NOT NULL DEFAULT 'previsto',
  source text NOT NULL DEFAULT 'contract',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);

CREATE TABLE IF NOT EXISTS public.contract_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  payment_plan_id uuid NOT NULL REFERENCES public.contract_payment_plans(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  installments_count integer NOT NULL DEFAULT 1,
  installment_value numeric(12,2),
  card_brand text,
  card_last_digits text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  payment_plan_id uuid NOT NULL REFERENCES public.contract_payment_plans(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.contract_payment_methods(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  installment_number integer NOT NULL,
  installments_count integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'previsto',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_payment_plans_clinic_contract ON public.contract_payment_plans (clinic_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_payment_methods_plan ON public.contract_payment_methods (payment_plan_id, payment_method);
CREATE INDEX IF NOT EXISTS idx_contract_payment_methods_contract ON public.contract_payment_methods (contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_installments_plan_due ON public.contract_installments (payment_plan_id, due_date);
CREATE INDEX IF NOT EXISTS idx_contract_installments_contract_due ON public.contract_installments (contract_id, due_date);

CREATE TRIGGER trg_contract_payment_plans_updated_at
  BEFORE UPDATE ON public.contract_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_contract_payment_methods_updated_at
  BEFORE UPDATE ON public.contract_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_contract_installments_updated_at
  BEFORE UPDATE ON public.contract_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.contract_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff views contract payment plans" ON public.contract_payment_plans;
CREATE POLICY "Staff views contract payment plans"
  ON public.contract_payment_plans FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff manages contract payment plans" ON public.contract_payment_plans;
CREATE POLICY "Staff manages contract payment plans"
  ON public.contract_payment_plans FOR ALL TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff views contract payment methods" ON public.contract_payment_methods;
CREATE POLICY "Staff views contract payment methods"
  ON public.contract_payment_methods FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff manages contract payment methods" ON public.contract_payment_methods;
CREATE POLICY "Staff manages contract payment methods"
  ON public.contract_payment_methods FOR ALL TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff views contract installments" ON public.contract_installments;
CREATE POLICY "Staff views contract installments"
  ON public.contract_installments FOR SELECT TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id));

DROP POLICY IF EXISTS "Staff manages contract installments" ON public.contract_installments;
CREATE POLICY "Staff manages contract installments"
  ON public.contract_installments FOR ALL TO authenticated
  USING (public.is_clinic_staff(auth.uid(), clinic_id))
  WITH CHECK (public.is_clinic_staff(auth.uid(), clinic_id));

CREATE OR REPLACE FUNCTION public.parse_brl_amount(_value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(REPLACE(REPLACE(REGEXP_REPLACE(COALESCE(_value, ''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric
$$;

CREATE OR REPLACE FUNCTION public.normalize_payment_method(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _value ILIKE 'dinheiro%' THEN 'cash'
    WHEN _value ILIKE 'pix%' THEN 'pix'
    WHEN _value ILIKE 'cartão%' OR _value ILIKE 'cartao%' THEN 'card'
    WHEN _value ILIKE 'boleto%' THEN 'boleto'
    ELSE 'other'
  END
$$;

CREATE OR REPLACE FUNCTION public.upsert_contract_financial_forecast(
  p_contract_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_plan_id uuid;
  v_base_date date;
  v_notes text;
  v_forms_text text;
  v_form_entry text;
  v_method text;
  v_amount numeric(12,2);
  v_installments integer;
  v_installment_value numeric(12,2);
  v_card_brand text;
  v_last4 text;
  v_method_id uuid;
  v_total_methods numeric(12,2) := 0;
  v_has_methods boolean := false;
  v_due date;
  v_i integer;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado: %', p_contract_id;
  END IF;

  IF NOT p_force THEN
    IF EXISTS (SELECT 1 FROM public.contract_payment_plans WHERE contract_id = p_contract_id) THEN
      RETURN jsonb_build_object('status', 'skipped', 'reason', 'already_exists', 'contract_id', p_contract_id);
    END IF;
  END IF;

  IF p_force THEN
    DELETE FROM public.contract_installments WHERE contract_id = p_contract_id;
    DELETE FROM public.contract_payment_methods WHERE contract_id = p_contract_id;
    DELETE FROM public.contract_payment_plans WHERE contract_id = p_contract_id;
  END IF;

  v_base_date := COALESCE(v_contract.start_date, (v_contract.created_at AT TIME ZONE 'UTC')::date, now()::date);
  v_notes := COALESCE(v_contract.notes, '');
  v_forms_text := COALESCE((regexp_match(v_notes, 'Formas:\s*(.*)$', 'i'))[1], '');

  INSERT INTO public.contract_payment_plans (
    clinic_id,
    contract_id,
    proposal_id,
    patient_id,
    payer_id,
    total_contract_value,
    total_predicted_value,
    prediction_status,
    source,
    created_by
  )
  VALUES (
    v_contract.clinic_id,
    v_contract.id,
    v_contract.proposal_id,
    v_contract.patient_id,
    v_contract.payer_id,
    0,
    0,
    'previsto',
    'contract',
    v_contract.created_by
  )
  RETURNING id INTO v_plan_id;

  FOR v_form_entry IN
    SELECT trim(value)
    FROM regexp_split_to_table(v_forms_text, '\|') AS value
  LOOP
    IF v_form_entry = '' THEN
      CONTINUE;
    END IF;

    v_method := public.normalize_payment_method(v_form_entry);
    v_amount := public.parse_brl_amount((regexp_match(v_form_entry, 'R\$\s*([0-9\.\,]+)', 'i'))[1]);
    v_installments := COALESCE(NULLIF((regexp_match(v_form_entry, '([0-9]+)\s*x\s*de', 'i'))[1], '')::integer, 1);
    v_installment_value := public.parse_brl_amount((regexp_match(v_form_entry, 'x\s*de\s*R\$\s*([0-9\.\,]+)', 'i'))[1]);
    v_card_brand := NULLIF((regexp_match(v_form_entry, '·\s*([^·]+?)\s*·\s*finais', 'i'))[1], '');
    v_last4 := NULLIF((regexp_match(v_form_entry, 'finais\s*([0-9]{4})', 'i'))[1], '');

    IF v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    IF v_installments IS NULL OR v_installments <= 0 THEN
      v_installments := 1;
    END IF;

    IF v_installment_value IS NULL OR v_installment_value <= 0 THEN
      v_installment_value := ROUND(v_amount / v_installments, 2);
    END IF;

    INSERT INTO public.contract_payment_methods (
      clinic_id,
      contract_id,
      payment_plan_id,
      payment_method,
      amount,
      installments_count,
      installment_value,
      card_brand,
      card_last_digits,
      notes
    )
    VALUES (
      v_contract.clinic_id,
      v_contract.id,
      v_plan_id,
      v_method,
      v_amount,
      v_installments,
      v_installment_value,
      CASE WHEN v_method = 'card' THEN v_card_brand END,
      CASE WHEN v_method = 'card' THEN v_last4 END,
      v_form_entry
    )
    RETURNING id INTO v_method_id;

    v_has_methods := true;
    v_total_methods := v_total_methods + v_amount;

    FOR v_i IN 1..v_installments LOOP
      v_due := (v_base_date + ((v_i - 1) * INTERVAL '1 month'))::date;
      INSERT INTO public.contract_installments (
        clinic_id,
        contract_id,
        payment_plan_id,
        payment_method_id,
        payment_method,
        installment_number,
        installments_count,
        due_date,
        amount,
        status,
        notes
      )
      VALUES (
        v_contract.clinic_id,
        v_contract.id,
        v_plan_id,
        v_method_id,
        v_method,
        v_i,
        v_installments,
        v_due,
        CASE WHEN v_i = v_installments THEN ROUND(v_amount - (v_installment_value * (v_installments - 1)), 2) ELSE v_installment_value END,
        'previsto',
        NULL
      );
    END LOOP;
  END LOOP;

  IF NOT v_has_methods THEN
    UPDATE public.contract_payment_plans
    SET total_contract_value = COALESCE((SELECT final_amount FROM public.proposals WHERE id = v_contract.proposal_id), 0),
        total_predicted_value = 0,
        prediction_status = 'financeiro_pendente_configuracao',
        updated_at = now()
    WHERE id = v_plan_id;

    RETURN jsonb_build_object(
      'status', 'pending_configuration',
      'contract_id', v_contract.id,
      'payment_plan_id', v_plan_id
    );
  END IF;

  UPDATE public.contract_payment_plans
  SET total_contract_value = COALESCE((SELECT final_amount FROM public.proposals WHERE id = v_contract.proposal_id), v_total_methods),
      total_predicted_value = v_total_methods,
      prediction_status = 'previsto',
      updated_at = now()
  WHERE id = v_plan_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'contract_id', v_contract.id,
    'payment_plan_id', v_plan_id,
    'total_predicted_value', v_total_methods
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_contract_financial_forecast(
  p_clinic_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_processed integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR v_row IN
    SELECT c.id
    FROM public.contracts c
    WHERE c.clinic_id = p_clinic_id
    ORDER BY c.created_at ASC
  LOOP
    IF NOT p_force AND EXISTS (SELECT 1 FROM public.contract_payment_plans cpp WHERE cpp.contract_id = v_row.id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM public.upsert_contract_financial_forecast(v_row.id, p_force);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'processed', v_processed,
    'skipped', v_skipped
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_contracts_monthly_matrix(
  p_clinic_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_treatment_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_contract_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  contract_id uuid,
  contract_number text,
  patient_name text,
  patient_cpf text,
  seller_name text,
  treatments text,
  contract_total numeric,
  cash_total numeric,
  pix_total numeric,
  card_total numeric,
  boleto_total numeric,
  other_total numeric,
  jan_total numeric,
  feb_total numeric,
  mar_total numeric,
  apr_total numeric,
  may_total numeric,
  jun_total numeric,
  jul_total numeric,
  aug_total numeric,
  sep_total numeric,
  oct_total numeric,
  nov_total numeric,
  dec_total numeric,
  total_predicted numeric,
  has_financial_divergence boolean,
  divergence_reason text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT
    c.id AS contract_id,
    c.contract_number,
    c.status::text AS contract_status,
    c.created_by,
    p.full_name AS patient_name,
    p.cpf AS patient_cpf,
    pr.final_amount AS contract_total,
    COALESCE(u.full_name, u.email, 'Sem responsável') AS seller_name,
    COALESCE(cpp.prediction_status, 'financeiro_pendente_configuracao') AS prediction_status
  FROM public.contracts c
  JOIN public.patients p ON p.id = c.patient_id
  LEFT JOIN public.proposals pr ON pr.id = c.proposal_id
  LEFT JOIN public.users u ON u.id = c.created_by
  LEFT JOIN public.contract_payment_plans cpp ON cpp.contract_id = c.id
  WHERE c.clinic_id = p_clinic_id
    AND (p_contract_status IS NULL OR p_contract_status = '' OR c.status::text = p_contract_status OR c.process_status = p_contract_status)
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contract_number ILIKE '%' || p_search || '%'
      OR p.full_name ILIKE '%' || p_search || '%'
      OR regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') ILIKE '%' || regexp_replace(p_search, '\D', '', 'g') || '%'
    )
    AND (p_seller_id IS NULL OR c.created_by = p_seller_id)
    AND (
      p_treatment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.proposal_items pi
        WHERE pi.proposal_id = c.proposal_id AND pi.treatment_id = p_treatment_id
      )
    )
    AND (
      p_payment_method IS NULL OR p_payment_method = ''
      OR EXISTS (
        SELECT 1
        FROM public.contract_payment_methods cpmf
        WHERE cpmf.contract_id = c.id
          AND cpmf.payment_method = p_payment_method
      )
    )
),
treatments AS (
  SELECT
    c.id AS contract_id,
    string_agg(DISTINCT t.name, ', ' ORDER BY t.name) AS treatments
  FROM public.contracts c
  LEFT JOIN public.proposal_items pi ON pi.proposal_id = c.proposal_id
  LEFT JOIN public.treatments t ON t.id = pi.treatment_id
  WHERE c.clinic_id = p_clinic_id
  GROUP BY c.id
),
methods AS (
  SELECT
    cpm.contract_id,
    SUM(CASE WHEN cpm.payment_method = 'cash' THEN cpm.amount ELSE 0 END)::numeric AS cash_total,
    SUM(CASE WHEN cpm.payment_method = 'pix' THEN cpm.amount ELSE 0 END)::numeric AS pix_total,
    SUM(CASE WHEN cpm.payment_method = 'card' THEN cpm.amount ELSE 0 END)::numeric AS card_total,
    SUM(CASE WHEN cpm.payment_method = 'boleto' THEN cpm.amount ELSE 0 END)::numeric AS boleto_total,
    SUM(CASE WHEN cpm.payment_method NOT IN ('cash', 'pix', 'card', 'boleto') THEN cpm.amount ELSE 0 END)::numeric AS other_total
  FROM public.contract_payment_methods cpm
  JOIN public.contracts c ON c.id = cpm.contract_id
  WHERE c.clinic_id = p_clinic_id
  GROUP BY cpm.contract_id
),
installments AS (
  SELECT
    ci.contract_id,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 1 THEN ci.amount ELSE 0 END)::numeric AS jan_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 2 THEN ci.amount ELSE 0 END)::numeric AS feb_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 3 THEN ci.amount ELSE 0 END)::numeric AS mar_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 4 THEN ci.amount ELSE 0 END)::numeric AS apr_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 5 THEN ci.amount ELSE 0 END)::numeric AS may_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 6 THEN ci.amount ELSE 0 END)::numeric AS jun_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 7 THEN ci.amount ELSE 0 END)::numeric AS jul_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 8 THEN ci.amount ELSE 0 END)::numeric AS aug_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 9 THEN ci.amount ELSE 0 END)::numeric AS sep_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 10 THEN ci.amount ELSE 0 END)::numeric AS oct_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 11 THEN ci.amount ELSE 0 END)::numeric AS nov_total,
    SUM(CASE WHEN EXTRACT(MONTH FROM ci.due_date) = 12 THEN ci.amount ELSE 0 END)::numeric AS dec_total,
    SUM(ci.amount)::numeric AS total_predicted
  FROM public.contract_installments ci
  JOIN public.contracts c ON c.id = ci.contract_id
  WHERE c.clinic_id = p_clinic_id
    AND (p_start_date IS NULL OR ci.due_date >= p_start_date)
    AND (p_end_date IS NULL OR ci.due_date <= p_end_date)
  GROUP BY ci.contract_id
)
SELECT
  b.contract_id,
  b.contract_number,
  b.patient_name,
  b.patient_cpf,
  b.seller_name,
  COALESCE(t.treatments, 'Sem tratamento vinculado') AS treatments,
  COALESCE(b.contract_total, 0)::numeric AS contract_total,
  COALESCE(m.cash_total, 0)::numeric AS cash_total,
  COALESCE(m.pix_total, 0)::numeric AS pix_total,
  COALESCE(m.card_total, 0)::numeric AS card_total,
  COALESCE(m.boleto_total, 0)::numeric AS boleto_total,
  COALESCE(m.other_total, 0)::numeric AS other_total,
  COALESCE(i.jan_total, 0)::numeric AS jan_total,
  COALESCE(i.feb_total, 0)::numeric AS feb_total,
  COALESCE(i.mar_total, 0)::numeric AS mar_total,
  COALESCE(i.apr_total, 0)::numeric AS apr_total,
  COALESCE(i.may_total, 0)::numeric AS may_total,
  COALESCE(i.jun_total, 0)::numeric AS jun_total,
  COALESCE(i.jul_total, 0)::numeric AS jul_total,
  COALESCE(i.aug_total, 0)::numeric AS aug_total,
  COALESCE(i.sep_total, 0)::numeric AS sep_total,
  COALESCE(i.oct_total, 0)::numeric AS oct_total,
  COALESCE(i.nov_total, 0)::numeric AS nov_total,
  COALESCE(i.dec_total, 0)::numeric AS dec_total,
  COALESCE(i.total_predicted, 0)::numeric AS total_predicted,
  (
    ABS(COALESCE(m.cash_total, 0) + COALESCE(m.pix_total, 0) + COALESCE(m.card_total, 0) + COALESCE(m.boleto_total, 0) + COALESCE(m.other_total, 0) - COALESCE(b.contract_total, 0)) > 0.01
    OR ABS(COALESCE(i.total_predicted, 0) - COALESCE(b.contract_total, 0)) > 0.01
    OR b.prediction_status = 'financeiro_pendente_configuracao'
  ) AS has_financial_divergence,
  CASE
    WHEN b.prediction_status = 'financeiro_pendente_configuracao' THEN 'Financeiro pendente de configuração'
    WHEN ABS(COALESCE(m.cash_total, 0) + COALESCE(m.pix_total, 0) + COALESCE(m.card_total, 0) + COALESCE(m.boleto_total, 0) + COALESCE(m.other_total, 0) - COALESCE(b.contract_total, 0)) > 0.01
      THEN 'Soma das formas difere do valor contratado'
    WHEN ABS(COALESCE(i.total_predicted, 0) - COALESCE(b.contract_total, 0)) > 0.01
      THEN 'Soma mensal difere do valor contratado'
    ELSE NULL
  END AS divergence_reason
FROM base b
LEFT JOIN treatments t ON t.contract_id = b.contract_id
LEFT JOIN methods m ON m.contract_id = b.contract_id
LEFT JOIN installments i ON i.contract_id = b.contract_id
ORDER BY b.contract_number DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_contracts_prediction_summary(
  p_clinic_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_treatment_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_contract_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  total_contracts bigint,
  total_contract_value numeric,
  total_predicted_period numeric,
  cash_predicted numeric,
  pix_predicted numeric,
  card_predicted numeric,
  boleto_predicted numeric,
  other_predicted numeric,
  average_ticket numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH m AS (
  SELECT * FROM public.get_finance_contracts_monthly_matrix(
    p_clinic_id,
    p_start_date,
    p_end_date,
    p_seller_id,
    p_treatment_id,
    p_payment_method,
    p_contract_status,
    p_search
  )
)
SELECT
  COUNT(*)::bigint AS total_contracts,
  COALESCE(SUM(contract_total), 0)::numeric AS total_contract_value,
  COALESCE(SUM(total_predicted), 0)::numeric AS total_predicted_period,
  COALESCE(SUM(cash_total), 0)::numeric AS cash_predicted,
  COALESCE(SUM(pix_total), 0)::numeric AS pix_predicted,
  COALESCE(SUM(card_total), 0)::numeric AS card_predicted,
  COALESCE(SUM(boleto_total), 0)::numeric AS boleto_predicted,
  COALESCE(SUM(other_total), 0)::numeric AS other_predicted,
  CASE WHEN COUNT(*) = 0 THEN 0 ELSE COALESCE(SUM(contract_total), 0) / COUNT(*) END::numeric AS average_ticket
FROM m;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_contract_forecast_detail(
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_methods jsonb;
  v_installments jsonb;
BEGIN
  SELECT
    c.id,
    c.contract_number,
    c.status,
    c.process_status,
    c.created_at,
    p.full_name AS patient_name,
    p.cpf AS patient_cpf,
    py.name AS payer_name,
    py.cpf AS payer_cpf,
    pr.proposal_number,
    pr.final_amount AS contract_total,
    COALESCE(u.full_name, u.email, 'Sem responsável') AS seller_name,
    COALESCE(cpp.prediction_status, 'financeiro_pendente_configuracao') AS prediction_status
  INTO v_contract
  FROM public.contracts c
  JOIN public.patients p ON p.id = c.patient_id
  LEFT JOIN public.payers py ON py.id = c.payer_id
  LEFT JOIN public.proposals pr ON pr.id = c.proposal_id
  LEFT JOIN public.users u ON u.id = c.created_by
  LEFT JOIN public.contract_payment_plans cpp ON cpp.contract_id = c.id
  WHERE c.id = p_contract_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', cpm.id,
        'payment_method', cpm.payment_method,
        'amount', cpm.amount,
        'installments_count', cpm.installments_count,
        'installment_value', cpm.installment_value,
        'card_brand', cpm.card_brand,
        'card_last_digits', cpm.card_last_digits,
        'notes', cpm.notes
      )
      ORDER BY cpm.created_at
    ),
    '[]'::jsonb
  )
  INTO v_methods
  FROM public.contract_payment_methods cpm
  WHERE cpm.contract_id = p_contract_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ci.id,
        'payment_method', ci.payment_method,
        'installment_number', ci.installment_number,
        'installments_count', ci.installments_count,
        'due_date', ci.due_date,
        'amount', ci.amount,
        'status', ci.status,
        'notes', ci.notes
      )
      ORDER BY ci.due_date, ci.installment_number
    ),
    '[]'::jsonb
  )
  INTO v_installments
  FROM public.contract_installments ci
  WHERE ci.contract_id = p_contract_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'contract', to_jsonb(v_contract),
    'methods', v_methods,
    'installments', v_installments
  );
END;
$$;
