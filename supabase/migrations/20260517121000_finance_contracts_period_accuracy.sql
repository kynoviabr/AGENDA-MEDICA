ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.contracts
SET approved_at = COALESCE(approved_at, confirmed_at, signed_at, created_at)
WHERE approved_at IS NULL
  AND (
    status IN ('active', 'completed')
    OR process_status IN ('confirmed', 'pending_confirmation', 'overdue')
  );

CREATE INDEX IF NOT EXISTS idx_contracts_clinic_approved_at
  ON public.contracts (clinic_id, approved_at);

CREATE OR REPLACE FUNCTION public.get_finance_contract_sellers(
  p_clinic_id uuid
)
RETURNS TABLE (
  seller_id uuid,
  seller_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    c.created_by AS seller_id,
    COALESCE(au.raw_user_meta_data ->> 'full_name', au.email, 'Sem responsável') AS seller_name
  FROM public.contracts c
  LEFT JOIN auth.users au ON au.id = c.created_by
  WHERE c.clinic_id = p_clinic_id
    AND c.created_by IS NOT NULL
  ORDER BY 2;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_contracts_monthly_matrix(
  p_clinic_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_reference_year integer DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_treatment_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_contract_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  contract_id uuid,
  contract_number text,
  approval_date timestamptz,
  patient_name text,
  patient_cpf text,
  seller_name text,
  seller_id uuid,
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
  out_of_period_total numeric,
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
    c.process_status,
    c.created_by AS seller_id,
    COALESCE(c.approved_at, c.signed_at, c.confirmed_at, c.created_at) AS approval_date,
    p.full_name AS patient_name,
    p.cpf AS patient_cpf,
    pr.final_amount AS contract_total,
    COALESCE(au.raw_user_meta_data ->> 'full_name', au.email, 'Sem responsável') AS seller_name,
    COALESCE(cpp.prediction_status, 'financeiro_pendente_configuracao') AS prediction_status
  FROM public.contracts c
  JOIN public.patients p ON p.id = c.patient_id
  LEFT JOIN public.proposals pr ON pr.id = c.proposal_id
  LEFT JOIN auth.users au ON au.id = c.created_by
  LEFT JOIN public.contract_payment_plans cpp ON cpp.contract_id = c.id
  WHERE c.clinic_id = p_clinic_id
    AND (
      CASE
        WHEN p_contract_status IS NULL OR p_contract_status = '' OR p_contract_status = 'closed'
          THEN ((c.status IN ('active', 'completed')) OR c.process_status = 'confirmed')
        WHEN p_contract_status = 'all'
          THEN true
        ELSE (c.status::text = p_contract_status OR c.process_status = p_contract_status)
      END
    )
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
        SELECT 1
        FROM public.proposal_items pi
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
    AND (p_start_date IS NULL OR COALESCE(c.approved_at, c.signed_at, c.confirmed_at, c.created_at) >= p_start_date::timestamptz)
    AND (p_end_date IS NULL OR COALESCE(c.approved_at, c.signed_at, c.confirmed_at, c.created_at) < p_end_date::timestamptz)
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
  JOIN base b ON b.contract_id = cpm.contract_id
  GROUP BY cpm.contract_id
),
installments AS (
  SELECT
    ci.contract_id,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 1 THEN ci.amount ELSE 0 END)::numeric AS jan_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 2 THEN ci.amount ELSE 0 END)::numeric AS feb_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 3 THEN ci.amount ELSE 0 END)::numeric AS mar_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 4 THEN ci.amount ELSE 0 END)::numeric AS apr_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 5 THEN ci.amount ELSE 0 END)::numeric AS may_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 6 THEN ci.amount ELSE 0 END)::numeric AS jun_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 7 THEN ci.amount ELSE 0 END)::numeric AS jul_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 8 THEN ci.amount ELSE 0 END)::numeric AS aug_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 9 THEN ci.amount ELSE 0 END)::numeric AS sep_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 10 THEN ci.amount ELSE 0 END)::numeric AS oct_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 11 THEN ci.amount ELSE 0 END)::numeric AS nov_total,
    SUM(CASE WHEN (p_reference_year IS NULL OR EXTRACT(YEAR FROM ci.due_date) = p_reference_year) AND EXTRACT(MONTH FROM ci.due_date) = 12 THEN ci.amount ELSE 0 END)::numeric AS dec_total,
    SUM(CASE WHEN p_reference_year IS NOT NULL AND EXTRACT(YEAR FROM ci.due_date) <> p_reference_year THEN ci.amount ELSE 0 END)::numeric AS out_of_period_total,
    SUM(ci.amount)::numeric AS total_predicted
  FROM public.contract_installments ci
  JOIN base b ON b.contract_id = ci.contract_id
  GROUP BY ci.contract_id
)
SELECT
  b.contract_id,
  b.contract_number,
  b.approval_date,
  b.patient_name,
  b.patient_cpf,
  b.seller_name,
  b.seller_id,
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
  COALESCE(i.out_of_period_total, 0)::numeric AS out_of_period_total,
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
      THEN 'Soma de parcelas previstas difere do valor contratado'
    ELSE NULL
  END AS divergence_reason
FROM base b
LEFT JOIN treatments t ON t.contract_id = b.contract_id
LEFT JOIN methods m ON m.contract_id = b.contract_id
LEFT JOIN installments i ON i.contract_id = b.contract_id
ORDER BY b.approval_date DESC NULLS LAST, b.contract_number DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_contracts_prediction_summary(
  p_clinic_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_reference_year integer DEFAULT NULL,
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
    p_reference_year,
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
