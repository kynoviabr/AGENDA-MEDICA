-- Seed de dados de teste para o Clinova
-- IDs preenchidos com base nos arquivos:
-- /Users/dempas/Downloads/query-results-export-2026-04-24_02-11-35.csv
-- /Users/dempas/Downloads/query-results-export-2026-04-24_02-12-00.csv
--
-- Como usar:
-- 1. Abra este arquivo no editor
-- 2. Se quiser, revise os 3 IDs do bloco cfg
-- 3. Rode no SQL Editor do Supabase
--
-- O script é idempotente para os IDs fixos abaixo:
-- se você rodar de novo, ele apaga os registros seeded e recria.

-- Corrige o gatilho de auditoria para tabelas sem clinic_id direto,
-- como payment_installments.
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic_id UUID;
  _record jsonb;
  _record_id uuid;
BEGIN
  _record := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  _record_id := NULLIF(_record->>'id', '')::uuid;

  IF _record ? 'clinic_id' THEN
    _clinic_id := NULLIF(_record->>'clinic_id', '')::uuid;
  ELSIF TG_TABLE_NAME = 'payment_installments' THEN
    SELECT clinic_id
    INTO _clinic_id
    FROM public.payment_plans
    WHERE id = NULLIF(_record->>'payment_plan_id', '')::uuid;
  ELSE
    _clinic_id := NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data)
    VALUES (_clinic_id, auth.uid(), 'delete', TG_TABLE_NAME, _record_id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data, new_data)
    VALUES (_clinic_id, auth.uid(), 'update', TG_TABLE_NAME, _record_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, new_data)
    VALUES (_clinic_id, auth.uid(), 'insert', TG_TABLE_NAME, _record_id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DO $$
DECLARE
  cfg_clinic_id uuid := 'fd8bacd4-6d49-4404-ae44-494be156b2a0';
  cfg_admin_user_id uuid := '3391e4c4-f7b6-40c6-a62b-824a88020bca';
  cfg_professional_user_id uuid := '3391e4c4-f7b6-40c6-a62b-824a88020bca';

  treatment_botox_id uuid := '11111111-1111-1111-1111-111111111101';
  treatment_skin_id uuid := '11111111-1111-1111-1111-111111111102';
  treatment_emsculpt_id uuid := '11111111-1111-1111-1111-111111111103';
  treatment_laser_id uuid := '11111111-1111-1111-1111-111111111104';

  payer_1_id uuid := '22222222-2222-2222-2222-222222222201';
  payer_2_id uuid := '22222222-2222-2222-2222-222222222202';
  payer_3_id uuid := '22222222-2222-2222-2222-222222222203';

  patient_1_id uuid := '33333333-3333-3333-3333-333333333301';
  patient_2_id uuid := '33333333-3333-3333-3333-333333333302';
  patient_3_id uuid := '33333333-3333-3333-3333-333333333303';
  patient_4_id uuid := '33333333-3333-3333-3333-333333333304';
  patient_5_id uuid := '33333333-3333-3333-3333-333333333305';
  patient_6_id uuid := '33333333-3333-3333-3333-333333333306';

  proposal_1_id uuid := '44444444-4444-4444-4444-444444444401';
  proposal_2_id uuid := '44444444-4444-4444-4444-444444444402';
  proposal_3_id uuid := '44444444-4444-4444-4444-444444444403';
  proposal_4_id uuid := '44444444-4444-4444-4444-444444444404';

  contract_1_id uuid := '55555555-5555-5555-5555-555555555501';
  contract_2_id uuid := '55555555-5555-5555-5555-555555555502';
  contract_3_id uuid := '55555555-5555-5555-5555-555555555503';

  plan_1_id uuid := '66666666-6666-6666-6666-666666666601';
  plan_2_id uuid := '66666666-6666-6666-6666-666666666602';
  plan_3_id uuid := '66666666-6666-6666-6666-666666666603';

  appointment_1_id uuid := '77777777-7777-7777-7777-777777777701';
  appointment_2_id uuid := '77777777-7777-7777-7777-777777777702';
  appointment_3_id uuid := '77777777-7777-7777-7777-777777777703';
  appointment_4_id uuid := '77777777-7777-7777-7777-777777777704';
  appointment_5_id uuid := '77777777-7777-7777-7777-777777777705';
  appointment_6_id uuid := '77777777-7777-7777-7777-777777777706';

  session_1_id uuid := '88888888-8888-8888-8888-888888888801';
  session_2_id uuid := '88888888-8888-8888-8888-888888888802';
  session_3_id uuid := '88888888-8888-8888-8888-888888888803';
  session_4_id uuid := '88888888-8888-8888-8888-888888888804';

  anamnese_1_id uuid := '99999999-9999-9999-9999-999999999901';
  anamnese_2_id uuid := '99999999-9999-9999-9999-999999999902';
  anamnese_3_id uuid := '99999999-9999-9999-9999-999999999903';
  anamnese_4_id uuid := '99999999-9999-9999-9999-999999999904';
  anamnese_5_id uuid := '99999999-9999-9999-9999-999999999905';

BEGIN
  -- Nesta base atual só veio um usuário admin no CSV.
  -- Por isso o profissional está apontando para o mesmo user_id por enquanto.
  -- Quando existir um professional real na tabela user_roles, basta trocar o cfg_professional_user_id.

  DELETE FROM public.session_feedback WHERE id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'
  );

  DELETE FROM public.patient_metrics WHERE id IN (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6'
  );

  DELETE FROM public.session_records WHERE id IN (session_1_id, session_2_id, session_3_id, session_4_id);
  DELETE FROM public.appointments WHERE id IN (appointment_1_id, appointment_2_id, appointment_3_id, appointment_4_id, appointment_5_id, appointment_6_id);
  DELETE FROM public.payment_installments WHERE payment_plan_id IN (plan_1_id, plan_2_id, plan_3_id);
  DELETE FROM public.payment_plans WHERE id IN (plan_1_id, plan_2_id, plan_3_id);
  DELETE FROM public.contracts WHERE id IN (contract_1_id, contract_2_id, contract_3_id);
  DELETE FROM public.proposal_items WHERE proposal_id IN (proposal_1_id, proposal_2_id, proposal_3_id, proposal_4_id);
  DELETE FROM public.proposals WHERE id IN (proposal_1_id, proposal_2_id, proposal_3_id, proposal_4_id);
  DELETE FROM public.patient_anamneses WHERE id IN (anamnese_1_id, anamnese_2_id, anamnese_3_id, anamnese_4_id, anamnese_5_id);
  DELETE FROM public.patients WHERE id IN (patient_1_id, patient_2_id, patient_3_id, patient_4_id, patient_5_id, patient_6_id);
  DELETE FROM public.payers WHERE id IN (payer_1_id, payer_2_id, payer_3_id);
  DELETE FROM public.treatments WHERE id IN (treatment_botox_id, treatment_skin_id, treatment_emsculpt_id, treatment_laser_id);

  INSERT INTO public.clinic_settings (clinic_id, key, value)
  VALUES (cfg_clinic_id, 'anamnese_validity_days', '180')
  ON CONFLICT (clinic_id, key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO public.payers (id, clinic_id, name, cpf, birth_date, email, phone)
  VALUES
    (payer_1_id, cfg_clinic_id, 'Mariana Costa', '11111111111', '1989-03-10', 'mariana.costa@example.com', '11990000001'),
    (payer_2_id, cfg_clinic_id, 'Roberto Lima', '22222222222', '1978-08-19', 'roberto.lima@example.com', '11990000002'),
    (payer_3_id, cfg_clinic_id, 'Juliana Rocha', '33333333333', '1991-01-25', 'juliana.rocha@example.com', '11990000003');

  INSERT INTO public.treatments (
    id, clinic_id, name, description, duration_minutes, num_sessions, price, category, default_price, min_price, cost, is_active
  ) VALUES
    (treatment_botox_id, cfg_clinic_id, 'Botox Full Face', 'Aplicação completa para harmonização facial.', 60, 1, 1850, 'Facial', 1850, 1600, 430, true),
    (treatment_skin_id, cfg_clinic_id, 'Limpeza de Pele Premium', 'Higienização profunda com extração e máscara calmante.', 90, 1, 320, 'Facial', 320, 250, 80, true),
    (treatment_emsculpt_id, cfg_clinic_id, 'Protocolo Corporal 8 Sessões', 'Tratamento corporal com foco em definição e drenagem.', 60, 8, 3600, 'Corporal', 3600, 3200, 950, true),
    (treatment_laser_id, cfg_clinic_id, 'Depilação a Laser - Axila', 'Pacote de sessões para depilação a laser.', 30, 10, 1200, 'Laser', 1200, 990, 260, true);

  INSERT INTO public.patients (
    id, clinic_id, full_name, email, phone, cpf, date_of_birth, gender, city, state, notes,
    status, payer_id, is_self_payer, dissatisfaction_flag, dissatisfaction_level, dissatisfaction_reason
  ) VALUES
    (patient_1_id, cfg_clinic_id, 'Mariana Costa', 'mariana.costa@example.com', '11981110001', '11111111111', '1989-03-10', 'female', 'Sao Paulo', 'SP', 'Paciente recorrente, perfil premium.', 'active', payer_1_id, true, false, null, null),
    (patient_2_id, cfg_clinic_id, 'Juliana Rocha', 'juliana.rocha@example.com', '11981110002', '33333333333', '1991-01-25', 'female', 'Sao Paulo', 'SP', 'Tratamento corporal em andamento.', 'active', payer_3_id, true, false, null, null),
    (patient_3_id, cfg_clinic_id, 'Patricia Nunes', 'patricia.nunes@example.com', '11981110003', '44444444444', '1985-07-18', 'female', 'Barueri', 'SP', 'Precisa renovar documentação antes do retorno.', 'active', null, true, false, null, null),
    (patient_4_id, cfg_clinic_id, 'Carlos Mendes', 'carlos.mendes@example.com', '11981110004', '55555555555', '1982-11-02', 'male', 'Sao Paulo', 'SP', 'Em negociação de pacote de laser.', 'pending', payer_2_id, false, false, null, null),
    (patient_5_id, cfg_clinic_id, 'Fernanda Alves', 'fernanda.alves@example.com', '11981110005', '66666666666', '1994-05-23', 'female', 'Sao Paulo', 'SP', 'Paciente com insatisfação recente registrada.', 'active', null, true, true, 'alto', 'Relatou desconforto e expectativa desalinhada.'),
    (patient_6_id, cfg_clinic_id, 'Bruna Teixeira', 'bruna.teixeira@example.com', '11981110006', '77777777777', '1997-09-11', 'female', 'Santo Andre', 'SP', 'Cadastro novo sem ficha preenchida ainda.', 'active', null, true, false, null, null);

  INSERT INTO public.patient_anamneses (
    id, clinic_id, patient_id, source_type, title, description, filled_at, expires_at, validity_days, status,
    is_current, form_data, notes, created_by, updated_by, validated_by, validated_at, document_uploaded_at
  ) VALUES
    (
      anamnese_1_id, cfg_clinic_id, patient_1_id, 'digital', 'Anamnese inicial Mariana Costa', 'Ficha completa e validada.',
      now() - interval '20 days', now() + interval '160 days', 180, 'validated', true,
      '{"health_history":{"has_allergies":false,"has_chronic_disease":false},"medications":{"takes_medication":false},"objectives":{"main_objective":"Melhora de linhas finas"}}'::jsonb,
      'Anamnese aprovada para procedimentos faciais.', null, null, null, now() - interval '19 days', now() - interval '20 days'
    ),
    (
      anamnese_2_id, cfg_clinic_id, patient_2_id, 'digital', 'Anamnese corporal Juliana Rocha', 'Ficha validada com observações de rotina.',
      now() - interval '45 days', now() + interval '135 days', 180, 'filled', true,
      '{"health_history":{"has_allergies":true,"allergies_details":"Alergia leve a esparadrapo"},"habits":{"smoking":false},"objectives":{"main_objective":"Definição corporal"}}'::jsonb,
      'Sem contraindicações relevantes.', null, null, null, null, now() - interval '45 days'
    ),
    (
      anamnese_3_id, cfg_clinic_id, patient_3_id, 'digital', 'Renovação pendente Patricia Nunes', 'Ficha antiga já expirada.',
      now() - interval '250 days', now() - interval '70 days', 180, 'expired', true,
      '{"health_history":{"has_allergies":false},"aesthetic_history":{"has_active_treatment":true,"active_treatment_details":"Peeling externo há 3 meses"}}'::jsonb,
      'Precisa renovar antes da próxima sessão.', null, null, null, now() - interval '249 days', now() - interval '250 days'
    ),
    (
      anamnese_4_id, cfg_clinic_id, patient_4_id, 'digital', 'Anamnese comercial Carlos Mendes', 'Ficha iniciada durante avaliação.',
      now() - interval '2 days', now() + interval '178 days', 180, 'pending', true,
      '{"health_history":{"has_allergies":false},"objectives":{"main_objective":"Iniciar pacote de laser"}}'::jsonb,
      'Aguardando completar alguns campos.', null, null, null, null, now() - interval '2 days'
    ),
    (
      anamnese_5_id, cfg_clinic_id, patient_5_id, 'digital', 'Anamnese Fernanda Alves', 'Ficha validada com sensibilidade cutânea.',
      now() - interval '15 days', now() + interval '165 days', 180, 'validated', true,
      '{"allergies":{"has_product_sensitivity":true,"product_sensitivity_details":"Sensibilidade a ácidos concentrados"},"health_history":{"has_skin_conditions":true,"skin_conditions_details":"Rosácea leve"}}'::jsonb,
      'Atenção especial para protocolos agressivos.', null, null, null, now() - interval '14 days', now() - interval '15 days'
    );

  INSERT INTO public.proposals (
    id, clinic_id, patient_id, proposal_number, status, total_amount, discount_percent, discount_amount, final_amount,
    valid_until, notes, created_by, created_at
  ) VALUES
    (proposal_1_id, cfg_clinic_id, patient_1_id, 'PROP-2026-0001', 'accepted', 1850, 0, 0, 1850, current_date + 20, 'Botox aprovado pela paciente.', null, now() - interval '18 days'),
    (proposal_2_id, cfg_clinic_id, patient_2_id, 'PROP-2026-0002', 'accepted', 3600, 8.33, 300, 3300, current_date + 15, 'Fechamento com desconto de campanha.', null, now() - interval '35 days'),
    (proposal_3_id, cfg_clinic_id, patient_4_id, 'PROP-2026-0003', 'sent', 1200, 0, 0, 1200, current_date + 10, 'Proposta enviada e aguardando retorno.', null, now() - interval '3 days'),
    (proposal_4_id, cfg_clinic_id, patient_5_id, 'PROP-2026-0004', 'accepted', 320, 0, 0, 320, current_date + 7, 'Sessão avulsa de recuperação.', null, now() - interval '12 days');

  INSERT INTO public.proposal_items (proposal_id, treatment_id, quantity, unit_price, subtotal)
  VALUES
    (proposal_1_id, treatment_botox_id, 1, 1850, 1850),
    (proposal_2_id, treatment_emsculpt_id, 1, 3600, 3600),
    (proposal_3_id, treatment_laser_id, 1, 1200, 1200),
    (proposal_4_id, treatment_skin_id, 1, 320, 320);

  INSERT INTO public.contracts (
    id, clinic_id, patient_id, proposal_id, contract_number, status, start_date, end_date, notes, signed_at, created_by, created_at
  ) VALUES
    (contract_1_id, cfg_clinic_id, patient_1_id, proposal_1_id, 'CTR-2026-0001', 'active', current_date - 18, current_date + 180, 'Contrato ativo para botox.', now() - interval '17 days', null, now() - interval '18 days'),
    (contract_2_id, cfg_clinic_id, patient_2_id, proposal_2_id, 'CTR-2026-0002', 'active', current_date - 34, current_date + 210, 'Protocolo corporal em andamento.', now() - interval '33 days', null, now() - interval '34 days'),
    (contract_3_id, cfg_clinic_id, patient_5_id, proposal_4_id, 'CTR-2026-0003', 'active', current_date - 12, current_date + 30, 'Contrato curto para acompanhamento.', now() - interval '11 days', null, now() - interval '12 days');

  INSERT INTO public.payment_plans (
    id, clinic_id, contract_id, patient_id, total_amount, payment_method, num_installments, status, notes, created_at
  ) VALUES
    (plan_1_id, cfg_clinic_id, contract_1_id, patient_1_id, 1850, 'pix', 1, 'paid', 'Pagamento à vista.', now() - interval '18 days'),
    (plan_2_id, cfg_clinic_id, contract_2_id, patient_2_id, 3300, 'credit_card', 3, 'pending', 'Parcelado no cartão.', now() - interval '34 days'),
    (plan_3_id, cfg_clinic_id, contract_3_id, patient_5_id, 320, 'cash', 1, 'paid', 'Pagamento presencial.', now() - interval '12 days');

  INSERT INTO public.payment_installments (
    payment_plan_id, installment_number, amount, due_date, paid_date, status
  ) VALUES
    (plan_1_id, 1, 1850, current_date - 18, current_date - 18, 'paid'),
    (plan_2_id, 1, 1100, current_date - 20, current_date - 20, 'paid'),
    (plan_2_id, 2, 1100, current_date + 10, null, 'pending'),
    (plan_2_id, 3, 1100, current_date + 40, null, 'pending'),
    (plan_3_id, 1, 320, current_date - 12, current_date - 12, 'paid');

  INSERT INTO public.appointments (
    id, clinic_id, patient_id, professional_id, treatment_id, start_time, end_time, status, notes, created_by
  ) VALUES
    (appointment_1_id, cfg_clinic_id, patient_1_id, null, treatment_botox_id, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed', 'Retorno pós-aplicação.', null),
    (appointment_2_id, cfg_clinic_id, patient_2_id, null, treatment_emsculpt_id, now() - interval '7 days', now() - interval '7 days' + interval '1 hour', 'completed', 'Sessão 2 do protocolo.', null),
    (appointment_3_id, cfg_clinic_id, patient_2_id, null, treatment_emsculpt_id, now() + interval '3 days', now() + interval '3 days 1 hour', 'confirmed', 'Sessão 3 do protocolo.', null),
    (appointment_4_id, cfg_clinic_id, patient_3_id, null, treatment_skin_id, now() + interval '1 day', now() + interval '1 day 90 minutes', 'scheduled', 'Aguardando renovação de anamnese.', null),
    (appointment_5_id, cfg_clinic_id, patient_4_id, null, treatment_laser_id, now() + interval '4 days', now() + interval '4 days 30 minutes', 'scheduled', 'Avaliação comercial do pacote.', null),
    (appointment_6_id, cfg_clinic_id, patient_5_id, null, treatment_skin_id, now() - interval '5 days', now() - interval '5 days' + interval '90 minutes', 'completed', 'Sessão de recuperação realizada.', null);

  INSERT INTO public.session_records (
    id, clinic_id, appointment_id, patient_id, treatment_id, professional_id, session_number, total_sessions,
    notes, products_used, observations, performed_at
  ) VALUES
    (session_1_id, cfg_clinic_id, appointment_2_id, patient_2_id, treatment_emsculpt_id, null, 2, 8, 'Boa evolução da paciente.', 'Gel condutor', 'Sem intercorrências.', now() - interval '7 days'),
    (session_2_id, cfg_clinic_id, null, patient_2_id, treatment_emsculpt_id, null, 1, 8, 'Primeira sessão registrada manualmente.', 'Gel condutor', 'Paciente adaptou bem.', now() - interval '14 days'),
    (session_3_id, cfg_clinic_id, appointment_6_id, patient_5_id, treatment_skin_id, null, 1, 1, 'Sessão finalizada com desconforto leve.', 'Máscara calmante', 'Pele reativa, observar retorno.', now() - interval '5 days'),
    (session_4_id, cfg_clinic_id, null, patient_1_id, treatment_botox_id, null, 1, 1, 'Aplicação inicial concluída.', 'Toxina botulínica', 'Paciente orientada sobre cuidados pós.', now() - interval '17 days');

  INSERT INTO public.session_feedback (
    id, clinic_id, session_record_id, patient_id, rating, comment, is_responded, response, responded_by, responded_at, created_at
  ) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', cfg_clinic_id, session_1_id, patient_2_id, 5, 'Gostei bastante do atendimento e da explicação.', true, 'Que bom saber disso. Seguimos com o protocolo.', null, now() - interval '6 days', now() - interval '6 days'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', cfg_clinic_id, session_3_id, patient_5_id, 2, 'Senti ardência maior do que esperava.', true, 'Obrigado por relatar. Vamos ajustar o próximo protocolo.', null, now() - interval '4 days', now() - interval '4 days'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', cfg_clinic_id, session_4_id, patient_1_id, 5, 'Atendimento excelente.', false, null, null, null, now() - interval '16 days');

  INSERT INTO public.patient_metrics (
    id, clinic_id, patient_id, metric_type, value, unit, notes, recorded_by, recorded_at
  ) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', cfg_clinic_id, patient_2_id, 'weight', 71.2, 'kg', 'Início do protocolo.', null, now() - interval '30 days'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', cfg_clinic_id, patient_2_id, 'weight', 69.8, 'kg', 'Revisão intermediária.', null, now() - interval '14 days'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', cfg_clinic_id, patient_2_id, 'waist', 88, 'cm', 'Medida inicial.', null, now() - interval '30 days'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', cfg_clinic_id, patient_2_id, 'waist', 84.5, 'cm', 'Boa redução.', null, now() - interval '14 days'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5', cfg_clinic_id, patient_5_id, 'weight', 62.4, 'kg', 'Controle de retorno.', null, now() - interval '10 days'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb6', cfg_clinic_id, patient_1_id, 'weight', 58.9, 'kg', 'Registro rápido para histórico.', null, now() - interval '18 days');

  RAISE NOTICE 'Seed aplicado com sucesso para a clínica %.', cfg_clinic_id;
END $$;
