
CREATE OR REPLACE FUNCTION public.notify_admin_negative_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _patient_name TEXT;
  _admin RECORD;
BEGIN
  IF NEW.is_negative = true THEN
    SELECT full_name INTO _patient_name FROM public.patients WHERE id = NEW.patient_id;

    FOR _admin IN
      SELECT user_id FROM public.user_roles
      WHERE clinic_id = NEW.clinic_id AND role = 'admin' AND is_active = true
    LOOP
      INSERT INTO public.notifications (clinic_id, user_id, title, message, channel, status)
      VALUES (
        NEW.clinic_id,
        _admin.user_id,
        '⚠️ Feedback negativo recebido',
        'O paciente ' || COALESCE(_patient_name, 'Desconhecido') || ' enviou uma avaliação negativa (nota ' || NEW.rating || '/5). Verifique o módulo de feedbacks.',
        'in_app',
        'pending'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admin_negative_feedback
AFTER INSERT ON public.session_feedback
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_negative_feedback();
