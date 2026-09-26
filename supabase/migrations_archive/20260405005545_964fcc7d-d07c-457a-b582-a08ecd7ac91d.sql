
CREATE POLICY "Staff deletes photo records"
ON public.patient_photos FOR DELETE TO authenticated
USING (public.is_clinic_staff(auth.uid(), clinic_id));
