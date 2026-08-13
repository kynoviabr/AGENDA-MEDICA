
-- Helper functions for auth context
CREATE OR REPLACE FUNCTION public.auth_clinic_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.user_roles WHERE user_id = auth.uid() AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() AND is_active = true LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_patient_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT patient_id FROM public.patient_portal_access
  WHERE auth_user_id = auth.uid() AND access_status = 'active' LIMIT 1
$$;

-- Audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic_id UUID;
  _action TEXT;
BEGIN
  _action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    _clinic_id := OLD.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data)
    VALUES (_clinic_id, auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    _clinic_id := NEW.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, old_data, new_data)
    VALUES (_clinic_id, auth.uid(), 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    _clinic_id := NEW.clinic_id;
    INSERT INTO public.audit_logs (clinic_id, user_id, action, table_name, record_id, new_data)
    VALUES (_clinic_id, auth.uid(), 'insert', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit triggers
CREATE TRIGGER audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_payment_plans
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_payment_installments
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_patient_photos
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_photos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER audit_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
