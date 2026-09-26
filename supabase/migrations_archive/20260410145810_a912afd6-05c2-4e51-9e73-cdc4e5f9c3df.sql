
CREATE OR REPLACE FUNCTION public.flag_patient_dissatisfaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_negative = true THEN
    UPDATE public.patients
    SET dissatisfaction_flag = true,
        dissatisfaction_level = CASE WHEN NEW.rating <= 2 THEN 'high' ELSE 'medium' END,
        dissatisfaction_reason = 'Feedback negativo: nota ' || NEW.rating || '/5, atenção ' || COALESCE(NEW.service_attention::text, 'N/A') || '/5, espera ' || COALESCE(NEW.waiting_time::text, 'N/A') || '/5'
    WHERE id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flag_dissatisfaction
AFTER INSERT ON public.session_feedback
FOR EACH ROW
EXECUTE FUNCTION public.flag_patient_dissatisfaction();
